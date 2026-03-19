from fastapi import APIRouter, Depends, HTTPException, status, Header, Query
from sqlalchemy.orm import Session
from app.db.database import SessionLocal
from app.api.auth import require_admin
from app.core.config import settings
from app.core.security import hash_password
from app.models.users import User
from app.models.patient import Patient
from app.models.report import Report
from app.models.user_preference import UserPreference
from app.schemas.admin import (
    AdminUserResponse,
    AdminUserCreate,
    AdminRoleUpdate,
    AdminPatientResponse,
    AdminReportResponse,
)


router = APIRouter(prefix="/api/admin", tags=["admin"])


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@router.post("/bootstrap", response_model=AdminUserResponse)
def bootstrap_admin(
    email: str = Query(...),
    x_bootstrap_secret: str = Header("", alias="X-Bootstrap-Secret"),
    db: Session = Depends(get_db),
):
    """
    Promote an existing user to admin.
    Enabled only when `ADMIN_BOOTSTRAP_SECRET` is set.
    """
    if not settings.ADMIN_BOOTSTRAP_SECRET:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Bootstrap is disabled")
    if x_bootstrap_secret != settings.ADMIN_BOOTSTRAP_SECRET:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid bootstrap secret")

    user = db.query(User).filter(User.email == email).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    user.role = "admin"
    db.commit()
    db.refresh(user)
    return user


@router.get("/users", response_model=list[AdminUserResponse])
def list_users(
    _admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    return db.query(User).order_by(User.id.asc()).all()


@router.get("/doctors", response_model=list[AdminUserResponse])
def list_doctors(
    _admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    return db.query(User).filter(User.role == "doctor").order_by(User.id.asc()).all()


@router.post("/doctors", response_model=AdminUserResponse, status_code=status.HTTP_201_CREATED)
def create_doctor(
    request: AdminUserCreate,
    _admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    existing = db.query(User).filter(User.email == request.email).first()
    if existing:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already registered")

    new_user = User(
        name=request.name,
        email=request.email,
        password=hash_password(request.password),
        role="doctor",
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    db.add(UserPreference(user_id=new_user.id))
    db.commit()
    return new_user


@router.put("/users/{user_id}/role", response_model=AdminUserResponse)
def update_role(
    user_id: int,
    request: AdminRoleUpdate,
    _admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    if request.role not in ["doctor", "admin"]:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid role")
    user.role = request.role
    db.commit()
    db.refresh(user)
    return user


@router.get("/patients", response_model=list[AdminPatientResponse])
def list_patients(
    _admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    return db.query(Patient).order_by(Patient.created_at.desc(), Patient.id.desc()).all()


@router.put("/patients/{patient_id}/assign", response_model=AdminPatientResponse)
def assign_patient(
    patient_id: int,
    doctor_id: int = Query(...),
    _admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    patient = db.query(Patient).filter(Patient.id == patient_id).first()
    if not patient:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Patient not found")
    doctor = db.query(User).filter(User.id == doctor_id, User.role == "doctor").first()
    if not doctor:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Doctor not found")
    patient.doctor_id = doctor_id
    db.commit()
    db.refresh(patient)
    return patient


@router.get("/reports", response_model=list[AdminReportResponse])
def list_reports(
    _admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    return db.query(Report).order_by(Report.created_at.desc(), Report.id.desc()).all()

