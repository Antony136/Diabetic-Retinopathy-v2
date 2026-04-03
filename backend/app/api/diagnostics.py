from __future__ import annotations

import os
from pathlib import Path

from fastapi import APIRouter, HTTPException, status


router = APIRouter(prefix="/api/diagnostics", tags=["diagnostics"])


def _require_desktop():
    if (os.getenv("DESKTOP_MODE") or "").strip() != "1":
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not available")


@router.get("/paths")
def paths():
    _require_desktop()
    uploads_dir = (os.getenv("UPLOADS_DIR") or "uploads").strip() or "uploads"
    return {
        "cwd": os.getcwd(),
        "database_url": os.getenv("DATABASE_URL", ""),
        "model_path": os.getenv("MODEL_PATH", ""),
        "uploads_dir": str(Path(uploads_dir).resolve()),
        "uploads_exists": Path(uploads_dir).exists(),
    }


@router.get("/local-ai")
def local_ai():
    _require_desktop()

    try:
        from app.services import local_ai_service

        local_ai_service.load_predictor()
        return {"ok": True, "model_path": os.getenv("MODEL_PATH", "")}
    except Exception as e:
        return {"ok": False, "error": str(e), "model_path": os.getenv("MODEL_PATH", "")}
