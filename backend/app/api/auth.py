import logging

from fastapi import APIRouter, Depends, HTTPException, status, Header
from sqlalchemy.orm import Session
from sqlalchemy.exc import OperationalError
from app.db.database import SessionLocal
from app.models.users import User
from app.models.user_preference import UserPreference
from app.models.patient import Patient
from app.models.report import Report
from app.models.notification import Notification
from app.schemas.auth import RegisterRequest, LoginRequest, TokenResponse, UserResponse
from app.core.security import hash_password, verify_password, create_access_token, decode_token

router = APIRouter(prefix="/api/auth", tags=["auth"])
logger = logging.getLogger(__name__)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def extract_token_from_header(authorization: str = Header(None)) -> str:
    """Extract bearer token from Authorization header"""
    if not authorization:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing authorization header"
        )
    
    parts = authorization.split()
    if len(parts) != 2 or parts[0].lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authorization header format"
        )
    
    return parts[1]

@router.post("/register", response_model=UserResponse)
def register(request: RegisterRequest, db: Session = Depends(get_db)):
    """Register a new user"""
    # Check if user already exists
    existing_user = db.query(User).filter(User.email == request.email).first()
    if existing_user:
        return existing_user
    
    # Create new user with hashed password
    hashed_password = hash_password(request.password)
    role = request.role if request.role in ("admin", "doctor") else "doctor"
    new_user = User(
        name=request.name,
        email=request.email,
        password=hashed_password,
        role=role,
    )
    
    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    # Create default preferences row for this user
    db.add(UserPreference(user_id=new_user.id))
    db.commit()
    
    return new_user

@router.post("/login", response_model=TokenResponse)
def login(request: LoginRequest, db: Session = Depends(get_db)):
    """Login user and get JWT token"""
    try:
        # Find user by email
        user = db.query(User).filter(User.email == request.email).first()
        if not user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid email or password"
            )

        # Verify password
        if not verify_password(request.password, user.password):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid email or password"
            )
    except OperationalError as e:
        logger.warning("Login failed due to DB connectivity issue for email=%s: %s", request.email, e)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database unavailable. Please try again in a few seconds.",
        )

    # Active check
    if getattr(user, "is_active", True) is False:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is disabled. Contact admin.",
        )
    
    # Create and return JWT token
    access_token = create_access_token(data={"sub": str(user.id), "email": user.email, "role": user.role})
    return {"access_token": access_token, "token_type": "bearer"}

@router.get("/me", response_model=UserResponse)
def get_current_user_endpoint(
    token: str = Depends(extract_token_from_header),
    db: Session = Depends(get_db)
):
    """Get current authenticated user"""
    payload = decode_token(token)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token"
        )
    
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token"
        )
    
    user = db.query(User).filter(User.id == int(user_id)).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    return user

# Dependency for protected routes
def get_current_user(
    token: str = Depends(extract_token_from_header),
    db: Session = Depends(get_db)
) -> User:
    """Dependency to get current user from JWT token"""
    payload = decode_token(token)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token"
        )
    
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token"
        )
    
    user = db.query(User).filter(User.id == int(user_id)).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    return user


@router.post("/clear-local-data")
def clear_local_data(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Clear local patient/report/notification data for cross-user isolation."""
    if getattr(current_user, "role", "doctor") != "admin":
        # Remove stale data from other doctors before sign-in or sign-out transitions.
        db.query(Report).join(Patient, Patient.id == Report.patient_id).filter(Patient.doctor_id != current_user.id).delete(synchronize_session=False)
        db.query(Notification).filter(Notification.user_id != current_user.id).delete(synchronize_session=False)
        db.query(Patient).filter(Patient.doctor_id != current_user.id).delete(synchronize_session=False)
        db.query(UserPreference).filter(UserPreference.user_id != current_user.id).delete(synchronize_session=False)
    else:
        db.query(Notification).filter(Notification.user_id != current_user.id).delete(synchronize_session=False)

    db.commit()
    return {"status": "ok"}


def require_admin(current_user: User = Depends(get_current_user)) -> User:
    if getattr(current_user, "role", "doctor") != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    return current_user
