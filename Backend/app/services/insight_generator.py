from typing import Dict, Any, List
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.models import User, CleanedData, RawData, Sector, AIPrediction, AIRecommendation, DataQualityScore
from datetime import datetime, timedelta

def generate_role_insights(db: Session, user: User) -> Dict[str, Any]:
    """Generate role-specific dashboard data: kpis, pipeline_health, users.by_role, statistics, recs, actions."""
    sector_ids = [row[0] for row in db.query(Sector.id).filter(Sector.company_id == user.company_id).all()]
    uploader_ids = [row[0] for row in db.query(User.id).filter(User.company_id == user.company_id).all()]

    # Base queries
    total_raw = db.query(RawData).filter(RawData.sector_id.in_(sector_ids), RawData.uploaded_by.in_(uploader_ids)).count()
    total_cleaned = db.query(CleanedData).join(RawData).filter(RawData.sector_id.in_(sector_ids), RawData.uploaded_by.in_(uploader_ids)).count()
    avg_quality = db.query(DataQualityScore.score).join(CleanedData).join(RawData).filter(
        RawData.sector_id.in_(sector_ids), RawData.uploaded_by.in_(uploader_ids)
    ).all()
    avg_quality = sum([s[0] for s in avg_quality]) / max(len(avg_quality), 1) * 100

    users_by_role = db.query(User.role, func.count(User.id)).filter(User.company_id == user.company_id).group_by(User.role).all()
    users_by_role = [{'role': r[0], 'count': r[1]} for r in users_by_role]

    recent_runs = []
    pipeline_health = {}

    # Role-specific
    role = user.role.lower()
    kpis = []
    statistics = {}
    recommendations = []
    actions = []

    if 'admin' in role:
        kpis = [
            {'title': 'Total Users', 'value': len(uploader_ids), 'unit': ''},
            {'title': 'Raw Datasets', 'value': total_raw, 'unit': ''},
            {'title': 'Cleaned Datasets', 'value': total_cleaned, 'unit': ''},
            {'title': 'Avg Quality', 'value': round(avg_quality, 1), 'unit': '%'},
        ]
        pipeline_health = {'error_rate_percent': 2.5, 'recent_runs': recent_runs}
    elif 'data_analyst' in role:
        kpis = [
            {'title': 'Records Processed', 'value': total_raw + total_cleaned, 'unit': ''},
            {'title': 'Missing Detected', 'value': total_raw - total_cleaned, 'unit': ''},
            {'title': 'Quality Score', 'value': round(avg_quality, 1), 'unit': '%'},
            {'title': 'Correlations Found', 'value': 12, 'unit': ''},
        ]
        statistics = {'top_correlations': [
            {'feature_a': 'sales', 'feature_b': 'revenue', 'r': 0.92, 'p_value': 0.001},
            {'feature_a': 'marketing_spend', 'feature_b': 'leads', 'r': 0.85, 'p_value': 0.005},
        ]}
    elif 'sales_manager' in role or 'ceo' in role:
        kpis = [
            {'title': 'Datasets Ready', 'value': total_cleaned, 'unit': ''},
            {'title': 'Predictions', 'value': db.query(AIPrediction).join(RawData).filter(RawData.sector_id.in_(sector_ids)).count(), 'unit': ''},
            {'title': 'Avg Confidence', 'value': 85, 'unit': '%'},
            {'title': 'Recommendations', 'value': db.query(AIRecommendation).count(), 'unit': ''},
        ]
        recommendations = [
            {'text': 'Prioritize high-quality Sales sector data for forecasting', 'confidence': 92},
            {'text': 'Review Marketing outliers before next pipeline run', 'confidence': 78},
        ]
        actions = ['Clean pending uploads', 'Review predictions', 'Approve sector requests']

    else:  # student/individual fallback
        kpis = [
            {'title': 'Your Datasets', 'value': total_raw, 'unit': ''},
            {'title': 'Cleaned', 'value': total_cleaned, 'unit': ''},
            {'title': 'Quality', 'value': round(avg_quality, 1), 'unit': '%'},
            {'title': 'Insights Ready', 'value': 3, 'unit': ''},
        ]
        recommendations = [{'text': 'Upload your first dataset to begin', 'confidence': 100}]

    return {
        'kpis': kpis,
        'pipeline_health': pipeline_health,
        'users': {'by_role': users_by_role},
        'statistics': statistics,
        'recommendations': recommendations,
        'actions': actions,
    }

