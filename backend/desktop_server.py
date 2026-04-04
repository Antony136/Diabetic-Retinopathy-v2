import os
import sys
from pathlib import Path


def setup_environment():
    """
    Configure environment variables for desktop runtime
    """
    os.environ.setdefault("AI_PROVIDER", "local")
    # Desktop runs should never rely on cloud storage being available. This enables:
    # - JSON error details from the global exception handler
    # - local `/uploads` fallback when cloud uploads fail
    os.environ.setdefault("DESKTOP_MODE", "1")
    os.environ.setdefault("ALLOWED_ORIGINS", "*")

    # When running from Electron we intentionally keep the current working directory (cwd)
    # set by the parent process (typically Electron's app.getPath("userData")).
    # That ensures SQLite + uploads persist under the user's profile and are writable.
    #
    # We only need to ensure Python can import the backend package when cwd is not the repo root.
    if getattr(sys, "frozen", False):
        base_path = getattr(sys, "_MEIPASS", os.getcwd())
    else:
        base_path = os.path.dirname(os.path.abspath(__file__))

    if base_path and base_path not in sys.path:
        sys.path.insert(0, base_path)

    # Ensure the local model checkpoint can be found in both dev + frozen builds.
    # dual_mode_service prefers an explicit MODEL_PATH override.
    if not (os.getenv("MODEL_PATH") or "").strip():
        candidates: list[Path] = []
        try:
            meipass = Path(getattr(sys, "_MEIPASS", ""))
            if str(meipass):
                candidates.append(meipass / "app" / "checkpoints" / "model_b3.pth")
        except Exception:
            pass

        try:
            exe_dir = Path(sys.executable).resolve().parent
            candidates.append(exe_dir / "model_b3.pth")
            candidates.append(exe_dir / "checkpoints" / "model_b3.pth")
            candidates.append(exe_dir / "app" / "checkpoints" / "model_b3.pth")
        except Exception:
            pass

        try:
            candidates.append(Path(base_path) / "app" / "checkpoints" / "model_b3.pth")
        except Exception:
            pass

        for p in candidates:
            try:
                if p and p.exists():
                    os.environ["MODEL_PATH"] = str(p)
                    break
            except Exception:
                continue


def main():
    setup_environment()

    host = os.getenv("HOST", "127.0.0.1")
    port = int(os.getenv("PORT", "8000"))
    log_level = os.getenv("LOG_LEVEL", "info")

    # ✅ IMPORTANT: Direct import (fixes your error)
    from app.main import app

    import uvicorn

    uvicorn.run(
        app,
        host=host,
        port=port,
        log_level=log_level
    )


if __name__ == "__main__":
    main()
