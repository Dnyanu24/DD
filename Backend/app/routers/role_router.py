from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.dependencies import get_current_user
from app.models import User
from app.services.insight_generator import generate_role_insights


router = APIRouter(prefix="/insights", tags=["Role Insights"])


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@router.get("/")
async def get_role_insights(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Return role-aware insight payload for the logged-in user.

    Roles:
    - admin -> admin insights (data quality + pipeline health)
    - data_analyst -> analyst insights (correlation/p-values + model metrics)
    - sales_manager/ceo/sector_head -> manager insights (ROI + predictions + actions)
    """
    return generate_role_insights(db, current_user)

