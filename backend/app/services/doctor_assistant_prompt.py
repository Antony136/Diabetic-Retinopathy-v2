from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timezone
from typing import Iterable, Optional

from app.models.patient import Patient
from app.models.report import Report


def _dt(dt: Optional[datetime]) -> str:
    if not dt:
        return "unknown"
    try:
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    except Exception:
        return str(dt)


def dr_stage_score(stage: str) -> int:
    s = (stage or "").strip().lower()
    # Common DR labels (kept flexible).
    if "no" in s and "dr" in s:
        return 0
    if "mild" in s:
        return 1
    if "moderate" in s:
        return 2
    if "severe" in s:
        return 3
    if "prolif" in s or "pdr" in s:
        return 4
    # If the model outputs grades like "Grade 3"
    for n in ["4", "3", "2", "1", "0"]:
        if f"grade {n}" in s or f"grade-{n}" in s or f"grade{n}" in s:
            return int(n)
    return 2


def priority_from_score(score: int, worsening: bool) -> tuple[str, str]:
    if score >= 3 or worsening:
        reason = "Severe/progressive DR risk" if score >= 3 else "Worsening compared to prior report"
        return "high", reason
    if score == 2:
        return "medium", "Moderate DR risk"
    return "low", "No/mild DR risk"


def safe_rule_based_answer(
    *,
    context_type: str,
    patient: Optional[Patient],
    reports: Iterable[Report],
    doctor_query: str,
) -> tuple[str, str]:
    reports = list(reports)
    latest = reports[0] if reports else None
    stage = (latest.prediction if latest else "Unknown").strip() if latest else "Unknown"
    conf = f"{(latest.confidence or 0.0) * 100:.1f}%" if latest else "n/a"

    if context_type == "general":
        answer = (
            "I can help, but the LLM is unavailable. For general guidance: diabetic retinopathy is retinal microvascular damage "
            "from diabetes. Screening uses dilated exam and/or retinal imaging. Treatment depends on severity and may include "
            "glycemic/BP/lipid control, intravitreal anti-VEGF, laser, and vitrectomy (specialist-guided)."
        )
        return answer, "Rule-based general guidance (LLM unavailable)."

    if context_type == "today_reports":
        severe = []
        for r in reports:
            if dr_stage_score(r.prediction) >= 3:
                severe.append(f"Patient #{r.patient_id} ({r.prediction})")
        answer = (
            "LLM is unavailable. Today’s report summary is generated using rule-based rules.\n\n"
            f"- Total reports today: {len(reports)}\n"
            f"- Severe/proliferative flags: {len(severe)}\n"
            + (("- Severe cases: " + "; ".join(severe)) if severe else "- Severe cases: none detected")
        )
        return answer, "Rule-based daily summary (LLM unavailable)."

    # patient
    p = patient
    who = f"{p.name} (age {p.age}, {p.gender})" if p else "Patient"
    answer = (
        "LLM is unavailable. Providing a rule-based patient summary.\n\n"
        f"Patient: {who}\n"
        f"Latest stage: {stage} (confidence {conf})\n"
        f"Doctor query: {doctor_query}\n\n"
        "Suggested next steps (general):\n"
        "- Correlate with symptoms and dilated fundus exam.\n"
        "- Optimize glycemic control, blood pressure, lipids.\n"
        "- If moderate/severe/proliferative or vision symptoms: urgent retina specialist referral.\n"
        "- Consider OCT/FA per specialist; follow local protocols."
    )
    return answer, "Rule-based patient response (LLM unavailable)."


@dataclass(frozen=True)
class DoctorAssistantPrompts:
    system: str
    user: str


def build_prompts(
    *,
    context_type: str,
    doctor_query: str,
    patient: Optional[Patient] = None,
    reports: Optional[list[Report]] = None,
    today: Optional[date] = None,
) -> DoctorAssistantPrompts:
    reports = reports or []
    today = today or datetime.now(timezone.utc).date()

    system = (
        "You are a Doctor Assistant for diabetic retinopathy (DR). "
        "Be concise, clinically helpful, and structured. "
        "Do NOT claim to replace clinical judgement. "
        "If information is missing, ask clarifying questions. "
        "Prefer bullet points.\n\n"
        "Output format (plain text):\n"
        "Assessment:\n"
        "- ...\n"
        "Risk level:\n"
        "- low/medium/high + short rationale\n"
        "Suggested next steps:\n"
        "- ...\n"
        "Red flags:\n"
        "- ...\n"
    )

    if context_type == "general":
        user = f"Doctor question: {doctor_query}"
        return DoctorAssistantPrompts(system=system, user=user)

    if context_type == "today_reports":
        lines = [f"Today (UTC date): {today.isoformat()}"]
        if not reports:
            lines.append("No reports found for today.")
        else:
            lines.append(f"Total reports today: {len(reports)}")
            for r in reports[:50]:
                lines.append(
                    f"- report_id={r.id}, patient_id={r.patient_id}, stage={r.prediction}, confidence={r.confidence:.3f}, created_at={_dt(r.created_at)}"
                )
        lines.append("")
        lines.append(f"Doctor question: {doctor_query}")
        lines.append(
            "Task: Summarize today’s caseload, highlight severe/proliferative and low-confidence predictions, and suggest triage priorities."
        )
        return DoctorAssistantPrompts(system=system, user="\n".join(lines))

    # patient
    lines = []
    if patient:
        lines.append(f"Patient: id={patient.id}, name={patient.name}, age={patient.age}, gender={patient.gender}")
    else:
        lines.append("Patient: unknown (record not found).")

    if not reports:
        lines.append("Reports: none available.")
    else:
        latest = reports[0]
        lines.append(
            f"Latest report: id={latest.id}, stage={latest.prediction}, confidence={latest.confidence:.3f}, created_at={_dt(latest.created_at)}, description={latest.description or ''}"
        )
        if len(reports) >= 2:
            prev = reports[1]
            lines.append(
                f"Previous report: id={prev.id}, stage={prev.prediction}, confidence={prev.confidence:.3f}, created_at={_dt(prev.created_at)}, description={prev.description or ''}"
            )
        if len(reports) > 2:
            lines.append(f"Older reports count: {len(reports) - 2}")

    lines.append("")
    lines.append(f"Doctor question: {doctor_query}")
    lines.append(
        "Task: Explain the patient’s DR status, detect worsening vs prior report if possible, estimate risk level, and propose next steps."
    )
    return DoctorAssistantPrompts(system=system, user="\n".join(lines))

