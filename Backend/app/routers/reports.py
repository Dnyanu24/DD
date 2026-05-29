from datetime import datetime
import json
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
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
    if current_user.role in ["ceo", "admin"]:
        return [
            row[0]
            for row in db.query(User.id).filter(
                User.company_id == current_user.company_id,
            ).all()
        ]
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
    total_sectors = db.query(Sector).filter(Sector.id.in_(sector_ids)).count()
    sector_rows = db.query(Sector).filter(Sector.id.in_(sector_ids)).all()
    sector_breakdown = []
    for sector in sector_rows:
        uploads = db.query(RawData).filter(
            RawData.sector_id == sector.id,
            RawData.uploaded_by.in_(uploader_ids),
        ).count()
        cleaned = db.query(CleanedData).join(
            RawData, CleanedData.raw_data_id == RawData.id
        ).filter(
            RawData.sector_id == sector.id,
            RawData.uploaded_by.in_(uploader_ids),
        ).all()
        avg_sector_quality = round(
            (sum((row.quality_score or 0) for row in cleaned) / len(cleaned) * 100), 2
        ) if cleaned else 0.0
        sector_breakdown.append({
            "sector_id": sector.id,
            "sector_name": sector.name,
            "uploads": uploads,
            "cleaned_datasets": len(cleaned),
            "average_quality_score": avg_sector_quality,
        })

    summary = {
        "generated_at": datetime.utcnow().isoformat(),
        "notes": payload.notes or "",
        "ceo_dashboard_overview": {
            "total_sectors": total_sectors,
            "total_uploads": total_uploads,
            "total_cleaned": total_cleaned,
            "average_quality_score": quality_score,
            "sector_breakdown": sector_breakdown,
        },
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


@router.get("/{report_id}/download")
def download_report(
    report_id: int,
    format: str = "json",
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

    report_payload = {
        "id": row.id,
        "title": row.title,
        "report_type": row.report_type,
        "created_by": row.created_by,
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "summary": row.payload,
    }
    safe_title = "".join(ch if ch.isalnum() or ch in ("-", "_") else "_" for ch in row.title).strip("_")
    filename = f"{safe_title or 'report'}_{row.id}"

    selected_format = (format or "json").lower()
    if selected_format == "txt":
        metrics = (row.payload or {}).get("metrics", {})
        overview = (row.payload or {}).get("ceo_dashboard_overview", {})
        sector_lines = [
            f"- {item.get('sector_name')}: uploads={item.get('uploads', 0)}, cleaned={item.get('cleaned_datasets', 0)}, quality={item.get('average_quality_score', 0)}%"
            for item in overview.get("sector_breakdown", [])
        ]
        content = "\n".join([
            row.title,
            f"Type: {row.report_type}",
            f"Created: {report_payload['created_at'] or '-'}",
            "",
            "CEO Dashboard Overview",
            f"Total sectors: {overview.get('total_sectors', 0)}",
            f"Total uploads: {overview.get('total_uploads', 0)}",
            f"Total cleaned: {overview.get('total_cleaned', 0)}",
            f"Average quality score: {overview.get('average_quality_score', 0)}",
            "",
            "Sector Breakdown",
            *(sector_lines or ["No sector data available."]),
            "",
            "Metrics",
            f"Total uploads: {metrics.get('total_uploads', 0)}",
            f"Total cleaned: {metrics.get('total_cleaned', 0)}",
            f"Total predictions: {metrics.get('total_predictions', 0)}",
            f"Average quality score: {metrics.get('average_quality_score', 0)}",
            "",
            f"Notes: {(row.payload or {}).get('notes', '')}",
        ])
        return Response(
            content=content,
            media_type="text/plain",
            headers={"Content-Disposition": f'attachment; filename="{filename}.txt"'},
        )

    return Response(
        content=json.dumps(report_payload, indent=2, default=str),
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="{filename}.json"'},
    )


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
