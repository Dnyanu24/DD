from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import Optional, List
from pydantic import BaseModel
from app.database import SessionLocal
from app.models import AIPrediction, AIRecommendation, Sector, RawData, CleanedData, User
from app.services.ai_predictions import AIPredictionEngine
from app.dependencies import get_current_user, require_sector_head, require_ceo

router = APIRouter()


class ChatRequest(BaseModel):
    message: str
    page: Optional[str] = None
    dataset_id: Optional[int] = None


class ChatResponse(BaseModel):
    reply: str
    suggestions: List[str]


class RolePredictionResponse(BaseModel):
    role: str
    company_id: int
    predictions: List[dict]

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


def _ensure_sector_access(db: Session, current_user: User, sector_id: int) -> None:
    if sector_id not in _allowed_sector_ids(db, current_user):
        raise HTTPException(status_code=403, detail="Access denied")


@router.get("/role-predictions", response_model=RolePredictionResponse)
async def get_role_predictions(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Return role-specific prediction guidance based on datasets used in the system."""
    sector_ids = _allowed_sector_ids(db, current_user)
    uploader_ids = _allowed_uploader_ids(db, current_user)
    if not sector_ids or not uploader_ids:
        return {"role": current_user.role, "company_id": current_user.company_id, "predictions": []}

    raw_rows = db.query(RawData).filter(
        RawData.sector_id.in_(sector_ids),
        RawData.uploaded_by.in_(uploader_ids),
    ).all()
    cleaned_rows = db.query(CleanedData)\
        .join(RawData, CleanedData.raw_data_id == RawData.id)\
        .filter(
            RawData.sector_id.in_(sector_ids),
            RawData.uploaded_by.in_(uploader_ids),
        ).all()

    total_rows = sum(len(row.data or []) for row in raw_rows)
    cleaned_ratio = (len(cleaned_rows) / max(len(raw_rows), 1)) * 100 if raw_rows else 0
    avg_quality = (sum((row.quality_score or 0) for row in cleaned_rows) / len(cleaned_rows) * 100) if cleaned_rows else 0

    role_key = (current_user.role or "").lower()
    predictions = []

    if role_key in ["ceo", "admin"]:
        predictions.append({
            "title": "Company Data Readiness",
            "value": round(cleaned_ratio, 2),
            "unit": "%",
            "detail": f"{len(cleaned_rows)} of {len(raw_rows)} datasets cleaned for company analytics.",
            "recommended_action": "Approve pending role requests and push low-cleaning sectors to run full pipeline.",
        })
        predictions.append({
            "title": "Expected Reporting Confidence",
            "value": round(avg_quality, 2),
            "unit": "%",
            "detail": "Estimated confidence for executive dashboards from current cleaned quality.",
            "recommended_action": "Prioritize sectors below 80% quality before monthly reporting.",
        })
    elif role_key == "data_analyst":
        predictions.append({
            "title": "Cleaning Coverage Forecast",
            "value": round(cleaned_ratio, 2),
            "unit": "%",
            "detail": "How much of your accessible data is already cleaned.",
            "recommended_action": "Run missing-values and outlier pipeline on pending datasets.",
        })
        predictions.append({
            "title": "Model Feature Reliability",
            "value": round(avg_quality, 2),
            "unit": "%",
            "detail": "Estimated reliability score for training features in current datasets.",
            "recommended_action": "Increase reliability using schema correction and text cleaning.",
        })
    elif role_key == "sales_manager":
        predictions.append({
            "title": "Sales Insight Readiness",
            "value": round(avg_quality, 2),
            "unit": "%",
            "detail": "Projected trust level for visualization and forecast dashboards.",
            "recommended_action": "Use cleaned sector datasets with highest quality for forecasting.",
        })
        predictions.append({
            "title": "Usable Dataset Count",
            "value": len(cleaned_rows),
            "unit": "datasets",
            "detail": "Cleaned datasets ready for performance comparison charts.",
            "recommended_action": "Request cleaning of remaining pending sales datasets.",
        })
    else:
        predictions.append({
            "title": "Sector Pipeline Health",
            "value": round(cleaned_ratio, 2),
            "unit": "%",
            "detail": "Share of your sector datasets available as cleaned outputs.",
            "recommended_action": "Clean pending datasets to improve sector-level predictions.",
        })
        predictions.append({
            "title": "Sector Data Quality Forecast",
            "value": round(avg_quality, 2),
            "unit": "%",
            "detail": "Expected quality score for next prediction cycle based on current cleaned files.",
            "recommended_action": "Apply full pipeline and review error-profile before model run.",
        })

    predictions.append({
        "title": "Processed Volume",
        "value": total_rows,
        "unit": "rows",
        "detail": "Total rows uploaded in your accessible scope.",
        "recommended_action": "Upload balanced sector data for more stable predictions.",
    })

    return {
        "role": current_user.role,
        "company_id": current_user.company_id,
        "predictions": predictions,
    }


@router.post("/chat", response_model=ChatResponse)
async def chat_assistant(
    payload: ChatRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Simple context-aware assistant for SDAS without external LLM dependency."""
    text = (payload.message or "").strip().lower()
    role_raw = (getattr(current_user, "role", "") or "").strip()
    role_key = role_raw.lower().replace(" ", "_")
    if not text:
        return {
            "reply": "Please type a question about uploads, cleaning, reports, or visualizations.",
            "suggestions": [
                "How many datasets are uploaded?",
                "What cleaning algorithm should I use?",
                "Show data quality summary",
            ],
        }

    sector_ids = _allowed_sector_ids(db, current_user)
    uploader_ids = _allowed_uploader_ids(db, current_user)
    if not sector_ids or not uploader_ids:
        sector_ids = [-1]
        uploader_ids = [-1]
    total_raw = db.query(RawData).filter(
        RawData.sector_id.in_(sector_ids),
        RawData.uploaded_by.in_(uploader_ids),
    ).count()
    total_cleaned = db.query(CleanedData)\
        .join(RawData, CleanedData.raw_data_id == RawData.id)\
        .filter(
            RawData.sector_id.in_(sector_ids),
            RawData.uploaded_by.in_(uploader_ids),
        ).count()
    latest_raw = db.query(RawData).filter(
        RawData.sector_id.in_(sector_ids),
        RawData.uploaded_by.in_(uploader_ids),
    ).order_by(RawData.uploaded_at.desc()).first()
    latest_cleaned = db.query(CleanedData)\
        .join(RawData, CleanedData.raw_data_id == RawData.id)\
        .filter(
            RawData.sector_id.in_(sector_ids),
            RawData.uploaded_by.in_(uploader_ids),
        )\
        .order_by(CleanedData.cleaned_at.desc()).first()
    latest_quality = round((latest_cleaned.quality_score * 100), 2) if latest_cleaned else 0
    role_scope = "company-wide" if role_key in ["ceo", "admin"] else "role-limited"

    # Lightweight "training by data": gather recent schema context from accessible datasets.
    recent_raw = db.query(RawData).filter(
        RawData.sector_id.in_(sector_ids),
        RawData.uploaded_by.in_(uploader_ids),
    ).order_by(RawData.uploaded_at.desc()).limit(20).all()
    schema_cols = set()
    for item in recent_raw:
        if isinstance(item.data, list) and item.data and isinstance(item.data[0], dict):
            schema_cols.update(item.data[0].keys())
    schema_preview = ", ".join(sorted(list(schema_cols))[:8]) if schema_cols else "no columns detected"

    if any(keyword in text for keyword in ["all company", "all sectors", "all data"]) and role_key not in ["ceo", "admin"]:
        return {
            "reply": (
                "You can access only your authorized role scope. "
                "Ask for insights from your assigned sector/company view."
            ),
            "suggestions": [
                "Show my accessible datasets",
                "What columns exist in my scope?",
                "How many cleaned datasets can I use?",
            ],
        }

    if "upload" in text or "dataset" in text:
        reply = (
            f"There are {total_raw} uploaded datasets. "
            f"{total_cleaned} datasets have cleaned output. "
            f"The latest upload id is {latest_raw.id if latest_raw else 'N/A'}. "
            f"Visible schema sample: {schema_preview}."
        )
        role_hint = {
            "ceo": "You can compare datasets across sectors from dashboard and reports.",
            "data_analyst": "You can move directly to cleaning after selecting a dataset.",
            "sales_manager": "You can focus on visualization and report pages for sales insights.",
            "sector_head": "You can track only your sector data and run cleaning for your team.",
        }.get(role_key, "")
        if role_hint:
            reply = f"{reply} {role_hint}"
        return {
            "reply": reply,
            "suggestions": [
                "How do I clean the latest dataset?",
                "Show cleaning progress steps",
                "Which page lists uploaded data?",
            ],
        }

    if "clean" in text or "algorithm" in text or "quality" in text:
        reply = (
            f"Current cleaned dataset count is {total_cleaned}. "
            f"Latest quality score is {latest_quality}%. "
            "Use full_pipeline for most cases, missing_values for null-heavy data, "
            "duplicates for repeated rows, and outliers for distribution cleanup."
        )
        if role_key == "sales_manager":
            reply = (
                f"{reply} If cleaning controls are restricted for your role, "
                "coordinate with Data Analyst or Sector Head and monitor final quality in visualizations."
            )
        return {
            "reply": reply,
            "suggestions": [
                "Start full pipeline cleaning",
                "Explain ML and clustering steps",
                "How does feedback learning improve cleaning?",
            ],
        }

    if "visual" in text or "graph" in text or "chart" in text:
        reply = (
            "Open the Visualizations page to see dashboard graphs based on uploaded data: "
            "rows by sector, monthly trend, quality distribution, status split, and top datasets."
        )
        return {
            "reply": reply,
            "suggestions": [
                "Go to visualizations",
                "Which chart shows quality distribution?",
                "How to improve low-quality datasets?",
            ],
        }

    if "report" in text:
        return {
            "reply": "Use Reports to view generated summaries and schedule outputs after cleaning and analysis steps.",
            "suggestions": [
                "Open reports page",
                "What data is included in reports?",
                "How to export report files?",
            ],
        }

    page_hint = f" on {payload.page}" if payload.page else ""
    return {
        "reply": (
            f"I can help with uploads, cleaning, visualizations, and reports{page_hint}. "
            f"Current totals: uploaded={total_raw}, cleaned={total_cleaned}, scope={role_scope}. Ask a specific action."
        ),
        "suggestions": [
            "How to upload and clean a dataset?",
            "Show cleaning best algorithm",
            "How to view dashboard graphs?",
        ],
    }

@router.post("/predict/sales")
async def predict_sales(
    sector_id: int,
    target_column: str,
    periods: int = 12,
    method: str = "arima",
    db: Session = Depends(get_db),
    current_user: User = Depends(require_sector_head)
):
    """Generate sales/demand forecasting predictions"""

    _ensure_sector_access(db, current_user, sector_id)
    uploader_ids = _allowed_uploader_ids(db, current_user)
    if not uploader_ids:
        raise HTTPException(status_code=404, detail="No cleaned data available for prediction")

    # Get cleaned data for the sector
    cleaned_data = db.query(CleanedData)\
        .join(RawData)\
        .filter(
            RawData.sector_id == sector_id,
            RawData.uploaded_by.in_(uploader_ids),
        )\
        .order_by(CleanedData.cleaned_at.desc())\
        .first()

    if not cleaned_data:
        raise HTTPException(status_code=404, detail="No cleaned data available for prediction")

    import pandas as pd
    df = pd.DataFrame(cleaned_data.cleaned_data)

    if target_column not in df.columns:
        raise HTTPException(status_code=400, detail=f"Target column '{target_column}' not found")

    # Generate prediction
    ai_engine = AIPredictionEngine()
    result = ai_engine.forecast_sales(df, target_column, periods, method)

    # Store prediction in database
    prediction_entry = AIPrediction(
        sector_id=sector_id,
        prediction_type='sales_forecast',
        prediction_data=result,
        confidence=result.get('confidence', 0.5)
    )
    db.add(prediction_entry)
    db.commit()
    db.refresh(prediction_entry)

    return {
        "prediction_id": prediction_entry.id,
        "forecast": result.get('forecast', []),
        "confidence": result.get('confidence', 0.5),
        "method": method,
        "periods": periods
    }

@router.post("/predict/anomalies")
async def detect_anomalies(
    sector_id: int,
    target_column: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_sector_head)
):
    """Detect trends and anomalies in data"""

    _ensure_sector_access(db, current_user, sector_id)
    uploader_ids = _allowed_uploader_ids(db, current_user)
    if not uploader_ids:
        raise HTTPException(status_code=404, detail="No cleaned data available")

    # Get cleaned data
    cleaned_data = db.query(CleanedData)\
        .join(RawData)\
        .filter(
            RawData.sector_id == sector_id,
            RawData.uploaded_by.in_(uploader_ids),
        )\
        .order_by(CleanedData.cleaned_at.desc())\
        .first()

    if not cleaned_data:
        raise HTTPException(status_code=404, detail="No cleaned data available")

    import pandas as pd
    df = pd.DataFrame(cleaned_data.cleaned_data)

    ai_engine = AIPredictionEngine()
    result = ai_engine.detect_trends_anomalies(df, target_column)

    # Store prediction
    prediction_entry = AIPrediction(
        sector_id=sector_id,
        prediction_type='anomaly_detection',
        prediction_data=result,
        confidence=result.get('confidence', 0.8)
    )
    db.add(prediction_entry)
    db.commit()

    return result

@router.post("/predict/risk")
async def predict_risk(
    sector_id: int,
    features: List[str],
    target_column: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_sector_head)
):
    """Predict risk using machine learning"""

    _ensure_sector_access(db, current_user, sector_id)
    uploader_ids = _allowed_uploader_ids(db, current_user)
    if not uploader_ids:
        raise HTTPException(status_code=404, detail="No cleaned data available")

    # Get cleaned data
    cleaned_data = db.query(CleanedData)\
        .join(RawData)\
        .filter(
            RawData.sector_id == sector_id,
            RawData.uploaded_by.in_(uploader_ids),
        )\
        .order_by(CleanedData.cleaned_at.desc())\
        .first()

    if not cleaned_data:
        raise HTTPException(status_code=404, detail="No cleaned data available")

    import pandas as pd
    df = pd.DataFrame(cleaned_data.cleaned_data)

    ai_engine = AIPredictionEngine()
    result = ai_engine.predict_risk(df, features, target_column)

    # Store prediction
    prediction_entry = AIPrediction(
        sector_id=sector_id,
        prediction_type='risk_prediction',
        prediction_data=result,
        confidence=result.get('confidence', 0.5)
    )
    db.add(prediction_entry)
    db.commit()

    return result

@router.post("/recommend")
async def generate_recommendations(
    sector_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_sector_head)
):
    """Generate AI-powered recommendations based on recent predictions"""

    _ensure_sector_access(db, current_user, sector_id)
    uploader_ids = _allowed_uploader_ids(db, current_user)

    # Get recent predictions for the sector
    recent_predictions = db.query(AIPrediction)\
        .join(RawData, RawData.sector_id == AIPrediction.sector_id)\
        .filter(AIPrediction.sector_id == sector_id)\
        .filter(RawData.uploaded_by.in_(uploader_ids if uploader_ids else [-1]))\
        .distinct()\
        .order_by(AIPrediction.predicted_at.desc())\
        .limit(5)\
        .all()

    if not recent_predictions:
        return {"recommendations": [], "message": "No recent predictions available"}

    # Extract prediction data for recommendation engine
    predictions_data = {}
    for pred in recent_predictions:
        predictions_data[pred.prediction_type] = pred.prediction_data

    # Get context data (current averages, etc.)
    context = {"current_average": 1000, "sector_id": sector_id}  # Placeholder

    ai_engine = AIPredictionEngine()
    recommendations = ai_engine.generate_recommendations(predictions_data, context)

    # Store recommendations
    prediction_id = recent_predictions[0].id if recent_predictions else None
    if prediction_id:
        for i, rec in enumerate(recommendations.get('recommendations', [])):
            rec_entry = AIRecommendation(
                prediction_id=prediction_id,
                recommendation_text=rec,
                explanation=recommendations.get('explanations', [])[i] if i < len(recommendations.get('explanations', [])) else ""
            )
            db.add(rec_entry)
        db.commit()

    return recommendations

@router.get("/rank-sectors")
async def rank_sectors(
    metrics: List[str] = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_ceo)
):
    """Rank sectors based on performance metrics"""

    # Get all sectors and their data
    uploader_ids = _allowed_uploader_ids(db, current_user)
    sectors = db.query(Sector).filter(Sector.company_id == current_user.company_id).all()
    sector_data = {}

    for sector in sectors:
        # Get cleaned data for each sector
        cleaned_data = db.query(CleanedData)\
            .join(RawData)\
            .filter(
                RawData.sector_id == sector.id,
                RawData.uploaded_by.in_(uploader_ids if uploader_ids else [-1]),
            )\
            .order_by(CleanedData.cleaned_at.desc())\
            .first()

        if cleaned_data:
            import pandas as pd
            df = pd.DataFrame(cleaned_data.cleaned_data)
            sector_data[sector.name] = df

    if not sector_data:
        raise HTTPException(status_code=404, detail="No data available for ranking")

    ai_engine = AIPredictionEngine()
    ranking_result = ai_engine.rank_sectors(sector_data, metrics)

    return ranking_result

@router.post("/nl-query")
async def process_nl_query(
    query: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Process natural language queries about data insights"""

    # Get available data based on user role
    available_data = {}
    uploader_ids = _allowed_uploader_ids(db, current_user)
    if current_user.role == 'sector_head':
        sector_data = db.query(CleanedData)\
            .join(RawData)\
            .filter(
                RawData.sector_id == current_user.sector_id,
                RawData.uploaded_by.in_(uploader_ids if uploader_ids else [-1]),
            )\
            .order_by(CleanedData.cleaned_at.desc())\
            .first()
        if sector_data:
            available_data['sector_data'] = sector_data.cleaned_data
    elif current_user.role in ['ceo', 'admin']:
        # Company-wide data summary
        company_sector_ids = _allowed_sector_ids(db, current_user)
        available_data['company_summary'] = {
            'total_sectors': db.query(Sector).filter(Sector.company_id == current_user.company_id).count(),
            'total_predictions': db.query(AIPrediction)
            .join(RawData, RawData.sector_id == AIPrediction.sector_id)
            .filter(
                AIPrediction.sector_id.in_(company_sector_ids),
                RawData.uploaded_by.in_(uploader_ids if uploader_ids else [-1]),
            )
            .distinct()
            .count()
        }

    ai_engine = AIPredictionEngine()
    result = ai_engine.process_nl_query(query, available_data)

    return result

@router.get("/predictions/{sector_id}")
async def get_predictions(
    sector_id: int,
    limit: int = 10,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_sector_head)
):
    """Get prediction history for a sector"""

    _ensure_sector_access(db, current_user, sector_id)
    uploader_ids = _allowed_uploader_ids(db, current_user)

    predictions = db.query(AIPrediction)\
        .join(RawData, RawData.sector_id == AIPrediction.sector_id)\
        .filter(AIPrediction.sector_id == sector_id)\
        .filter(RawData.uploaded_by.in_(uploader_ids if uploader_ids else [-1]))\
        .distinct()\
        .order_by(AIPrediction.predicted_at.desc())\
        .limit(limit)\
        .all()

    return [
        {
            "id": pred.id,
            "type": pred.prediction_type,
            "data": pred.prediction_data,
            "confidence": pred.confidence,
            "predicted_at": pred.predicted_at.isoformat()
        } for pred in predictions
    ]

@router.get("/recommendations/{sector_id}")
async def get_recommendations(
    sector_id: int,
    limit: int = 10,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_sector_head)
):
    """Get AI recommendations for a sector"""

    _ensure_sector_access(db, current_user, sector_id)
    uploader_ids = _allowed_uploader_ids(db, current_user)

    recommendations = db.query(AIRecommendation)\
        .join(AIPrediction)\
        .join(RawData, RawData.sector_id == AIPrediction.sector_id)\
        .filter(AIPrediction.sector_id == sector_id)\
        .filter(RawData.uploaded_by.in_(uploader_ids if uploader_ids else [-1]))\
        .distinct()\
        .order_by(AIRecommendation.created_at.desc())\
        .limit(limit)\
        .all()

    return [
        {
            "id": rec.id,
            "recommendation": rec.recommendation_text,
            "explanation": rec.explanation,
            "created_at": rec.created_at.isoformat()
        } for rec in recommendations
    ]
