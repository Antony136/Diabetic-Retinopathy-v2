from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Query
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
import os
import tempfile
import uuid


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


@router.post("/", response_model=ReportResponse)
async def create_report(
    patient_id: int = Query(...),
    file: UploadFile = File(...),
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
    if not str(image_url).startswith("http"):
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Supabase Storage upload failed (check SUPABASE_URL/SUPABASE_KEY and bucket permissions).",
        )

    heatmap_url = ""
    if heatmap_bytes:
        hm_ext = heatmap_ext if heatmap_ext in [".png", ".jpg", ".jpeg"] else ".png"
        hm_name = f"{uuid.uuid4().hex}_heatmap_{Path(report_filename).stem}{hm_ext}"
        heatmap_url = storage_service.upload_bytes(
            data=heatmap_bytes,
            remote_filename=hm_name,
            content_type=heatmap_content_type or ("image/png" if hm_ext == ".png" else "image/jpeg"),
        )
        if heatmap_url and not str(heatmap_url).startswith("http"):
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Supabase Storage heatmap upload failed (check SUPABASE_URL/SUPABASE_KEY and bucket permissions).",
            )

    new_report = Report(
        patient_id=patient_id,
        filename=report_filename,
        image_url=image_url,
        heatmap_url=heatmap_url,
        prediction=prediction,
        confidence=confidence,
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
        filename=_unique_report_filename(db, report_in.patient_id, (report_in.filename or "manual-report").strip()),
        image_url=report_in.image_url,
        heatmap_url=report_in.heatmap_url,
        prediction=report_in.prediction,
        confidence=report_in.confidence,
        description=report_in.description,
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
):
    query = db.query(Report, Patient.name).join(Patient)
    if getattr(current_user, "role", "doctor") != "admin":
        query = query.filter(Patient.doctor_id == current_user.id)
    reports_with_patient = query.all()

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
