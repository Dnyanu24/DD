from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional

import numpy as np
import pandas as pd
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import (
    AIPrediction,
    AIRecommendation,
    CleanedData,
    DataQualityScore,
    PipelineIterationLog,
    RawData,
    Sector,
    User,
)


def _utc_iso() -> str:
    return datetime.utcnow().isoformat()


def _latest_cleaned_df(db: Session, *, company_id: int, sector_id: Optional[int] = None) -> Optional[pd.DataFrame]:
    q = (
        db.query(CleanedData)
        .join(RawData, CleanedData.raw_data_id == RawData.id)
        .join(Sector, Sector.id == RawData.sector_id)
        .filter(Sector.company_id == int(company_id))
    )
    if sector_id is not None:
        q = q.filter(RawData.sector_id == int(sector_id))
    row = q.order_by(CleanedData.cleaned_at.desc()).first()
    if not row or not row.cleaned_data:
        return None
    try:
        return pd.DataFrame(row.cleaned_data)
    except Exception:
        return None


def _quality_kpis(db: Session, *, company_id: int) -> Dict[str, Any]:
    company_sector_ids = [r[0] for r in db.query(Sector.id).filter(Sector.company_id == int(company_id)).all()] or [-1]

    cleaned_count = (
        db.query(func.count(CleanedData.id))
        .join(RawData, CleanedData.raw_data_id == RawData.id)
        .filter(RawData.sector_id.in_(company_sector_ids))
        .scalar()
        or 0
    )
    raw_count = db.query(func.count(RawData.id)).filter(RawData.sector_id.in_(company_sector_ids)).scalar() or 0

    avg_quality = (
        db.query(func.avg(DataQualityScore.score))
        .join(CleanedData, DataQualityScore.cleaned_data_id == CleanedData.id)
        .join(RawData, CleanedData.raw_data_id == RawData.id)
        .filter(RawData.sector_id.in_(company_sector_ids))
        .scalar()
        or 0
    )

    return {
        "raw_datasets": int(raw_count),
        "cleaned_datasets": int(cleaned_count),
        "avg_quality_score": round(float(avg_quality), 4),
    }


def _pipeline_health(db: Session, *, company_id: int, limit: int = 15) -> Dict[str, Any]:
    rows = (
        db.query(PipelineIterationLog)
        .filter(PipelineIterationLog.company_id == int(company_id))
        .order_by(PipelineIterationLog.created_at.desc())
        .limit(int(limit))
        .all()
    )
    status_counts: Dict[str, int] = {}
    recent: List[Dict[str, Any]] = []
    for row in rows:
        status_counts[row.status] = status_counts.get(row.status, 0) + 1
        recent.append(
            {
                "created_at": row.created_at.isoformat() if row.created_at else None,
                "task": row.task,
                "run_key": row.run_key,
                "iteration": row.iteration,
                "status": row.status,
                "metrics": row.metrics or {},
            }
        )
    total = sum(status_counts.values()) or 1
    return {
        "status_counts": status_counts,
        "error_rate_percent": round((status_counts.get("error", 0) / total) * 100.0, 2),
        "recent_runs": recent,
    }


def admin_insights(db: Session, current_user: User) -> Dict[str, Any]:
    quality = _quality_kpis(db, company_id=current_user.company_id)
    health = _pipeline_health(db, company_id=current_user.company_id, limit=15)

    total_users = db.query(func.count(User.id)).filter(User.company_id == current_user.company_id).scalar() or 0
    users_by_role = (
        db.query(User.role, func.count(User.id))
        .filter(User.company_id == current_user.company_id)
        .group_by(User.role)
        .all()
    )
    role_breakdown = [{"role": str(role), "count": int(count)} for role, count in users_by_role]

    return {
        "role_category": "admin",
        "generated_at": _utc_iso(),
        "kpis": [
            {"title": "Users", "value": int(total_users)},
            {"title": "Raw Datasets", "value": int(quality["raw_datasets"])},
            {"title": "Cleaned Datasets", "value": int(quality["cleaned_datasets"])},
            {"title": "Avg Quality", "value": round(float(quality["avg_quality_score"]) * 100, 2), "unit": "%"},
        ],
        "data_quality": quality,
        "pipeline_health": health,
        "users": {"total": int(total_users), "by_role": role_breakdown},
    }


def _top_correlations(df: pd.DataFrame, limit: int = 8) -> List[Dict[str, Any]]:
    from scipy.stats import pearsonr

    numeric = df.select_dtypes(include=[np.number]).replace([np.inf, -np.inf], np.nan).dropna(axis=0, how="any")
    if numeric.shape[0] < 12 or numeric.shape[1] < 2:
        return []

    cols = list(numeric.columns)[:12]
    pairs: List[Dict[str, Any]] = []
    for i in range(len(cols)):
        for j in range(i + 1, len(cols)):
            a = numeric[cols[i]].values
            b = numeric[cols[j]].values
            if np.std(a) == 0 or np.std(b) == 0:
                continue
            r, p = pearsonr(a, b)
            pairs.append(
                {
                    "feature_a": str(cols[i]),
                    "feature_b": str(cols[j]),
                    "r": round(float(r), 4),
                    "p_value": round(float(p), 6),
                    "abs_r": abs(float(r)),
                }
            )
    pairs.sort(key=lambda item: item["abs_r"], reverse=True)
    for item in pairs:
        item.pop("abs_r", None)
    return pairs[: int(limit)]


def _model_performance_summary(db: Session, *, company_id: int, limit: int = 12) -> Dict[str, Any]:
    recent_iter = (
        db.query(PipelineIterationLog)
        .filter(PipelineIterationLog.company_id == int(company_id))
        .order_by(PipelineIterationLog.created_at.desc())
        .limit(int(limit))
        .all()
    )
    recent_pred = (
        db.query(AIPrediction)
        .join(RawData, RawData.sector_id == AIPrediction.sector_id)
        .join(Sector, Sector.id == RawData.sector_id)
        .filter(Sector.company_id == int(company_id))
        .order_by(AIPrediction.predicted_at.desc())
        .limit(int(limit))
        .all()
    )

    iter_rows = [
        {
            "created_at": row.created_at.isoformat() if row.created_at else None,
            "task": row.task,
            "status": row.status,
            "metrics": row.metrics or {},
        }
        for row in recent_iter
    ]
    pred_rows = [
        {
            "predicted_at": row.predicted_at.isoformat() if row.predicted_at else None,
            "type": row.prediction_type,
            "confidence": float(row.confidence or 0),
            "metrics": (row.prediction_data or {}).get("metrics", {}),
        }
        for row in recent_pred
    ]

    headline = {}
    for row in iter_rows:
        metrics = row.get("metrics") or {}
        if any(k in metrics for k in ("f1", "accuracy", "rmse", "r2")):
            headline = metrics
            break
    if not headline:
        for row in pred_rows:
            metrics = row.get("metrics") or {}
            if any(k in metrics for k in ("f1", "accuracy", "rmse", "r2")):
                headline = metrics
                break

    return {"headline_metrics": headline, "recent_iterations": iter_rows, "recent_predictions": pred_rows}


def analyst_insights(db: Session, current_user: User) -> Dict[str, Any]:
    sector_id = current_user.sector_id if current_user.role == "sector_head" else None
    df = _latest_cleaned_df(db, company_id=current_user.company_id, sector_id=sector_id)

    correlations = _top_correlations(df, limit=8) if df is not None else []
    perf = _model_performance_summary(db, company_id=current_user.company_id, limit=12)

    numeric_cols = int(df.select_dtypes(include=[np.number]).shape[1]) if df is not None else 0
    rows = int(df.shape[0]) if df is not None else 0

    return {
        "role_category": "analyst",
        "generated_at": _utc_iso(),
        "kpis": [
            {"title": "Rows Analyzed", "value": rows},
            {"title": "Numeric Features", "value": numeric_cols},
            {"title": "Top Correlations", "value": len(correlations)},
            {"title": "Latest F1", "value": perf.get("headline_metrics", {}).get("f1")},
        ],
        "statistics": {"top_correlations": correlations},
        "model_performance": perf,
    }


def _business_kpis_from_df(df: Optional[pd.DataFrame]) -> Dict[str, Any]:
    if df is None or df.shape[0] == 0:
        return {"roi_percent": None, "signal_column": None, "signal_value": None}

    cols = [str(c) for c in df.columns]
    revenue_col = next((c for c in cols if any(k in c.lower() for k in ["revenue", "sales", "income", "amount"])), None)
    cost_col = next((c for c in cols if any(k in c.lower() for k in ["cost", "expense", "spend"])), None)

    roi = None
    if revenue_col and cost_col:
        rev = pd.to_numeric(df[revenue_col], errors="coerce").dropna()
        cost = pd.to_numeric(df[cost_col], errors="coerce").dropna()
        if len(rev) and len(cost):
            rev_sum = float(rev.sum())
            cost_sum = float(cost.sum())
            if cost_sum > 0:
                roi = ((rev_sum - cost_sum) / cost_sum) * 100.0

    numeric = df.select_dtypes(include=[np.number])
    signal_column = None
    signal_value = None
    if numeric.shape[1] > 0:
        best = max(list(numeric.columns), key=lambda c: int(pd.to_numeric(numeric[c], errors="coerce").notna().sum()))
        signal_column = str(best)
        signal_value = float(pd.to_numeric(numeric[best], errors="coerce").dropna().sum())

    return {
        "roi_percent": round(float(roi), 2) if roi is not None else None,
        "signal_column": signal_column,
        "signal_value": round(float(signal_value), 2) if signal_value is not None else None,
    }


def manager_insights(db: Session, current_user: User) -> Dict[str, Any]:
    df = _latest_cleaned_df(db, company_id=current_user.company_id, sector_id=None)
    business = _business_kpis_from_df(df)

    sector_ids = [r[0] for r in db.query(Sector.id).filter(Sector.company_id == current_user.company_id).all()] or [-1]

    recs = (
        db.query(AIRecommendation)
        .join(AIPrediction, AIRecommendation.prediction_id == AIPrediction.id)
        .filter(AIPrediction.sector_id.in_(sector_ids))
        .order_by(AIRecommendation.created_at.desc())
        .limit(8)
        .all()
    )
    recommendations = [
        {
            "text": r.recommendation_text,
            "explanation": r.explanation,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in recs
    ]

    preds = (
        db.query(AIPrediction)
        .filter(AIPrediction.sector_id.in_(sector_ids))
        .order_by(AIPrediction.predicted_at.desc())
        .limit(10)
        .all()
    )
    prediction_summary: Dict[str, Dict[str, Any]] = {}
    for p in preds:
        key = str(p.prediction_type)
        bucket = prediction_summary.setdefault(key, {"type": key, "count": 0, "avg_confidence": 0.0})
        bucket["count"] += 1
        bucket["avg_confidence"] += float(p.confidence or 0.0)
    summarized = []
    for item in prediction_summary.values():
        item["avg_confidence"] = round(item["avg_confidence"] / max(item["count"], 1), 3)
        summarized.append(item)
    summarized.sort(key=lambda x: x["count"], reverse=True)

    actions = []
    if business.get("roi_percent") is not None and business["roi_percent"] < 10:
        actions.append("ROI is low. Review cost drivers and rerun forecasting for high-margin segments.")
    if recommendations:
        actions.append("Review latest AI recommendations and assign owners to the top 3 actions.")
    actions.append("Track weekly prediction confidence and investigate drops using optimization logs.")

    return {
        "role_category": "manager",
        "generated_at": _utc_iso(),
        "kpis": [
            {"title": "ROI", "value": business.get("roi_percent"), "unit": "%"},
            {"title": "Signal Metric", "value": business.get("signal_value"), "label": business.get("signal_column")},
            {"title": "Recommendations", "value": len(recommendations)},
            {"title": "Prediction Types", "value": len(summarized)},
        ],
        "business": business,
        "predictions": {"summary": summarized},
        "recommendations": recommendations,
        "actions": actions,
    }


def generate_role_insights(db: Session, current_user: User) -> Dict[str, Any]:
    role = (current_user.role or "").strip().lower()
    if role == "admin":
        return admin_insights(db, current_user)
    if role in ("data_analyst", "analyst"):
        return analyst_insights(db, current_user)
    if role in ("sales_manager", "manager", "ceo", "sector_head"):
        return manager_insights(db, current_user)

    base = analyst_insights(db, current_user)
    base["role_category"] = "student" if role == "student" else "individual" if role == "individual" else role or "user"
    return base

