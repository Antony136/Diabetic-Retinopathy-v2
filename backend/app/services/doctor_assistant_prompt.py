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
    today_rows: Optional[list[dict]] = None,
) -> tuple[str, str]:
    reports = list(reports)
    latest = reports[0] if reports else None
    stage = (latest.prediction if latest else "Unknown").strip() if latest else "Unknown"
    conf = f"{(latest.confidence or 0.0) * 100:.1f}%" if latest else "n/a"

    if context_type == "general":
        answer = (
            "LLM is unavailable, so here’s a rule-based overview.\n\n"
            "Diabetic retinopathy (DR) is retinal microvascular damage from diabetes. Screening is typically with a dilated fundus exam "
            "and/or retinal imaging; OCT is commonly used when macular edema is suspected. Treatment depends on severity and may include "
            "systemic risk-factor control (glucose/BP/lipids) and ophthalmic interventions such as intravitreal anti-VEGF, laser, or vitrectomy "
            "(specialist-guided).\n\n"
            "Urgent referral red flags: sudden vision loss, new floaters/flashes, severe NPDR/PDR, suspected macular edema."
        )
        return answer, "Rule-based general guidance (LLM unavailable)."

    if context_type == "today_reports":
        items = today_rows or []
        severe = []
        for it in items:
            if dr_stage_score(str(it.get("prediction") or "")) >= 3:
                severe.append(f"{it.get('name') or 'Patient'} (#{it.get('patient_id')}) - {it.get('prediction')}")

        lines = [
            "Assessment:",
            "- LLM is unavailable; providing rule-based daily summary.",
            f"- Total reports today: {len(items) or len(reports)}",
            f"- Severe/proliferative flags: {len(severe)}",
            "",
            "Risk level:",
            "- High priority for severe/proliferative DR and low-confidence predictions.",
            "",
            "Suggested next steps:",
            "- Review severe/proliferative cases first and arrange urgent retina referral per protocol.",
            "- For moderate cases: ensure timely follow-up and optimize systemic risk factors.",
            "",
            "Red flags:",
            "- Severe NPDR/PDR labels, very low confidence, symptomatic patients.",
            "",
            "Patients (today):",
        ]
        if items:
            for i, it in enumerate(items[:50], start=1):
                lines.extend(
                    [
                        f"--- Patient {i} ---",
                        f"ID: {it.get('patient_id')} | Name: {it.get('name')} | Age: {it.get('age')} | Gender: {it.get('gender')}",
                        f"Stage: {it.get('prediction')} | Confidence: {it.get('confidence')} | Report: {it.get('created_at')}",
                        f"Notes: {it.get('description') or ''}".rstrip(),
                        "",
                    ]
                )
        else:
            lines.append("- No reports found for today.")

        return "\n".join(lines).strip(), "Rule-based daily summary (LLM unavailable)."

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
    today_rows: Optional[list[dict]] = None,
) -> DoctorAssistantPrompts:
    reports = reports or []
    today = today or datetime.now(timezone.utc).date()

    if context_type == "general":
        system = (
            "You are a medical assistant chatbot helping a clinician with diabetic retinopathy (DR) questions. "
            "Answer naturally in a helpful, readable way (short paragraphs and bullet points are fine). "
            "Do NOT output the patient-report template sections unless explicitly asked. "
            "Do NOT claim to replace clinical judgement. "
            "If the question is ambiguous, ask 1–3 clarifying questions. "
            "Avoid hallucinating specific patient details.\n"
        )
        user = (
            "Context: general medical question (not patient-specific).\n"
            f"Doctor question: {doctor_query}\n\n"
            "Formatting: answer like a normal medical assistant response, not a patient report."
        )
        return DoctorAssistantPrompts(system=system, user=user)

    system = (
        "You are a Doctor Assistant for diabetic retinopathy (DR). "
        "Be concise, clinically helpful, and structured. "
        "Do NOT claim to replace clinical judgement. "
        "If information is missing, ask clarifying questions. "
        "Prefer bullet points.\n\n"
        "Always respond in this exact section order (plain text):\n"
        "Assessment:\n"
        "Risk level:\n"
        "Suggested next steps:\n"
        "Red flags:\n"
    )

    if context_type == "today_reports":
        items = today_rows or []
        lines = [
            f"Today (UTC date): {today.isoformat()}",
            "Task: Summarize today’s caseload, highlight severe/proliferative and low-confidence predictions, and suggest triage priorities.",
            "",
            "Patients (leave a blank line between each patient block):",
        ]

        if not items and not reports:
            lines.append("No reports found for today.")
        else:
            lines.append(f"Total reports today: {len(items) or len(reports)}")
            if items:
                for i, it in enumerate(items[:60], start=1):
                    lines.extend(
                        [
                            f"--- Patient {i} ---",
                            f"patient_id: {it.get('patient_id')}",
                            f"name: {it.get('name')}",
                            f"age: {it.get('age')}",
                            f"gender: {it.get('gender')}",
                            f"report_id: {it.get('report_id')}",
                            f"stage: {it.get('prediction')}",
                            f"confidence: {it.get('confidence')}",
                            f"created_at: {_dt(it.get('created_at')) if isinstance(it.get('created_at'), datetime) else it.get('created_at')}",
                            f"description: {it.get('description') or ''}".rstrip(),
                            "",
                            "",
                        ]
                    )
            else:
                for r in reports[:50]:
                    lines.extend(
                        [
                            "--- Patient ---",
                            f"patient_id: {r.patient_id}",
                            f"stage: {r.prediction}",
                            f"confidence: {r.confidence:.3f}",
                            f"created_at: {_dt(r.created_at)}",
                            "",
                            "",
                        ]
                    )

        lines.append(f"Doctor question: {doctor_query}")
        lines.append("In the Assessment section, include a concise per-patient triage list (high/medium/low).")
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
