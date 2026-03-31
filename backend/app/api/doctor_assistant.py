import logging
from datetime import date, datetime, timedelta
from typing import Optional, Tuple

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


def _get_reports_for_patient(
    db: Session,
    patient_id: int,
    *,
    limit: int = 50,
    dt_range: Optional[Tuple[datetime, datetime]] = None,
) -> list[Report]:
    q = db.query(Report).filter(Report.patient_id == patient_id)
    if dt_range:
        start, end = dt_range
        q = q.filter(Report.created_at >= start, Report.created_at <= end)
    return q.order_by(Report.created_at.desc(), Report.id.desc()).limit(limit).all()


def _parse_ymd(s: str) -> date:
    try:
        return datetime.strptime(s, "%Y-%m-%d").date()
    except Exception:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid date format. Use YYYY-MM-DD.")


def _resolve_timeframe(payload: DoctorAssistantExplainRequest) -> Optional[Tuple[datetime, datetime]]:
    """
    Returns (start_dt, end_dt) in naive UTC datetimes for DB filtering, or None for all-time / not set.
    """
    tf = (payload.timeframe or "").strip().lower()
    if not tf:
        return None

    today = datetime.utcnow().date()
    if tf == "all":
        return None
    if tf == "today":
        start = datetime(today.year, today.month, today.day)
        end = start.replace(hour=23, minute=59, second=59, microsecond=999999)
        return start, end
    if tf in ["7d", "30d", "90d"]:
        days = int(tf.replace("d", ""))
        start_date = today - timedelta(days=days)
        start = datetime(start_date.year, start_date.month, start_date.day)
        end = datetime(today.year, today.month, today.day).replace(hour=23, minute=59, second=59, microsecond=999999)
        return start, end
    if tf == "custom":
        if not payload.start_date or not payload.end_date:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="start_date and end_date are required for timeframe=custom")
        sd = _parse_ymd(payload.start_date)
        ed = _parse_ymd(payload.end_date)
        if ed < sd:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="end_date must be >= start_date")
        start = datetime(sd.year, sd.month, sd.day)
        end = datetime(ed.year, ed.month, ed.day).replace(hour=23, minute=59, second=59, microsecond=999999)
        return start, end

    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid timeframe. Use today|7d|30d|90d|all|custom.")

def _get_today_reports_for_user(db: Session, user: User) -> list[Report]:
    # created_at is stored as UTC (datetime.utcnow default, typically naive). Compare on UTC date (naive).
    today = datetime.utcnow().date()
    start = datetime(today.year, today.month, today.day)
    end = start.replace(hour=23, minute=59, second=59, microsecond=999999)

    q = db.query(Report).join(Patient, Patient.id == Report.patient_id).filter(Report.created_at >= start, Report.created_at <= end)
    if getattr(user, "role", "doctor") != "admin":
        q = q.filter(Patient.doctor_id == user.id)
    return q.order_by(Report.created_at.desc(), Report.id.desc()).all()

def _get_report_rows_for_user_in_range(db: Session, user: User, dt_range: Optional[Tuple[datetime, datetime]]) -> list[dict]:
    q = (
        db.query(Report, Patient)
        .join(Patient, Patient.id == Report.patient_id)
    )
    if dt_range:
        start, end = dt_range
        q = q.filter(Report.created_at >= start, Report.created_at <= end)
    if getattr(user, "role", "doctor") != "admin":
        q = q.filter(Patient.doctor_id == user.id)

    rows: list[dict] = []
    for report, patient in q.order_by(Report.created_at.desc(), Report.id.desc()).all():
        rows.append(
            {
                "patient_id": patient.id,
                "name": patient.name,
                "age": patient.age,
                "gender": patient.gender,
                "report_id": report.id,
                "prediction": report.prediction,
                "confidence": report.confidence,
                "created_at": report.created_at,
                "description": report.description,
            }
        )
    return rows


def _latest_per_patient(rows: list[dict]) -> list[dict]:
    by_pid: dict[int, dict] = {}
    for it in rows:
        pid = int(it.get("patient_id") or 0)
        if pid <= 0:
            continue
        prev = by_pid.get(pid)
        if not prev:
            by_pid[pid] = it
            continue
        a = it.get("created_at")
        b = prev.get("created_at")
        if isinstance(a, datetime) and isinstance(b, datetime) and a > b:
            by_pid[pid] = it
            continue
        if int(it.get("report_id") or 0) > int(prev.get("report_id") or 0):
            by_pid[pid] = it
    return list(by_pid.values())


@router.post("/doctor-assistant/explain", response_model=DoctorAssistantExplainResponse)
@router.post("/api/doctor-assistant/explain", response_model=DoctorAssistantExplainResponse)
async def doctor_assistant_explain(
    payload: DoctorAssistantExplainRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    context_type = payload.context_type
    doctor_query = payload.doctor_query.strip()
    task = payload.task
    dt_range = _resolve_timeframe(payload)

    if context_type == "patient" and not payload.patient_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="patient_id is required for context_type=patient")

    patient: Optional[Patient] = None
    reports: list[Report] = []
    today_rows: list[dict] = []
    range_rows: list[dict] = []

    if context_type == "patient":
        patient = _get_patient_for_user(db, int(payload.patient_id), current_user)
        if not patient:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Patient not found or access denied")
        reports = _get_reports_for_patient(db, patient.id, limit=50, dt_range=dt_range)

    if context_type == "today_reports":
        # Defaults to today, but supports timeframe overrides (7d/30d/90d/custom/all).
        if not payload.timeframe:
            payload.timeframe = "today"
            dt_range = _resolve_timeframe(payload)
        today_rows = _get_report_rows_for_user_in_range(db, current_user, dt_range)
        reports = _get_today_reports_for_user(db, current_user) if payload.timeframe == "today" else []

    if context_type == "reports_range":
        range_rows = _get_report_rows_for_user_in_range(db, current_user, dt_range)
        if task == "triage_queue":
            range_rows = _latest_per_patient(range_rows)

    prompts = build_prompts(
        context_type=context_type,
        doctor_query=doctor_query,
        patient=patient,
        reports=reports,
        today_rows=today_rows if context_type == "today_reports" else None,
        range_rows=range_rows if context_type == "reports_range" else None,
        task=task,
        dt_range=dt_range,
    )

    worsening: Optional[bool] = None
    priority: Optional[str] = None
    priority_reason: Optional[str] = None

    if context_type == "patient":
        latest = reports[0] if reports else None
        prev = reports[1] if len(reports) >= 2 else None
        latest_score = dr_stage_score(latest.prediction) if latest else 2
        prev_score = dr_stage_score(prev.prediction) if prev else latest_score
        worsening = bool(latest and prev and latest_score > prev_score)
        priority, priority_reason = priority_from_score(latest_score, bool(worsening))
    elif context_type == "today_reports":
        # Priority reflects the worst case present today.
        scores = [dr_stage_score(str(it.get("prediction") or "")) for it in today_rows] if today_rows else []
        worst = max(scores) if scores else 2
        priority, priority_reason = priority_from_score(worst, False)
    elif context_type == "reports_range":
        scores = [dr_stage_score(str(it.get("prediction") or "")) for it in range_rows] if range_rows else []
        worst = max(scores) if scores else 2
        priority, priority_reason = priority_from_score(worst, False)
    else:
        # general: don't return priority
        worsening = None
        priority = None
        priority_reason = None

    cache_key = None
    if context_type == "general":
        cache_key = f"general::{task}::{doctor_query.lower()}"
    elif context_type == "today_reports":
        today = datetime.utcnow().date().isoformat()
        tf = payload.timeframe or "today"
        cache_key = f"today::{task}::{getattr(current_user,'id',0)}::{tf}::{payload.start_date or ''}::{payload.end_date or ''}::{today}::{doctor_query.lower()}"
    else:
        if context_type == "reports_range":
            tf = payload.timeframe or "all"
            cache_key = f"range::{task}::{getattr(current_user,'id',0)}::{tf}::{payload.start_date or ''}::{payload.end_date or ''}::{doctor_query.lower()}"
        else:
            latest = reports[0] if reports else None
            latest_id = latest.id if latest else 0
            cache_key = f"patient::{task}::{patient.id if patient else 0}::{latest_id}::{doctor_query.lower()}"

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
            today_rows=today_rows if context_type == "today_reports" else None,
            range_rows=range_rows if context_type == "reports_range" else None,
            task=task,
        )
        logger.error("DoctorAssistant: both providers failed: %s", err)
        return DoctorAssistantExplainResponse(
            status="error",
            message="LLM service unavailable",
            fallback="rule-based response",
            answer=rule_answer,
            summary=rule_summary,
            priority=priority,
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
