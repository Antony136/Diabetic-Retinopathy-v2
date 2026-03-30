from typing import Literal, Optional

from pydantic import BaseModel, Field


ContextType = Literal["patient", "today_reports", "general"]
Priority = Literal["high", "medium", "low"]
Status = Literal["success", "error"]


class DoctorAssistantExplainRequest(BaseModel):
    patient_id: Optional[int] = Field(default=None, description="Optional patient id for patient context")
    doctor_query: str = Field(min_length=1, max_length=4000)
    context_type: ContextType = Field(default="general")


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

