import os
from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL") or "sqlite:///./app.db"

connect_args = {}
engine_kwargs = {
    "pool_pre_ping": True,
    "pool_recycle": 300,
    "pool_timeout": 10,
}

if DATABASE_URL.startswith("sqlite"):
    # SQLite needs this for multithreaded FastAPI usage (common in desktop apps).
    connect_args = {"check_same_thread": False}
    # SQLite doesn't support many pool options; use defaults.
    engine_kwargs = {}
else:
    # Avoid long hangs during cold starts / transient DB issues (Postgres).
    connect_args = {"connect_timeout": 10}

engine = create_engine(
    DATABASE_URL,
    connect_args=connect_args,
    **engine_kwargs,
)


SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)

Base = declarative_base()
