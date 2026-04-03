from fastapi import APIRouter
import os
from pathlib import Path

router = APIRouter()

@router.get("/health")
def health_check():
    desktop = (os.getenv("DESKTOP_MODE") or "").strip() == "1"
    if not desktop:
        return {"status": "ok"}

    try:
        uploads_dir = Path((os.getenv("UPLOADS_DIR") or "uploads").strip() or "uploads")
        count = len(list(uploads_dir.glob("*"))) if uploads_dir.exists() else 0
    except Exception:
        count = -1

    return {
        "status": "ok",
        "desktop_mode": True,
        "cwd": os.getcwd(),
        "uploads_dir": str(Path((os.getenv("UPLOADS_DIR") or "uploads").strip() or "uploads").resolve()),
        "uploads_count": count,
    }
