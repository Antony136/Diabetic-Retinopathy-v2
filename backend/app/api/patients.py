from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from sqlalchemy import or_, desc, cast, String
from typing import Optional
from app.db.database import SessionLocal
from app.models.patient import Patient
from app.models.users import User
from app.models.notification import Notification
from app.models.report import Report
from app.schemas.patient import PatientCreate, PatientUpdate, PatientResponse
from app.api.auth import get_current_user

router = APIRouter(prefix="/api/patients", tags=["patients"])

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@router.post("", response_model=PatientResponse)
def create_patient(
    request: PatientCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Create a new patient for the authenticated doctor"""
    # Sync-friendly idempotency key (preferred over heuristic de-dup).
    client_uuid = (request.client_uuid or "").strip() or None
    if client_uuid:
        existing_by_uuid = db.query(Patient).filter(Patient.doctor_id == current_user.id, Patient.client_uuid == client_uuid).first()
        if existing_by_uuid:
            return existing_by_uuid

    # De-duplicate: if the same patient is re-entered, reuse existing row.
    phone = (request.phone or "").strip()
    if phone:
        existing = db.query(Patient).filter(Patient.doctor_id == current_user.id, Patient.phone == phone).first()
        if existing:
            return existing
    else:
        existing = db.query(Patient).filter(
            Patient.doctor_id == current_user.id,
            Patient.name == request.name,
            Patient.age == request.age,
            Patient.gender == request.gender,
            Patient.address == request.address,
        ).first()
        if existing:
            return existing

    new_patient = Patient(
        client_uuid=client_uuid,
        name=request.name,
        age=request.age,
        gender=request.gender,
        phone=request.phone,
        address=request.address,
        doctor_id=current_user.id
    )
    
    db.add(new_patient)
    db.commit()
    db.refresh(new_patient)

    # Notify the assigned doctor/user
    db.add(
        Notification(
            user_id=current_user.id,
            patient_id=new_patient.id,
            report_id=None,
            type="NEW_PATIENT_ASSIGNED",
            title="👨‍⚕️ New patient assigned",
            message=f"{new_patient.name} has been added to your patient list.",
        )
    )
    db.commit()
    
    return new_patient

@router.get("", response_model=list[PatientResponse])
def get_all_patients(
    search: Optional[str] = Query(None),
    severity: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get all patients for the authenticated doctor"""
    if getattr(current_user, "role", "doctor") == "admin":
        query = db.query(Patient)
    else:
        query = db.query(Patient).filter(Patient.doctor_id == current_user.id)
    
    if search:
        search_term = f"%{search}%"
        query = query.filter(
            or_(
                Patient.name.ilike(search_term),
                cast(Patient.id, String).ilike(search_term)
            )
        )
        
    patients = query.all()
    
    result = []
    for patient in patients:
        latest_report = db.query(Report).filter(Report.patient_id == patient.id).order_by(desc(Report.created_at)).first()
        
        p_dict = {
            "id": patient.id,
            "name": patient.name,
            "age": patient.age,
            "gender": patient.gender,
            "phone": patient.phone,
            "address": patient.address,
            "created_at": patient.created_at,
            "doctor_id": patient.doctor_id,
            "latest_prediction": None,
            "latest_confidence": None
        }
        
        if latest_report:
            p_dict["latest_prediction"] = latest_report.prediction
            p_dict["latest_confidence"] = latest_report.confidence
            
            if severity and severity != "All Severities":
                pred = latest_report.prediction
                if severity == "Critical" and pred not in ["Severe", "Proliferative DR"]:
                    continue
                if severity == "Moderate" and pred not in ["Moderate", "Mild"]:
                    continue
                if severity == "Stable" and pred != "No DR":
                    continue
        else:
            if severity and severity != "All Severities":
                continue
                
        result.append(p_dict)
        
    return result

@router.get("/{patient_id}", response_model=PatientResponse)
def get_patient(
    patient_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get a specific patient by ID (only own patients)"""
    patient = db.query(Patient).filter(
        Patient.id == patient_id,
        Patient.doctor_id == current_user.id
    ).first()
    
    if not patient:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Patient not found"
        )
    
    return patient

@router.put("/{patient_id}", response_model=PatientResponse)
def update_patient(
    patient_id: int,
    request: PatientUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update a patient's information (only own patients)"""
    patient = db.query(Patient).filter(
        Patient.id == patient_id,
        Patient.doctor_id == current_user.id
    ).first()
    
    if not patient:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Patient not found"
        )
    
    patient.name = request.name
    patient.age = request.age
    patient.gender = request.gender
    patient.phone = request.phone
    patient.address = request.address
    # Ensure updated_at changes even on SQLite where onupdate isn't always triggered.
    try:
        from datetime import datetime

        patient.updated_at = datetime.utcnow()
    except Exception:
        pass
    
    db.commit()
    db.refresh(patient)
    
    return patient

@router.delete("/{patient_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_patient(
    patient_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete a patient (only own patients)"""
    patient = db.query(Patient).filter(
        Patient.id == patient_id,
        Patient.doctor_id == current_user.id
    ).first()
    
    if not patient:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Patient not found"
        )
    
    db.delete(patient)
    db.commit()
    
    return None
