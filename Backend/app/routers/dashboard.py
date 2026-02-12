from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Dict, Any
from sqlalchemy import func

from app.database import SessionLocal
from app.models import (
    User, Sector, Product, RawData, CleanedData, DataQualityScore,
    AIPrediction, AIRecommendation, FeedbackLog
)
from app.dependencies import get_current_user, require_sector_head, require_ceo, require_admin
from app.services.feedback_learning import FeedbackLearningEngine

router = APIRouter()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

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

    # Recent uploads
    recent_uploads = db.query(RawData).filter(RawData.sector_id == user.sector_id)\
        .order_by(RawData.uploaded_at.desc()).limit(5).all()

    # Cleaned data summary
    cleaned_count = db.query(func.count(CleanedData.id))\
        .join(RawData, CleanedData.raw_data_id == RawData.id)\
        .filter(RawData.sector_id == user.sector_id).scalar()

    # AI predictions for sector
    predictions = db.query(AIPrediction)\
        .filter(AIPrediction.sector_id == user.sector_id)\
        .order_by(AIPrediction.predicted_at.desc()).limit(3).all()

    # Data quality scores
    avg_quality = db.query(func.avg(DataQualityScore.score))\
        .join(CleanedData, DataQualityScore.cleaned_data_id == CleanedData.id)\
        .join(RawData, CleanedData.raw_data_id == RawData.id)\
        .filter(RawData.sector_id == user.sector_id).scalar() or 0

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

    # Company overview
    total_sectors = db.query(func.count(Sector.id)).scalar()
    total_products = db.query(func.count(Product.id)).scalar()
    total_uploads = db.query(func.count(RawData.id)).scalar()

    # Sector performance comparison
    sector_stats = db.query(
        Sector.name,
        func.count(RawData.id).label('uploads'),
        func.avg(DataQualityScore.score).label('avg_quality')
    ).join(RawData, Sector.id == RawData.sector_id)\
     .outerjoin(CleanedData, RawData.id == CleanedData.raw_data_id)\
     .outerjoin(DataQualityScore, CleanedData.id == DataQualityScore.cleaned_data_id)\
     .group_by(Sector.id, Sector.name).all()

    # AI recommendations
    recommendations = db.query(AIRecommendation)\
        .join(AIPrediction, AIRecommendation.prediction_id == AIPrediction.id)\
        .order_by(AIRecommendation.created_at.desc()).limit(5).all()

    # Company-wide predictions summary
    prediction_summary = db.query(
        AIPrediction.prediction_type,
        func.avg(AIPrediction.confidence).label('avg_confidence'),
        func.count(AIPrediction.id).label('count')
    ).group_by(AIPrediction.prediction_type).all()

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

    # User statistics
    total_users = db.query(func.count(User.id)).scalar()
    users_by_role = db.query(User.role, func.count(User.id))\
        .group_by(User.role).all()

    # System health
    total_raw_data = db.query(func.count(RawData.id)).scalar()
    total_cleaned_data = db.query(func.count(CleanedData.id)).scalar()
    avg_system_quality = db.query(func.avg(DataQualityScore.score)).scalar() or 0

    # Recent feedback
    recent_feedback = db.query(FeedbackLog)\
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
    new_users = db.query(func.count(User.id))\
        .filter(User.created_at >= thirty_days_ago).scalar()

    # Pending reports (assuming reports that are not processed or something - using recent reports)
    pending_reports = db.query(func.count(FeedbackLog.id))\
        .filter(FeedbackLog.feedback_type == 'correction').scalar()

    # System alerts (recent feedback logs)
    system_alerts = db.query(func.count(FeedbackLog.id))\
        .filter(FeedbackLog.timestamp >= thirty_days_ago).scalar()

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
