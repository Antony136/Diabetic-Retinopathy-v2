from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, UniqueConstraint

from app.db.database import Base


class ImageCache(Base):
    __tablename__ = "image_cache"

    id = Column(Integer, primary_key=True, index=True)
    doctor_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)

    # Canonicalized remote URL (querystring stripped) to avoid cache misses on signed URLs.
    remote_url = Column(String, nullable=False)
    # Existing desktop DBs use `local_url`. Keep that stable.
    local_url = Column(String, nullable=False)

    content_type = Column(String, nullable=True)
    etag = Column(String, nullable=True)
    last_modified = Column(String, nullable=True)
    byte_size = Column(Integer, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    last_accessed_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (UniqueConstraint("doctor_id", "remote_url", name="uq_image_cache_doctor_remote"),)

    @property
    def local_path(self) -> str:
        # Back-compat alias for older code paths.
        return self.local_url
