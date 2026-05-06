from pydantic import BaseModel
from datetime import datetime
from typing import Optional

class PatientCreate(BaseModel):
    client_uuid: Optional[str] = None
    name: str
    age: Optional[int] = None
    gender: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None

class PatientUpdate(BaseModel):
    name: str
    age: Optional[int] = None
    gender: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None

class PatientResponse(BaseModel):
    id: int
    client_uuid: Optional[str] = None
    name: str
    age: Optional[int] = None
    gender: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None
    doctor_id: int
    latest_prediction: Optional[str] = None
    latest_confidence: Optional[float] = None

    class Config:
        from_attributes = True
