import base64
import os
import tempfile
import uuid
from pathlib import Path

from fastapi import APIRouter, File, HTTPException, UploadFile, status
from pydantic import BaseModel


router = APIRouter(tags=["inference"])


class PredictUrlRequest(BaseModel):
    url: str


def _safe_suffix(filename: str | None) -> str:
    try:
        suffix = Path(filename or "").suffix
    except Exception:
        suffix = ""
    if suffix.lower() in [".jpg", ".jpeg", ".png"]:
        return suffix.lower()
    return ".png"


def _write_temp_image(image_bytes: bytes, suffix: str) -> str:
    tmp_dir = Path(tempfile.gettempdir())
    tmp_path = tmp_dir / f"dr_{uuid.uuid4().hex}{suffix}"
    tmp_path.write_bytes(image_bytes)
    return str(tmp_path)


@router.post("/predict")
async def predict(file: UploadFile = File(...)):
    try:
        await file.seek(0)
        image_bytes = await file.read()
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Failed to read uploaded file: {e}")

    if not image_bytes:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Uploaded file is empty (0 bytes).")

    suffix = _safe_suffix(getattr(file, "filename", None))
    local_image_path = _write_temp_image(image_bytes, suffix)

    try:
        from app.services.ai_service import predict_dr_stage

        prediction, confidence, heatmap_bytes, _ct, _ext = predict_dr_stage(local_image_path)
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"AI prediction failed: {e}")
    finally:
        try:
            if os.path.exists(local_image_path):
                os.remove(local_image_path)
        except Exception:
            pass

    heatmap_b64 = base64.b64encode(heatmap_bytes or b"").decode("ascii") if heatmap_bytes else None
    return {"prediction": prediction, "confidence": confidence, "heatmap_png_base64": heatmap_b64}


@router.post("/predict_url")
async def predict_url(req: PredictUrlRequest):
    try:
        from app.services.ai_service import predict_dr_stage_from_url

        prediction, confidence, heatmap_bytes, _ct, _ext = predict_dr_stage_from_url(req.url)
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"AI prediction failed: {e}")

    heatmap_b64 = base64.b64encode(heatmap_bytes or b"").decode("ascii") if heatmap_bytes else None
    return {"prediction": prediction, "confidence": confidence, "heatmap_png_base64": heatmap_b64}

