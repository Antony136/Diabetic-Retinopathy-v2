from typing import Literal, Optional

from pydantic import BaseModel, Field


ContextType = Literal["patient", "today_reports", "reports_range", "general"]
Priority = Literal["high", "medium", "low"]
Status = Literal["success", "error"]
TaskType = Literal[
    "answer",
    "triage_queue",
    "draft_referral_letter",
    "draft_followup_plan",
]
TimeframePreset = Literal["today", "7d", "30d", "90d", "all", "custom"]


class DoctorAssistantExplainRequest(BaseModel):
    patient_id: Optional[int] = Field(default=None, description="Optional patient id for patient context")
    doctor_query: str = Field(min_length=1, max_length=4000)
    context_type: ContextType = Field(default="general")
    task: TaskType = Field(default="answer", description="What you want the assistant to do")

    # Optional time filtering (used for today_reports/reports_range, and optionally patient history)
    timeframe: Optional[TimeframePreset] = Field(default=None, description="Quick time filter preset")
    start_date: Optional[str] = Field(default=None, description="YYYY-MM-DD (required if timeframe=custom)")
    end_date: Optional[str] = Field(default=None, description="YYYY-MM-DD (required if timeframe=custom)")


class DoctorAssistantExplainResponse(BaseModel):
    status: Status
    answer: Optional[str] = None
    priority: Optional[Priority] = None
    summary: Optional[str] = None

    # error payload (when status=error)
    message: Optional[str] = None
    fallback: Optional[str] = None

    # additional structured metadata
    priority_reason: Optional[str] = None
    worsening_detected: Optional[bool] = None
    provider_used: Optional[str] = None
