from __future__ import annotations

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.auth import get_current_user
from app.db.database import SessionLocal
from app.models.users import User
from app.services import image_cache_service


router = APIRouter(prefix="/api/cache", tags=["image-cache"])


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


class WarmRequest(BaseModel):
    urls: list[str]


@router.get("/resolve")
def resolve(
    url: str = Query(..., description="Remote image URL to cache"),
    force: bool = Query(False),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Resolve a remote URL to a locally cached path.

    - Requires auth (per-doctor cache).
    - Returns remote URL as fallback if caching fails.
    """
    if getattr(current_user, "role", "doctor") == "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin cache resolve not supported")

    canonical = image_cache_service.canonicalize_url(url)

    try:
        cached = image_cache_service.lookup_cached(db, doctor_id=current_user.id, remote_url=url)
        if cached and not force:
            return {"remote_url": canonical, "cached": True, "local_url": cached}

        local_url = image_cache_service.cache_url(db, doctor_id=current_user.id, remote_url=url, force=force)
        if local_url:
            return {"remote_url": canonical, "cached": True, "local_url": local_url}
    except Exception:
        # Never hard-fail the UI for caching issues; caller can fall back to remote URL.
        return {"remote_url": canonical, "cached": False, "local_url": None}

    return {"remote_url": canonical, "cached": False, "local_url": None}


@router.post("/warm")
def warm(
    payload: WarmRequest,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Warm the cache for multiple URLs (async downloads in background).
    Returns immediately with a list of URLs accepted for warming.
    """
    if getattr(current_user, "role", "doctor") == "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin cache warm not supported")

    urls = [u.strip() for u in (payload.urls or []) if (u or "").strip()]
    urls = urls[:200]

    accepted: list[str] = []
    for u in urls:
        try:
            canonical = image_cache_service.canonicalize_url(image_cache_service.validate_remote_url(u))
        except Exception:
            continue

        accepted.append(canonical)

        def _task(remote_url: str = u, doctor_id: int = current_user.id):
            # New DB session in background task.
            db2 = SessionLocal()
            try:
                image_cache_service.cache_url(db2, doctor_id=doctor_id, remote_url=remote_url, force=False)
            finally:
                db2.close()

        background_tasks.add_task(_task)

    return {"status": "warming", "accepted": accepted}
