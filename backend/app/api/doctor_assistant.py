import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.auth import get_current_user
from app.db.database import SessionLocal
from app.models.patient import Patient
from app.models.report import Report
from app.models.users import User
from app.schemas.doctor_assistant import DoctorAssistantExplainRequest, DoctorAssistantExplainResponse
from app.services.doctor_assistant_llm import generate_with_fallback
from app.services.doctor_assistant_prompt import (
    build_prompts,
    dr_stage_score,
    priority_from_score,
    safe_rule_based_answer,
)

logger = logging.getLogger(__name__)

router = APIRouter(tags=["doctor-assistant"])


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _summary_from_answer(answer: str) -> str:
    a = (answer or "").strip()
    if not a:
        return ""
    first_line = a.splitlines()[0].strip()
    return first_line[:220]


def _get_patient_for_user(db: Session, patient_id: int, user: User) -> Optional[Patient]:
    q = db.query(Patient).filter(Patient.id == patient_id)
    if getattr(user, "role", "doctor") != "admin":
        q = q.filter(Patient.doctor_id == user.id)
    return q.first()


def _get_reports_for_patient(db: Session, patient_id: int, limit: int = 20) -> list[Report]:
    return (
        db.query(Report)
        .filter(Report.patient_id == patient_id)
        .order_by(Report.created_at.desc(), Report.id.desc())
        .limit(limit)
        .all()
    )


def _get_today_reports_for_user(db: Session, user: User) -> list[Report]:
    # created_at is stored as UTC (datetime.utcnow default, typically naive). Compare on UTC date (naive).
    today = datetime.utcnow().date()
    start = datetime(today.year, today.month, today.day)
    end = start.replace(hour=23, minute=59, second=59, microsecond=999999)

    q = db.query(Report).join(Patient, Patient.id == Report.patient_id).filter(Report.created_at >= start, Report.created_at <= end)
    if getattr(user, "role", "doctor") != "admin":
        q = q.filter(Patient.doctor_id == user.id)
    return q.order_by(Report.created_at.desc(), Report.id.desc()).all()


@router.post("/doctor-assistant/explain", response_model=DoctorAssistantExplainResponse)
@router.post("/api/doctor-assistant/explain", response_model=DoctorAssistantExplainResponse)
async def doctor_assistant_explain(
    payload: DoctorAssistantExplainRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    context_type = payload.context_type
    doctor_query = payload.doctor_query.strip()

    if context_type == "patient" and not payload.patient_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="patient_id is required for context_type=patient")

    patient: Optional[Patient] = None
    reports: list[Report] = []

    if context_type == "patient":
        patient = _get_patient_for_user(db, int(payload.patient_id), current_user)
        if not patient:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Patient not found or access denied")
        reports = _get_reports_for_patient(db, patient.id, limit=20)

    if context_type == "today_reports":
        reports = _get_today_reports_for_user(db, current_user)

    prompts = build_prompts(
        context_type=context_type,
        doctor_query=doctor_query,
        patient=patient,
        reports=reports,
    )

    latest = reports[0] if reports else None
    prev = reports[1] if len(reports) >= 2 else None
    latest_score = dr_stage_score(latest.prediction) if latest else 2
    prev_score = dr_stage_score(prev.prediction) if prev else latest_score
    worsening = bool(latest and prev and latest_score > prev_score)
    priority, priority_reason = priority_from_score(latest_score, worsening)

    cache_key = None
    if context_type == "general":
        cache_key = f"general::{doctor_query.lower()}"
    elif context_type == "today_reports":
        today = datetime.utcnow().date().isoformat()
        cache_key = f"today::{getattr(current_user,'id',0)}::{today}::{doctor_query.lower()}"
    else:
        latest_id = latest.id if latest else 0
        cache_key = f"patient::{patient.id if patient else 0}::{latest_id}::{doctor_query.lower()}"

    llm_text, provider_used, err = await generate_with_fallback(
        system_prompt=prompts.system,
        user_prompt=prompts.user,
        cache_key=cache_key,
    )

    if not llm_text:
        rule_answer, rule_summary = safe_rule_based_answer(
            context_type=context_type,
            patient=patient,
            reports=reports,
            doctor_query=doctor_query,
        )
        logger.error("DoctorAssistant: both providers failed: %s", err)
        return DoctorAssistantExplainResponse(
            status="error",
            message="LLM service unavailable",
            fallback="rule-based response",
            answer=rule_answer,
            summary=rule_summary,
            priority=priority,  # still useful for UI triage
            priority_reason=priority_reason,
            worsening_detected=worsening,
        )

    return DoctorAssistantExplainResponse(
        status="success",
        answer=llm_text,
        summary=_summary_from_answer(llm_text),
        priority=priority,
        priority_reason=priority_reason,
        worsening_detected=worsening,
        provider_used=provider_used,
    )
