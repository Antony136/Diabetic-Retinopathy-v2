import os
import json
import httpx
import base64
import time
from pathlib import Path
from typing import Tuple, Optional
from app.services.storage_service import storage_service
from dotenv import load_dotenv

load_dotenv()

# =========================
# AI PREDICTOR SERVICE (IRONCLAD GRADIO EVENT POLLING)
# =========================
class AIPredictor:
    """
    Final Guaranteed Fix: Bypasses ALL protocol issues by using 
    the official Gradio 4/5/6 event-based (polling) flow.
    Matches the exact browser interaction for Hugging Face Spaces.
    """
    _raw_url = os.getenv("HF_SPACE_URL", "https://jczdgyo-diabetic-retinopathy.hf.space")
    
    # Resolve full URL if Space ID is provided
    if not _raw_url.startswith("http"):
        parts = _raw_url.split("/")
        if len(parts) == 2:
            user, space = parts
            _hf_base_url = f"https://{user.lower()}-{space.lower().replace('_', '-')}.hf.space"
        else:
            _hf_base_url = f"https://{_raw_url.replace('/', '-').replace('_', '-')}.hf.space"
    else:
        _hf_base_url = _raw_url.rstrip("/")

    _hf_token = os.getenv("HF_TOKEN")

    @classmethod
    def predict(cls, image_path: str) -> Tuple[str, float, str]:
        try:
            print(f"DEBUG: Starting Ironclad REST prediction for {image_path}...")
            
            # 1. Encode Image to Base64
            with open(image_path, "rb") as image_file:
                encoded_string = base64.b64encode(image_file.read()).decode('utf-8')
            
            base64_data = f"data:image/jpeg;base64,{encoded_string}"

            # Browser-like headers for HF Proxy persistence
            headers = {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "Content-Type": "application/json",
            }
            if cls._hf_token:
                headers["Authorization"] = f"Bearer {cls._hf_token}"

            with httpx.Client(timeout=300.0, follow_redirects=True) as client:
                # STEP 1: Call Gradio API (Trigger Prediction)
                # Modern Gradio 4/5/6 route
                call_endpoint = f"{cls._hf_base_url}/gradio_api/call/predict"
                print(f"DEBUG: Calling endpoint {call_endpoint}...")
                
                payload = {
                    "data": [base64_data]
                }
                
                predict_resp = client.post(call_endpoint, json=payload, headers=headers)
                
                if predict_resp.status_code != 200:
                    print(f"ERROR: Initial call failed {predict_resp.status_code}: {predict_resp.text}")
                    raise Exception(f"HF Space Call failed: {predict_resp.text}")

                event_id = predict_resp.json().get("event_id")
                if not event_id:
                    raise Exception("No event_id returned from HF API")

                print(f"DEBUG: event_id = {event_id}. Starting polling...")

                # STEP 2: Poll result (Correct SSID format)
                # Poll endpoint: /gradio_api/queue/data?event_id=xyz
                result_url = f"{cls._hf_base_url}/gradio_api/queue/data?event_id={event_id}"
                result_data = None

                for i in range(30):  # Poll for up to 30 seconds
                    res = client.get(result_url, headers=headers)
                    if res.status_code != 200:
                        raise Exception(f"Polling failed: {res.text}")
                    
                    # Gradio 6 returns SSE-like strings or JSON depending on the proxy
                    # We handle both raw SSE and JSON
                    try:
                        content = res.text
                        if "event: complete" in content or '"status": "complete"' in content:
                            # Extract JSON from SSE data if needed
                            if "data: " in content:
                                data_str = content.split("data: ")[1].split("\n")[0]
                                full_resp = json.loads(data_str)
                            else:
                                full_resp = res.json()
                            
                            result_data = full_resp.get("data")
                            print(f"DEBUG: Status complete on attempt {i+1}")
                            break
                        elif "event: error" in content:
                            raise Exception(f"Gradio Remote Error: {content}")
                    except Exception as parse_err:
                        print(f"DEBUG: Polling parsing warning: {parse_err}")

                    time.sleep(1)

                if result_data is None:
                    raise Exception("Timeout waiting for prediction result from Hugging Face")

                # STEP 3: Parse result
                prediction_info = result_data[0]
                if isinstance(prediction_info, str):
                    prediction_info = json.loads(prediction_info)
                
                prediction = prediction_info.get("prediction", "Unknown")
                confidence = float(prediction_info.get("confidence", 0.0))
                
                # 4. Handle Heatmap
                heatmap_info = result_data[1]
                heatmap_url = ""
                
                if heatmap_info and isinstance(heatmap_info, dict) and "path" in heatmap_info:
                    hf_heatmap_path = heatmap_info["path"]
                    # Try both file endpoints (V4 and V3 compat)
                    download_urls = [
                        f"{cls._hf_base_url}/gradio_api/file={hf_heatmap_path}",
                        f"{cls._hf_base_url}/file={hf_heatmap_path}"
                    ]
                    
                    found = False
                    for dl_url in download_urls:
                        print(f"DEBUG: Attempting heatmap download from {dl_url}...")
                        h_res = client.get(dl_url, headers=headers)
                        if h_res.status_code == 200:
                            local_heatmap_p = f"{image_path}_heatmap.jpg"
                            with open(local_heatmap_p, "wb") as f:
                                f.write(h_res.content)
                            
                            remote_fn = f"heatmap_{os.path.basename(image_path)}"
                            heatmap_url = storage_service.upload_file(local_heatmap_p, remote_fn)
                            
                            if os.path.exists(local_heatmap_p):
                                os.remove(local_heatmap_p)
                            found = True
                            break
                    
                    if not found:
                        print(f"WARNING: Heatmap download failed on all routes.")

                return prediction, confidence, heatmap_url

        except Exception as e:
            print(f"REST Prediction error: {str(e)}")
            import traceback
            traceback.print_exc()
            raise Exception(f"AI Service (REST) failed: {str(e)}")


# Convenience function for API calls
def predict_dr_stage(image_path: str) -> Tuple[str, float, str]:
    return AIPredictor.predict(image_path)
