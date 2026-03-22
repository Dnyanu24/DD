from collections import defaultdict
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import Optional, List, Dict, Any, Tuple
from pydantic import BaseModel
from app.database import SessionLocal
from app.models import (
    AIPrediction,
    AIRecommendation,
    Sector,
    RawData,
    CleanedData,
    User,
    Product,
    CompanyAnnouncement,
    PipelineIterationLog,
    MetaLearningExperience,
)
from app.services.ai_predictions import AIPredictionEngine
from app.services.feedback_engine import FeedbackEngine
from app.services.meta_learner import MetaLearner
from app.services.rag_retriever import RagIndex, RagChunk, build_software_chunks, format_dataset_table
from app.dependencies import get_current_user, require_sector_head, require_ceo

router = APIRouter()


class ChatRequest(BaseModel):
    message: str
    page: Optional[str] = None
    dataset_id: Optional[int] = None


class ChatResponse(BaseModel):
    reply: str
    suggestions: List[str]
    sources: Optional[List[Dict[str, Any]]] = None


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
    # Company-scope access for shared data (role/sector filters still apply elsewhere).
    return [row[0] for row in db.query(User.id).filter(User.company_id == current_user.company_id).all()]


_RAG_CACHE: Dict[Tuple[int, Optional[int]], Dict[str, Any]] = {}


def _clip(text: str, limit: int = 280) -> str:
    s = (text or "").strip()
    if len(s) <= limit:
        return s
    return (s[:limit].rsplit(" ", 1)[0] or s[:limit]).strip() + "..."


def _rag_state_fingerprint(db: Session, company_id: int) -> str:
    """
    Cheap DB fingerprint to refresh cached RAG index when core tables change.
    """
    def _max_iso(model, attr: str) -> str:
        try:
            row = db.query(getattr(model, attr)).order_by(getattr(model, attr).desc()).first()
            value = row[0] if row else None
            return value.isoformat() if value else ""
        except Exception:
            return ""

    parts = [
        _max_iso(RawData, "uploaded_at"),
        _max_iso(CleanedData, "cleaned_at"),
        _max_iso(CompanyAnnouncement, "created_at"),
        _max_iso(PipelineIterationLog, "created_at"),
        _max_iso(MetaLearningExperience, "created_at"),
    ]
    return "|".join(parts)


def _build_database_chunks(
    db: Session,
    *,
    current_user: User,
    sector_ids: List[int],
    uploader_ids: List[int],
    total_raw: int,
    total_cleaned: int,
    latest_raw: Optional[RawData],
    latest_cleaned: Optional[CleanedData],
    schema_preview: str,
) -> List[RagChunk]:
    now = datetime.utcnow().isoformat()
    latest_quality = round((latest_cleaned.quality_score * 100), 2) if latest_cleaned else 0.0
    chunks: List[RagChunk] = []

    chunks.append(
        RagChunk(
            chunk_id="db:overview",
            source="database",
            title="Database Overview",
            text=(
                f"Uploaded datasets: {total_raw}. Cleaned datasets: {total_cleaned}. "
                f"Latest upload id: {getattr(latest_raw, 'id', None)}. "
                f"Latest cleaned quality: {latest_quality}%. "
                f"Recent schema columns: {schema_preview}."
            ),
            meta={"company_id": current_user.company_id, "updated_at": now},
        )
    )

    # Recent cleaned datasets (top N)
    try:
        cleaned_rows = (
            db.query(CleanedData)
            .join(RawData, CleanedData.raw_data_id == RawData.id)
            .filter(RawData.sector_id.in_(sector_ids), RawData.uploaded_by.in_(uploader_ids))
            .order_by(CleanedData.cleaned_at.desc())
            .limit(12)
            .all()
        )
        table_rows = []
        for row in cleaned_rows:
            records = row.cleaned_data if isinstance(row.cleaned_data, list) else []
            cols = list(records[0].keys()) if records and isinstance(records[0], dict) else []
            table_rows.append(
                {
                    "cleaned_data_id": row.id,
                    "row_count": len(records),
                    "column_count": len(cols),
                    "columns": cols,
                    "quality_score": float(row.quality_score or 0.0),
                    "algorithm": row.cleaning_algorithm,
                }
            )
        chunks.append(
            RagChunk(
                chunk_id="db:recent_cleaned",
                source="database",
                title="Recent Cleaned Datasets",
                text="Recent cleaned datasets:\n" + format_dataset_table(table_rows, limit=8),
                meta={"company_id": current_user.company_id, "updated_at": now},
            )
        )
    except Exception:
        pass

    # Recent announcements
    try:
        rows = (
            db.query(CompanyAnnouncement)
            .filter(CompanyAnnouncement.company_id == current_user.company_id)
            .order_by(CompanyAnnouncement.created_at.desc())
            .limit(5)
            .all()
        )
        if rows:
            lines = []
            for row in rows:
                created = row.created_at.isoformat() if row.created_at else ""
                lines.append(f"- {row.title}: {row.message} ({created})")
            chunks.append(
                RagChunk(
                    chunk_id="db:announcements",
                    source="database",
                    title="Company Announcements",
                    text="Recent announcements:\n" + "\n".join(lines),
                    meta={"company_id": current_user.company_id, "updated_at": now},
                )
            )
    except Exception:
        pass

    # Self-learning / iterations
    try:
        rows = (
            db.query(PipelineIterationLog)
            .filter(PipelineIterationLog.company_id == current_user.company_id)
            .order_by(PipelineIterationLog.created_at.desc())
            .limit(8)
            .all()
        )
        if rows:
            lines = []
            for row in rows:
                created = row.created_at.isoformat() if row.created_at else ""
                score = row.metrics.get("cleaned_percent") if isinstance(row.metrics, dict) else None
                lines.append(f"- task={row.task} status={row.status} score={score} at={created}")
            chunks.append(
                RagChunk(
                    chunk_id="db:pipeline_iterations",
                    source="database",
                    title="Pipeline Iteration Logs",
                    text="Recent iteration logs:\n" + "\n".join(lines),
                    meta={"company_id": current_user.company_id, "updated_at": now},
                )
            )
    except Exception:
        pass

    # Meta-learning experiences
    try:
        rows = (
            db.query(MetaLearningExperience)
            .filter(MetaLearningExperience.company_id == current_user.company_id)
            .order_by(MetaLearningExperience.created_at.desc())
            .limit(5)
            .all()
        )
        if rows:
            lines = []
            for row in rows:
                created = row.created_at.isoformat() if row.created_at else ""
                best_cfg = row.best_config or {}
                lines.append(f"- exp_id={row.id} sector_id={row.sector_id} cfg_keys={list(best_cfg.keys())[:6]} at={created}")
            chunks.append(
                RagChunk(
                    chunk_id="db:meta_learning",
                    source="database",
                    title="Meta-Learning Experiences",
                    text="Recent meta-learning records:\n" + "\n".join(lines),
                    meta={"company_id": current_user.company_id, "updated_at": now},
                )
            )
    except Exception:
        pass

    return chunks


def _get_rag_index(db: Session, *, current_user: User) -> RagIndex:
    company_id = int(current_user.company_id)
    sector_key = int(current_user.sector_id) if getattr(current_user, "sector_id", None) is not None else None
    cache_key = (company_id, sector_key)
    fp = _rag_state_fingerprint(db, company_id)

    cached = _RAG_CACHE.get(cache_key)
    if cached and cached.get("fingerprint") == fp and isinstance(cached.get("index"), RagIndex):
        return cached["index"]

    # Build a base index with software + company database chunks (fast, cached).
    sector_ids = _allowed_sector_ids(db, current_user) or [-1]
    uploader_ids = _allowed_uploader_ids(db, current_user) or [-1]
    total_raw = db.query(RawData).filter(RawData.sector_id.in_(sector_ids), RawData.uploaded_by.in_(uploader_ids)).count()
    total_cleaned = (
        db.query(CleanedData)
        .join(RawData, CleanedData.raw_data_id == RawData.id)
        .filter(RawData.sector_id.in_(sector_ids), RawData.uploaded_by.in_(uploader_ids))
        .count()
    )
    latest_raw = (
        db.query(RawData)
        .filter(RawData.sector_id.in_(sector_ids), RawData.uploaded_by.in_(uploader_ids))
        .order_by(RawData.uploaded_at.desc())
        .first()
    )
    latest_cleaned = (
        db.query(CleanedData)
        .join(RawData, CleanedData.raw_data_id == RawData.id)
        .filter(RawData.sector_id.in_(sector_ids), RawData.uploaded_by.in_(uploader_ids))
        .order_by(CleanedData.cleaned_at.desc())
        .first()
    )

    recent_raw = (
        db.query(RawData)
        .filter(RawData.sector_id.in_(sector_ids), RawData.uploaded_by.in_(uploader_ids))
        .order_by(RawData.uploaded_at.desc())
        .limit(20)
        .all()
    )
    schema_cols = set()
    for item in recent_raw:
        if isinstance(item.data, list) and item.data and isinstance(item.data[0], dict):
            schema_cols.update(item.data[0].keys())
    schema_preview = ", ".join(sorted(list(schema_cols))[:10]) if schema_cols else "no columns detected"

    chunks: List[RagChunk] = []
    chunks.extend(build_software_chunks())
    chunks.extend(
        _build_database_chunks(
            db,
            current_user=current_user,
            sector_ids=sector_ids,
            uploader_ids=uploader_ids,
            total_raw=total_raw,
            total_cleaned=total_cleaned,
            latest_raw=latest_raw,
            latest_cleaned=latest_cleaned,
            schema_preview=schema_preview,
        )
    )

    index = RagIndex(chunks).fit()
    _RAG_CACHE[cache_key] = {"fingerprint": fp, "index": index}
    return index


def _ensure_sector_access(db: Session, current_user: User, sector_id: int) -> None:
    if sector_id not in _allowed_sector_ids(db, current_user):
        raise HTTPException(status_code=403, detail="Access denied")


def _company_sector_ids(db: Session, current_user: User) -> List[int]:
    return [row[0] for row in db.query(Sector.id).filter(Sector.company_id == current_user.company_id).all()]


def _safe_float(value) -> Optional[float]:
    if value is None or isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    try:
        cleaned = str(value).replace(",", "").strip()
        if cleaned == "":
            return None
        return float(cleaned)
    except (TypeError, ValueError):
        return None


def _to_json_safe_records(df):
    import numpy as np
    import pandas as pd

    if df is None or not isinstance(df, pd.DataFrame):
        return []

    safe_df = df.copy()
    for col in safe_df.columns:
        if pd.api.types.is_datetime64_any_dtype(safe_df[col]):
            safe_df[col] = safe_df[col].dt.strftime("%Y-%m-%dT%H:%M:%S")
    safe_df = safe_df.where(pd.notnull(safe_df), None)

    records = safe_df.to_dict("records")
    normalized = []
    for row in records:
        if not isinstance(row, dict):
            continue
        normalized_row = {}
        for key, value in row.items():
            if isinstance(value, pd.Timestamp):
                normalized_row[key] = value.isoformat()
            elif isinstance(value, np.generic):
                normalized_row[key] = value.item()
            else:
                normalized_row[key] = value
        normalized.append(normalized_row)
    return normalized


def _quality_score_from_df(df) -> float:
    import pandas as pd

    if df is None or not isinstance(df, pd.DataFrame) or df.shape[0] == 0:
        return 0.0
    total_cells = max(int(df.shape[0]) * max(int(df.shape[1]), 1), 1)
    missing_cells = int(df.isna().sum().sum())
    return float(max(0.0, min(1.0, 1 - (missing_cells / total_cells))))


def _extract_dataset_signal(records: List[dict]) -> dict:
    if not isinstance(records, list) or not records:
        return {"metric_value": 0.0, "metric_key": "rows", "metric_label": "Rows"}

    preferred_keywords = ["revenue", "sales", "amount", "total", "profit", "demand", "quantity", "qty", "units"]
    scored_columns = []
    columns = set()
    for row in records:
        if isinstance(row, dict):
            columns.update(row.keys())

    for column in columns:
        numeric_values = []
        column_key = str(column).lower()
        for row in records:
            if not isinstance(row, dict):
                continue
            numeric_value = _safe_float(row.get(column))
            if numeric_value is not None:
                numeric_values.append(numeric_value)
        if not numeric_values:
            continue
        keyword_bonus = 0
        for index, keyword in enumerate(preferred_keywords):
            if keyword in column_key:
                keyword_bonus = len(preferred_keywords) - index
                break
        scored_columns.append(
            {
                "column": str(column),
                "score": keyword_bonus * 1000 + len(numeric_values),
                "sum": float(sum(numeric_values)),
            }
        )

    if scored_columns:
        chosen = sorted(scored_columns, key=lambda item: item["score"], reverse=True)[0]
        return {
            "metric_value": round(chosen["sum"], 2),
            "metric_key": chosen["column"],
            "metric_label": chosen["column"].replace("_", " ").title(),
        }

    return {"metric_value": float(len(records)), "metric_key": "rows", "metric_label": "Rows"}


def _estimate_records_quality(records: List[dict]) -> float:
    if not isinstance(records, list) or not records:
        return 0.0
    dict_rows = [row for row in records if isinstance(row, dict)]
    if not dict_rows:
        return 0.0
    total_cells = max(len(dict_rows) * max(len(dict_rows[0].keys()), 1), 1)
    missing_cells = sum(
        1
        for row in dict_rows
        for value in row.values()
        if value in [None, ""]
    )
    return round(max(0.0, 1 - (missing_cells / total_cells)), 4)


def _recent_growth_percent(series: List[float]) -> float:
    if not series:
        return 0.0
    recent = sum(series[-2:])
    baseline = sum(series[-4:-2]) if len(series) >= 4 else sum(series[:-2])
    if baseline > 0:
        return round(((recent - baseline) / baseline) * 100, 2)
    if recent > 0:
        return 18.0
    return 0.0


def _confidence_score(avg_quality: float, cleaned_datasets: int, total_datasets: int) -> float:
    coverage = cleaned_datasets / max(total_datasets, 1)
    confidence = 0.35 + (avg_quality * 0.4) + (min(cleaned_datasets / 5, 1.0) * 0.15) + (coverage * 0.1)
    return round(min(max(confidence, 0.05), 0.98), 2)


def _investment_signal(growth_percent: float, avg_quality: float, cleaned_datasets: int, total_datasets: int) -> dict:
    coverage = (cleaned_datasets / max(total_datasets, 1)) * 100
    growth_score = min(max((growth_percent + 20) / 55, 0), 1) * 100
    quality_score = avg_quality * 100
    investment_score = round((growth_score * 0.45) + (quality_score * 0.35) + (coverage * 0.2), 2)
    confidence = _confidence_score(avg_quality, cleaned_datasets, total_datasets)

    if investment_score >= 70 and growth_percent >= 8 and avg_quality >= 0.75:
        stance = "Invest"
    elif investment_score >= 52 and growth_percent >= 0:
        stance = "Watch"
    else:
        stance = "Do Not Invest"

    return {
        "investment_score": investment_score,
        "confidence": confidence,
        "stance": stance,
        "coverage_percent": round(coverage, 2),
    }


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
    current_user: User = Depends(require_ceo)
):
    """Company-wide growth outlook for CEO dashboards using cleaned datasets and product-sector signals."""
    sector_ids = _company_sector_ids(db, current_user)
    if not sector_ids:
        return {
            "generated_at": datetime.utcnow().isoformat(),
            "summary": {},
            "timeline": [],
            "sector_outlook": [],
            "product_opportunities": [],
            "recommendations": [],
        }

    raw_rows = db.query(RawData, Sector, Product)\
        .join(Sector, RawData.sector_id == Sector.id)\
        .outerjoin(Product, Product.id == RawData.product_id)\
        .filter(RawData.sector_id.in_(sector_ids))\
        .all()

    cleaned_rows = db.query(CleanedData, RawData, Sector, Product)\
        .join(RawData, CleanedData.raw_data_id == RawData.id)\
        .join(Sector, RawData.sector_id == Sector.id)\
        .outerjoin(Product, Product.id == RawData.product_id)\
        .filter(
            RawData.sector_id.in_(sector_ids),
            ~CleanedData.cleaning_algorithm.contains("__sector__"),
        )\
        .all()

    if not raw_rows:
        return {
            "generated_at": datetime.utcnow().isoformat(),
            "summary": {
                "message": "No sector datasets available for company-wide growth prediction.",
                "sector_count": len(sector_ids),
                "cleaned_datasets": 0,
            },
            "timeline": [],
            "sector_outlook": [],
            "product_opportunities": [],
            "recommendations": [],
        }

    now = datetime.utcnow()
    period_keys = []
    year = now.year
    month = now.month
    for offset in range(5, -1, -1):
        calc_month = month - offset
        calc_year = year
        while calc_month <= 0:
            calc_month += 12
            calc_year -= 1
        period_keys.append(f"{calc_year:04d}-{calc_month:02d}")

    sector_totals = defaultdict(lambda: {
        "sector_name": "Unknown",
        "cleaned_datasets": 0,
        "source_datasets": 0,
        "total_datasets": 0,
        "metric_total": 0.0,
        "quality_sum": 0.0,
        "periods": defaultdict(float),
        "products": defaultdict(lambda: {
            "product_name": "Unassigned",
            "metric_total": 0.0,
            "quality_sum": 0.0,
            "cleaned_datasets": 0,
            "source_datasets": 0,
            "periods": defaultdict(float),
        }),
    })
    timeline_totals = defaultdict(lambda: {"metric_total": 0.0, "quality_sum": 0.0, "datasets": 0})

    cleaned_by_raw_id = {raw.id: cleaned for cleaned, raw, _sector, _product in cleaned_rows}
    raw_count_by_sector = defaultdict(int)
    source_mix = {"cleaned": 0, "raw": 0}
    for raw, sector, _product in raw_rows:
        raw_count_by_sector[sector.id] += 1
        cleaned = cleaned_by_raw_id.get(raw.id)
        records = cleaned.cleaned_data if cleaned and isinstance(cleaned.cleaned_data, list) else (raw.data if isinstance(raw.data, list) else [])
        signal = _extract_dataset_signal(records)
        effective_quality = float(cleaned.quality_score or 0) if cleaned else _estimate_records_quality(records)
        period_key = ((cleaned.cleaned_at if cleaned else None) or raw.uploaded_at or now).strftime("%Y-%m")
        product_name = product.name if product else "Unassigned"
        source_mix["cleaned" if cleaned else "raw"] += 1

        sector_bucket = sector_totals[sector.id]
        sector_bucket["sector_name"] = sector.name
        sector_bucket["cleaned_datasets"] += 1 if cleaned else 0
        sector_bucket["source_datasets"] += 1
        sector_bucket["metric_total"] += signal["metric_value"]
        sector_bucket["quality_sum"] += effective_quality
        sector_bucket["periods"][period_key] += signal["metric_value"]

        product_bucket = sector_bucket["products"][raw.product_id or 0]
        product_bucket["product_name"] = product_name
        product_bucket["metric_total"] += signal["metric_value"]
        product_bucket["quality_sum"] += effective_quality
        product_bucket["cleaned_datasets"] += 1 if cleaned else 0
        product_bucket["source_datasets"] += 1
        product_bucket["periods"][period_key] += signal["metric_value"]

        timeline_totals[period_key]["metric_total"] += signal["metric_value"]
        timeline_totals[period_key]["quality_sum"] += effective_quality
        timeline_totals[period_key]["datasets"] += 1

    sector_outlook = []
    product_opportunities = []
    recommendations = []

    for sector_id, sector_bucket in sector_totals.items():
        sector_bucket["total_datasets"] = raw_count_by_sector.get(sector_id, sector_bucket["cleaned_datasets"])
        sector_series = [round(sector_bucket["periods"].get(period_key, 0.0), 2) for period_key in period_keys]
        sector_growth = _recent_growth_percent(sector_series)
        avg_quality = sector_bucket["quality_sum"] / max(sector_bucket["source_datasets"], 1)
        investment = _investment_signal(
            growth_percent=sector_growth,
            avg_quality=avg_quality,
            cleaned_datasets=sector_bucket["source_datasets"],
            total_datasets=sector_bucket["total_datasets"],
        )

        ranked_products = []
        for product_id, product_bucket in sector_bucket["products"].items():
            product_series = [round(product_bucket["periods"].get(period_key, 0.0), 2) for period_key in period_keys]
            product_growth = _recent_growth_percent(product_series)
            product_quality = product_bucket["quality_sum"] / max(product_bucket["source_datasets"], 1)
            product_signal = _investment_signal(
                growth_percent=product_growth,
                avg_quality=product_quality,
                cleaned_datasets=product_bucket["source_datasets"],
                total_datasets=sector_bucket["total_datasets"],
            )
            product_row = {
                "product_id": product_id or None,
                "product_name": product_bucket["product_name"],
                "sector_id": sector_id,
                "sector_name": sector_bucket["sector_name"],
                "growth_percent": round(product_growth, 2),
                "quality_score": round(product_quality * 100, 2),
                "confidence": round(product_signal["confidence"] * 100, 2),
                "recommendation": product_signal["stance"],
                "investment_score": product_signal["investment_score"],
                "metric_total": round(product_bucket["metric_total"], 2),
                "source": "mixed" if product_bucket["cleaned_datasets"] and product_bucket["cleaned_datasets"] < product_bucket["source_datasets"] else ("cleaned" if product_bucket["cleaned_datasets"] else "raw"),
            }
            ranked_products.append(product_row)
            product_opportunities.append(product_row)

        ranked_products.sort(key=lambda item: (item["investment_score"], item["growth_percent"]), reverse=True)
        top_product = ranked_products[0] if ranked_products else None

        sector_row = {
            "sector_id": sector_id,
            "sector_name": sector_bucket["sector_name"],
            "growth_percent": round(sector_growth, 2),
            "avg_quality": round(avg_quality * 100, 2),
            "confidence": round(investment["confidence"] * 100, 2),
            "recommendation": investment["stance"],
            "investment_score": investment["investment_score"],
            "coverage_percent": investment["coverage_percent"],
            "cleaned_datasets": sector_bucket["cleaned_datasets"],
            "source_datasets": sector_bucket["source_datasets"],
            "total_datasets": sector_bucket["total_datasets"],
            "metric_total": round(sector_bucket["metric_total"], 2),
            "top_product": top_product["product_name"] if top_product else "Unassigned",
            "top_product_growth": top_product["growth_percent"] if top_product else 0,
            "source": "mixed" if sector_bucket["cleaned_datasets"] and sector_bucket["cleaned_datasets"] < sector_bucket["source_datasets"] else ("cleaned" if sector_bucket["cleaned_datasets"] else "raw"),
        }
        sector_outlook.append(sector_row)
        recommendations.append(
            {
                "sector_name": sector_row["sector_name"],
                "product_name": sector_row["top_product"],
                "recommendation": sector_row["recommendation"],
                "confidence": sector_row["confidence"],
                "rationale": (
                    f"{sector_row['sector_name']} shows {sector_row['growth_percent']}% projected momentum "
                    f"with {sector_row['avg_quality']}% data quality from {sector_row['source']} database inputs. "
                    f"Top product: {sector_row['top_product']}."
                ),
            }
        )

    sector_outlook.sort(key=lambda item: (item["investment_score"], item["growth_percent"]), reverse=True)
    product_opportunities.sort(key=lambda item: (item["investment_score"], item["growth_percent"]), reverse=True)
    recommendations.sort(key=lambda item: item["confidence"], reverse=True)

    timeline = []
    timeline_values = [round(timeline_totals[period_key]["metric_total"], 2) for period_key in period_keys]
    company_growth = _recent_growth_percent(timeline_values)
    projection_multiplier = 1 + max(min(company_growth / 100, 0.35), -0.2)

    for index, period_key in enumerate(period_keys):
        period_year, period_month = period_key.split("-")
        period_dt = datetime(int(period_year), int(period_month), 1)
        bucket = timeline_totals[period_key]
        avg_quality = (bucket["quality_sum"] / bucket["datasets"]) if bucket["datasets"] else 0.0
        actual_value = round(bucket["metric_total"], 2)
        projected_value = round(actual_value * projection_multiplier, 2)
        timeline.append(
            {
                "period": period_dt.strftime("%b"),
                "period_key": period_key,
                "actual": actual_value,
                "projected": projected_value,
                "quality": round(avg_quality * 100, 2),
                "datasets": bucket["datasets"],
            }
        )

    invest_count = sum(1 for row in sector_outlook if row["recommendation"] == "Invest")
    watch_count = sum(1 for row in sector_outlook if row["recommendation"] == "Watch")
    avoid_count = sum(1 for row in sector_outlook if row["recommendation"] == "Do Not Invest")
    best_sector = sector_outlook[0] if sector_outlook else None
    best_product = product_opportunities[0] if product_opportunities else None
    avg_confidence = round(
        sum(row["confidence"] for row in sector_outlook) / max(len(sector_outlook), 1),
        2,
    )

    return {
        "generated_at": now.isoformat(),
        "summary": {
            "projected_growth_percent": round(company_growth, 2),
            "avg_confidence": avg_confidence,
            "invest_count": invest_count,
            "watch_count": watch_count,
            "avoid_count": avoid_count,
            "cleaned_datasets": len(cleaned_rows),
            "raw_fallback_datasets": source_mix["raw"],
            "mixed_source_datasets": source_mix["cleaned"] + source_mix["raw"],
            "sector_count": len(sector_outlook),
            "top_sector": best_sector["sector_name"] if best_sector else None,
            "top_product": best_product["product_name"] if best_product else None,
            "top_product_sector": best_product["sector_name"] if best_product else None,
            "data_source": "cleaned_and_raw_database",
        },
        "timeline": timeline,
        "sector_outlook": sector_outlook,
        "product_opportunities": product_opportunities[:8],
        "recommendations": recommendations[:6],
    }


@router.post("/chat", response_model=ChatResponse)
async def chat_assistant(
    payload: ChatRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    RAG-style assistant for SDAS (no external LLM required):
    - Retrieves relevant "software" + "database" chunks (TF-IDF).
    - Adds live database stats (counts, latest quality).
    - Optionally adds dataset-specific context using dataset_id (raw_data id).
    """
    raw_message = (payload.message or "").strip()
    text = raw_message.lower()
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
            "sources": [],
        }

    sector_ids = _allowed_sector_ids(db, current_user) or []
    uploader_ids = _allowed_uploader_ids(db, current_user) or []
    if not sector_ids or not uploader_ids:
        sector_ids = [-1]
        uploader_ids = [-1]

    total_raw = db.query(RawData).filter(RawData.sector_id.in_(sector_ids), RawData.uploaded_by.in_(uploader_ids)).count()
    total_cleaned = (
        db.query(CleanedData)
        .join(RawData, CleanedData.raw_data_id == RawData.id)
        .filter(RawData.sector_id.in_(sector_ids), RawData.uploaded_by.in_(uploader_ids))
        .count()
    )
    latest_raw = (
        db.query(RawData)
        .filter(RawData.sector_id.in_(sector_ids), RawData.uploaded_by.in_(uploader_ids))
        .order_by(RawData.uploaded_at.desc())
        .first()
    )
    latest_cleaned = (
        db.query(CleanedData)
        .join(RawData, CleanedData.raw_data_id == RawData.id)
        .filter(RawData.sector_id.in_(sector_ids), RawData.uploaded_by.in_(uploader_ids))
        .order_by(CleanedData.cleaned_at.desc())
        .first()
    )
    latest_quality = round((latest_cleaned.quality_score * 100), 2) if latest_cleaned else 0.0
    role_scope = "company-wide" if role_key in ["ceo", "admin"] else "role-limited"

    recent_raw = (
        db.query(RawData)
        .filter(RawData.sector_id.in_(sector_ids), RawData.uploaded_by.in_(uploader_ids))
        .order_by(RawData.uploaded_at.desc())
        .limit(20)
        .all()
    )
    schema_cols = set()
    for item in recent_raw:
        if isinstance(item.data, list) and item.data and isinstance(item.data[0], dict):
            schema_cols.update(item.data[0].keys())
    schema_preview = ", ".join(sorted(list(schema_cols))[:10]) if schema_cols else "no columns detected"

    # RAG retrieval (software + database index + optional dataset chunk).
    index = _get_rag_index(db, current_user=current_user)
    dataset_chunks: List[RagChunk] = []
    if payload.dataset_id:
        try:
            dataset_id = int(payload.dataset_id)
            raw_row = (
                db.query(RawData)
                .filter(
                    RawData.id == dataset_id,
                    RawData.sector_id.in_(sector_ids),
                    RawData.uploaded_by.in_(uploader_ids),
                )
                .first()
            )
            cleaned_row = (
                db.query(CleanedData)
                .filter(CleanedData.raw_data_id == dataset_id)
                .order_by(CleanedData.cleaned_at.desc())
                .first()
            )
            if raw_row:
                records = raw_row.data if isinstance(raw_row.data, list) else []
                cols = list(records[0].keys()) if records and isinstance(records[0], dict) else []
                total_cells = max(len(records) * max(len(cols), 1), 1)
                missing_cells = 0
                if records and isinstance(records[0], dict):
                    missing_cells = sum(
                        1
                        for r in records
                        for v in r.values()
                        if v in (None, "")
                    )
                miss_pct = round((missing_cells / total_cells) * 100.0, 2)
                q = round(float(cleaned_row.quality_score or 0.0) * 100.0, 2) if cleaned_row else None
                dataset_chunks.append(
                    RagChunk(
                        chunk_id=f"dataset:{dataset_id}",
                        source="dataset",
                        title=f"Dataset {dataset_id} Summary",
                        text=(
                            f"Dataset id {dataset_id} has {len(records)} rows and {len(cols)} columns. "
                            f"Columns: {', '.join([str(c) for c in cols[:20]])}. "
                            f"Raw missing cells: {miss_pct}%. "
                            f"Latest cleaned quality: {q}%." if q is not None else f"Dataset id {dataset_id} has {len(records)} rows and {len(cols)} columns."
                        ),
                        meta={"raw_data_id": dataset_id, "columns": cols[:50]},
                    )
                )
        except Exception:
            pass

    base_hits = index.search(raw_message, top_k=5)
    extra_hits = index.score_extra_chunks(raw_message, dataset_chunks, top_k=2)
    merged = {h.chunk.chunk_id: h for h in (base_hits + extra_hits)}
    ranked_hits = sorted(merged.values(), key=lambda h: h.score, reverse=True)
    sources = [
        {
            "id": h.chunk.chunk_id,
            "source": h.chunk.source,
            "title": h.chunk.title,
            "score": round(float(h.score), 4),
            "snippet": _clip(h.chunk.text, 220),
            "meta": h.chunk.meta,
        }
        for h in ranked_hits[:6]
    ]

    reply = ""
    suggestions: List[str] = []

    if any(keyword in text for keyword in ["all company", "all sectors", "all data"]) and role_key not in ["ceo", "admin"]:
        reply = (
            "You can access only your authorized role scope. "
            "Ask for insights from your assigned sector/company view."
        )
        suggestions = ["Show my accessible datasets", "What columns exist in my scope?", "How many cleaned datasets can I use?"]
    elif "upload" in text or "dataset" in text:
        reply = (
            f"Database totals ({role_scope}): uploaded={total_raw}, cleaned={total_cleaned}. "
            f"Latest upload id is {latest_raw.id if latest_raw else 'N/A'}. "
            f"Common columns in your scope: {schema_preview}."
        )
        suggestions = ["How do I clean the latest dataset?", "Which page lists uploaded data?", "Show data quality summary"]
    elif "clean" in text or "algorithm" in text or "quality" in text:
        reply = (
            f"Cleaning status: cleaned={total_cleaned}, latest quality={latest_quality}%. "
            "SDAS uses self-learning imputation selection (mean/median/KNN/regression) and records best configs for similar datasets."
        )
        suggestions = ["Start full pipeline cleaning", "Explain which imputation method was selected", "How does meta-learning help future cleaning?"]
    elif "visual" in text or "graph" in text or "chart" in text:
        reply = (
            "Visualizations are built from real SQLite values. "
            "Use the Visualizations page for sector vs sales, region distribution, scatter plots, distributions, and growth waves."
        )
        suggestions = ["Open visualizations", "Which chart shows data quality?", "How to improve low-quality datasets?"]
    elif "report" in text:
        reply = "Use Reports to view generated summaries and export outputs after cleaning and analysis steps."
        suggestions = ["Open reports page", "What data is included in reports?", "How to export report files?"]
    else:
        page_hint = f" on {payload.page}" if payload.page else ""
        reply = (
            f"I can help with uploads, cleaning, visualizations, roles, and reports{page_hint}. "
            f"Database totals in your scope: uploaded={total_raw}, cleaned={total_cleaned}, latest_quality={latest_quality}%."
        )
        suggestions = ["How to upload and clean a dataset?", "Show data quality summary", "How to view dashboard graphs?"]

    if ranked_hits:
        reply += "\n\nRelevant knowledge (RAG):"
        for hit in ranked_hits[:4]:
            reply += f"\n- {hit.chunk.title}: {_clip(hit.chunk.text, 220)}"

    if payload.dataset_id:
        reply += f"\n\nDataset context: dataset_id={payload.dataset_id}."

    return {"reply": reply, "suggestions": suggestions, "sources": sources}

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


@router.post("/predict/risk/optimized")
async def predict_risk_optimized(
    sector_id: int,
    features: List[str],
    target_column: str,
    max_iterations: int = 3,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_sector_head),
):
    """
    Risk prediction with cross-layer feedback optimization (few iterations).

    - Re-runs preprocessing/imputation when performance drops.
    - Logs each iteration to `pipeline_iteration_logs` (SQLite).
    - Saves the improved cleaned dataset back to `cleaned_data`.
    - Records the experience to the meta-learning config store.
    """

    _ensure_sector_access(db, current_user, sector_id)
    uploader_ids = _allowed_uploader_ids(db, current_user)
    if not uploader_ids:
        raise HTTPException(status_code=404, detail="No data available for optimization")

    raw_row = (
        db.query(RawData)
        .filter(RawData.sector_id == sector_id, RawData.uploaded_by.in_(uploader_ids))
        .order_by(RawData.uploaded_at.desc())
        .first()
    )
    if not raw_row:
        raise HTTPException(status_code=404, detail="No raw data available for optimization")

    import pandas as pd

    raw_df = pd.DataFrame(raw_row.data or [])
    if raw_df.shape[0] < 10:
        raise HTTPException(status_code=400, detail="Insufficient data for optimized risk prediction")

    engine = FeedbackEngine(
        db,
        company_id=current_user.company_id,
        sector_id=sector_id,
        task="risk_prediction",
        max_iterations=int(max_iterations),
    )

    try:
        run = engine.optimize_risk_prediction(raw_df, features=features, target_column=target_column)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Optimization failed: {str(e)}")

    if run.cleaned_df is None:
        raise HTTPException(status_code=500, detail="Optimization did not produce a cleaned dataset")

    cleaned_records = _to_json_safe_records(run.cleaned_df)
    quality_score = _quality_score_from_df(run.cleaned_df)

    cleaned_entry = CleanedData(
        raw_data_id=raw_row.id,
        cleaned_data=cleaned_records,
        cleaning_algorithm="feedback_optimized",
        quality_score=float(round(quality_score, 4)),
    )
    db.add(cleaned_entry)
    db.commit()
    db.refresh(cleaned_entry)

    prediction_entry = AIPrediction(
        sector_id=sector_id,
        prediction_type="risk_prediction",
        prediction_data=run.best_result,
        confidence=float(run.best_result.get("confidence", 0.5) or 0.5),
    )
    db.add(prediction_entry)
    db.commit()
    db.refresh(prediction_entry)

    # Store new experience for meta-learning warm starts.
    try:
        MetaLearner(db).record_experience(
            company_id=current_user.company_id,
            sector_id=sector_id,
            df=raw_df,
            best_config=run.best_cleaning_config,
            best_model={"model_type": run.best_result.get("model_type"), "params": {}},
            best_metrics=run.best_metrics,
            source_cleaned_data_id=cleaned_entry.id,
        )
    except Exception:
        pass

    return {
        **run.best_result,
        "optimization": {
            "run_key": run.run_key,
            "status": run.status,
            "iterations": run.iterations,
            "best_cleaning_config": run.best_cleaning_config,
            "best_score": round(run.best_score, 6),
            "baseline_previous_metrics": run.baseline_previous_metrics,
            "iteration_logs": run.logs,
            "saved_cleaned_data_id": cleaned_entry.id,
            "prediction_id": prediction_entry.id,
        },
    }

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
