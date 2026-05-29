from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import Optional, List
from pydantic import BaseModel
import pandas as pd
import numpy as np
from app.database import SessionLocal
from app.models import AIPrediction, AIRecommendation, Sector, RawData, CleanedData, User, Product
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


def _ensure_sector_access(db: Session, current_user: User, sector_id: int) -> None:
    if sector_id not in _allowed_sector_ids(db, current_user):
        raise HTTPException(status_code=403, detail="Access denied")


def _records_to_dataframe(records) -> pd.DataFrame:
    if isinstance(records, list):
        return pd.DataFrame(records)
    return pd.DataFrame()


def _numeric_columns(df: pd.DataFrame) -> List[str]:
    columns = []
    for col in df.columns:
        series = pd.to_numeric(df[col], errors="coerce")
        if series.notna().sum() >= max(2, int(len(df) * 0.25)):
            columns.append(col)
    return columns


def _first_matching_column(columns: List[str], tokens: List[str]) -> Optional[str]:
    for col in columns:
        name = str(col).lower()
        if any(token in name for token in tokens):
            return col
    return None


def _quality_percent(df: pd.DataFrame, cleaned_quality: Optional[float] = None) -> float:
    if cleaned_quality is not None:
        return round(float(cleaned_quality or 0) * 100, 2)
    if df.empty or len(df.columns) == 0:
        return 0.0
    missing_tokens = {"", "na", "n/a", "null", "none", "nan", "undefined", "unknown", "-", "--"}
    normalized = df.copy()
    for col in normalized.columns:
        if normalized[col].dtype == object:
            normalized[col] = normalized[col].astype(str).str.strip().str.lower()
            normalized[col] = normalized[col].where(~normalized[col].isin(missing_tokens), np.nan)
    total_cells = max(len(normalized) * len(normalized.columns), 1)
    missing = int(normalized.isna().sum().sum())
    return round(max(0.0, (1 - (missing / total_cells)) * 100), 2)


def _growth_signal(df: pd.DataFrame) -> float:
    if df.empty:
        return 0.0
    numeric_cols = _numeric_columns(df)
    growth_col = _first_matching_column(numeric_cols, ["growth", "%", "percent"])
    revenue_col = _first_matching_column(numeric_cols, ["revenue", "sales", "amount", "profit"])

    if growth_col:
        values = pd.to_numeric(df[growth_col], errors="coerce").dropna()
        if not values.empty:
            return round(float(values.mean()), 2)

    if revenue_col:
        values = pd.to_numeric(df[revenue_col], errors="coerce").dropna()
        if len(values) >= 2 and values.iloc[0] != 0:
            return round(float(((values.iloc[-1] - values.iloc[0]) / abs(values.iloc[0])) * 100), 2)
        if not values.empty:
            return round(float(values.mean() / max(values.max(), 1) * 20), 2)

    if numeric_cols:
        values = pd.to_numeric(df[numeric_cols[0]], errors="coerce").dropna()
        if not values.empty:
            return round(float(values.mean() / max(values.max(), 1) * 20), 2)
    return 0.0


def _top_product_name(db: Session, raw_rows: List[RawData]) -> str:
    product_scores = {}
    product_names = {}
    for raw in raw_rows:
        product_key = raw.product_id or 0
        if raw.product_id:
            product = db.query(Product).filter(Product.id == raw.product_id).first()
            product_names[product_key] = product.name if product else f"Product {raw.product_id}"
        else:
            product_names[product_key] = "Unassigned"
        records = raw.data if isinstance(raw.data, list) else []
        product_scores[product_key] = product_scores.get(product_key, 0) + len(records)
    if not product_scores:
        return "Unassigned"
    best_key = max(product_scores, key=product_scores.get)
    return product_names.get(best_key, "Unassigned")


def _recommendation(growth: float, confidence: float, quality: float) -> str:
    score = (growth * 0.45) + (confidence * 0.35) + (quality * 0.20)
    if score >= 55:
        return "Invest"
    if score >= 30:
        return "Watch"
    return "Do Not Invest"


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


@router.get("/ceo-growth-outlook")
async def get_ceo_growth_outlook(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Build CEO/admin AI model data from company raw and cleaned datasets."""
    if current_user.role not in ["ceo", "admin"]:
        raise HTTPException(status_code=403, detail="Access denied")

    sector_ids = _allowed_sector_ids(db, current_user)
    uploader_ids = _allowed_uploader_ids(db, current_user)
    sectors = db.query(Sector).filter(Sector.id.in_(sector_ids)).all() if sector_ids else []

    sector_outlook = []
    product_opportunities = []
    cleaned_dataset_count = 0
    raw_fallback_count = 0

    for sector in sectors:
        raw_rows = db.query(RawData).filter(
            RawData.sector_id == sector.id,
            RawData.uploaded_by.in_(uploader_ids if uploader_ids else [-1]),
        ).all()
        if not raw_rows:
            continue

        cleaned_rows = db.query(CleanedData)\
            .join(RawData, CleanedData.raw_data_id == RawData.id)\
            .filter(
                RawData.sector_id == sector.id,
                RawData.uploaded_by.in_(uploader_ids if uploader_ids else [-1]),
            ).all()

        if cleaned_rows:
            frames = [_records_to_dataframe(row.cleaned_data) for row in cleaned_rows]
            quality_values = [float(row.quality_score or 0) for row in cleaned_rows]
            source = "cleaned"
            cleaned_dataset_count += len(cleaned_rows)
            avg_quality = round((sum(quality_values) / max(len(quality_values), 1)) * 100, 2)
        else:
            frames = [_records_to_dataframe(row.data) for row in raw_rows]
            source = "raw"
            raw_fallback_count += len(raw_rows)
            avg_quality = 0.0

        df = pd.concat([frame for frame in frames if not frame.empty], ignore_index=True) if frames else pd.DataFrame()
        if df.empty:
            continue
        if avg_quality == 0.0:
            avg_quality = _quality_percent(df)

        growth = _growth_signal(df)
        confidence = round(min(100.0, max(15.0, avg_quality * 0.65 + min(abs(growth), 100) * 0.35)), 2)
        metric_total = round(float(np.nansum([abs(growth), confidence, avg_quality])), 2)
        investment_score = round(max(0.0, min(100.0, (growth * 0.45) + (confidence * 0.35) + (avg_quality * 0.20))), 2)
        top_product = _top_product_name(db, raw_rows)
        recommendation = _recommendation(growth, confidence, avg_quality)

        sector_entry = {
            "sector_id": sector.id,
            "sector_name": sector.name,
            "growth_percent": growth,
            "avg_quality": avg_quality,
            "confidence": confidence,
            "investment_score": investment_score,
            "metric_total": metric_total,
            "top_product": top_product,
            "recommendation": recommendation,
            "source": source,
            "source_datasets": len(raw_rows),
            "cleaned_datasets": len(cleaned_rows),
            "coverage_percent": round((len(cleaned_rows) / max(len(raw_rows), 1)) * 100, 2),
        }
        sector_outlook.append(sector_entry)
        product_opportunities.append({
            "sector_id": sector.id,
            "sector_name": sector.name,
            "product_name": top_product,
            "growth_percent": growth,
            "confidence": confidence,
            "investment_score": investment_score,
            "recommendation": recommendation,
            "source": source,
        })

    sector_outlook.sort(key=lambda item: item["investment_score"], reverse=True)
    product_opportunities.sort(key=lambda item: item["investment_score"], reverse=True)

    invest_count = sum(1 for item in sector_outlook if item["recommendation"] == "Invest")
    watch_count = sum(1 for item in sector_outlook if item["recommendation"] == "Watch")
    avoid_count = sum(1 for item in sector_outlook if item["recommendation"] == "Do Not Invest")
    avg_growth = round(sum(item["growth_percent"] for item in sector_outlook) / max(len(sector_outlook), 1), 2) if sector_outlook else 0
    avg_confidence = round(sum(item["confidence"] for item in sector_outlook) / max(len(sector_outlook), 1), 2) if sector_outlook else 0
    top_sector = sector_outlook[0]["sector_name"] if sector_outlook else None
    top_product = product_opportunities[0]["product_name"] if product_opportunities else None
    top_product_sector = product_opportunities[0]["sector_name"] if product_opportunities else None

    timeline = []
    actual = max(avg_growth, 0)
    for index in range(6):
        projected = round(actual * (1 + (0.03 * (index + 1))) + (avg_confidence / 25), 2)
        timeline.append({
            "period": f"M{index + 1}",
            "actual": round(actual, 2),
            "projected": projected,
        })
        actual = projected

    recommendations = [
        {
            "sector_name": item["sector_name"],
            "product_name": item["top_product"],
            "recommendation": item["recommendation"],
            "confidence": item["confidence"],
            "rationale": (
                f"{item['sector_name']} has {item['growth_percent']}% growth signal, "
                f"{item['avg_quality']}% data quality, and {item['confidence']}% confidence from {item['source']} data."
            ),
        }
        for item in sector_outlook[:6]
    ]

    return {
        "summary": {
            "sector_count": len(sector_outlook),
            "projected_growth_percent": avg_growth,
            "avg_confidence": avg_confidence,
            "invest_count": invest_count,
            "watch_count": watch_count,
            "avoid_count": avoid_count,
            "top_sector": top_sector,
            "top_product": top_product,
            "top_product_sector": top_product_sector,
            "cleaned_datasets": cleaned_dataset_count,
            "raw_fallback_datasets": raw_fallback_count,
        },
        "timeline": timeline,
        "sector_outlook": sector_outlook,
        "product_opportunities": product_opportunities,
        "recommendations": recommendations,
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
