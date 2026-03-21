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
            # 1. Initialize Client
            client = Client(cls._hf_space_url, hf_token=cls._hf_token)
            
            # 2. Call the Remote API
            # app.py outputs [Label, Number, Image]
            result = client.predict(
                image=handle_file(image_path),
                api_name="/predict"
            )
            
            # 3. Parse result
            prediction_dict = result[0]
            prediction = prediction_dict.get("label", "Unknown")
            conf_val = float(result[1])
            local_heatmap_path = result[2]

            # 4. Upload Heatmap to Supabase
            heatmap_url = ""
            if local_heatmap_path and os.path.exists(local_heatmap_path):
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
            raise Exception(f"AI Service (Remote) failed: {str(e)}")

# Convenience function for API calls
def predict_dr_stage(image_path: str) -> Tuple[str, float, str]:
    return AIPredictor.predict(image_path)
