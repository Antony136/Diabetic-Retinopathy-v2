import os
from dotenv import load_dotenv

load_dotenv()

class Settings:
    PROJECT_NAME: str = "Diabetic Retinopathy API"
    PROJECT_VERSION: str = "1.0.0"
    
    # JWT Configuration
    SECRET_KEY: str = os.getenv("SECRET_KEY", "your-secret-key-change-in-production")
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    
    # Database
    DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite:///./test.db")

    # Admin bootstrap (optional)
    # Set `ADMIN_BOOTSTRAP_SECRET` in env to enable the bootstrap endpoint.
    ADMIN_BOOTSTRAP_SECRET: str = os.getenv("ADMIN_BOOTSTRAP_SECRET", "")

settings = Settings()
