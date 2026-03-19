from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.db.database import SessionLocal
from app.models.user_preference import UserPreference
from app.models.users import User
from app.api.auth import get_current_user
from app.schemas.preference import PreferenceResponse, PreferenceUpdate


router = APIRouter(prefix="/api/preferences", tags=["preferences"])


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _get_or_create(db: Session, user_id: int) -> UserPreference:
    pref = db.query(UserPreference).filter(UserPreference.user_id == user_id).first()
    if pref:
        return pref
    pref = UserPreference(user_id=user_id)
    db.add(pref)
    db.commit()
    db.refresh(pref)
    return pref


@router.get("", response_model=PreferenceResponse)
def get_preferences(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    pref = _get_or_create(db, current_user.id)
    return PreferenceResponse(
        notifications_high_risk=pref.notifications_high_risk,
        notifications_daily_summary=pref.notifications_daily_summary,
    )


@router.put("", response_model=PreferenceResponse)
def update_preferences(
    request: PreferenceUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    pref = _get_or_create(db, current_user.id)
    if request.notifications_high_risk is not None:
        pref.notifications_high_risk = request.notifications_high_risk
    if request.notifications_daily_summary is not None:
        pref.notifications_daily_summary = request.notifications_daily_summary
    db.commit()
    db.refresh(pref)
    return PreferenceResponse(
        notifications_high_risk=pref.notifications_high_risk,
        notifications_daily_summary=pref.notifications_daily_summary,
    )

