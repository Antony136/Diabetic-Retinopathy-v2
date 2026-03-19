from pydantic import BaseModel
from datetime import datetime


class AdminUserResponse(BaseModel):
    id: int
    name: str
    email: str
    role: str
    is_active: bool | None = None
    created_at: datetime | None = None

    class Config:
        from_attributes = True


class AdminUserCreate(BaseModel):
    name: str
    email: str
    password: str


class AdminRoleUpdate(BaseModel):
    role: str


class AdminStatusUpdate(BaseModel):
    is_active: bool


class AdminNotificationCreate(BaseModel):
    user_id: int
    patient_id: int | None = None
    report_id: int | None = None
    type: str
    title: str
    message: str


class AdminPatientResponse(BaseModel):
    id: int
    name: str
    age: int
    gender: str
    phone: str
    address: str
    created_at: datetime
    doctor_id: int

    class Config:
        from_attributes = True


class AdminReportResponse(BaseModel):
    id: int
    patient_id: int
    image_url: str
    heatmap_url: str
    prediction: str
    confidence: float
    created_at: datetime

    class Config:
        from_attributes = True
