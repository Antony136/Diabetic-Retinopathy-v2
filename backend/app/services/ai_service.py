import os
from pathlib import Path
from typing import Tuple, Optional
from gradio_client import Client, handle_file
from app.services.storage_service import storage_service
from dotenv import load_dotenv

load_dotenv()

# =========================
# AI PREDICTOR SERVICE (REMOTE)
# =========================
class AIPredictor:
    """
    Service to handle AI predictions by calling a remote Hugging Face Space.
    This keeps the Render backend lightweight and avoids OOM errors.
    """
    _hf_space_url = os.getenv("HF_SPACE_URL", "jczdgyo/diabetic-retinopathy")
    _hf_token = os.getenv("HF_TOKEN")

    @classmethod
    def predict(cls, image_path: str) -> Tuple[str, float, str]:
        try:
            print(f"DEBUG: Calling HF Space at {cls._hf_space_url}...")
            # 1. Initialize Client
            client = Client(cls._hf_space_url, hf_token=cls._hf_token)
            
            # 2. Call the Remote API
            # app.py Interface outputs [Label, Number, Image]
            result = client.predict(
                image=handle_file(image_path),
                api_name="/predict"
            )
            
            print(f"DEBUG: HF Result Type: {type(result)}")
            print(f"DEBUG: HF Result Content: {result}")

            if not result or not isinstance(result, (list, tuple)):
                raise ValueError(f"Unexpected result format from HF Space: {result}")

            # 3. Parse result (Defensive)
            # result[0] could be a Dict (gr.Label) or a String (direct)
            prediction_item = result[0]
            if isinstance(prediction_item, dict):
                prediction = prediction_item.get("label", "Unknown")
            else:
                prediction = str(prediction_item)
                
            conf_val = float(result[1]) if len(result) > 1 else 0.0
            local_heatmap_path = result[2] if len(result) > 2 else None

            # 4. Upload Heatmap to Supabase
            heatmap_url = ""
            if local_heatmap_path and os.path.exists(local_heatmap_path):
                print(f"DEBUG: Uploading heatmap {local_heatmap_path}...")
                remote_fn = f"heatmap_{os.path.basename(image_path)}"
                heatmap_url = storage_service.upload_file(local_heatmap_path, remote_fn)
                
                # Cleanup gradio temp file
                try:
                    os.remove(local_heatmap_path)
                except:
                    pass

            return prediction, conf_val, heatmap_url
            
        except Exception as e:
            print(f"Remote Prediction error: {str(e)}")
            # Log the full traceback or type of error
            import traceback
            traceback.print_exc()
            raise Exception(f"AI Service (Remote) failed: {str(e)}")

# Convenience function for API calls
def predict_dr_stage(image_path: str) -> Tuple[str, float, str]:
    return AIPredictor.predict(image_path)
