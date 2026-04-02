from __future__ import annotations

import os
import re
import socket
import uuid
from datetime import datetime
from pathlib import Path
from typing import Optional
from urllib.parse import urlparse, urlunparse

import httpx
from sqlalchemy.orm import Session

from app.models.image_cache import ImageCache


def canonicalize_url(url: str) -> str:
    """
    Strip querystring/fragment so signed URLs don't cause cache misses.
    """
    p = urlparse(url.strip())
    return urlunparse((p.scheme, p.netloc, p.path, "", "", ""))


def _is_private_host(hostname: str) -> bool:
    if not hostname:
        return True
    hn = hostname.lower().strip()
    if hn in {"localhost", "127.0.0.1", "::1"}:
        return True
    try:
        ip = socket.gethostbyname(hn)
    except Exception:
        # If it can't resolve, treat as unsafe.
        return True

    try:
        import ipaddress

        addr = ipaddress.ip_address(ip)
        return addr.is_private or addr.is_loopback or addr.is_link_local or addr.is_multicast or addr.is_reserved
    except Exception:
        return True


def _allowed_hosts() -> set[str]:
    env = (os.getenv("IMAGE_CACHE_ALLOW_HOSTS") or "").strip()
    hosts: set[str] = set()
    if env:
        for h in env.split(","):
            h2 = h.strip().lower()
            if h2:
                hosts.add(h2)

    # Default to Supabase host (if configured).
    supabase = (os.getenv("SUPABASE_URL") or "").strip()
    try:
        if supabase:
            hosts.add(urlparse(supabase).hostname.lower())  # type: ignore[union-attr]
    except Exception:
        pass

    return hosts


def validate_remote_url(url: str) -> str:
    if not url:
        raise ValueError("Empty URL")
    url = url.strip()
    p = urlparse(url)
    if p.scheme not in {"http", "https"}:
        raise ValueError("Only http/https URLs are allowed")
    if not p.hostname:
        raise ValueError("Invalid URL hostname")
    if _is_private_host(p.hostname):
        raise ValueError("Refusing to fetch private/local addresses")

    allow = _allowed_hosts()
    if allow and p.hostname.lower() not in allow:
        raise ValueError("Remote host not in allowlist")

    return url


def _ext_from_content_type(ct: str | None) -> str:
    if not ct:
        return ".bin"
    ct2 = ct.lower()
    if "png" in ct2:
        return ".png"
    if "jpeg" in ct2 or "jpg" in ct2:
        return ".jpg"
    if "webp" in ct2:
        return ".webp"
    return ".bin"


def _ext_from_url_path(path: str) -> str:
    suffix = Path(path).suffix.lower()
    if suffix in {".png", ".jpg", ".jpeg", ".webp"}:
        return ".jpg" if suffix == ".jpeg" else suffix
    return ""


def _safe_filename(name: str) -> str:
    # Keep it boring: alnum, dash, underscore, dot.
    name = re.sub(r"[^a-zA-Z0-9._-]+", "_", name)
    return name[:180] if len(name) > 180 else name


def cache_url(
    db: Session,
    *,
    doctor_id: int,
    remote_url: str,
    uploads_dir: str | Path = "uploads",
    force: bool = False,
    timeout_seconds: float = 30.0,
) -> Optional[str]:
    """
    Downloads a remote URL into uploads_dir and stores/updates mapping in image_cache.
    Returns the local served path (e.g. /uploads/<file>) or None on failure.
    """
    try:
        download_url = validate_remote_url(remote_url)
    except Exception:
        return None

    canonical = canonicalize_url(download_url)

    uploads_dir = Path(uploads_dir)
    uploads_dir.mkdir(parents=True, exist_ok=True)

    existing = (
        db.query(ImageCache)
        .filter(ImageCache.doctor_id == doctor_id, ImageCache.remote_url == canonical)
        .first()
    )

    if existing and not force:
        local_rel = existing.local_url
        local_fs = uploads_dir / Path(local_rel).name
        if local_fs.exists() and local_fs.stat().st_size > 0:
            existing.last_accessed_at = datetime.utcnow()
            db.commit()
            return local_rel
        # Mapping exists but file is missing/corrupt; force re-download.
        force = True

    p = urlparse(download_url)
    url_path_ext = _ext_from_url_path(p.path)

    max_bytes = int(float(os.getenv("IMAGE_CACHE_MAX_BYTES") or "52428800"))  # 50MB

    try:
        with httpx.Client(timeout=timeout_seconds, follow_redirects=True) as client:
            r = client.get(download_url)
            r.raise_for_status()
            ct = r.headers.get("content-type")
            etag = r.headers.get("etag")
            last_modified = r.headers.get("last-modified")
            content = r.content
    except Exception:
        return None

    if not content or len(content) == 0:
        return None
    if len(content) > max_bytes:
        return None

    ext = url_path_ext or _ext_from_content_type(ct)
    fname = _safe_filename(f"cache_{uuid.uuid4().hex}{ext}")
    local_fs_path = uploads_dir / fname
    try:
        local_fs_path.write_bytes(content)
    except Exception:
        return None

    local_rel = f"/uploads/{fname}"

    if existing:
        existing.local_url = local_rel
        existing.content_type = ct
        existing.etag = etag
        existing.last_modified = last_modified
        existing.byte_size = len(content)
        existing.updated_at = datetime.utcnow()
        existing.last_accessed_at = datetime.utcnow()
        db.commit()
        return local_rel

    rec = ImageCache(
        doctor_id=doctor_id,
        remote_url=canonical,
        local_url=local_rel,
        content_type=ct,
        etag=etag,
        last_modified=last_modified,
        byte_size=len(content),
    )
    db.add(rec)
    db.commit()
    return local_rel


def lookup_cached(db: Session, *, doctor_id: int, remote_url: str) -> Optional[str]:
    try:
        canonical = canonicalize_url(remote_url)
    except Exception:
        return None
    rec = db.query(ImageCache).filter(ImageCache.doctor_id == doctor_id, ImageCache.remote_url == canonical).first()
    if not rec:
        return None
    return rec.local_url


# --- Backward-compatible API used by sync.py ---

def get_cached_image(db: Session, doctor_id: int, remote_url: str) -> Optional[ImageCache]:
    try:
        canonical = canonicalize_url(remote_url)
    except Exception:
        return None
    rec = (
        db.query(ImageCache)
        .filter(ImageCache.doctor_id == doctor_id, ImageCache.remote_url == canonical)
        .first()
    )
    if not rec:
        return None

    # If file is missing, treat as uncached so the caller can re-download.
    try:
        uploads_dir = Path("uploads")
        fs_path = uploads_dir / Path(rec.local_url).name
        if not fs_path.exists() or fs_path.stat().st_size == 0:
            return None
    except Exception:
        return None
    return rec


def cache_remote_image(db: Session, doctor_id: int, remote_url: str) -> Optional[str]:
    return cache_url(db, doctor_id=doctor_id, remote_url=remote_url, force=False)
