import os
import httpx
import re
import time
import uuid
from pathlib import Path
from dotenv import load_dotenv
from urllib.parse import quote, unquote

load_dotenv()

class StorageService:
    @staticmethod
    def _write_local_upload(data: bytes, remote_filename: str) -> str:
        uploads_dir = Path((os.getenv("UPLOADS_DIR") or "uploads").strip() or "uploads")
        uploads_dir.mkdir(parents=True, exist_ok=True)

        # Normalize and sanitize remote filenames to avoid encoded path mismatch
        filename = Path(remote_filename).name
        filename = unquote(filename)
        # Keep spaces to avoid URL/DB mismatch (StaticFiles decodes %20 -> space).
        # NOTE: Put '-' at the end of the character class to avoid regex "bad character range" issues.
        filename = re.sub(r"[^A-Za-z0-9_.() -]", "_", filename).strip("_ ")
        if not filename:
            filename = f"{uuid.uuid4().hex}.bin"

        local_path = uploads_dir / filename
        # Avoid collisions by appending numeric suffix
        if local_path.exists():
            stem = local_path.stem
            suffix = local_path.suffix
            i = 1
            while True:
                candidate = uploads_dir / f"{stem}_{i}{suffix}"
                if not candidate.exists():
                    local_path = candidate
                    break
                i += 1

        local_path.write_bytes(data or b"")
        return f"/uploads/{local_path.name}"

    @staticmethod
    def upload_bytes(
        data: bytes,
        remote_filename: str,
        bucket: str = "retina-images",
        content_type: str | None = None,
        retries: int = 1, # Reduced retries for faster fallback
    ) -> str:
        """
        Upload raw bytes to Supabase Storage.
        IF DESKTOP_MODE: Return local URL immediately and background the cloud upload.
        """
        supabase_url = (os.getenv("SUPABASE_URL") or "").rstrip("/")
        supabase_key = os.getenv("SUPABASE_KEY") or ""
        desktop_mode = (os.getenv("DESKTOP_MODE") or "").strip() == "1"

        # 1. Local Persistence (Guaranteed Fast)
        local_url = StorageService._write_local_upload(data, remote_filename)
        
        # 2. If not cloud-configured, just return local
        if not supabase_url or not supabase_key:
            return local_url

        # 3. Cloud Upload Logic
        def _bg_upload():
            safe_filename = quote(remote_filename)
            endpoint = f"{supabase_url}/storage/v1/object/{bucket}/{safe_filename}"
            
            headers = {
                "Authorization": f"Bearer {supabase_key}",
                "apikey": supabase_key,
                "Content-Type": content_type or "application/octet-stream",
                "x-upsert": "true",
            }
            
            try:
                with httpx.Client(timeout=10.0) as client:
                    response = client.post(endpoint, content=data, headers=headers)
                    if response.status_code == 405:
                        response = client.put(endpoint, content=data, headers=headers)
                    
                    if response.status_code in (200, 201):
                        print(f"BACKGROUND CLOUD SUCCESS: {remote_filename}")
                    else:
                        # Silently log errors to avoid blocking UI
                        if not (response.status_code == 404 and "Bucket not found" in response.text):
                            print(f"BACKGROUND CLOUD FAILED ({response.status_code}): {remote_filename}")
            except Exception as e:
                pass # Silent fail in background

        # 4. Strategy: Return local immediately if desktop, else wait for cloud
        if desktop_mode:
            import threading
            threading.Thread(target=_bg_upload, daemon=True).start()
            return local_url
        
        # Cloud deployment mode: wait for cloud because local is ephemeral
        _bg_upload() # Synchronous for cloud
        # In cloud mode, we need the real public URL
        safe_filename = quote(remote_filename)
        return f"{supabase_url}/storage/v1/object/public/{bucket}/{safe_filename}"

    @staticmethod
    def upload_file(local_path: str, remote_filename: str, bucket: str = "retina-images", retries: int = 3) -> str:
        """
        Uploads a file to Supabase Storage with retry logic.
        """
        supabase_url = (os.getenv("SUPABASE_URL") or "").rstrip("/")
        supabase_key = os.getenv("SUPABASE_KEY") or ""

        if not supabase_url or not supabase_key:
            return StorageService._write_local_upload(Path(local_path).read_bytes(), remote_filename)

        if not os.path.exists(local_path):
            print(f"ERROR: Local file not found: {local_path}")
            return ""

        file_size = os.path.getsize(local_path)
        if file_size == 0:
            print(f"ERROR: File is empty (0 bytes): {local_path}")
            return ""

        file_ext = Path(local_path).suffix.lower()
        if file_ext in [".jpg", ".jpeg"]:
            content_type = "image/jpeg"
        elif file_ext == ".png":
            content_type = "image/png"
        else:
            content_type = "application/octet-stream"

        try:
            with open(local_path, "rb") as f:
                file_data = f.read()
        except Exception as e:
            print(f"ERROR: Failed to read local file {local_path}: {e}")
            return ""

        return StorageService.upload_bytes(
            data=file_data,
            remote_filename=remote_filename,
            bucket=bucket,
            content_type=content_type,
            retries=retries,
        )

# Create a singleton
storage_service = StorageService()
