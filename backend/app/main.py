from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from app.api import health, auth, patients, reports, notifications, preferences, profile, admin
from pathlib import Path
import os

app = FastAPI(title="Retina Max Backend", version="2.0.0")

# Create uploads directory (ensure it exist)
uploads_dir = Path("uploads")
uploads_dir.mkdir(parents=True, exist_ok=True)

print(f"Server starting - Environment: PORT={os.getenv('PORT')}")

# Mount uploads directory as static files
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


@app.get("/")
def root():
    return {"message": "Backend running 🚀"}

app.include_router(health.router)
app.include_router(auth.router)
app.include_router(patients.router)
app.include_router(reports.router)
app.include_router(notifications.router)
app.include_router(preferences.router)
app.include_router(profile.router)
app.include_router(admin.router)
