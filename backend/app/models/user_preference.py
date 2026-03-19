from sqlalchemy import Column, Integer, Boolean, ForeignKey, Float
from app.db.database import Base


class UserPreference(Base):
    __tablename__ = "user_preferences"

    user_id = Column(Integer, ForeignKey("users.id"), primary_key=True, index=True)

    notifications_high_risk = Column(Boolean, default=True, nullable=False)
    notifications_daily_summary = Column(Boolean, default=False, nullable=False)

    # Triage / review preferences
    follow_up_days_moderate = Column(Integer, default=14, nullable=False)
    urgent_review_hours = Column(Integer, default=24, nullable=False)
    min_confidence_threshold = Column(Float, default=0.85, nullable=False)
