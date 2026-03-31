import json
import os
from typing import Tuple, Optional
from gradio_client import Client, handle_file
from dotenv import load_dotenv
from pathlib import Path
import httpx

load_dotenv()

# =========================
# AI PREDICTOR SERVICE (GRADIO CLIENT SYNCED)
# =========================
class AIPredictor:
    """
    Hugging Face connector using gradio_client.
    Synced with the working test script logic.
    """

    # Use your HF Space ID
    _hf_space_id = os.getenv("HF_SPACE_ID") or os.getenv("HF_SPACE_URL") or "jczdgyo/diabetic-retinopathy"
    _hf_token = os.getenv("HF_TOKEN") or os.getenv("HUGGINGFACEHUB_API_TOKEN") or os.getenv("HF_API_TOKEN")
    
    # Initialize client
    _client = None

    @classmethod
    def get_client(cls):
        if cls._client is None:
            print(f"DEBUG: Initializing Gradio Client for {cls._hf_space_id}...")
            if cls._hf_token:
                cls._client = Client(cls._hf_space_id, hf_token=cls._hf_token)
            else:
                cls._client = Client(cls._hf_space_id)
        return cls._client

    @classmethod
    def _parse_prediction(cls, prediction_json: object) -> Tuple[str, float]:
        if isinstance(prediction_json, dict):
            prediction = prediction_json.get("prediction", "Unknown")
            confidence_raw = prediction_json.get("confidence", 0.0)
        elif isinstance(prediction_json, str):
            try:
                data = json.loads(prediction_json)
                prediction = data.get("prediction", prediction_json)
                confidence_raw = data.get("confidence", 0.0)
            except Exception:
                prediction = prediction_json
                confidence_raw = 0.0
        else:
            prediction = str(prediction_json)
            confidence_raw = 0.0

        try:
            confidence = float(confidence_raw)
        except Exception:
            confidence = 0.0
        return str(prediction), confidence

    @classmethod
    def _extract_file_bytes(cls, file_info: object) -> tuple[Optional[bytes], Optional[str], Optional[str]]:
        """
        Returns (bytes, content_type, extension) when possible.
        Gradio file outputs may be a local path, a dict with path/url, or a URL string.
        """
        if not file_info:
            return None, None, None

        local_path: Optional[str] = None
        url: Optional[str] = None

        if isinstance(file_info, dict):
            local_path = file_info.get("path")
            url = file_info.get("url")
        elif isinstance(file_info, str):
            if file_info.startswith("http://") or file_info.startswith("https://"):
                url = file_info
            else:
                local_path = file_info
        else:
            local_path = str(file_info)

        if local_path and os.path.exists(local_path):
            try:
                b = Path(local_path).read_bytes()
                ext = Path(local_path).suffix.lower() or None
                content_type = "image/png" if ext == ".png" else "image/jpeg" if ext in [".jpg", ".jpeg"] else "application/octet-stream"
                return b, content_type, ext
            except Exception as e:
                print(f"ERROR: Failed to read heatmap file from disk: {e}")

        if url:
            try:
                with httpx.Client(timeout=60.0, follow_redirects=True) as client:
                    resp = client.get(url)
                    resp.raise_for_status()
                    content_type = resp.headers.get("content-type")
                    ext = None
                    if content_type:
                        if "png" in content_type:
                            ext = ".png"
                        elif "jpeg" in content_type or "jpg" in content_type:
                            ext = ".jpg"
                    return resp.content, content_type, ext
            except Exception as e:
                print(f"ERROR: Failed to download heatmap from url {url}: {e}")

        return None, None, None

    @classmethod
    def predict(cls, image_path: str) -> Tuple[str, float, Optional[bytes], Optional[str], Optional[str]]:
        try:
            print(f"DEBUG: Starting AI prediction for {image_path}...")
            client = cls.get_client()

            # 1. Prepare file handle (Official Gradio way)
            image_input = handle_file(image_path)

            # 2. Call Gradio API
            # Matches test script: client.predict(image=..., api_name="/predict")
            try:
                result = client.predict(image=image_input, api_name="/predict")
            except Exception:
                # Some Spaces register api_name without a leading slash
                result = client.predict(image=image_input, api_name="predict")

            print(f"DEBUG: Prediction successful. Raw result type: {type(result)}")

            # 3. Parse outputs [prediction_json, heatmap_info]
            if not isinstance(result, (list, tuple)) or len(result) < 2:
                raise Exception(f"Unexpected response format from HF Space: {result}")

            prediction, confidence = cls._parse_prediction(result[0])

            heatmap_bytes, heatmap_content_type, heatmap_ext = cls._extract_file_bytes(result[1])
            return prediction, confidence, heatmap_bytes, heatmap_content_type, heatmap_ext

        except Exception as e:
            print(f"ERROR in AI prediction: {e}")
            import traceback
            traceback.print_exc()
            raise Exception(f"AI Service failed: {str(e)}")

    @classmethod
    def predict_url(cls, image_url: str) -> Tuple[str, float, Optional[bytes], Optional[str], Optional[str]]:
        try:
            image_url = (image_url or "").strip()
            if not image_url.startswith("http"):
                raise ValueError("Invalid image URL")

            print(f"DEBUG: Starting AI prediction for URL {image_url}...")
            client = cls.get_client()

            try:
                result = client.predict(image_url=image_url, api_name="predict_url")
            except Exception:
                # Some Spaces register api_name with a leading slash
                result = client.predict(image_url=image_url, api_name="/predict_url")

            if not isinstance(result, (list, tuple)) or len(result) < 2:
                raise Exception(f"Unexpected response format from HF Space: {result}")

            prediction, confidence = cls._parse_prediction(result[0])
            heatmap_bytes, heatmap_content_type, heatmap_ext = cls._extract_file_bytes(result[1])
            return prediction, confidence, heatmap_bytes, heatmap_content_type, heatmap_ext
        except Exception as e:
            print(f"ERROR in AI prediction (URL): {e}")
            raise Exception(f"AI Service failed: {str(e)}")


# Convenience wrapper
def predict_dr_stage(image_path: str) -> Tuple[str, float, Optional[bytes], Optional[str], Optional[str]]:
    provider = (os.getenv("AI_PROVIDER") or "").strip().lower()
    if provider in ("local", "offline", "desktop"):
        from app.services import local_ai_service

        return local_ai_service.predict(image_path)
    return AIPredictor.predict(image_path)


def predict_dr_stage_from_url(image_url: str) -> Tuple[str, float, Optional[bytes], Optional[str], Optional[str]]:
    provider = (os.getenv("AI_PROVIDER") or "").strip().lower()
    if provider in ("local", "offline", "desktop"):
        from app.services import local_ai_service

        return local_ai_service.predict_from_url(image_url)
    return AIPredictor.predict_url(image_url)
