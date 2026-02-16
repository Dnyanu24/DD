from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional

from app.dependencies import get_db, get_current_user
from app.models import User, CompanyReport, RawData, CleanedData, Sector, AIPrediction

router = APIRouter()


class ReportCreateRequest(BaseModel):
    title: str
    report_type: str = "summary"
    notes: Optional[str] = None


def _allowed_sector_ids(db: Session, current_user: User):
    query = db.query(Sector.id).filter(Sector.company_id == current_user.company_id)
    if current_user.role == "sector_head":
        query = query.filter(Sector.id == current_user.sector_id)
    return [row[0] for row in query.all()]


def _allowed_uploader_ids(db: Session, current_user: User):
    return [
        row[0]
        for row in db.query(User.id).filter(
            User.company_id == current_user.company_id,
            User.role == current_user.role,
        ).all()
    ]


@router.get("/")
def list_reports(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    rows = db.query(CompanyReport).join(
        User, User.id == CompanyReport.created_by
    ).filter(
        CompanyReport.company_id == current_user.company_id,
        User.role == current_user.role,
    ).order_by(CompanyReport.created_at.desc()).all()
    return [
        {
            "id": row.id,
            "title": row.title,
            "report_type": row.report_type,
            "created_by": row.created_by,
            "created_at": row.created_at.isoformat() if row.created_at else None,
            "summary": row.payload,
        }
        for row in rows
    ]


@router.post("/generate")
def generate_report(
    payload: ReportCreateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    sector_ids = _allowed_sector_ids(db, current_user) or [-1]
    uploader_ids = _allowed_uploader_ids(db, current_user) or [-1]

    total_uploads = db.query(RawData).filter(
        RawData.sector_id.in_(sector_ids),
        RawData.uploaded_by.in_(uploader_ids),
    ).count()
    total_cleaned = db.query(CleanedData).join(
        RawData, CleanedData.raw_data_id == RawData.id
    ).filter(
        RawData.sector_id.in_(sector_ids),
        RawData.uploaded_by.in_(uploader_ids),
    ).count()
    total_predictions = db.query(AIPrediction).join(
        RawData, RawData.sector_id == AIPrediction.sector_id
    ).filter(
        RawData.sector_id.in_(sector_ids),
        RawData.uploaded_by.in_(uploader_ids),
        AIPrediction.sector_id.in_(sector_ids)
    ).distinct().count()
    avg_quality = db.query(CleanedData).join(
        RawData, CleanedData.raw_data_id == RawData.id
    ).filter(
        RawData.sector_id.in_(sector_ids),
        RawData.uploaded_by.in_(uploader_ids),
    ).all()
    quality_score = round(
        (sum((row.quality_score or 0) for row in avg_quality) / len(avg_quality) * 100), 2
    ) if avg_quality else 0.0

    summary = {
        "generated_at": datetime.utcnow().isoformat(),
        "notes": payload.notes or "",
        "metrics": {
            "total_uploads": total_uploads,
            "total_cleaned": total_cleaned,
            "total_predictions": total_predictions,
            "average_quality_score": quality_score,
        },
    }

    report = CompanyReport(
        company_id=current_user.company_id,
        title=payload.title,
        report_type=payload.report_type,
        payload=summary,
        created_by=current_user.id,
    )
    db.add(report)
    db.commit()
    db.refresh(report)

    return {
        "id": report.id,
        "title": report.title,
        "report_type": report.report_type,
        "created_at": report.created_at.isoformat() if report.created_at else None,
        "summary": report.payload,
    }


@router.get("/{report_id}")
def get_report(
    report_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    row = db.query(CompanyReport).join(
        User, User.id == CompanyReport.created_by
    ).filter(
        CompanyReport.id == report_id,
        CompanyReport.company_id == current_user.company_id,
        User.role == current_user.role,
    ).first()
    if not row:
        raise HTTPException(status_code=404, detail="Report not found")
    return {
        "id": row.id,
        "title": row.title,
        "report_type": row.report_type,
        "created_by": row.created_by,
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "summary": row.payload,
    }


@router.delete("/{report_id}")
def delete_report(
    report_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    row = db.query(CompanyReport).join(
        User, User.id == CompanyReport.created_by
    ).filter(
        CompanyReport.id == report_id,
        CompanyReport.company_id == current_user.company_id,
        User.role == current_user.role,
    ).first()
    if not row:
        raise HTTPException(status_code=404, detail="Report not found")
    db.delete(row)
    db.commit()
    return {"message": "Report deleted", "report_id": report_id}
