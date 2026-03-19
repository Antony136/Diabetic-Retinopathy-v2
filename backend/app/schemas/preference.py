from pydantic import BaseModel


class PreferenceResponse(BaseModel):
    notifications_high_risk: bool
    notifications_daily_summary: bool


class PreferenceUpdate(BaseModel):
    notifications_high_risk: bool | None = None
    notifications_daily_summary: bool | None = None

