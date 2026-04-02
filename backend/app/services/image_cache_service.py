import uuid
from pathlib import Path
from urllib.parse import urlparse, unquote

import httpx
from sqlalchemy.orm import Session

from app.models.image_cache import ImageCache
from app.services.storage_service import storage_service


def _is_remote_url(path: str | None) -> bool:
    if not path:
        return False
    lower = path.lower()
    return lower.startswith("http://") or lower.startswith("https://")


def get_cached_image(db: Session, doctor_id: int, remote_url: str) -> ImageCache | None:
    if not remote_url or not _is_remote_url(remote_url):
        return None
    return (
        db.query(ImageCache)
        .filter(ImageCache.doctor_id == doctor_id, ImageCache.remote_url == remote_url)
        .first()
    )


def set_cached_image(db: Session, doctor_id: int, remote_url: str, local_url: str) -> ImageCache:
    record = get_cached_image(db, doctor_id, remote_url)
    if record:
        record.local_url = local_url
        db.commit()
        db.refresh(record)
        return record

    record = ImageCache(
        doctor_id=doctor_id,
        remote_url=remote_url,
        local_url=local_url,
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


def cache_remote_image(db: Session, doctor_id: int, remote_url: str) -> str | None:
    if not _is_remote_url(remote_url):
        return None

    existing = get_cached_image(db, doctor_id, remote_url)
    if existing:
        return existing.local_url

    try:
        with httpx.Client(timeout=60.0, follow_redirects=True) as client:
            response = client.get(remote_url)
            response.raise_for_status()
            parsed = Path(urlparse(remote_url).path).name
            parsed = unquote(parsed)
            if not parsed:
                parsed = f"{uuid.uuid4().hex}.png"
            parsed = parsed.replace("/", "_")
            local_url = storage_service.upload_bytes(response.content, parsed)
            if local_url:
                set_cached_image(db, doctor_id, remote_url, local_url)
                return local_url
    except Exception:
        pass

    return None
