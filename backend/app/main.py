from fastapi import FastAPI
from fastapi import Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from app.api import health, auth, patients, reports, notifications, preferences, profile, admin, doctor_assistant, inference, sync, diagnostics
from app.api import image_cache
from pathlib import Path
from app.db.database import engine, Base
from app.db.migrate import run_migrations
import os
import traceback


app = FastAPI(title="Retina Max Backend", version="2.0.0")

# Ensure local SQLite tables exist (desktop mode) before app usage.
try:
    if engine.dialect.name == "sqlite" or (os.getenv("DESKTOP_MODE") or "").strip() == "1":
        Base.metadata.create_all(bind=engine)
except Exception as e:
    print(f"WARNING: create_all skipped/failed: {e}")


@app.on_event("startup")
def _startup_migrations():
    if (os.getenv("RUN_MIGRATIONS") or "1").strip() in ("0", "false", "False", "no", "NO"):
        print("Migrations skipped (RUN_MIGRATIONS=0).")
        return
    try:
        run_migrations(engine)
        print("Migrations applied (if any).")
    except Exception as e:
        # Don't prevent boot if migrations fail (e.g., limited DB permissions)
        print(f"WARNING: migrations failed: {e}")


# Create uploads directory (ensure it exists)
uploads_dir = Path((os.getenv("UPLOADS_DIR") or "uploads").strip() or "uploads")
uploads_dir.mkdir(parents=True, exist_ok=True)

print(f"Server starting - Environment: PORT={os.getenv('PORT')}")

# Mount uploads directory as static files (legacy local-storage support)
try:
    from app.services.uploads_static import UploadsStaticFiles

    app.mount("/uploads", UploadsStaticFiles(directory=str(uploads_dir)), name="uploads")
except Exception:
    app.mount("/uploads", StaticFiles(directory=str(uploads_dir)), name="uploads")

# --- ROBUST CORS CONFIGURATION ---
origins_env = os.getenv("ALLOWED_ORIGINS")
# Default production origins (Vercel & local)
allowed_origins = [
    "http://localhost:5173",
    "http://localhost:3000",
    "https://diabetic-retinopathy-v2.vercel.app"
]

if origins_env:
    # Append user-defined origins from environment
    extra_origins = [o.strip() for o in origins_env.split(",") if o.strip()]
    for o in extra_origins:
        # Strip trailing slash for robustness
        clean_o = o.rstrip("/")
        if clean_o not in allowed_origins:
            allowed_origins.append(clean_o)

# If we have specific origins, we can allow credentials (JWT/Cookies)
allow_credentials = True if allowed_origins else False

# Standard-compliant CORS for JWT (non-cookie) authentication
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_origin_regex=r"https://.*\.vercel\.app", # Allow all vercel subdomains & previews
    allow_credentials=allow_credentials,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)


@app.exception_handler(Exception)
async def _unhandled_exception_handler(request: Request, exc: Exception):
    # Ensure desktop gets JSON errors (instead of plain "Internal Server Error"),
    # which makes debugging offline issues much easier.
    desktop = (os.getenv("DESKTOP_MODE") or "").strip() == "1"
    
    # Extract origin for CORS fallback
    origin = request.headers.get("origin")
    headers = {}
    if origin:
        headers["Access-Control-Allow-Origin"] = origin
        headers["Access-Control-Allow-Credentials"] = "true"

    if desktop:
        try:
            traceback.print_exc()
        except Exception:
            pass
        return JSONResponse(
            status_code=500,
            headers=headers,
            content={
                "detail": "Internal Server Error",
                "error": str(exc),
                "type": exc.__class__.__name__,
                "path": str(request.url.path),
            },
        )

    # Cloud: keep response generic but include CORS headers
    return JSONResponse(
        status_code=500, 
        headers=headers,
        content={"detail": f"Internal Server Error: {str(exc)}"}
    )


@app.api_route("/", methods=["GET", "HEAD"])
def root():
    return {"message": "Backend running"}


app.include_router(health.router)
app.include_router(auth.router)
app.include_router(patients.router)
app.include_router(reports.router)
app.include_router(notifications.router)
app.include_router(preferences.router)
app.include_router(profile.router)
app.include_router(admin.router)
app.include_router(doctor_assistant.router)
app.include_router(inference.router)
app.include_router(sync.router)
app.include_router(image_cache.router)
app.include_router(diagnostics.router)

