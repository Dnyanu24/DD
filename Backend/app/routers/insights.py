from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.dependencies import get_current_user
from app.models import User
from app.services.insight_generator import generate_role_insights

router = APIRouter()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@router.get("/")
async def get_role_insights(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return generate_role_insights(db, current_user)
