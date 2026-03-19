from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.db.database import SessionLocal
from app.api.auth import get_current_user
from app.core.security import verify_password, hash_password
from app.models.users import User
from app.models.user_profile import UserProfile
from app.models.patient import Patient
from app.models.report import Report
from app.schemas.profile import ProfileResponse, ProfileUpdate, PasswordChange
import shutil
from pathlib import Path

UPLOAD_DIR = Path("uploads")
UPLOAD_DIR.mkdir(exist_ok=True)


router = APIRouter(prefix="/api/profile", tags=["profile"])


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_or_create_profile(db: Session, user_id: int) -> UserProfile:
    profile = db.query(UserProfile).filter(UserProfile.user_id == user_id).first()
    if profile:
        return profile
    profile = UserProfile(user_id=user_id)
    db.add(profile)
    db.commit()
    db.refresh(profile)
    return profile


def compute_stats(db: Session, user_id: int) -> dict:
    patient_count = db.query(Patient).filter(Patient.doctor_id == user_id).count()
    report_q = db.query(Report).join(Patient).filter(Patient.doctor_id == user_id)
    report_count = report_q.count()
    avg_conf = (
        db.query(func.avg(Report.confidence))
        .join(Patient)
        .filter(Patient.doctor_id == user_id)
        .scalar()
        or 0.0
    )
    critical = report_q.filter(Report.prediction.in_(["Severe", "Proliferative DR"])).count()
    return {
        "patients": patient_count,
        "reports": report_count,
        "critical_cases": critical,
        "avg_confidence": float(avg_conf),
    }


@router.get("", response_model=ProfileResponse)
def get_profile(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    profile = get_or_create_profile(db, current_user.id)
    stats = compute_stats(db, current_user.id)
    return {
        "id": current_user.id,
        "name": current_user.name,
        "email": current_user.email,
        "title": profile.title,
        "hospital_name": profile.hospital_name,
        "phone": profile.phone,
        "board_certified": profile.board_certified,
        "avatar_url": profile.avatar_url,
        "stats": stats,
    }


@router.put("", response_model=ProfileResponse)
def update_profile(
    request: ProfileUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    profile = get_or_create_profile(db, current_user.id)

    if request.name is not None:
        current_user.name = request.name
    if request.title is not None:
        profile.title = request.title
    if request.hospital_name is not None:
        profile.hospital_name = request.hospital_name
    if request.phone is not None:
        profile.phone = request.phone
    if request.board_certified is not None:
        profile.board_certified = request.board_certified
    if request.avatar_url is not None:
        profile.avatar_url = request.avatar_url

    db.commit()
    stats = compute_stats(db, current_user.id)
    return {
        "id": current_user.id,
        "name": current_user.name,
        "email": current_user.email,
        "title": profile.title,
        "hospital_name": profile.hospital_name,
        "phone": profile.phone,
        "board_certified": profile.board_certified,
        "avatar_url": profile.avatar_url,
        "stats": stats,
    }


@router.post("/avatar")
def upload_avatar(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    profile = get_or_create_profile(db, current_user.id)
    safe_name = file.filename.replace("\\", "/").split("/")[-1]
    target = UPLOAD_DIR / f"avatar_user_{current_user.id}_{safe_name}"
    with open(target, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    profile.avatar_url = str(target)
    db.commit()
    db.refresh(profile)
    return {"avatar_url": profile.avatar_url}


@router.put("/password", status_code=status.HTTP_204_NO_CONTENT)
def change_password(
    request: PasswordChange,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    user = db.query(User).filter(User.id == current_user.id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    if not verify_password(request.current_password, user.password):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Current password is incorrect")

    user.password = hash_password(request.new_password)
    db.commit()
    return None
