from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Dict, Any
from sqlalchemy import func

from app.database import SessionLocal
from app.models import (
    User, Sector, Product, RawData, CleanedData, DataQualityScore,
    AIPrediction, AIRecommendation, FeedbackLog, CompanyAnnouncement, UserSetting
)
from app.dependencies import get_current_user, require_sector_head, require_ceo, require_admin
from app.services.feedback_learning import FeedbackLearningEngine
from pydantic import BaseModel
from datetime import datetime

router = APIRouter()


class AnnouncementCreateRequest(BaseModel):
    title: str
    message: str


class SettingsUpdateRequest(BaseModel):
    settings: dict

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _allowed_sector_ids(db: Session, current_user: User) -> List[int]:
    query = db.query(Sector.id).filter(Sector.company_id == current_user.company_id)
    if current_user.role == "sector_head":
        query = query.filter(Sector.id == current_user.sector_id)
    return [row[0] for row in query.all()]


def _allowed_uploader_ids(db: Session, current_user: User) -> List[int]:
    return [
        row[0]
        for row in db.query(User.id).filter(
            User.company_id == current_user.company_id,
            User.role == current_user.role,
        ).all()
    ]

@router.get("/")
async def get_dashboard(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Get role-based dashboard data"""

    if current_user.role == 'sector_head':
        return await get_sector_head_dashboard(current_user, db)
    elif current_user.role == 'ceo':
        return await get_ceo_dashboard(current_user, db)
    elif current_user.role == 'admin':
        return await get_admin_dashboard(current_user, db)
    else:
        raise HTTPException(status_code=403, detail="Invalid user role")

async def get_sector_head_dashboard(user: User, db: Session) -> Dict[str, Any]:
    """Sector Head Dashboard: Sector-specific data and insights"""

    # Get sector data
    sector = db.query(Sector).filter(Sector.id == user.sector_id).first()
    if not sector:
        raise HTTPException(status_code=404, detail="Sector not found")

    uploader_ids = _allowed_uploader_ids(db, user)
    if not uploader_ids:
        uploader_ids = [-1]

    # Recent uploads
    recent_uploads = db.query(RawData).filter(
        RawData.sector_id == user.sector_id,
        RawData.uploaded_by.in_(uploader_ids),
    )\
        .order_by(RawData.uploaded_at.desc()).limit(5).all()

    # Cleaned data summary
    cleaned_count = db.query(func.count(CleanedData.id))\
        .join(RawData, CleanedData.raw_data_id == RawData.id)\
        .filter(
            RawData.sector_id == user.sector_id,
            RawData.uploaded_by.in_(uploader_ids),
        ).scalar()

    # AI predictions for sector
    predictions = db.query(AIPrediction)\
        .join(RawData, RawData.sector_id == AIPrediction.sector_id)\
        .filter(
            AIPrediction.sector_id == user.sector_id,
            RawData.uploaded_by.in_(uploader_ids),
        )\
        .distinct()\
        .order_by(AIPrediction.predicted_at.desc()).limit(3).all()

    # Data quality scores
    avg_quality = db.query(func.avg(DataQualityScore.score))\
        .join(CleanedData, DataQualityScore.cleaned_data_id == CleanedData.id)\
        .join(RawData, CleanedData.raw_data_id == RawData.id)\
        .filter(
            RawData.sector_id == user.sector_id,
            RawData.uploaded_by.in_(uploader_ids),
        ).scalar() or 0

    return {
        "role": "sector_head",
        "sector": {
            "id": sector.id,
            "name": sector.name
        },
        "summary": {
            "total_uploads": len(recent_uploads),
            "cleaned_datasets": cleaned_count,
            "avg_data_quality": round(avg_quality, 2),
            "active_predictions": len(predictions)
        },
        "recent_uploads": [
            {
                "id": upload.id,
                "uploaded_at": upload.uploaded_at.isoformat(),
                "data_points": len(upload.data) if upload.data else 0
            } for upload in recent_uploads
        ],
        "predictions": [
            {
                "type": pred.prediction_type,
                "confidence": pred.confidence,
                "predicted_at": pred.predicted_at.isoformat()
            } for pred in predictions
        ]
    }

async def get_ceo_dashboard(user: User, db: Session) -> Dict[str, Any]:
    """CEO Dashboard: Company-wide aggregated view"""

    allowed_sector_ids = _allowed_sector_ids(db, user)
    uploader_ids = _allowed_uploader_ids(db, user)
    if not allowed_sector_ids or not uploader_ids:
        company_sector_ids = [-1]
    else:
        company_sector_ids = [
            row[0]
            for row in db.query(RawData.sector_id).filter(
                RawData.sector_id.in_(allowed_sector_ids),
                RawData.uploaded_by.in_(uploader_ids),
            ).distinct().all()
        ] or [-1]

    total_sectors = db.query(func.count(Sector.id)).filter(Sector.id.in_(company_sector_ids)).scalar()
    total_products = db.query(func.count(Product.id)).filter(Product.sector_id.in_(company_sector_ids)).scalar()
    total_uploads = db.query(func.count(RawData.id)).filter(
        RawData.sector_id.in_(company_sector_ids),
        RawData.uploaded_by.in_(uploader_ids if uploader_ids else [-1]),
    ).scalar()

    # Sector performance comparison
    sector_stats = db.query(
        Sector.name,
        func.count(RawData.id).label('uploads'),
        func.avg(DataQualityScore.score).label('avg_quality')
    ).join(RawData, Sector.id == RawData.sector_id)\
     .outerjoin(CleanedData, RawData.id == CleanedData.raw_data_id)\
     .outerjoin(DataQualityScore, CleanedData.id == DataQualityScore.cleaned_data_id)\
     .filter(
         Sector.id.in_(company_sector_ids),
         RawData.uploaded_by.in_(uploader_ids if uploader_ids else [-1]),
     )\
     .group_by(Sector.id, Sector.name).all()

    # AI recommendations
    recommendations = db.query(AIRecommendation)\
        .join(AIPrediction, AIRecommendation.prediction_id == AIPrediction.id)\
        .join(RawData, RawData.sector_id == AIPrediction.sector_id)\
        .filter(
            AIPrediction.sector_id.in_(company_sector_ids),
            RawData.uploaded_by.in_(uploader_ids if uploader_ids else [-1]),
        )\
        .distinct()\
        .order_by(AIRecommendation.created_at.desc()).limit(5).all()

    # Company-wide predictions summary
    prediction_summary = db.query(
        AIPrediction.prediction_type,
        func.avg(AIPrediction.confidence).label('avg_confidence'),
        func.count(AIPrediction.id).label('count')
    ).join(RawData, RawData.sector_id == AIPrediction.sector_id)\
     .filter(
         AIPrediction.sector_id.in_(company_sector_ids),
         RawData.uploaded_by.in_(uploader_ids if uploader_ids else [-1]),
     )\
     .group_by(AIPrediction.prediction_type).all()

    return {
        "role": "ceo",
        "company_overview": {
            "total_sectors": total_sectors,
            "total_products": total_products,
            "total_uploads": total_uploads
        },
        "sector_comparison": [
            {
                "sector": stat[0],
                "uploads": stat[1],
                "avg_quality": round(stat[2] or 0, 2)
            } for stat in sector_stats
        ],
        "ai_insights": {
            "recommendations": [
                {
                    "text": rec.recommendation_text,
                    "explanation": rec.explanation,
                    "created_at": rec.created_at.isoformat()
                } for rec in recommendations
            ],
            "prediction_summary": [
                {
                    "type": pred[0],
                    "avg_confidence": round(pred[1] or 0, 2),
                    "count": pred[2]
                } for pred in prediction_summary
            ]
        }
    }

async def get_admin_dashboard(user: User, db: Session) -> Dict[str, Any]:
    """Admin Dashboard: System monitoring and user management"""

    uploader_ids = _allowed_uploader_ids(db, user)
    if not uploader_ids:
        uploader_ids = [-1]

    # User statistics
    total_users = db.query(func.count(User.id)).filter(User.company_id == user.company_id).scalar()
    users_by_role = db.query(User.role, func.count(User.id))\
        .filter(User.company_id == user.company_id)\
        .group_by(User.role).all()

    # System health
    company_sector_ids = [row[0] for row in db.query(Sector.id).filter(Sector.company_id == user.company_id).all()]
    if not company_sector_ids:
        company_sector_ids = [-1]
    total_raw_data = db.query(func.count(RawData.id)).filter(
        RawData.sector_id.in_(company_sector_ids),
        RawData.uploaded_by.in_(uploader_ids),
    ).scalar()
    total_cleaned_data = db.query(func.count(CleanedData.id))\
        .join(RawData, CleanedData.raw_data_id == RawData.id)\
        .filter(
            RawData.sector_id.in_(company_sector_ids),
            RawData.uploaded_by.in_(uploader_ids),
        ).scalar()
    avg_system_quality = db.query(func.avg(DataQualityScore.score))\
        .join(CleanedData, DataQualityScore.cleaned_data_id == CleanedData.id)\
        .join(RawData, CleanedData.raw_data_id == RawData.id)\
        .filter(
            RawData.sector_id.in_(company_sector_ids),
            RawData.uploaded_by.in_(uploader_ids),
        ).scalar() or 0

    # Recent feedback
    recent_feedback = db.query(FeedbackLog)\
        .join(User, User.id == FeedbackLog.user_id)\
        .filter(
            User.company_id == user.company_id,
            User.role == user.role,
        )\
        .order_by(FeedbackLog.timestamp.desc()).limit(10).all()

    # Data processing stats
    processing_stats = {
        "raw_data_entries": total_raw_data,
        "cleaned_data_entries": total_cleaned_data,
        "processing_rate": total_cleaned_data / max(total_raw_data, 1),
        "avg_quality_score": round(avg_system_quality, 2)
    }

    return {
        "role": "admin",
        "user_management": {
            "total_users": total_users,
            "users_by_role": dict(users_by_role)
        },
        "system_health": processing_stats,
        "recent_feedback": [
            {
                "user_id": fb.user_id,
                "feedback_type": fb.feedback_type,
                "timestamp": fb.timestamp.isoformat()
            } for fb in recent_feedback
        ]
    }

@router.get("/admin/quick-stats")
async def get_admin_quick_stats(current_user: User = Depends(require_admin), db: Session = Depends(get_db)):
    """Get quick stats for admin sidebar"""

    # New users (users created in last 30 days)
    from datetime import datetime, timedelta
    thirty_days_ago = datetime.utcnow() - timedelta(days=30)
    uploader_ids = _allowed_uploader_ids(db, current_user)
    if not uploader_ids:
        uploader_ids = [-1]
    new_users = db.query(func.count(User.id))\
        .filter(
            User.created_at >= thirty_days_ago,
            User.company_id == current_user.company_id,
            User.role == current_user.role,
        ).scalar()

    # Pending reports (assuming reports that are not processed or something - using recent reports)
    pending_reports = db.query(func.count(FeedbackLog.id))\
        .join(User, User.id == FeedbackLog.user_id)\
        .filter(
            FeedbackLog.feedback_type == 'correction',
            User.company_id == current_user.company_id,
            User.id.in_(uploader_ids),
        ).scalar()

    # System alerts (recent feedback logs)
    system_alerts = db.query(func.count(FeedbackLog.id))\
        .join(User, User.id == FeedbackLog.user_id)\
        .filter(
            FeedbackLog.timestamp >= thirty_days_ago,
            User.company_id == current_user.company_id,
            User.id.in_(uploader_ids),
        ).scalar()

    return {
        "pendingReports": pending_reports,
        "newUsers": new_users,
        "systemAlerts": system_alerts
    }

@router.post("/feedback")
async def submit_feedback(
    data_id: int,
    feedback_type: str,
    feedback_data: Dict[str, Any],
    current_user: User = Depends(require_sector_head),
    db: Session = Depends(get_db)
):
    """Submit feedback on data or predictions (for sector heads)"""

    feedback_entry = FeedbackLog(
        user_id=current_user.id,
        data_id=data_id,
        feedback_type=feedback_type,
        feedback_data=feedback_data
    )
    db.add(feedback_entry)
    db.commit()

    return {"message": "Feedback submitted successfully"}


@router.get("/announcements")
async def get_announcements(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    rows = db.query(CompanyAnnouncement).filter(
        CompanyAnnouncement.company_id == current_user.company_id
    ).order_by(CompanyAnnouncement.created_at.desc()).limit(50).all()
    return [
        {
            "id": row.id,
            "title": row.title,
            "message": row.message,
            "created_by": row.created_by,
            "created_at": row.created_at.isoformat() if row.created_at else None,
        }
        for row in rows
    ]


@router.post("/announcements")
async def create_announcement(
    payload: AnnouncementCreateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if current_user.role not in ["ceo", "admin"]:
        raise HTTPException(status_code=403, detail="Only CEO/Admin can post announcements")
    row = CompanyAnnouncement(
        company_id=current_user.company_id,
        title=payload.title,
        message=payload.message,
        created_by=current_user.id,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return {
        "id": row.id,
        "title": row.title,
        "message": row.message,
        "created_by": row.created_by,
        "created_at": row.created_at.isoformat() if row.created_at else None,
    }


@router.get("/settings")
async def get_user_settings(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    row = db.query(UserSetting).filter(UserSetting.user_id == current_user.id).first()
    if not row:
        default_settings = {
            "notifications": {
                "email_reports": True,
                "in_app_alerts": True,
            },
            "ai": {
                "feedback_learning": True,
                "prediction_confidence_threshold": 75,
            },
            "data": {
                "auto_cleaning_threshold": 85,
                "duplicate_detection": True,
            },
        }
        row = UserSetting(
            user_id=current_user.id,
            settings=default_settings,
            updated_at=datetime.utcnow(),
        )
        db.add(row)
        db.commit()
        db.refresh(row)
    return {
        "user_id": current_user.id,
        "settings": row.settings,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
    }


@router.put("/settings")
async def update_user_settings(
    payload: SettingsUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    row = db.query(UserSetting).filter(UserSetting.user_id == current_user.id).first()
    if not row:
        row = UserSetting(
            user_id=current_user.id,
            settings=payload.settings,
            updated_at=datetime.utcnow(),
        )
        db.add(row)
    else:
        row.settings = payload.settings
        row.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(row)
    return {
        "user_id": current_user.id,
        "settings": row.settings,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
    }
