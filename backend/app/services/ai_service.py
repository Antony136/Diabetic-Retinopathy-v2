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
    HEAVY DUTY FIX: Bypasses the buggy 'gradio_client' library entirely.
    Directly calls the Hugging Face REST API using Base64 encoding.
    This is 100% stable regardless of Python version or Render RAM.
    """
    _hf_base_url = "https://jczdgyo-diabetic-retinopathy.hf.space"
    _hf_token = os.getenv("HF_TOKEN")

    @classmethod
    def predict(cls, image_path: str) -> Tuple[str, float, str]:
        try:
            print(f"DEBUG: Starting Ironclad REST prediction for {image_path}...")
            
            # 1. Encode Image to Base64
            with open(image_path, "rb") as image_file:
                encoded_string = base64.b64encode(image_file.read()).decode('utf-8')
            
            # Format as a Data URI which Gradio's Image component accepts directly
            base64_data = f"data:image/jpeg;base64,{encoded_string}"

            with httpx.Client(timeout=300.0) as client:
                # 2. Trigger Prediction API
                # This matches the 'predict' function index 0 in app.py
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
                    print(f"ERROR: HF API Status {predict_resp.status_code}: {predict_resp.text}")
                    # If /api/predict/ 404s, try without the trailing slash
                    if predict_resp.status_code == 404:
                         predict_resp = client.post(
                            f"{cls._hf_base_url}/api/predict",
                            json=payload,
                            headers={"Authorization": f"Bearer {cls._hf_token}"} if cls._hf_token else {}
                        )

                if predict_resp.status_code != 200:
                    raise Exception(f"HF Space Prediction API failed: {predict_resp.text}")

                # 3. Parse result
                # Output 0: JSON result (prediction info)
                # Output 1: Heatmap image info
                resp_json = predict_resp.json()
                data = resp_json["data"]
                
                # Unwrap the first output (prediction data)
                # If we used gr.JSON, it's a dict. If we used gr.Textbox(json.dumps), it's a string.
                prediction_data = data[0]
                if isinstance(prediction_data, str):
                    prediction_data = json.loads(prediction_data)
                
                prediction = prediction_data.get("prediction", "Unknown")
                confidence = float(prediction_data.get("confidence", 0.0))
                
                # 4. Handle Heatmap
                heatmap_info = data[1]
                heatmap_url = ""
                
                if heatmap_info and isinstance(heatmap_info, dict) and "path" in heatmap_info:
                    # Download heatmap using the file server endpoint
                    # URL format: {base_url}/file={temp_path}
                    hf_heatmap_path = heatmap_info["path"]
                    hf_download_url = f"{cls._hf_base_url}/file={hf_heatmap_path}"
                    
                    local_heatmap_path = f"{image_path}_heatmap.jpg"
                    heatmap_resp = client.get(hf_download_url)
                    
                    if heatmap_resp.status_code == 200:
                        with open(local_heatmap_path, "wb") as f:
                            f.write(heatmap_resp.content)

                        remote_fn = f"heatmap_{os.path.basename(image_path)}"
                        heatmap_url = storage_service.upload_file(local_heatmap_path, remote_fn)
                        
                        # Cleanup
                        if os.path.exists(local_heatmap_path):
                            os.remove(local_heatmap_path)

                return prediction, confidence, heatmap_url

        except Exception as e:
            print(f"REST Prediction error: {str(e)}")
            import traceback
            traceback.print_exc()
            raise Exception(f"AI Service (REST) failed: {str(e)}")

# Convenience function for API calls
def predict_dr_stage(image_path: str) -> Tuple[str, float, str]:
    return AIPredictor.predict(image_path)
