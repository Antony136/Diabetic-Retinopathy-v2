from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from app.api import health, auth, patients, reports, notifications, preferences, profile, admin, doctor_assistant, inference, sync
from pathlib import Path
from app.db.database import engine
from app.db.migrate import run_migrations
import os


app = FastAPI(title="Retina Max Backend", version="2.0.0")


@app.on_event("startup")
def _startup_migrations():
    try:
        run_migrations(engine)
        print("Migrations applied (if any).")
    except Exception as e:
        # Don't prevent boot if migrations fail (e.g., limited DB permissions)
        print(f"WARNING: migrations failed: {e}")


# Create uploads directory (ensure it exists)
uploads_dir = Path("uploads")
uploads_dir.mkdir(parents=True, exist_ok=True)

print(f"Server starting - Environment: PORT={os.getenv('PORT')}")

# Mount uploads directory as static files (legacy local-storage support)
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

# CORS middleware
origins_env = os.getenv("ALLOWED_ORIGINS")
allowed_origins = origins_env.split(",") if origins_env else ["*"]

# Standard-compliant CORS for JWT (non-cookie) authentication
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
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

