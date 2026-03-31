import os


def main():
    # Desktop defaults: local DB + local inference. Electron can override via env.
    os.environ.setdefault("AI_PROVIDER", "local")
    os.environ.setdefault("ALLOWED_ORIGINS", "*")

    host = os.getenv("HOST", "127.0.0.1")
    port = int(os.getenv("PORT", "8000"))

    import uvicorn

    uvicorn.run("app.main:app", host=host, port=port, log_level=os.getenv("LOG_LEVEL", "info"))


if __name__ == "__main__":
    main()

