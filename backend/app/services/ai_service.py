import os
import json
import httpx
import base64
from pathlib import Path
from typing import Tuple, Optional
from app.services.storage_service import storage_service
from dotenv import load_dotenv

load_dotenv()

# =========================
# AI PREDICTOR SERVICE (BASE64 REST CLIENT)
# =========================
class AIPredictor:
    """
    Final Stability Fix: Uses Base64 encoding to communicate with Hugging Face via REST.
    This avoids the /upload endpoint which was causing 404/Not Found errors.
    """
    _hf_base_url = "https://jczdgyo-diabetic-retinopathy.hf.space"
    _hf_token = os.getenv("HF_TOKEN")

    @classmethod
    def predict(cls, image_path: str) -> Tuple[str, float, str]:
        try:
            print(f"DEBUG: Starting Base64 REST prediction for {image_path}...")
            
            # 1. Encode Image to Base64
            with open(image_path, "rb") as image_file:
                encoded_string = base64.b64encode(image_file.read()).decode('utf-8')
            
            base64_data = f"data:image/jpeg;base64,{encoded_string}"

            with httpx.Client(timeout=300.0) as client:
                # 2. Trigger Prediction API
                # payload format for Gradio 4.0+ direct API
                payload = {
                    "data": [base64_data],
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
                data = predict_resp.json()["data"]
                result_json = json.loads(data[0])
                heatmap_info = data[1] # Path of the generated heatmap on HF

                prediction = result_json.get("prediction", "Unknown")
                conf_val = float(result_json.get("confidence", 0.0))
                
                # 4. Download Heatmap using the file= endpoint
                # Heatmap URL format: {base_url}/file={temp_path}
                hf_heatmap_url = f"{cls._hf_base_url}/file={heatmap_info['path']}"
                print(f"DEBUG: Downloading heatmap from {hf_heatmap_url}...")

                local_heatmap_path = f"{image_path}_heatmap.jpg"
                heatmap_resp = client.get(hf_heatmap_url)
                with open(local_heatmap_path, "wb") as f:
                    f.write(heatmap_resp.content)

                # 5. Process & Upload (Existing flow)
                remote_fn = f"heatmap_{os.path.basename(image_path)}"
                heatmap_url = storage_service.upload_file(local_heatmap_path, remote_fn)
                
                # Cleanup local temp file
                if os.path.exists(local_heatmap_path):
                    os.remove(local_heatmap_path)
                    
                return prediction, conf_val, heatmap_url

        except Exception as e:
            print(f"Base64 REST Prediction error: {str(e)}")
            import traceback
            traceback.print_exc()
            raise Exception(f"AI Service (REST-B64) failed: {str(e)}")

# Convenience function for API calls
def predict_dr_stage(image_path: str) -> Tuple[str, float, str]:
    return AIPredictor.predict(image_path)
