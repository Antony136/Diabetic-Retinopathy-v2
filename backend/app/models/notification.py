from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime, ForeignKey, Index
from datetime import datetime
from app.db.database import Base


class Notification(Base):
    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True, index=True)

    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    patient_id = Column(Integer, ForeignKey("patients.id"), nullable=True)
    report_id = Column(Integer, ForeignKey("reports.id"), nullable=True)

    type = Column(String(50), nullable=False)
    title = Column(String(255), nullable=False)
    message = Column(Text, nullable=False)

    is_read = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)


Index("idx_notifications_user_id", Notification.user_id)

