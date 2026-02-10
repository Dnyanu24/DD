from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from datetime import date
from app.database import Report
from app.dependencies import get_db

router = APIRouter()

# 🔹 Daily report
@router.get("/daily")
def daily_report(db: Session = Depends(get_db)):
    today = date.today()
    data = db.query(Report).filter(Report.date == today).all()
    return data

# 🔹 Monthly report
@router.get("/monthly/{month}")
def monthly_report(month: int, db: Session = Depends(get_db)):
    data = db.query(Report).filter(
        Report.date.month == month
    ).all()
    return data
