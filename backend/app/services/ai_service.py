import os
import json
import httpx
import gc
from pathlib import Path
from typing import Tuple, Optional
from app.services.storage_service import storage_service
from dotenv import load_dotenv

load_dotenv()

# =========================
# AI PREDICTOR SERVICE (REST API CLIENT)
# =========================
class AIPredictor:
    """
    Service to handle AI predictions by calling a remote Hugging Face Space via raw REST API.
    Bypasses the 'gradio_client' library to avoid current schema-parsing bugs in Python 3.14/3.13.
    """
    _hf_base_url = "https://jczdgyo-diabetic-retinopathy.hf.space"
    _hf_token = os.getenv("HF_TOKEN")

    @classmethod
    def predict(cls, image_path: str) -> Tuple[str, float, str]:
        """
        Direct REST call to Gradio API on Hugging Face
        """
        try:
            print(f"DEBUG: Starting REST prediction for {image_path}...")
            
            with httpx.Client(timeout=300.0) as client:
                # 1. Upload File to Space
                with open(image_path, "rb") as f:
                    upload_resp = client.post(
                        f"{cls._hf_base_url}/upload",
                        files={"files": f},
                        headers={"Authorization": f"Bearer {cls._hf_token}"} if cls._hf_token else {}
                    )
                
                if upload_resp.status_code != 200:
                    raise Exception(f"Failed to upload image to HF Space: {upload_resp.text}")
                
                remote_temp_filename = upload_resp.json()[0]
                print(f"DEBUG: Image uploaded to HF temp storage: {remote_temp_filename}")

                # 2. Trigger Prediction API
                payload = {
                    "data": [
                        {"path": remote_temp_filename, "orig_name": os.path.basename(image_path)},
                    ],
                    "fn_index": 0
                }
                
                predict_resp = client.post(
                    f"{cls._hf_base_url}/api/predict/",
                    json=payload,
                    headers={"Authorization": f"Bearer {cls._hf_token}"} if cls._hf_token else {}
                )
                
                if predict_resp.status_code != 200:
                    raise Exception(f"HF Space Prediction API failed: {predict_resp.text}")

                # 3. Parse result
                # Output 0: JSON result string
                # Output 1: Heatmap image info
                data = predict_resp.json()["data"]
                result_json = json.loads(data[0])
                heatmap_info = data[1] # This contains the URL for the heatmap on HF

                prediction = result_json.get("prediction", "Unknown")
                conf_val = float(result_json.get("confidence", 0.0))
                
                hf_heatmap_url = f"{cls._hf_base_url}/file={heatmap_info['path']}"
                print(f"DEBUG: Downloading heatmap from {hf_heatmap_url}...")

                # 4. Download Heatmap and Upload to Supabase (Existing flow)
                local_heatmap_path = f"{image_path}_heatmap.jpg"
                heatmap_resp = client.get(hf_heatmap_url)
                with open(local_heatmap_path, "wb") as f:
                    f.write(heatmap_resp.content)

                remote_fn = f"heatmap_{os.path.basename(image_path)}"
                heatmap_url = storage_service.upload_file(local_heatmap_path, remote_fn)
                
                # Cleanup
                if os.path.exists(local_heatmap_path):
                    os.remove(local_heatmap_path)
                    
                return prediction, conf_val, heatmap_url

        except Exception as e:
            print(f"REST Prediction error: {str(e)}")
            import traceback
            traceback.print_exc()
            raise Exception(f"AI Service (REST) failed: {str(e)}")

# Convenience function for API calls
def predict_dr_stage(image_path: str) -> Tuple[str, float, str]:
    return AIPredictor.predict(image_path)
