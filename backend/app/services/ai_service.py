import json
import os
from typing import Tuple
from gradio_client import Client, handle_file
from app.services.storage_service import storage_service
from dotenv import load_dotenv

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
    _hf_space_id = os.getenv("HF_SPACE_ID", "jczdgyo/diabetic-retinopathy")
    
    # Initialize client
    _client = None

    @classmethod
    def get_client(cls):
        if cls._client is None:
            print(f"DEBUG: Initializing Gradio Client for {cls._hf_space_id}...")
            cls._client = Client(cls._hf_space_id)
        return cls._client

    @classmethod
    def predict(cls, image_path: str) -> Tuple[str, float, str]:
        try:
            print(f"DEBUG: Starting AI prediction for {image_path}...")
            client = cls.get_client()

            # 1. Prepare file handle (Official Gradio way)
            image_input = handle_file(image_path)

            # 2. Call Gradio API
            # Matches test script: client.predict(image=..., api_name="/predict")
            result = client.predict(
                image=image_input,
                api_name="/predict"
            )

            print(f"DEBUG: Prediction successful. Raw result type: {type(result)}")

            # 3. Parse outputs [prediction_json, heatmap_info]
            if not isinstance(result, (list, tuple)) or len(result) < 2:
                raise Exception(f"Unexpected response format from HF Space: {result}")

            # Parse prediction JSON
            prediction_json = result[0]
            if isinstance(prediction_json, str):
                prediction_data = json.loads(prediction_json)
            else:
                prediction_data = prediction_json

            prediction = prediction_data.get("prediction", "Unknown")
            confidence = float(prediction_data.get("confidence", 0.0))

            # Handle heatmap (could be path or dict)
            heatmap_info = result[1]
            heatmap_url = ""

            if heatmap_info:
                heatmap_local_path = ""
                if isinstance(heatmap_info, dict):
                    heatmap_local_path = heatmap_info.get("path") or heatmap_info.get("url")
                else:
                    heatmap_local_path = heatmap_info

                if heatmap_local_path and os.path.exists(heatmap_local_path):
                    remote_name = f"heatmap_{os.path.basename(image_path)}"
                    print(f"DEBUG: Uploading heatmap {heatmap_local_path} to Supabase...")
                    heatmap_url = storage_service.upload_file(heatmap_local_path, remote_name)

            return prediction, confidence, heatmap_url

        except Exception as e:
            print(f"ERROR in AI prediction: {e}")
            import traceback
            traceback.print_exc()
            raise Exception(f"AI Service failed: {str(e)}")


# Convenience wrapper
def predict_dr_stage(image_path: str) -> Tuple[str, float, str]:
    return AIPredictor.predict(image_path)
