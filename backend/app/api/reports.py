from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Query, Form
from sqlalchemy.orm import Session
from app.db.database import SessionLocal
from app.models.report import Report
from app.models.patient import Patient
from app.models.users import User
from app.models.notification import Notification
from app.models.user_preference import UserPreference
from app.schemas.report import ReportCreate, ReportResponse
from app.api.auth import get_current_user
from app.services.storage_service import storage_service
from pathlib import Path
from urllib.parse import urlparse
import httpx
import os
import tempfile
import uuid
from datetime import datetime, timedelta


router = APIRouter(prefix="/api/reports", tags=["reports"])


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _safe_suffix(filename: str | None) -> str:
    try:
        suffix = Path(filename or "").suffix
    except Exception:
        suffix = ""
    if suffix.lower() in [".jpg", ".jpeg", ".png"]:
        return suffix.lower()
    return ".png"


def _write_temp_image(image_bytes: bytes, suffix: str) -> str:
    tmp_dir = Path(tempfile.gettempdir())
    tmp_path = tmp_dir / f"dr_{uuid.uuid4().hex}{suffix}"
    tmp_path.write_bytes(image_bytes)
    return str(tmp_path)


def _clean_filename(name: str | None, default_ext: str) -> str:
    cleaned = Path(name or "").name.strip()
    if not cleaned:
        cleaned = f"retina{default_ext}"
    if "." not in cleaned:
        cleaned = f"{cleaned}{default_ext}"
    return cleaned


def _unique_report_filename(db: Session, patient_id: int, desired: str) -> str:
    desired = desired.strip()
    if not desired:
        desired = "retina.png"

    stem = Path(desired).stem
    ext = Path(desired).suffix

    candidate = f"{stem}{ext}"
    if not db.query(Report.id).filter(Report.patient_id == patient_id, Report.filename == candidate).first():
        return candidate

    n = 2
    while True:
        candidate = f"{stem} ({n}){ext}"
        if not db.query(Report.id).filter(Report.patient_id == patient_id, Report.filename == candidate).first():
            return candidate
        n += 1


def get_or_create_preferences(db: Session, user_id: int) -> UserPreference:
    pref = db.query(UserPreference).filter(UserPreference.user_id == user_id).first()
    if pref:
        return pref
    pref = UserPreference(user_id=user_id)
    db.add(pref)
    db.commit()
    db.refresh(pref)
    return pref


@router.post("/cache-url")
async def cache_image_url(
    url: str = Form(...),
    current_user: User = Depends(get_current_user),
):
    if not url or not (url.startswith("http://") or url.startswith("https://")):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid image URL")

    try:
        async with httpx.AsyncClient(timeout=60.0, follow_redirects=True) as client:
            response = await client.get(url)
            response.raise_for_status()
            parsed = Path(urlparse(url).path).name
            if not parsed:
                parsed = f"{uuid.uuid4().hex}.png"
            local_url = storage_service.upload_bytes(response.content, parsed)
            return {"local_url": local_url}
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to cache image: {e}")


@router.post("/", response_model=ReportResponse)
async def create_report(
    patient_id: int = Query(...),
    file: UploadFile = File(...),
    client_uuid: str | None = Query(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Create a new report with image upload and AI prediction.

    Flow:
    - Read multipart image bytes
    - Send to Hugging Face Space /predict
    - Upload original + heatmap to Supabase Storage
    - Insert record into DB
    - Return JSON to frontend
    """
    patient_query = db.query(Patient).filter(Patient.id == patient_id)
    if getattr(current_user, "role", "doctor") != "admin":
        patient_query = patient_query.filter(Patient.doctor_id == current_user.id)
    patient = patient_query.first()

    if not patient:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Patient not found or access denied",
        )

    try:
        await file.seek(0)
        image_bytes = await file.read()
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to read uploaded file: {str(e)}",
        )

    if not image_bytes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded file is empty (0 bytes).",
        )

    suffix = _safe_suffix(getattr(file, "filename", None))
    original_filename = _clean_filename(getattr(file, "filename", None), suffix)
    report_filename = _unique_report_filename(db, patient_id, original_filename)
    local_image_path = _write_temp_image(image_bytes, suffix)

    try:
        from app.services.ai_service import predict_dr_stage

        prediction, confidence, heatmap_bytes, heatmap_content_type, heatmap_ext = predict_dr_stage(local_image_path)
    except Exception as e:
        try:
            import traceback

            traceback.print_exc()
        except Exception:
            pass
        if os.path.exists(local_image_path):
            os.remove(local_image_path)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"AI prediction failed: {str(e)}",
        )
    finally:
        if os.path.exists(local_image_path):
            os.remove(local_image_path)

    image_remote_name = f"{uuid.uuid4().hex}_{report_filename}"
    image_content_type = getattr(file, "content_type", None) or (
        "image/jpeg" if suffix in [".jpg", ".jpeg"] else "image/png"
    )
    image_url = storage_service.upload_bytes(
        data=image_bytes,
        remote_filename=image_remote_name,
        content_type=image_content_type,
    )
    if not image_url:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Image storage failed")

    heatmap_url = ""
    if heatmap_bytes:
        hm_ext = heatmap_ext if heatmap_ext in [".png", ".jpg", ".jpeg"] else ".png"
        hm_name = f"{uuid.uuid4().hex}_heatmap_{Path(report_filename).stem}{hm_ext}"
        heatmap_url = storage_service.upload_bytes(
            data=heatmap_bytes,
            remote_filename=hm_name,
            content_type=heatmap_content_type or ("image/png" if hm_ext == ".png" else "image/jpeg"),
        )
        if not heatmap_url:
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Heatmap storage failed")

    new_report = Report(
        patient_id=patient_id,
        client_uuid=(client_uuid or "").strip() or None,
        filename=report_filename,
        image_url=image_url,
        heatmap_url=heatmap_url,
        prediction=prediction,
        confidence=confidence,
        source="sync_local",
    )

    db.add(new_report)
    db.commit()
    db.refresh(new_report)

    pref = get_or_create_preferences(db, current_user.id)

    db.add(
        Notification(
            user_id=current_user.id,
            patient_id=patient.id,
            report_id=new_report.id,
            type="REPORT_READY",
            title="Report ready",
            message=f"Report #{new_report.id} for {patient.name} is ready.",
        )
    )

    if pref.notifications_high_risk:
        if prediction in ["Severe", "Proliferative DR"]:
            db.add(
                Notification(
                    user_id=current_user.id,
                    patient_id=patient.id,
                    report_id=new_report.id,
                    type="HIGH_RISK",
                    title="Severe DR detected",
                    message=f"{patient.name} has {prediction}. Review within {pref.urgent_review_hours}h.",
                )
            )
        elif prediction == "Moderate":
            db.add(
                Notification(
                    user_id=current_user.id,
                    patient_id=patient.id,
                    report_id=new_report.id,
                    type="FOLLOW_UP",
                    title="Moderate DR detected",
                    message=f"{patient.name} has Moderate DR. Follow-up in {pref.follow_up_days_moderate} days.",
                )
            )

    if confidence < pref.min_confidence_threshold:
        db.add(
            Notification(
                user_id=current_user.id,
                patient_id=patient.id,
                report_id=new_report.id,
                type="MANUAL_REVIEW",
                title="Low confidence",
                message=f"Report #{new_report.id} confidence is {round(confidence * 100, 1)}%. Please review before action.",
            )
        )

    db.commit()
    return new_report


@router.post("/import", response_model=ReportResponse)
async def import_report(
    patient_id: int | None = Query(None),
    patient_client_uuid: str | None = Query(None),
    client_uuid: str = Form(...),
    prediction: str = Form(...),
    confidence: float = Form(...),
    description: str | None = Form(None),
    created_at: str | None = Form(None),
    updated_at: str | None = Form(None),
    file: UploadFile | None = File(None),
    heatmap: UploadFile | None = File(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Import a report created offline (sync).

    Idempotent on (doctor_id, report.client_uuid).
    """
    c_uuid = (client_uuid or "").strip()
    if not c_uuid:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="client_uuid is required")

    existing = (
        db.query(Report)
        .join(Patient, Patient.id == Report.patient_id)
        .filter(Patient.doctor_id == current_user.id, Report.client_uuid == c_uuid)
        .first()
    )
    if existing:
        return existing

    resolved_patient: Patient | None = None
    if patient_id is not None:
        resolved_patient = db.query(Patient).filter(Patient.id == patient_id, Patient.doctor_id == current_user.id).first()
    if resolved_patient is None and patient_client_uuid:
        resolved_patient = db.query(Patient).filter(Patient.doctor_id == current_user.id, Patient.client_uuid == patient_client_uuid).first()
    if resolved_patient is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Patient not found for import")

    filename = "offline-report.png"
    image_url: str | None = None
    if file is not None:
        await file.seek(0)
        image_bytes = await file.read()
        if not image_bytes:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Imported report image is empty")

        suffix = _safe_suffix(getattr(file, "filename", None))
        original_filename = _clean_filename(getattr(file, "filename", None), suffix)
        filename = _unique_report_filename(db, resolved_patient.id, original_filename)

        image_remote_name = f"{uuid.uuid4().hex}_{filename}"
        image_url = storage_service.upload_bytes(
            data=image_bytes,
            remote_filename=image_remote_name,
            content_type=getattr(file, "content_type", None),
        )

    heatmap_url = ""
    if heatmap is not None:
        await heatmap.seek(0)
        heatmap_bytes = await heatmap.read()
        if heatmap_bytes:
            hm_suffix = _safe_suffix(getattr(heatmap, "filename", None))
            hm_name = f"{uuid.uuid4().hex}_heatmap_{Path(filename).stem}{hm_suffix}"
            heatmap_url = storage_service.upload_bytes(
                data=heatmap_bytes,
                remote_filename=hm_name,
                content_type=getattr(heatmap, "content_type", None),
            )

    def _parse_dt(value: str | None) -> datetime | None:
        if not value:
            return None
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00")).replace(tzinfo=None)
        except Exception:
            return None

    created_dt = _parse_dt(created_at) or datetime.utcnow()
    updated_dt = _parse_dt(updated_at) or created_dt

    new_report = Report(
        patient_id=resolved_patient.id,
        client_uuid=c_uuid,
        filename=filename,
        image_url=image_url,
        heatmap_url=heatmap_url,
        prediction=prediction,
        confidence=float(confidence),
        description=description,
        created_at=created_dt,
        updated_at=updated_dt,
        source="sync_import",
    )
    db.add(new_report)
    db.commit()
    db.refresh(new_report)
    return new_report


@router.post("/manual", response_model=ReportResponse)
async def create_manual_report(
    report_in: ReportCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Create a new manual report without AI prediction.
    """
    patient = db.query(Patient).filter(
        Patient.id == report_in.patient_id,
        Patient.doctor_id == current_user.id,
    ).first()

    if not patient:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Patient not found or access denied",
        )

    new_report = Report(
        patient_id=report_in.patient_id,
        client_uuid=(report_in.client_uuid or "").strip() or None,
        filename=_unique_report_filename(db, report_in.patient_id, (report_in.filename or "manual-report").strip()),
        image_url=report_in.image_url,
        heatmap_url=report_in.heatmap_url,
        prediction=report_in.prediction,
        confidence=report_in.confidence,
        description=report_in.description,
        source="manual",
    )

    db.add(new_report)
    db.commit()
    db.refresh(new_report)

    pref = get_or_create_preferences(db, current_user.id)

    db.add(
        Notification(
            user_id=current_user.id,
            patient_id=patient.id,
            report_id=new_report.id,
            type="REPORT_READY",
            title="Manual report created",
            message=f"A manual triage report for {patient.name} was added.",
        )
    )

    if pref.notifications_high_risk:
        if report_in.prediction in ["Severe", "Proliferative DR"]:
            db.add(
                Notification(
                    user_id=current_user.id,
                    patient_id=patient.id,
                    report_id=new_report.id,
                    type="HIGH_RISK",
                    title="Severe DR noted",
                    message=f"{patient.name} manually marked as {report_in.prediction}.",
                )
            )
        elif report_in.prediction == "Moderate":
            db.add(
                Notification(
                    user_id=current_user.id,
                    patient_id=patient.id,
                    report_id=new_report.id,
                    type="FOLLOW_UP",
                    title="Moderate DR noted",
                    message=f"{patient.name} marked as Moderate DR.",
                )
            )

    db.commit()
    return new_report


@router.get("/", response_model=list[ReportResponse])
def get_all_reports(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    timeframe: str | None = Query(default=None, description="today|1d|7d|30d|custom|all"),
    start_date: str | None = Query(default=None, description="YYYY-MM-DD (required if timeframe=custom)"),
    end_date: str | None = Query(default=None, description="YYYY-MM-DD (required if timeframe=custom)"),
    latest_per_patient: bool = Query(default=False, description="Return only the latest report per patient (after filters)"),
):
    query = db.query(Report, Patient.name).join(Patient)
    if getattr(current_user, "role", "doctor") != "admin":
        query = query.filter(Patient.doctor_id == current_user.id)

    # Time filtering (created_at stored as naive UTC by default)
    tf = (timeframe or "").strip().lower()
    if tf and tf != "all":
        now = datetime.utcnow()
        if tf == "today":
            start = datetime(now.year, now.month, now.day)
            end = start.replace(hour=23, minute=59, second=59, microsecond=999999)
        elif tf in ["1d", "7d", "30d"]:
            days = int(tf.replace("d", ""))
            start = now - timedelta(days=days)
            end = now
        elif tf == "custom":
            if not start_date or not end_date:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="start_date and end_date are required for timeframe=custom")
            try:
                sd = datetime.strptime(start_date, "%Y-%m-%d").date()
                ed = datetime.strptime(end_date, "%Y-%m-%d").date()
            except Exception:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid date format. Use YYYY-MM-DD.")
            if ed < sd:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="end_date must be >= start_date")
            start = datetime(sd.year, sd.month, sd.day)
            end = datetime(ed.year, ed.month, ed.day).replace(hour=23, minute=59, second=59, microsecond=999999)
        else:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid timeframe. Use today|1d|7d|30d|custom|all.")
        query = query.filter(Report.created_at >= start, Report.created_at <= end)

    reports_with_patient = query.order_by(Report.created_at.desc(), Report.id.desc()).all()

    if latest_per_patient:
        seen: set[int] = set()
        deduped: list[tuple[Report, str]] = []
        for report, patient_name in reports_with_patient:
            if report.patient_id in seen:
                continue
            seen.add(report.patient_id)
            deduped.append((report, patient_name))
        reports_with_patient = deduped

    result = []
    for report, patient_name in reports_with_patient:
        r_dict = {
            "id": report.id,
            "patient_id": report.patient_id,
            "filename": getattr(report, "filename", None),
            "image_url": report.image_url,
            "heatmap_url": report.heatmap_url,
            "prediction": report.prediction,
            "confidence": report.confidence,
            "description": getattr(report, "description", None),
            "created_at": report.created_at,
            "patient_name": patient_name,
        }
        result.append(r_dict)
    return result


@router.get("/{report_id}", response_model=ReportResponse)
def get_report(
    report_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    report = (
        db.query(Report)
        .join(Patient)
        .filter(Report.id == report_id, Patient.doctor_id == current_user.id)
        .first()
    )

    if not report:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Report not found",
        )

    return report


@router.get("/patient/{patient_id}", response_model=list[ReportResponse])
def get_patient_reports(
    patient_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    patient = db.query(Patient).filter(
        Patient.id == patient_id,
        Patient.doctor_id == current_user.id,
    ).first()

    if not patient:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Patient not found or access denied",
        )

    reports = db.query(Report).filter(Report.patient_id == patient_id).all()

    result = []
    for report in reports:
        r_dict = {
            "id": report.id,
            "patient_id": report.patient_id,
            "filename": getattr(report, "filename", None),
            "image_url": report.image_url,
            "heatmap_url": report.heatmap_url,
            "prediction": report.prediction,
            "confidence": report.confidence,
            "description": getattr(report, "description", None),
            "created_at": report.created_at,
            "patient_name": patient.name,
        }
        result.append(r_dict)
    return result


@router.delete("/{report_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_report(
    report_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    report = (
        db.query(Report)
        .join(Patient)
        .filter(Report.id == report_id, Patient.doctor_id == current_user.id)
        .first()
    )

    if not report:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Report not found",
        )

    if report.image_url and not str(report.image_url).startswith("http") and os.path.exists(report.image_url):
        os.remove(report.image_url)
    if report.heatmap_url and not str(report.heatmap_url).startswith("http") and os.path.exists(report.heatmap_url):
        os.remove(report.heatmap_url)

    db.delete(report)
    db.commit()
    return None
