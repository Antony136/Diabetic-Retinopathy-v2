from pydantic import BaseModel
from datetime import datetime
from typing import Optional

class ReportCreate(BaseModel):
    patient_id: int
    filename: Optional[str] = None
    image_url: Optional[str] = None
    heatmap_url: Optional[str] = None
    prediction: str
    confidence: float
    description: Optional[str] = None

class ReportUpdate(BaseModel):
    prediction: str
    confidence: float
    description: Optional[str] = None

class ReportResponse(BaseModel):
    id: int
    patient_id: int
    patient_name: Optional[str] = None
    filename: Optional[str] = None
    image_url: Optional[str] = None
    heatmap_url: Optional[str] = None
    prediction: str
    confidence: float
    description: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True
