import os
import httpx
import time
from pathlib import Path
from dotenv import load_dotenv
from urllib.parse import quote

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL", "").rstrip("/")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

class StorageService:
    @staticmethod
    def upload_file(local_path: str, remote_filename: str, bucket: str = "retina-images", retries: int = 3) -> str:
        """
        Uploads a file to Supabase Storage with retry logic.
        """
        if not SUPABASE_URL or not SUPABASE_KEY:
            print("ERROR: SUPABASE_URL or SUPABASE_KEY missing in environment.")
            return f"/uploads/{remote_filename}"

        if not os.path.exists(local_path):
            print(f"ERROR: Local file not found: {local_path}")
            return f"/uploads/{remote_filename}"

        file_size = os.path.getsize(local_path)
        if file_size == 0:
            print(f"ERROR: File is empty (0 bytes): {local_path}")
            return f"/uploads/{remote_filename}"

        safe_filename = quote(remote_filename)
        endpoint = f"{SUPABASE_URL}/storage/v1/object/{bucket}/{safe_filename}"
        
        file_ext = Path(local_path).suffix.lower()
        content_type = "image/jpeg" if file_ext in [".jpg", ".jpeg"] else "image/png"
        
        headers = {
            "Authorization": f"Bearer {SUPABASE_KEY}",
            "apikey": SUPABASE_KEY,
            "Content-Type": content_type,
            "x-upsert": "true"
        }

        print(f"DEBUG: Uploading {remote_filename} ({file_size} bytes) to Supabase...")

        for attempt in range(retries):
            try:
                with open(local_path, "rb") as f:
                    file_data = f.read()

                # Increased timeout and added follow_redirects for reliability
                with httpx.Client(timeout=60.0, follow_redirects=True) as client:
                    response = client.post(endpoint, content=file_data, headers=headers)
                    
                    if response.status_code == 200:
                        public_url = f"{SUPABASE_URL}/storage/v1/object/public/{bucket}/{safe_filename}"
                        print(f"SUCCESS: Uploaded to cloud: {public_url}")
                        return public_url
                    else:
                        print(f"UPLOAD ATTEMPT {attempt+1} FAILED ({response.status_code}): {response.text}")
            except Exception as e:
                print(f"STORAGE ATTEMPT {attempt+1} ERROR: {str(e)}")
            
            if attempt < retries - 1:
                time.sleep(2) # Wait before retry

        return f"/uploads/{remote_filename}"

# Create a singleton
storage_service = StorageService()
