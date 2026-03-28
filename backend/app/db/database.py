import os
from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")

engine = create_engine(
    DATABASE_URL,
    # Avoid long hangs during cold starts / transient DB issues.
    connect_args={"connect_timeout": 10},
    pool_pre_ping=True,
    pool_recycle=300,
    pool_timeout=10,
)


SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)

Base = declarative_base()
