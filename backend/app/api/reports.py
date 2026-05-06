from typing import List, Optional
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
from app.services.dual_mode_service import apply_dual_mode_logic_remote
from pathlib import Path, PurePosixPath
from urllib.parse import urlparse
import httpx
import os
import tempfile
import uuid
import json
from datetime import datetime, timedelta
from app.services.batch_inference_service import batch_inference_service, batch_progress_store
import asyncio
import pandas as pd


router = APIRouter(prefix="/api/reports", tags=["reports"])

from fastapi import BackgroundTasks
from app.services.batch_inference_service import batch_inference_service, batch_progress_store, batch_results_store

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _safe_suffix(filename: str | None) -> str | None:
    try:
        suffix = Path(filename or "").suffix
    except Exception:
        suffix = ""
    if suffix.lower() in [".jpg", ".jpeg", ".png"]:
        return suffix.lower()
    return None


def _normalize_mode(mode: str | None) -> str:
    m = (mode or "standard").strip().lower()
    if m in ("standard", "high_sensitivity"):
        return m
    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid mode.")


def _write_temp_image(image_bytes: bytes, suffix: str) -> str:
    tmp_dir = Path(tempfile.gettempdir())
    tmp_path = tmp_dir / f"dr_{uuid.uuid4().hex}{suffix}"
    tmp_path.write_bytes(image_bytes)
    return str(tmp_path)


def _clean_filename(name: str | None, default_ext: str) -> str:
    cleaned = Path(name or "").name.strip()
    if not cleaned: cleaned = f"retina{default_ext}"
    if "." not in cleaned: cleaned = f"{cleaned}{default_ext}"
    return cleaned


def _unique_report_filename(db: Session, patient_id: int, desired: str) -> str:
    desired = desired.strip() or "retina.png"
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
    if pref: return pref
    pref = UserPreference(user_id=user_id)
    db.add(pref)
    db.commit()
    db.refresh(pref)
    return pref


def _read_local_upload_bytes(url_path: str) -> bytes:
    uploads_dir = Path((os.getenv("UPLOADS_DIR") or "uploads").strip() or "uploads")
    name = PurePosixPath(url_path).name
    fs_path = uploads_dir / name
    if not fs_path.exists(): raise FileNotFoundError(f"Local upload not found: {name}")
    return fs_path.read_bytes()


async def _fetch_bytes_for_url(path_or_url: str) -> bytes:
    s = (path_or_url or "").strip()
    if not s: raise ValueError("Empty URL")
    if s.startswith("/uploads/"): return _read_local_upload_bytes(s)
    if s.startswith("http://") or s.startswith("https://"):
        async with httpx.AsyncClient(timeout=60.0, follow_redirects=True) as client:
            r = await client.get(s)
            r.raise_for_status()
            return r.content
    raise ValueError("Unsupported path")


@router.post("/cache-url")
async def cache_image_url(url: str = Form(...), current_user: User = Depends(get_current_user)):
    if not url or not (url.startswith("http://") or url.startswith("https://")):
        raise HTTPException(status_code=400, detail="Invalid image URL")
    try:
        async with httpx.AsyncClient(timeout=60.0, follow_redirects=True) as client:
            response = await client.get(url)
            response.raise_for_status()
            parsed = Path(urlparse(url).path).name or f"{uuid.uuid4().hex}.png"
            local_url = storage_service.upload_bytes(response.content, parsed)
            return {"local_url": local_url}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to cache image: {e}")


@router.get("/batch/progress/{batch_id}")
async def get_batch_progress(batch_id: str):
    if batch_id in batch_results_store:
        return {"done": 1, "total": 1, "status": "completed"}
    if batch_id in batch_progress_store:
        return {**batch_progress_store[batch_id], "status": "processing"}
    return {"done": 0, "total": 0, "status": "not_found"}

@router.get("/batch/result/{batch_id}")
async def get_batch_result(batch_id: str):
    """
    Returns the final results of a completed batch.
    """
    if batch_id in batch_results_store:
        return batch_results_store[batch_id]["result"]
    
    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail="Batch result not found or still processing."
    )

def _save_batch_to_db(db: Session, batch_results: dict, mode: str, user_id: int, batch_id: str):
    """Synchronous helper to save results to DB in one go."""
    from app.models.users import User
    current_user = db.query(User).filter(User.id == user_id).first()
    if not current_user: return 0

    ai_provider = (os.getenv("AI_PROVIDER") or "").strip().lower()
    use_local = ai_provider in ("local", "offline", "desktop")
    source = "sync_local" if use_local else "sync_remote"
    saved_count = 0

    for res in batch_results.get("results", []):
        try:
            meta = res.get("metadata") or {}
            pid = (meta.get("patient_id") or meta.get("id") or meta.get("client_uuid") or meta.get("patient_no"))
            pname = (meta.get("patient_name") or meta.get("name") or meta.get("patient"))
            
            patient_query = db.query(Patient)
            if current_user.role != "admin":
                patient_query = patient_query.filter(Patient.doctor_id == current_user.id)
            
            patient = None
            if pid and str(pid).isdigit():
                patient = patient_query.filter(Patient.id == int(pid)).first()
            if not patient and pid:
                patient = patient_query.filter(Patient.client_uuid == str(pid)).first()
            if not patient and pname:
                patient = patient_query.filter(Patient.name == str(pname)).first()
            
            if not patient:
                patient = Patient(
                    client_uuid=str(pid) if pid else str(uuid.uuid4()),
                    name=str(pname) if pname else f"Batch: {res.get('name', 'Unknown')}",
                    age=int(meta.get("age", 0)) if meta.get("age") else None,
                    gender=str(meta.get("gender", "")),
                    doctor_id=current_user.id
                )
                db.add(patient)
                db.flush() # Get ID without commit
            
            report_filename = _unique_report_filename(db, patient.id, res.get("name", "batch.png"))
            new_report = Report(
                patient_id=patient.id,
                filename=report_filename,
                image_url=res.get("image_url", ""),
                heatmap_url=res.get("heatmap_url", ""),
                prediction=res.get("prediction", "Unknown"),
                confidence=res.get("confidence", 0.0),
                source=source,
                image_explanation=res.get("clinical_summary"),
                risk_score=res.get("risk_score"),
                decision=res.get("decision"),
                mode=mode,
                adaptive_explanation=res.get("explanation"),
                pdf_url=res.get("pdf_url", "")
            )
            db.add(new_report)
            saved_count += 1
        except Exception as e:
            print(f"WARN: Failed to save individual result in batch {batch_id}: {e}")

    db.commit()
    return saved_count

async def _background_batch_task(
    image_paths: List[str],
    csv_path: str,
    mode: str,
    batch_id: str,
    provider: str,
    user_id: int,
):
    try:
        # 1. Read CSV data from disk
        csv_data = b""
        if os.path.exists(csv_path):
            with open(csv_path, "rb") as f:
                csv_data = f.read()

        # 2. Reconstruct minimal files_data (one by one would be better but let's see)
        # Actually, let's modify process_batch_raw to take paths directly to be even more efficient.
        # For now, I'll keep the interface but read them here.
        files_data = []
        for p in image_paths:
            if os.path.exists(p):
                with open(p, "rb") as f:
                    files_data.append({
                        "filename": Path(p).name,
                        "content": f.read(),
                        "content_type": "image/jpeg" # fallback
                    })

        # 3. Inference
        batch_results = await batch_inference_service.process_batch_raw(
            files_data=files_data,
            mode=mode,
            csv_content=csv_data,
            batch_id=batch_id,
            provider=provider
        )

        # 4. Save to DB
        loop = asyncio.get_running_loop()
        def _db_op():
            with SessionLocal() as db:
                return _save_batch_to_db(db, batch_results, mode, user_id, batch_id)
        
        await loop.run_in_executor(None, _db_op)
    except Exception as e:
        print(f"ERROR: Background batch {batch_id} failed: {e}")
    finally:
        # Cleanup temporary files
        for p in image_paths:
            if os.path.exists(p): os.remove(p)
        if os.path.exists(csv_path): os.remove(csv_path)


@router.post("/batch")
async def create_batch_reports(
    background_tasks: BackgroundTasks,
    files: List[UploadFile] = File(...),
    csv_file: UploadFile = File(...),
    mode: str = Query("standard"),
    batch_id: Optional[str] = Query(None),
    provider: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
):
    """
    Asynchronous Batch Screening. Disk-buffered to prevent OOM on 512MB RAM limit.
    """
    mode = _normalize_mode(mode)
    if not batch_id: batch_id = uuid.uuid4().hex[:8]

    if len(files) > 50:
        raise HTTPException(status_code=413, detail="Max 50 items allowed.")

    try:
        import tempfile
        image_paths = []
        
        # Save images to temp files immediately (low RAM)
        for f in files:
            suffix = Path(f.filename or "batch.jpg").suffix or ".jpg"
            with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
                content = await f.read()
                tmp.write(content)
                image_paths.append(tmp.name)
        
        # Save CSV to temp file
        csv_path = ""
        with tempfile.NamedTemporaryFile(delete=False, suffix=".csv") as tmp:
            csv_content = await csv_file.read()
            tmp.write(csv_content)
            csv_path = tmp.name
        
        background_tasks.add_task(
            _background_batch_task,
            image_paths=image_paths,
            csv_path=csv_path,
            mode=mode,
            batch_id=batch_id,
            provider=provider or "cloud",
            user_id=current_user.id
        )
        
        return {"batch_id": batch_id, "status": "processing"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Start failed: {e}")


@router.post("/", response_model=ReportResponse)
async def create_report(
    patient_id: int = Query(...),
    file: UploadFile = File(...),
    mode: str = Query("standard"),
    client_uuid: str | None = Query(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Create a new report with image upload and AI prediction.
    Now supports dual-mode adaptive screening (standard vs high_sensitivity).
    """
    mode = _normalize_mode(mode)

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
    # Strict extension check before creating temp file
    if suffix is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid image. Please upload a retinal fundus image (JPG/PNG only).",
        )

    original_filename = _clean_filename(getattr(file, "filename", None), suffix)
    report_filename = _unique_report_filename(db, patient_id, original_filename)
    local_image_path = _write_temp_image(image_bytes, suffix)

    # Multi-analysis using existing model outputs
    from app.services import image_explanation_service

    try:
        provider = (os.getenv("AI_PROVIDER") or "").strip().lower()
        use_local = provider in ("local", "offline", "desktop")

        # Defaults (keeps mypy/linters happy and avoids accidental UnboundLocalError)
        prediction = "Unknown"
        confidence = 0.0
        heatmap_bytes = None
        heatmap_content_type = None
        heatmap_ext = None
        risk_score = None
        risk_level = None
        decision = None
        adaptive_explanation = None
        override_applied = False
        source = "sync_local" if use_local else "sync_remote"

        if use_local:
            # Local (desktop/offline) dual-mode screening using bundled checkpoint.
            from app.services.dual_mode_service import run_inference, load_model, MODEL_PATH

            try:
                model = load_model(MODEL_PATH)
            except FileNotFoundError as e:
                raise HTTPException(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    detail=f"Local AI model not available on this device: {e}",
                )
            except ModuleNotFoundError as e:
                raise HTTPException(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    detail=f"Local AI dependencies missing: {e}",
                )
            except Exception as e:
                raise HTTPException(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    detail=f"Local AI failed to initialize: {e}",
                )

            result = run_inference(local_image_path, mode, model=model)

            prediction = result["grade"]
            confidence = float(result["confidence"])
            risk_score = result["risk_score"]
            risk_level = result["risk_level"]
            decision = result["decision"]
            adaptive_explanation = result["explanation"]
            override_applied = result["override_applied"]

            # Heatmap (best-effort) via local Grad-CAM pipeline.
            try:
                from app.services.local_ai_service import predict as local_predict

                _lbl, _conf, heatmap_bytes, heatmap_content_type, heatmap_ext = local_predict(local_image_path)
            except Exception as e:
                # Heatmap is optional; do not fail the report for this.
                print(f"WARNING: heatmap generation failed: {e}")
                heatmap_bytes = None
                heatmap_content_type = None
                heatmap_ext = None
        else:
            # Online/cloud: default to Hugging Face (or other remote provider) to avoid missing-checkpoint 500s.
            from app.services.ai_service import predict_dr_stage

            prediction, confidence, heatmap_bytes, heatmap_content_type, heatmap_ext = predict_dr_stage(local_image_path)
            confidence = float(confidence)
            triage = apply_dual_mode_logic_remote(prediction, mode, confidence)
            risk_score = triage["risk_score"]
            risk_level = triage["risk_level"]
            decision = triage["decision"]
            adaptive_explanation = triage["explanation"]
            override_applied = triage["override_applied"]
        
    except ValueError as ve:
        # Catch strict validation (heuristics/confidence filter) from dual_mode_service
        if os.path.exists(local_image_path):
            os.remove(local_image_path)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(ve) or "Invalid image. Please upload a retinal fundus image (JPG/PNG only).",
        )
    except (httpx.ConnectError, httpx.ReadTimeout, httpx.ConnectTimeout) as e:
        if os.path.exists(local_image_path):
            os.remove(local_image_path)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"AI provider unreachable: {e}",
        )
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

    image_observations_raw: str | None = None
    image_explanation: str | None = None
    image_explanation_summary: str | None = None
    image_explanation_structured: str | None = None
    if heatmap_bytes:
        try:
            hm_img = image_explanation_service.load_heatmap_image_from_bytes(heatmap_bytes)
            feats = image_explanation_service.extract_heatmap_features(hm_img)
            obs = image_explanation_service.derive_observations(feats)
            image_observations_raw = image_explanation_service.pack_observations(obs)
            # Generate summary, detailed, and structured explanation (best-effort, skip on failure)
            image_explanation_summary = await image_explanation_service.generate_image_explanation_summary(
                diagnosis=prediction,
                confidence=float(confidence),
                cache_key=f"imgexp_summary:{prediction}:{round(float(confidence),4)}",
            )
            image_explanation = await image_explanation_service.generate_image_explanation(
                diagnosis=prediction,
                confidence=float(confidence),
                observations=obs,
                cache_key=f"imgexp:{prediction}:{round(float(confidence),4)}:{image_explanation_service.get_stable_hash(obs)}",
            )
            structured = await image_explanation_service.generate_structured_explanation(
                diagnosis=prediction,
                confidence=float(confidence),
                observations=obs,
                cache_key=f"imgexp_struct:{prediction}:{round(float(confidence),4)}:{image_explanation_service.get_stable_hash(obs)}",
            )
            image_explanation_structured = json.dumps(structured) if structured else None
        except Exception as e:
            print(f"WARNING: image explanation generation failed: {e}")

    new_report = Report(
        patient_id=patient_id,
        client_uuid=(client_uuid or "").strip() or None,
        filename=report_filename,
        image_url=image_url,
        heatmap_url=heatmap_url,
        prediction=prediction,
        confidence=confidence,
        source=source,
        image_observations=image_observations_raw,
        image_explanation=image_explanation,
        image_explanation_summary=image_explanation_summary,
        image_explanation_structured=image_explanation_structured,
        # New Additions
        risk_score=risk_score,
        risk_level=risk_level,
        decision=decision,
        mode=mode,
        adaptive_explanation=adaptive_explanation,
        override_applied=override_applied
    )

    db.add(new_report)
    db.commit()
    db.refresh(new_report)

    # Notifications/preferences are non-critical
    try:
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
    except Exception as e:
        try:
            db.rollback()
        except Exception:
            pass
        print(f"WARNING: post-report notifications/preferences failed: {e}")

    return new_report


@router.post("/import", response_model=ReportResponse)
async def import_report(
    patient_id: int | None = Query(None),
    patient_client_uuid: str | None = Query(None),
    client_uuid: str = Form(...),
    prediction: str = Form(...),
    confidence: float = Form(...),
    description: str | None = Form(None),
    image_observations: str | None = Form(None),
    image_explanation: str | None = Form(None),
    created_at: str | None = Form(None),
    updated_at: str | None = Form(None),
    file: UploadFile | None = File(None),
    heatmap: UploadFile | None = File(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Import a report created offline (sync).
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
        image_observations=image_observations,
        image_explanation=image_explanation,
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

    # Time filtering
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
            "image_observations": getattr(report, "image_observations", None),
            "image_explanation": getattr(report, "image_explanation", None),
            "image_explanation_summary": getattr(report, "image_explanation_summary", None),
            "image_explanation_structured": getattr(report, "image_explanation_structured", None),
            # New fields
            "risk_score": report.risk_score,
            "risk_level": report.risk_level,
            "decision": report.decision,
            "mode": report.mode,
            "adaptive_explanation": report.adaptive_explanation,
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
            "image_observations": getattr(report, "image_observations", None),
            "image_explanation": getattr(report, "image_explanation", None),
            "image_explanation_summary": getattr(report, "image_explanation_summary", None),
            "image_explanation_structured": getattr(report, "image_explanation_structured", None),
            # New fields
            "risk_score": report.risk_score,
            "risk_level": report.risk_level,
            "decision": report.decision,
            "mode": report.mode,
            "adaptive_explanation": report.adaptive_explanation,
            "created_at": report.created_at,
            "patient_name": patient.name,
        }
        result.append(r_dict)
    return result


@router.post("/{report_id}/image-explanation")
async def generate_report_image_explanation(
    report_id: int,
    force: bool = Query(False, description="Re-generate even if already present"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Generate (or refresh) the image-based explanation for a report using its heatmap.
    """
    report = (
        db.query(Report)
        .join(Patient, Patient.id == Report.patient_id)
        .filter(Report.id == report_id, Patient.doctor_id == current_user.id)
        .first()
    )
    if not report:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report not found")

    if getattr(report, "image_explanation", None) and not force:
        return {
            "image_observations": getattr(report, "image_observations", None),
            "image_explanation": getattr(report, "image_explanation", None),
            "image_explanation_summary": getattr(report, "image_explanation_summary", None),
            "image_explanation_structured": getattr(report, "image_explanation_structured", None),
        }

    if not report.heatmap_url:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Report has no heatmap to explain")

    try:
        hm_bytes = await _fetch_bytes_for_url(str(report.heatmap_url))
        from app.services import image_explanation_service
        hm_img = image_explanation_service.load_heatmap_image_from_bytes(hm_bytes)
        feats = image_explanation_service.extract_heatmap_features(hm_img)
        obs = image_explanation_service.derive_observations(feats)
        packed = image_explanation_service.pack_observations(obs)
        
        # Generate summary, detailed, and structured explanations
        explanation_summary = await image_explanation_service.generate_image_explanation_summary(
            diagnosis=str(report.prediction),
            confidence=float(report.confidence or 0.0),
            cache_key=f"imgexp_summary:report:{report.id}",
        )
        explanation = await image_explanation_service.generate_image_explanation(
            diagnosis=str(report.prediction),
            confidence=float(report.confidence or 0.0),
            observations=obs,
            cache_key=f"imgexp:report:{report.id}:{image_explanation_service.get_stable_hash(obs)}",
        )
        structured = await image_explanation_service.generate_structured_explanation(
            diagnosis=str(report.prediction),
            confidence=float(report.confidence or 0.0),
            observations=obs,
            cache_key=f"imgexp_struct:report:{report.id}:{image_explanation_service.get_stable_hash(obs)}",
        )
        structured_json = json.dumps(structured) if structured else None
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to generate image explanation: {e}")

    report.image_observations = packed
    report.image_explanation = explanation
    report.image_explanation_summary = explanation_summary
    report.image_explanation_structured = structured_json
    report.updated_at = datetime.utcnow()
    db.commit()

    return {
        "image_observations": packed,
        "image_explanation": explanation,
        "image_explanation_summary": explanation_summary,
        "image_explanation_structured": structured_json,
    }


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
