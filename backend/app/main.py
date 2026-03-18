from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api import health, auth
from app.db.database import engine, Base

app = FastAPI()

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def root():
    return {"message": "Backend running 🚀"}

app.include_router(health.router)
app.include_router(auth.router)

Base.metadata.create_all(bind=engine)
