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
# AI PREDICTOR SERVICE (IRONCLAD REST)
# =========================
class AIPredictor:
    """
    Final Guaranteed Fix: Bypasses the buggy 'gradio_client' entirely.
    Directly calls the Hugging Face REST API using Base64 encoding.
    This is the most stable and reliable way to connect to Hugging Face from Render.
    """
    _hf_base_url = os.getenv("HF_SPACE_URL_OVERRIDE", "https://jczdgyo-diabetic-retinopathy.hf.space")
    _hf_token = os.getenv("HF_TOKEN")

    @classmethod
    def predict(cls, image_path: str) -> Tuple[str, float, str]:
        try:
            print(f"DEBUG: Starting Ironclad REST prediction for {image_path}...")
            
            # 1. Encode Image to Base64
            with open(image_path, "rb") as image_file:
                encoded_string = base64.b64encode(image_file.read()).decode('utf-8')
            
            # Data URI format
            base64_data = f"data:image/jpeg;base64,{encoded_string}"

            with httpx.Client(timeout=300.0) as client:
                # 2. Trigger Prediction API
                # payload format for Gradio 4.0+
                payload = {
                    "data": [base64_data],
                    "fn_index": 0
                }
                
                # Try the primary endpoint /api/predict/
                endpoint = f"{cls._hf_base_url}/api/predict/"
                print(f"DEBUG: Calling endpoint {endpoint}...")
                
                predict_resp = client.post(
                    endpoint,
                    json=payload,
                    headers={"Authorization": f"Bearer {cls._hf_token}"} if cls._hf_token else {}
                )
                
                # Check for 404 and try fallback without trailing slash
                if predict_resp.status_code == 404:
                    print("DEBUG: 404 Not Found. Trying fallback endpoint without slash...")
                    endpoint = f"{cls._hf_base_url}/api/predict"
                    predict_resp = client.post(
                        endpoint,
                        json=payload,
                        headers={"Authorization": f"Bearer {cls._hf_token}"} if cls._hf_token else {}
                    )

                if predict_resp.status_code != 200:
                    print(f"ERROR: HF API failed with status {predict_resp.status_code}: {predict_resp.text}")
                    raise Exception(f"HF Space Prediction API failed: {predict_resp.text}")

                # 3. Parse result
                data = predict_resp.json()["data"]
                
                # Output 0: JSON result string
                prediction_data = data[0]
                if isinstance(prediction_data, str):
                    prediction_data = json.loads(prediction_data)
                
                prediction = prediction_data.get("prediction", "Unknown")
                confidence = float(prediction_data.get("confidence", 0.0))
                
                # 4. Handle Heatmap
                heatmap_info = data[1]
                heatmap_url = ""
                
                if heatmap_info and isinstance(heatmap_info, dict) and "path" in heatmap_info:
                    hf_heatmap_path = heatmap_info["path"]
                    # URL for files: {base_url}/file={path}
                    hf_download_url = f"{cls._hf_base_url}/file={hf_heatmap_path}"
                    print(f"DEBUG: Downloading heatmap from {hf_download_url}...")
                    
                    heatmap_resp = client.get(hf_download_url)
                    if heatmap_resp.status_code == 200:
                        local_heatmap_path = f"{image_path}_heatmap.jpg"
                        with open(local_heatmap_path, "wb") as f:
                            f.write(heatmap_resp.content)

                        remote_fn = f"heatmap_{os.path.basename(image_path)}"
                        heatmap_url = storage_service.upload_file(local_heatmap_path, remote_fn)
                        
                        # Cleanup temp file
                        if os.path.exists(local_heatmap_path):
                            os.remove(local_heatmap_path)
                    else:
                        print(f"WARNING: Failed to download heatmap: {heatmap_resp.status_code}")

                return prediction, confidence, heatmap_url

        except Exception as e:
            print(f"REST Prediction error: {str(e)}")
            import traceback
            traceback.print_exc()
            raise Exception(f"AI Service (REST) failed: {str(e)}")

# Convenience function for API calls
def predict_dr_stage(image_path: str) -> Tuple[str, float, str]:
    return AIPredictor.predict(image_path)
