from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Query
from sqlalchemy.orm import Session
from app.db.database import SessionLocal
from app.models.report import Report
from app.models.patient import Patient
from app.models.users import User
from app.models.notification import Notification
from app.models.user_preference import UserPreference
from app.schemas.report import ReportCreate, ReportResponse
from app.api.auth import get_current_user
import os
import shutil
from pathlib import Path
from app.services.storage_service import storage_service

router = APIRouter(prefix="/api/reports", tags=["reports"])

# Create uploads directory
UPLOAD_DIR = Path("uploads")
UPLOAD_DIR.mkdir(exist_ok=True)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def save_upload_file(upload_file: UploadFile) -> str:
    """Save uploaded file and return the path"""
    try:
        file_path = UPLOAD_DIR / upload_file.filename
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(upload_file.file, buffer)
        return str(file_path)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to save file: {str(e)}"
        )

def get_or_create_preferences(db: Session, user_id: int) -> UserPreference:
    pref = db.query(UserPreference).filter(UserPreference.user_id == user_id).first()
    if pref:
        return pref
    pref = UserPreference(user_id=user_id)
    db.add(pref)
    db.commit()
    db.refresh(pref)
    return pref

@router.post("/manual", response_model=ReportResponse)
async def create_manual_report(
    report_in: ReportCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Create a new manual report without AI prediction.
    """
    # Verify patient belongs to current doctor
    patient = db.query(Patient).filter(
        Patient.id == report_in.patient_id,
        Patient.doctor_id == current_user.id
    ).first()
    
    if not patient:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Patient not found or access denied"
        )
    
    # Create manual report record
    new_report = Report(
        patient_id=report_in.patient_id,
        image_url=report_in.image_url,
        heatmap_url=report_in.heatmap_url,
        prediction=report_in.prediction,
        confidence=report_in.confidence,
        description=report_in.description
    )
    
    db.add(new_report)
    db.commit()
    db.refresh(new_report)

    # Create contextual notifications
    pref = get_or_create_preferences(db, current_user.id)

    db.add(
        Notification(
            user_id=current_user.id,
            patient_id=patient.id,
            report_id=new_report.id,
            type="REPORT_READY",
            title="🟢 Manual report created",
            message=f"A manual triage report for {patient.name} was added.",
        )
    )

    if pref.notifications_high_risk:
        if report_in.prediction in ["Severe", "Proliferative DR"]:
            db.add(
                Notification(
                    user_id=current_user.id,
                    patient_id=patient.id,
                    report_id=new_report.id,
                    type="HIGH_RISK",
                    title="🔴 Severe DR noted → review",
                    message=f"{patient.name} manually marked as {report_in.prediction}.",
                )
            )
        elif report_in.prediction == "Moderate":
            db.add(
                Notification(
                    user_id=current_user.id,
                    patient_id=patient.id,
                    report_id=new_report.id,
                    type="FOLLOW_UP",
                    title="🟡 Moderate DR noted → follow-up",
                    message=f"{patient.name} marked as Moderate DR.",
                )
            )

    db.commit()
    return new_report

@router.post("/", response_model=ReportResponse)
async def create_report(
    patient_id: int = Query(...),
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Create a new report with image upload and AI prediction
    
    - Verify patient belongs to doctor
    - Save uploaded image
    - Run AI prediction
    - Store report in database
    """
    # Verify patient belongs to current doctor (admin can access any patient)
    patient_query = db.query(Patient).filter(Patient.id == patient_id)
    if getattr(current_user, "role", "doctor") != "admin":
        patient_query = patient_query.filter(Patient.doctor_id == current_user.id)
    patient = patient_query.first()
    
    if not patient:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Patient not found or access denied"
        )
    
    # Save uploaded image locally (temporary for AI)
    await file.seek(0)
    local_image_path = save_upload_file(file)
    
    # Upload original image to Supabase
    remote_filename = os.path.basename(local_image_path)
    supabase_image_url = storage_service.upload_file(local_image_path, remote_filename)
    
    # Run AI prediction (using local path)
    try:
        from app.services.ai_service import predict_dr_stage
        import time
        time.sleep(1) # Stabilization delay
        prediction, confidence, heatmap_url = predict_dr_stage(local_image_path)
    except Exception as e:
        # Clean up local image if prediction fails
        if os.path.exists(local_image_path):
            os.remove(local_image_path)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"AI prediction failed: {str(e)}"
        )
    
    # Clean up local folder only if cloud upload was successful
    if os.path.exists(local_image_path) and supabase_image_url.startswith('http'):
        os.remove(local_image_path)
        
    # Create report record
    new_report = Report(
        patient_id=patient_id,
        image_url=supabase_image_url,
        heatmap_url=heatmap_url,
        prediction=prediction,
        confidence=confidence
    )
    
    db.add(new_report)
    db.commit()
    db.refresh(new_report)

    # Create contextual notifications (respect user preferences)
    pref = get_or_create_preferences(db, current_user.id)

    # Report ready
    db.add(
        Notification(
            user_id=current_user.id,
            patient_id=patient.id,
            report_id=new_report.id,
            type="REPORT_READY",
            title="🟢 Report ready",
            message=f"Report #{new_report.id} for {patient.name} is ready.",
        )
    )

    if pref.notifications_high_risk:
        if prediction in ["Severe", "Proliferative DR"]:
            db.add(
                Notification(
                    user_id=current_user.id,
                    patient_id=patient.id,
                    report_id=new_report.id,
                    type="HIGH_RISK",
                    title="🔴 Severe DR detected → urgent review",
                    message=f"{patient.name} has {prediction}. Review within {pref.urgent_review_hours}h.",
                )
            )
        elif prediction == "Moderate":
            db.add(
                Notification(
                    user_id=current_user.id,
                    patient_id=patient.id,
                    report_id=new_report.id,
                    type="FOLLOW_UP",
                    title="🟡 Moderate DR → schedule follow-up",
                    message=f"{patient.name} has Moderate DR. Follow-up in {pref.follow_up_days_moderate} days.",
                )
            )

    # Low-confidence case -> manual review reminder
    if confidence < pref.min_confidence_threshold:
        db.add(
            Notification(
                user_id=current_user.id,
                patient_id=patient.id,
                report_id=new_report.id,
                type="MANUAL_REVIEW",
                title="🟠 Low confidence → manual review",
                message=f"Report #{new_report.id} confidence is {round(confidence * 100, 1)}%. Please review before action.",
            )
        )

    db.commit()
    
    return new_report

@router.post("/manual", response_model=ReportResponse)
async def create_manual_report(
    report_in: ReportCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Create a new manual report without AI prediction.
    """
    # Verify patient belongs to current doctor
    patient = db.query(Patient).filter(
        Patient.id == report_in.patient_id,
        Patient.doctor_id == current_user.id
    ).first()
    
    if not patient:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Patient not found or access denied"
        )
    
    # Create manual report record
    new_report = Report(
        patient_id=report_in.patient_id,
        image_url=report_in.image_url,
        heatmap_url=report_in.heatmap_url,
        prediction=report_in.prediction,
        confidence=report_in.confidence,
        description=report_in.description
    )
    
    db.add(new_report)
    db.commit()
    db.refresh(new_report)

    # Create contextual notifications
    pref = get_or_create_preferences(db, current_user.id)

    # Report ready
    db.add(
        Notification(
            user_id=current_user.id,
            patient_id=patient.id,
            report_id=new_report.id,
            type="REPORT_READY",
            title="🟢 Manual report created",
            message=f"A manual triage report for {patient.name} was added.",
        )
    )

    if pref.notifications_high_risk:
        if report_in.prediction in ["Severe", "Proliferative DR"]:
            db.add(
                Notification(
                    user_id=current_user.id,
                    patient_id=patient.id,
                    report_id=new_report.id,
                    type="HIGH_RISK",
                    title="🔴 Severe DR noted → review",
                    message=f"{patient.name} manually marked as {report_in.prediction}.",
                )
            )
        elif report_in.prediction == "Moderate":
            db.add(
                Notification(
                    user_id=current_user.id,
                    patient_id=patient.id,
                    report_id=new_report.id,
                    type="FOLLOW_UP",
                    title="🟡 Moderate DR noted → follow-up",
                    message=f"{patient.name} marked as Moderate DR.",
                )
            )

    db.commit()
    
    return new_report

@router.get("/", response_model=list[ReportResponse])
def get_all_reports(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get all reports for the authenticated doctor's patients"""
    query = db.query(Report, Patient.name).join(Patient)
    if getattr(current_user, "role", "doctor") != "admin":
        query = query.filter(Patient.doctor_id == current_user.id)
    reports_with_patient = query.all()
    
    result = []
    for report, patient_name in reports_with_patient:
        r_dict = {
            "id": report.id,
            "patient_id": report.patient_id,
            "image_url": report.image_url,
            "heatmap_url": report.heatmap_url,
            "prediction": report.prediction,
            "confidence": report.confidence,
            "description": getattr(report, "description", None),
            "created_at": report.created_at,
            "patient_name": patient_name
        }
        result.append(r_dict)
    return result

@router.get("/{report_id}", response_model=ReportResponse)
def get_report(
    report_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get a specific report (only if it belongs to current doctor's patient)"""
    report = db.query(Report).join(Patient).filter(
        Report.id == report_id,
        Patient.doctor_id == current_user.id
    ).first()
    
    if not report:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Report not found"
        )
    
    return report

@router.get("/patient/{patient_id}", response_model=list[ReportResponse])
def get_patient_reports(
    patient_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get all reports for a specific patient (only if it belongs to current doctor)"""
    # Verify patient belongs to current doctor
    patient = db.query(Patient).filter(
        Patient.id == patient_id,
        Patient.doctor_id == current_user.id
    ).first()
    
    if not patient:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Patient not found or access denied"
        )
    
    reports = db.query(Report).filter(Report.patient_id == patient_id).all()
    
    result = []
    for report in reports:
        r_dict = {
            "id": report.id,
            "patient_id": report.patient_id,
            "image_url": report.image_url,
            "heatmap_url": report.heatmap_url,
            "prediction": report.prediction,
            "confidence": report.confidence,
            "description": getattr(report, "description", None),
            "created_at": report.created_at,
            "patient_name": patient.name
        }
        result.append(r_dict)
    return result

@router.delete("/{report_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_report(
    report_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete a report (only if it belongs to current doctor's patient)"""
    report = db.query(Report).join(Patient).filter(
        Report.id == report_id,
        Patient.doctor_id == current_user.id
    ).first()
    
    if not report:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Report not found"
        )
    
    # Delete associated files
    if os.path.exists(report.image_url):
        os.remove(report.image_url)
    if os.path.exists(report.heatmap_url):
        os.remove(report.heatmap_url)
    
    db.delete(report)
    db.commit()
    
    return None
