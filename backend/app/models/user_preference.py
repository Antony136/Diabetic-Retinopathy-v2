from sqlalchemy import Column, Integer, Boolean, ForeignKey
from app.db.database import Base


class UserPreference(Base):
    __tablename__ = "user_preferences"

    user_id = Column(Integer, ForeignKey("users.id"), primary_key=True, index=True)

    notifications_high_risk = Column(Boolean, default=True, nullable=False)
    notifications_daily_summary = Column(Boolean, default=False, nullable=False)

