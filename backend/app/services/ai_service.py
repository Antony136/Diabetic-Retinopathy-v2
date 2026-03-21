from gradio_client import Client
import os
from app.services.storage_service import storage_service
from typing import Tuple
from dotenv import load_dotenv

load_dotenv()

class AIPredictor:
    """
    Calls Hugging Face Space using gradio_client (recommended for public Spaces).
    Avoids 404/Not Found errors from /api/predict/ endpoints.
    """

    _hf_space = os.getenv("HF_SPACE_URL", "jczdgyo/diabetic-retinopathy")

    @classmethod
    def predict(cls, image_path: str) -> Tuple[str, float, str]:
        try:
            print(f"DEBUG: Sending image {image_path} to HF Space {cls._hf_space}...")

            # 1. Connect to HF Space
            client = Client(cls._hf_space)

            # 2. Call the first function (fn_index=0) in the Space
            result = client.predict(image_path, api_name=None)  # api_name=None = default function

            # 3. Unpack result
            # result expected: [prediction_dict, heatmap_info]
            prediction_data = result[0]   # dict: {'prediction': 'Moderate', 'confidence': 0.87}
            heatmap_info = result[1]      # dict: {'path': 'temp/heatmap_abc.jpg'}

            prediction = prediction_data.get("prediction", "Unknown")
            confidence = float(prediction_data.get("confidence", 0.0))

            # 4. Upload heatmap to Supabase
            # heatmap_info['url'] might be available if using recent gradio_client
            # but we can fallback to the file path if it's local
            heatmap_url = ""
            if heatmap_info and isinstance(heatmap_info, dict) and "path" in heatmap_info:
                local_heatmap_path = heatmap_info["path"]
                remote_fn = f"heatmap_{os.path.basename(image_path)}"
                heatmap_url = storage_service.upload_file(local_heatmap_path, remote_fn)

            return prediction, confidence, heatmap_url

        except Exception as e:
            print(f"HF Space Prediction error: {e}")
            import traceback
            traceback.print_exc()
            raise Exception(f"AI Service failed: {e}")


# Convenience function for API calls
def predict_dr_stage(image_path: str) -> Tuple[str, float, str]:
    return AIPredictor.predict(image_path)
