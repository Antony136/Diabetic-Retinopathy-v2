from pydantic import BaseModel


class PreferenceResponse(BaseModel):
    notifications_high_risk: bool
    notifications_daily_summary: bool
    follow_up_days_moderate: int
    urgent_review_hours: int
    min_confidence_threshold: float


class PreferenceUpdate(BaseModel):
    notifications_high_risk: bool | None = None
    notifications_daily_summary: bool | None = None
    follow_up_days_moderate: int | None = None
    urgent_review_hours: int | None = None
    min_confidence_threshold: float | None = None
