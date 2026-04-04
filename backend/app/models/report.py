from sqlalchemy import Column, Integer, String, Float, ForeignKey, DateTime, Text, Boolean
from datetime import datetime
from app.db.database import Base

class Report(Base):
    __tablename__ = "reports"

    id = Column(Integer, primary_key=True, index=True)

    # Stable identifier for offline-first sync across devices/instances.
    client_uuid = Column(String, nullable=True, index=True)

    patient_id = Column(Integer, ForeignKey("patients.id"))
    filename = Column(String, nullable=True)
    image_url = Column(String, nullable=True)
    heatmap_url = Column(String, nullable=True)
    prediction = Column(String)
    confidence = Column(Float)
    description = Column(String, nullable=True)

    # Explainable AI (image reasoning)
    image_observations = Column(Text, nullable=True)  # JSON-encoded list[str]
    image_explanation = Column(Text, nullable=True)  # LLM-generated text

    # Adaptive Screening Mode
    risk_score = Column(Float, nullable=True)
    risk_level = Column(String, nullable=True)
    decision = Column(String, nullable=True) # "Refer" or "Normal"
    mode = Column(String, nullable=True) # "standard" or "high_sensitivity"
    adaptive_explanation = Column(Text, nullable=True)
    override_applied = Column(Boolean, default=False)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    source = Column(String, nullable=True)
