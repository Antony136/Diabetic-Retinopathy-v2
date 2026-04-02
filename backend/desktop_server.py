import os
import sys


def setup_environment():
    """
    Configure environment variables for desktop runtime
    """
    os.environ.setdefault("AI_PROVIDER", "local")
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
