import os
import sys


def setup_environment():
    """
    Configure environment variables for desktop runtime
    """
    os.environ.setdefault("AI_PROVIDER", "local")
    os.environ.setdefault("ALLOWED_ORIGINS", "*")

    # Fix working directory when running as PyInstaller EXE
    if getattr(sys, 'frozen', False):
        # Running inside EXE
        base_path = sys._MEIPASS
    else:
        # Running in dev
        base_path = os.path.dirname(os.path.abspath(__file__))

    os.chdir(base_path)


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
