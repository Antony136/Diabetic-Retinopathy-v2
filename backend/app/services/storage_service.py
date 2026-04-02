import os
import httpx
import re
import time
import uuid
from pathlib import Path
from dotenv import load_dotenv
from urllib.parse import quote, unquote

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL", "").rstrip("/")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

class StorageService:
    @staticmethod
    def _write_local_upload(data: bytes, remote_filename: str) -> str:
        uploads_dir = Path("uploads")
        uploads_dir.mkdir(parents=True, exist_ok=True)

        # Normalize and sanitize remote filenames to avoid encoded path mismatch
        filename = Path(remote_filename).name
        filename = unquote(filename)
        # Keep spaces to avoid URL/DB mismatch (StaticFiles decodes %20 -> space).
        filename = re.sub(r"[^A-Za-z0-9_.()\\- ]", "_", filename).strip("_ ")
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
        retries: int = 3,
    ) -> str:
        """
        Upload raw bytes to Supabase Storage with retry logic.
        Returns the public object URL (requires a public bucket).
        """
        if not SUPABASE_URL or not SUPABASE_KEY:
            # Offline/local fallback: persist to disk and serve via /uploads static mount.
            try:
                return StorageService._write_local_upload(data, remote_filename)
            except Exception as e:
                print(f"ERROR: Failed to write local upload fallback: {e}")
                return f"/uploads/{Path(unquote(remote_filename)).name}"

        if not data:
            print("ERROR: No data provided for upload (0 bytes).")
            return ""

        safe_filename = quote(remote_filename)
        endpoint = f"{SUPABASE_URL}/storage/v1/object/{bucket}/{safe_filename}"

        if content_type is None:
            file_ext = Path(remote_filename).suffix.lower()
            if file_ext in [".jpg", ".jpeg"]:
                content_type = "image/jpeg"
            elif file_ext == ".png":
                content_type = "image/png"
            else:
                content_type = "application/octet-stream"

        headers = {
            "Authorization": f"Bearer {SUPABASE_KEY}",
            "apikey": SUPABASE_KEY,
            "Content-Type": content_type,
            "x-upsert": "true",
        }

        print(f"DEBUG: Uploading {remote_filename} ({len(data)} bytes) to Supabase...")

        for attempt in range(retries):
            try:
                with httpx.Client(timeout=60.0, follow_redirects=True) as client:
                    response = client.post(endpoint, content=data, headers=headers)

                    # Some environments/buckets expect PUT instead of POST.
                    if response.status_code == 405:
                        response = client.put(endpoint, content=data, headers=headers)

                    if response.status_code in (200, 201):
                        public_url = f"{SUPABASE_URL}/storage/v1/object/public/{bucket}/{safe_filename}"
                        print(f"SUCCESS: Uploaded to cloud: {public_url}")
                        return public_url

                    print(f"UPLOAD ATTEMPT {attempt+1} FAILED ({response.status_code}): {response.text}")
            except Exception as e:
                print(f"STORAGE ATTEMPT {attempt+1} ERROR: {str(e)}")

            if attempt < retries - 1:
                time.sleep(2)

        # Cloud upload failed; fall back to local persistence so desktop/offline remains consistent.
        try:
            return StorageService._write_local_upload(data, remote_filename)
        except Exception as e:
            print(f"ERROR: Failed to write local upload fallback after cloud failure: {e}")
            return ""

    @staticmethod
    def upload_file(local_path: str, remote_filename: str, bucket: str = "retina-images", retries: int = 3) -> str:
        """
        Uploads a file to Supabase Storage with retry logic.
        """
        if not SUPABASE_URL or not SUPABASE_KEY:
            try:
                return StorageService._write_local_upload(Path(local_path).read_bytes(), remote_filename)
            except Exception as e:
                print(f"ERROR: Failed to write local upload fallback: {e}")
                return f"/uploads/{Path(remote_filename).name}"

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
