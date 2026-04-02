from fastapi import APIRouter, Depends, HTTPException, status, Query, Form
from sqlalchemy.orm import Session

from app.api.auth import get_current_user
from app.db.database import SessionLocal
from app.services.image_cache_service import cache_remote_image, get_cached_image
from app.models.users import User

router = APIRouter(prefix="/api/images", tags=["images"])

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@router.get("/cache")
def get_cached_image_url(
    url: str = Query(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not url:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Missing url")

    cached = get_cached_image(db, current_user.id, url)
    if cached:
        return {"local_url": cached.local_url}
    return {"local_url": None}


@router.post("/cache")
def post_cache_image_url(
    url: str = Form(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not url:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Missing url")

    local = cache_remote_image(db, current_user.id, url)
    if local:
        return {"local_url": local}
    raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Failed to download and cache image")
