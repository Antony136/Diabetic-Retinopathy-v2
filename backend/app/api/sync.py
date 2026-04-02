from __future__ import annotations

import os
import uuid
from datetime import datetime
from typing import Optional
from urllib.parse import urlparse

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.auth import get_current_user
from app.db.database import engine
from app.db.database import SessionLocal
from app.models.patient import Patient
from app.models.report import Report
from app.models.users import User
from app.services.storage_service import storage_service
from app.services.image_cache_service import cache_remote_image, get_cached_image


router = APIRouter(prefix="/api/sync", tags=["sync"])


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _parse_dt(value: str | None) -> Optional[datetime]:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).replace(tzinfo=None)
    except Exception:
        return None


def _dt_iso(dt: datetime) -> str:
    return dt.replace(microsecond=0).isoformat() + "Z"


def _is_remote_url(path: str | None) -> bool:
    if not path:
        return False
    lower = path.lower()
    return lower.startswith("http://") or lower.startswith("https://")


def _resolve_cloud_url(path: str | None, cloud_base: str | None) -> Optional[str]:
    if not path:
        return None
    if _is_remote_url(path):
        return path
    if path.startswith("/uploads") and cloud_base:
        return f"{cloud_base.rstrip('/')}{path}"
    return path


def _download_and_cache_image(db: Session, doctor_id: int, remote_url: str) -> str:
    if not _is_remote_url(remote_url):
        return remote_url

    cached = get_cached_image(db, doctor_id, remote_url)
    if cached:
        return cached.local_url

    local_url = cache_remote_image(db, doctor_id, remote_url)
    return local_url or remote_url


def _desktop_cache_enabled() -> bool:
    """
    Only cache remote assets into /uploads for the desktop/offline backend.

    On cloud deployments, rewriting image URLs to /uploads would break persistence.
    """
    try:
        if engine.dialect.name == "sqlite":
            return True
    except Exception:
        pass
    return (os.getenv("DESKTOP_MODE") or "").strip() == "1"


class SyncPatient(BaseModel):
    client_uuid: str
    name: str
    age: Optional[int] = None
    gender: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class SyncReport(BaseModel):
    client_uuid: str
    patient_client_uuid: str
    filename: Optional[str] = None
    image_url: Optional[str] = None
    heatmap_url: Optional[str] = None
    prediction: str
    confidence: float
    description: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    source: Optional[str] = None


class SyncExportResponse(BaseModel):
    server_time: str
    since: Optional[str] = None
    patients: list[SyncPatient]
    reports: list[SyncReport]


class SyncImportRequest(BaseModel):
    patients: list[SyncPatient] = []
    reports: list[SyncReport] = []


@router.get("/export", response_model=SyncExportResponse)
def export_changes(
    since: str | None = Query(None, description="ISO timestamp (UTC). If omitted, exports all."),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    since_dt = _parse_dt(since) if since else None

    # Ensure stable client_uuid values exist.
    patients_q = db.query(Patient)
    reports_q = db.query(Report).join(Patient, Patient.id == Report.patient_id)

    if getattr(current_user, "role", "doctor") != "admin":
        patients_q = patients_q.filter(Patient.doctor_id == current_user.id)
        reports_q = reports_q.filter(Patient.doctor_id == current_user.id)

    patients = patients_q.all()
    reports = reports_q.all()

    now = datetime.utcnow()
    dirty = False

    for p in patients:
        if not getattr(p, "client_uuid", None):
            p.client_uuid = str(uuid.uuid4())
            p.updated_at = now
            dirty = True
        if not getattr(p, "updated_at", None):
            p.updated_at = now
            dirty = True

    for r in reports:
        if not getattr(r, "client_uuid", None):
            r.client_uuid = str(uuid.uuid4())
            r.updated_at = now
            dirty = True
        if not getattr(r, "updated_at", None):
            r.updated_at = now
            dirty = True

    if dirty:
        db.commit()

    def patient_to_sync(p: Patient) -> SyncPatient:
        return SyncPatient(
            client_uuid=p.client_uuid,
            name=p.name,
            age=p.age,
            gender=p.gender,
            phone=p.phone,
            address=p.address,
            created_at=_dt_iso(p.created_at) if p.created_at else None,
            updated_at=_dt_iso(p.updated_at) if getattr(p, "updated_at", None) else None,
        )

    def report_to_sync(r: Report) -> SyncReport:
        p = db.query(Patient).filter(Patient.id == r.patient_id).first()
        return SyncReport(
            client_uuid=r.client_uuid,
            patient_client_uuid=getattr(p, "client_uuid", "") or "",
            filename=getattr(r, "filename", None),
            image_url=getattr(r, "image_url", None),
            heatmap_url=getattr(r, "heatmap_url", None),
            prediction=r.prediction,
            confidence=r.confidence,
            description=getattr(r, "description", None),
            created_at=_dt_iso(r.created_at) if r.created_at else None,
            updated_at=_dt_iso(getattr(r, "updated_at", None) or r.created_at or now),
            source=getattr(r, "source", None),
        )

    out_patients = [patient_to_sync(p) for p in patients if not since_dt or (getattr(p, "updated_at", p.created_at) and getattr(p, "updated_at", p.created_at) > since_dt)]
    out_reports = [report_to_sync(r) for r in reports if not since_dt or (getattr(r, "updated_at", r.created_at) and getattr(r, "updated_at", r.created_at) > since_dt)]

    return SyncExportResponse(
        server_time=_dt_iso(now),
        since=since,
        patients=out_patients,
        reports=out_reports,
    )


@router.post("/import")
def import_changes(
    payload: SyncImportRequest,
    cloud_base: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if getattr(current_user, "role", "doctor") == "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sync import is not supported for admin users")

    # Patients first (so reports can link by client_uuid).
    patient_map: dict[str, Patient] = {}

    for p in payload.patients:
        c_uuid = (p.client_uuid or "").strip()
        if not c_uuid:
            continue

        incoming_updated = _parse_dt(p.updated_at) or _parse_dt(p.created_at) or datetime.utcnow()
        existing = db.query(Patient).filter(Patient.doctor_id == current_user.id, Patient.client_uuid == c_uuid).first()

        if existing:
            existing_updated = getattr(existing, "updated_at", None) or existing.created_at or datetime.min
            if incoming_updated > existing_updated:
                existing.name = p.name
                existing.age = p.age
                existing.gender = p.gender
                existing.phone = p.phone
                existing.address = p.address
                existing.updated_at = incoming_updated
            patient_map[c_uuid] = existing
            continue

        created_dt = _parse_dt(p.created_at) or datetime.utcnow()
        new_p = Patient(
            client_uuid=c_uuid,
            name=p.name,
            age=p.age,
            gender=p.gender,
            phone=p.phone,
            address=p.address,
            doctor_id=current_user.id,
            created_at=created_dt,
            updated_at=incoming_updated,
        )
        db.add(new_p)
        db.flush()
        patient_map[c_uuid] = new_p

    # Reports next.
    enable_cache = _desktop_cache_enabled()
    for r in payload.reports:
        c_uuid = (r.client_uuid or "").strip()
        p_uuid = (r.patient_client_uuid or "").strip()
        if not c_uuid or not p_uuid:
            continue

        patient = patient_map.get(p_uuid) or db.query(Patient).filter(Patient.doctor_id == current_user.id, Patient.client_uuid == p_uuid).first()
        if not patient:
            continue

        existing = (
            db.query(Report)
            .join(Patient, Patient.id == Report.patient_id)
            .filter(Patient.doctor_id == current_user.id, Report.client_uuid == c_uuid)
            .first()
        )
        if existing:
            continue

        created_dt = _parse_dt(r.created_at) or datetime.utcnow()
        updated_dt = _parse_dt(r.updated_at) or created_dt

        image_url = _resolve_cloud_url(r.image_url, cloud_base)
        heatmap_url = _resolve_cloud_url(r.heatmap_url, cloud_base)

        if enable_cache:
            if image_url and _is_remote_url(image_url):
                image_url = _download_and_cache_image(db, current_user.id, image_url)
            if heatmap_url and _is_remote_url(heatmap_url):
                heatmap_url = _download_and_cache_image(db, current_user.id, heatmap_url)

        new_r = Report(
            client_uuid=c_uuid,
            patient_id=patient.id,
            filename=r.filename,
            image_url=image_url,
            heatmap_url=heatmap_url,
            prediction=r.prediction,
            confidence=float(r.confidence),
            description=r.description,
            created_at=created_dt,
            updated_at=updated_dt,
            source=r.source or "sync_import",
        )
        db.add(new_r)

    db.commit()
    return {"status": "ok"}
