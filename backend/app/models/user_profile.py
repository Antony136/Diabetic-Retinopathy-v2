from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey
from datetime import datetime
from app.db.database import Base


class UserProfile(Base):
    __tablename__ = "user_profiles"

    user_id = Column(Integer, ForeignKey("users.id"), primary_key=True, index=True)

    title = Column(String, default="Ophthalmologist", nullable=False)
    hospital_name = Column(String, default="—", nullable=False)
    phone = Column(String, default="", nullable=False)
    board_certified = Column(Boolean, default=True, nullable=False)
    avatar_url = Column(String, default="", nullable=False)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
