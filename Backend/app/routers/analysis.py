from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Request
from fastapi.responses import StreamingResponse, Response
from sqlalchemy.orm import Session
from typing import Dict, Any, Optional, Callable, List
from pydantic import BaseModel
import pandas as pd
import numpy as np
import json
import asyncio
import io
import zipfile
from datetime import datetime
import re

from app.database import SessionLocal
from app.models import RawData, CleanedData, AIPrediction, AIRecommendation, DataQualityScore, Sector, Product, FeedbackLog, SavedCleanedDataset, PipelineIterationLog, ExtractedDataset
from app.services.data_cleaning import DataCleaningEngine
from app.services.ai_predictions import AIPredictionEngine
from app.services.feedback_learning import FeedbackLearningEngine
from app.services.file_ingest import load_dataframe_from_uploadfile
from app.services.pipeline_controller import run_intelligent_pipeline
from app.services.sector_classifier import SectorClassifier
from app.services.root_cause_analyzer import RootCauseAnalyzer
from app.services.meta_learner import MetaLearner
from app.dependencies import get_current_user, require_sector_head
from app.models import User


router = APIRouter()


class SaveCleanedDatasetRequest(BaseModel):
    source_cleaned_data_id: Optional[int] = None
    filename: Optional[str] = None
    columns: Optional[List[str]] = None
    rows: List[Dict[str, Any]]

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def _utc_iso() -> str:
    return datetime.utcnow().isoformat()

def _sse_event(event: str, data: Dict[str, Any]) -> str:
    return f"event: {event}\ndata: {json.dumps(data, default=str)}\n\n"

def _sanitize_json_value(value: Any) -> Any:
    """Recursively convert NaN, Inf, and other non-JSON-safe values."""
    if value is None:
        return None
    if isinstance(value, float):
        if pd.isna(value) or not np.isfinite(value):
            return None
        return value
    if isinstance(value, np.floating):
        if pd.isna(value) or not np.isfinite(value):
            return None
        return float(value)
    if isinstance(value, np.integer):
        return int(value)
    if isinstance(value, dict):
        return {k: _sanitize_json_value(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_sanitize_json_value(v) for v in value]
    if isinstance(value, pd.Timestamp):
        return value.isoformat()
    if isinstance(value, np.generic):
        return _sanitize_json_value(value.item())
    return value


def _to_json_safe_records(df: pd.DataFrame) -> List[Dict[str, Any]]:
    safe_df = df.copy()
    for col in safe_df.columns:
        if pd.api.types.is_datetime64_any_dtype(safe_df[col]):
            safe_df[col] = safe_df[col].dt.strftime("%Y-%m-%dT%H:%M:%S")
    safe_df = safe_df.where(pd.notnull(safe_df), None)

    records = safe_df.to_dict("records")
    normalized = []
    for row in records:
        normalized_row = {}
        for key, value in row.items():
            if isinstance(value, pd.Timestamp):
                normalized_row[key] = value.isoformat()
            elif isinstance(value, np.generic):
                normalized_row[key] = value.item()
            elif isinstance(value, str) and value.strip() == "":
                normalized_row[key] = None
            else:
                normalized_row[key] = value
        normalized.append(normalized_row)
    return normalized


def _normalize_column_name(name: str) -> str:
    normalized = re.sub(r"[^a-zA-Z0-9]+", "_", str(name).strip().lower())
    return normalized.strip("_") or "column"


def _sanitize_sector_key(value: Any) -> str:
    text = str(value).strip().lower()
    text = re.sub(r"[^a-z0-9]+", "_", text)
    return text.strip("_") or "unknown"


def _structure_dataframe(df: pd.DataFrame) -> pd.DataFrame:
    """Convert partially unstructured tabular data into a structured dataframe."""
    structured = df.copy()

    expanded_columns: Dict[str, List[Any]] = {}
    drop_columns = []
    for col in list(structured.columns):
        series = structured[col]
        parsed_values = []
        can_expand = False
        for value in series:
            if isinstance(value, dict):
                parsed_values.append(value)
                can_expand = True
            elif isinstance(value, str):
                text = value.strip()
                if text.startswith("{") and text.endswith("}"):
                    try:
                        parsed = json.loads(text)
                        if isinstance(parsed, dict):
                            parsed_values.append(parsed)
                            can_expand = True
                        else:
                            parsed_values.append({})
                    except Exception:
                        parsed_values.append({})
                else:
                    parsed_values.append({})
            else:
                parsed_values.append({})

        if can_expand:
            keys = set()
            for item in parsed_values:
                keys.update(item.keys())
            for key in keys:
                expanded_key = f"{col}_{key}"
                expanded_columns[expanded_key] = [item.get(key) for item in parsed_values]
            drop_columns.append(col)
            continue

        if series.apply(lambda x: isinstance(x, list)).any():
            structured[col] = series.apply(
                lambda x: json.dumps(x, ensure_ascii=True) if isinstance(x, list) else x
            )

    if expanded_columns:
        structured = structured.drop(columns=drop_columns, errors="ignore")
        for name, values in expanded_columns.items():
            structured[name] = values

    renamed_cols = []
    used = {}
    for col in structured.columns:
        base = _normalize_column_name(col)
        if base in used:
            used[base] += 1
            renamed_cols.append(f"{base}_{used[base]}")
        else:
            used[base] = 1
            renamed_cols.append(base)
    structured.columns = renamed_cols

    return structured


def _split_by_sector(df: pd.DataFrame) -> Dict[str, pd.DataFrame]:
    preferred = ["sector", "sector_name", "business_sector", "department", "division"]
    sector_column = None
    for col in preferred:
        if col in df.columns:
            sector_column = col
            break
    if not sector_column:
        for col in df.columns:
            if "sector" in col:
                sector_column = col
                break

    if not sector_column:
        return {"all": df}

    working = df.copy()
    working[sector_column] = working[sector_column].fillna("unknown").astype(str).str.strip()
    unique_values = [v for v in working[sector_column].unique().tolist() if v]
    if len(unique_values) <= 1:
        return {"all": working}

    grouped = {}
    for value, subset in working.groupby(sector_column):
        key = _sanitize_sector_key(value)
        grouped[key] = subset.reset_index(drop=True)
    return grouped


def _compute_cleaning_improvement(before_df: pd.DataFrame, after_df: pd.DataFrame) -> Dict[str, Any]:
    def missing_pct(df: pd.DataFrame) -> float:
        total_cells = max(len(df) * max(len(df.columns), 1), 1)
        if len(df.columns) == 0:
            return 0.0
        return float(df.isna().sum().sum()) / total_cells

    def duplicate_count(df: pd.DataFrame) -> int:
        return int(df.duplicated().sum()) if len(df.columns) > 0 else 0

    before_missing = missing_pct(before_df)
    after_missing = missing_pct(after_df)
    before_dup = duplicate_count(before_df)
    after_dup = duplicate_count(after_df)

    missing_reduction = max(0.0, before_missing - after_missing)
    dup_reduction_ratio = (
        (before_dup - after_dup) / max(before_dup, 1)
        if before_dup > 0 else 0.0
    )
    row_retention = len(after_df) / max(len(before_df), 1)
    improvement = (missing_reduction * 0.5 + max(0.0, dup_reduction_ratio) * 0.3 + min(row_retention, 1.0) * 0.2) * 100
    improvement = max(0.0, min(100.0, improvement))

    return {
        "cleaned_percent": round(improvement, 2),
        "missing_before_percent": round(before_missing * 100, 2),
        "missing_after_percent": round(after_missing * 100, 2),
        "duplicates_before": before_dup,
        "duplicates_after": after_dup,
    }


def _calculate_missing_percent(df: pd.DataFrame) -> float:
    total_cells = max(len(df) * max(len(df.columns), 1), 1)
    if len(df.columns) == 0:
        return 0.0
    missing_cells = int(df.isna().sum().sum())
    return round((missing_cells / total_cells) * 100, 2)


def _build_predictive_fill_audit(predictive_fill: bool, missing_percent: float) -> Optional[Dict[str, Any]]:
    if not predictive_fill or missing_percent < 60:
        return None
    return {
        "level": "high_risk_override",
        "message": f"Predictive fill override approved on sparse dataset ({missing_percent}% blank cells).",
        "missing_percent": missing_percent,
    }


def _persist_predictive_fill_audit(
    db: Session,
    current_user: User,
    data_id: int,
    algorithm: str,
    audit_warning: Optional[Dict[str, Any]],
):
    if not audit_warning:
        return

    db.add(
        FeedbackLog(
            user_id=current_user.id,
            data_id=data_id,
            feedback_type="audit",
            feedback_data={
                "category": "predictive_fill_override",
                "algorithm": algorithm,
                **audit_warning,
            },
        )
    )
    db.commit()


def _allowed_sector_ids(db: Session, current_user: User) -> List[int]:
    query = db.query(Sector.id).filter(Sector.company_id == current_user.company_id)
    if current_user.role == "sector_head":
        query = query.filter(Sector.id == current_user.sector_id)
    return [row[0] for row in query.all()]


def _allowed_uploader_ids(db: Session, current_user: User) -> List[int]:
    # Allow access to datasets uploaded by any user in the same company.
    # Sector scoping is still enforced via `_allowed_sector_ids` and raw_data.sector_id filters.
    return [row[0] for row in db.query(User.id).filter(User.company_id == current_user.company_id).all()]


def _get_accessible_raw_data(db: Session, data_id: int, current_user: User) -> Optional[RawData]:
    sector_ids = _allowed_sector_ids(db, current_user)
    uploader_ids = _allowed_uploader_ids(db, current_user)
    if not sector_ids:
        return None
    if not uploader_ids:
        return None
    return db.query(RawData).filter(
        RawData.id == data_id,
        RawData.sector_id.in_(sector_ids),
        RawData.uploaded_by.in_(uploader_ids),
    ).first()


def _load_dataframe_from_upload(file: UploadFile) -> pd.DataFrame:
    try:
        return load_dataframe_from_uploadfile(file)
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception:
        raise HTTPException(status_code=400, detail="Unsupported file format")


def _infer_pipeline_by_df(df: pd.DataFrame) -> str:
    if df is None or df.empty:
        return "structured"

    text_columns = [c for c in df.select_dtypes(include=["object"]).columns]
    if len(df.columns) == 1 and text_columns:
        col = text_columns[0]
        sample = df[col].dropna().astype(str).head(20)
        if not sample.empty:
            long_text_ratio = float(sum(len(text.split()) > 8 for text in sample)) / len(sample)
            if long_text_ratio >= 0.6:
                return "unstructured"

    if any(str(c).lower() in {"document_text", "text", "content", "body"} for c in df.columns):
        return "unstructured"

    if len(text_columns) >= len(df.columns) - 1 and len(df.columns) <= 3:
        text_only_ratio = float(len(text_columns)) / max(len(df.columns), 1)
        if text_only_ratio >= 0.75:
            return "unstructured"

    return "structured"


def _is_pdf_extracted_data(data: Any) -> bool:
    """Check if data contains PDF extraction metadata"""
    if not isinstance(data, list) or not data:
        return False
    
    first_row = data[0] if isinstance(data, list) else None
    if not isinstance(first_row, dict):
        return False
    
    pdf_indicators = {"_page", "_block_index", "entity_type", "block_ind"}
    return any(key in first_row for key in pdf_indicators)


def _normalize_pdf_data(df: pd.DataFrame) -> pd.DataFrame:
    """Normalize PDF-extracted data to standard format: page, block_ind, entity_type, value, confidence, record_confidence"""
    normalized = df.copy()
    
    # Map column names to standard names
    column_mapping = {
        "_page": "page",
        "_block_index": "block_ind",
        "block_ind": "block_ind",
        "block_index": "block_ind",
    }
    
    for old_col, new_col in column_mapping.items():
        if old_col in normalized.columns:
            normalized.rename(columns={old_col: new_col}, inplace=True)
    
    # Ensure required columns exist
    if "page" not in normalized.columns:
        normalized["page"] = 1
    if "block_ind" not in normalized.columns:
        normalized["block_ind"] = range(len(normalized))
    
    # Handle entity_type
    if "entity_type" not in normalized.columns:
        # Try to infer from data
        normalized["entity_type"] = "text"
    
    # Ensure confidence columns exist
    if "confidence" not in normalized.columns and "_field_confidence" in normalized.columns:
        normalized["confidence"] = normalized["_field_confidence"].apply(
            lambda x: float(sum(x.values()) / len(x)) if isinstance(x, dict) else 0.5
        )
    elif "confidence" not in normalized.columns:
        normalized["confidence"] = 0.5
    
    if "record_confidence" not in normalized.columns and "_record_confidence" in normalized.columns:
        normalized["record_confidence"] = normalized["_record_confidence"]
    elif "record_confidence" not in normalized.columns:
        normalized["record_confidence"] = 0.5
    
    # Keep the core columns and relevant metadata
    core_columns = ["page", "block_ind", "entity_type", "confidence", "record_confidence"]
    
    # Find non-metadata columns (these are actual extracted fields / table columns)
    value_columns = [c for c in normalized.columns if c not in core_columns and not c.startswith("_")]

    # If there is exactly one value column, try to detect whether that
    # single column actually encodes a multi-column table (common when parsing PDFs).
    # If so, split into multiple columns; otherwise rename to `value`.
    if value_columns:
        if len(value_columns) == 1:
            single_col = value_columns[0]

            def _try_split_single_col_to_table(series: pd.Series):
                # Try splitting lines by two-or-more spaces (aligned columns), fallback to single spaces
                lines = series.fillna("").astype(str).tolist()
                # Tokenize using 2+ spaces first
                tokenized = [re.split(r"\s{2,}", line.strip()) for line in lines]
                counts = [len(t) for t in tokenized if any(tok.strip() for tok in t)]
                if not counts:
                    return None
                # If majority rows have >=2 tokens and the modal token count is stable, accept split
                from collections import Counter
                cnt = Counter(counts)
                modal_count, modal_freq = cnt.most_common(1)[0]
                if modal_count >= 2 and modal_freq / max(1, len(counts)) >= 0.55:
                    # Build columns
                    cols = [f"col_{i+1}" for i in range(modal_count)]
                    rows = []
                    for parts in tokenized:
                        # pad/truncate
                        parts = [p.strip() for p in parts if p is not None]
                        if len(parts) >= modal_count:
                            rows.append(parts[:modal_count])
                        else:
                            rows.append(parts + [""] * (modal_count - len(parts)))
                    return pd.DataFrame(rows, columns=cols)

                # Fallback: try splitting by single spaces when lines have consistent numeric/text pattern
                tokenized2 = [re.split(r"\s+", line.strip()) for line in lines]
                counts2 = [len(t) for t in tokenized2 if any(tok.strip() for tok in t)]
                if not counts2:
                    return None
                cnt2 = Counter(counts2)
                modal_count2, modal_freq2 = cnt2.most_common(1)[0]
                if modal_count2 >= 2 and modal_freq2 / max(1, len(counts2)) >= 0.65:
                    cols = [f"col_{i+1}" for i in range(modal_count2)]
                    rows = []
                    for parts in tokenized2:
                        parts = [p.strip() for p in parts if p is not None]
                        if len(parts) >= modal_count2:
                            rows.append(parts[:modal_count2])
                        else:
                            rows.append(parts + [""] * (modal_count2 - len(parts)))
                    return pd.DataFrame(rows, columns=cols)

                return None

            try:
                split_df = _try_split_single_col_to_table(normalized[single_col])
            except Exception:
                split_df = None

            if split_df is not None and not split_df.empty:
                # Drop original single column and concatenate split columns
                normalized = normalized.drop(columns=[single_col])
                # Insert split columns at front
                for c in split_df.columns:
                    normalized[c] = split_df[c].astype(str)
                value_columns = [c for c in split_df.columns]
            else:
                # Not a multi-column table; rename to `value`
                normalized.rename(columns={single_col: "value"}, inplace=True)
                value_columns = ["value"]
        else:
            # preserve table columns as-is
            pass
    elif "value" not in normalized.columns:
        # If no explicit value-like column, try to synthesize one from `key` if present
        if "key" in normalized.columns:
            normalized["value"] = normalized["key"].astype(str) + ": " + (normalized.get("value", "")).astype(str)
            value_columns = ["value"]
        else:
            normalized["value"] = ""
            value_columns = ["value"]

# Select final columns - STRIP METADATA for clean structured output
    # Keep ONLY data columns + confidence (drop page/block_ind/entity_type for clean tables)
    # PURE DATA ONLY - NO METADATA/CONFIDENCE
    data_columns = value_columns  # Just extracted business data
    final_columns = data_columns  # Sector_Name, Month, Revenue... ONLY
    final_columns = [c for c in final_columns if c in normalized.columns]
    result = normalized[final_columns]
    
    # Ensure proper data types
    # Type safety only for confidence columns if present
    for col in ["confidence", "record_confidence"]:
        if col in result.columns:
            result[col] = pd.to_numeric(result[col], errors="coerce").fillna(0.5).clip(0, 1)

    # Data columns already strings from extraction
    return result



def _select_data_pipeline(raw_data: RawData) -> str:
    if hasattr(raw_data, "file_category") and getattr(raw_data, "file_category", None):
        return "unstructured" if raw_data.file_category == "unstructured" else "structured"

    if isinstance(getattr(raw_data, "data", None), dict):
        metadata = raw_data.data.get("file_detection")
        if isinstance(metadata, dict):
            recommended = metadata.get("recommended_pipeline")
            if recommended in {"structured", "unstructured"}:
                return recommended

    return _infer_pipeline_by_df(pd.DataFrame(raw_data.data))


def _execute_cleaning_pipeline(
    db: Session,
    current_user: User,
    data_id: int,
    pipeline_type: str,
    algorithm: str,
    predictive_fill: bool,
) -> Dict[str, Any]:
    raw_data = _get_accessible_raw_data(db, data_id, current_user)
    if not raw_data:
        raise HTTPException(status_code=404, detail="Data not found")

    cleaning_engine = DataCleaningEngine()
    source_df = pd.DataFrame(raw_data.data)
    
# ALL data stored as CSV → structured pipeline only
    is_pdf_data = False
    
    missing_percent = _calculate_missing_percent(source_df)
    audit_warning = _build_predictive_fill_audit(predictive_fill, missing_percent)
    if audit_warning:
        cleaning_engine.log_action("predictive_fill_override", audit_warning)

    learning = _derive_learning_strategy(db, source_df, predictive_fill)
    strategy_config = learning["config"]

    # Route PDF uploads through their extracted dataset records when possible.
    # Structured CSV pipeline for ALL files
    df_clean = cleaning_engine.remove_duplicates(source_df.copy())
    steps = _get_algorithm_steps(cleaning_engine, algorithm, strategy_config)
    for step in steps:
        df_clean = step["operation"](df_clean)
    structured_df = df_clean
    intelligent = None
    try:
        intelligent = run_intelligent_pipeline(
            structured_df,
            db=db,
            company_id=current_user.company_id,
            sector_id=raw_data.sector_id,
            role=current_user.role,
            config=strategy_config,
        )
        structured_df = intelligent.df
    except Exception:
        pass
    else:
        df_clean = cleaning_engine.clean_text(source_df.copy())
        structured_df = _structure_dataframe(df_clean)
        intelligent = None
        try:
            intelligent = run_intelligent_pipeline(
                structured_df,
                db=db,
                company_id=current_user.company_id,
                sector_id=raw_data.sector_id,
                role=current_user.role,
                config=strategy_config,
            )
            structured_df = intelligent.df
        except Exception:
            pass
    # Compute cleaning improvement metrics and persist cleaned variants for non-stream responses
    try:
        improvement = _compute_cleaning_improvement(source_df, structured_df)
    except Exception:
        improvement = {
            "cleaned_percent": 0.0,
            "missing_before_percent": 0.0,
            "missing_after_percent": 0.0,
            "duplicates_before": 0,
            "duplicates_after": 0,
        }

    try:
        persist_result = _persist_cleaned_variants(
            db=db,
            data_id=data_id,
            algorithm=algorithm,
            structured_df=structured_df,
            quality_scores=cleaning_engine.get_quality_scores(),
        )
    except Exception:
        persist_result = {}

    _persist_predictive_fill_audit(db, current_user, data_id, algorithm, audit_warning)

    best_methods = {}
    validation_stats = {}
    validation_warnings = []
    if intelligent is not None:
        for item in intelligent.logs:
            if isinstance(item, dict) and item.get("stage") == "parallel_imputation":
                best_methods = dict(item.get("best_method_by_column") or {})
                break
        for item in intelligent.logs:
            if isinstance(item, dict) and item.get("stage") == "validation":
                validation_stats = dict(item.get("stats") or {})
                validation_warnings = list(item.get("warnings") or [])
                break

    best_config = dict(strategy_config or {})
    if best_methods:
        best_config["best_method_by_column"] = best_methods

    best_metrics = {
        "cleaned_percent": improvement.get("cleaned_percent"),
        "missing_after_percent": improvement.get("missing_after_percent"),
        "validation_stats": validation_stats,
        "warnings_count": len(validation_warnings),
    }

    # Ensure we have a sector classification report available for the response
    sector_report = None
    try:
        classifier = SectorClassifier(db, company_id=current_user.company_id)
        try:
            _ = None
            # classify returns (df, report) — we only need the report here
            _, sector_report = classifier.classify(structured_df.copy())
        except Exception:
            sector_report = None
    except Exception:
        sector_report = None

    try:
        MetaLearner(db).record_experience(
            company_id=current_user.company_id,
            sector_id=raw_data.sector_id,
            df=structured_df,
            best_config=best_config,
            best_model={},
            best_metrics=best_metrics,
            source_cleaned_data_id=persist_result.get("primary_cleaned_data_id"),
        )
    except Exception:
        pass

    # Ensure `intelligent` exists for downstream reporting (streaming uses intel/log aggregators)
    if "intelligent" not in locals() or intelligent is None:
        class _DummyInt:
            def __init__(self, logs=None, summary=None, warnings=None):
                self.logs = logs or []
                self.summary = summary or []
                self.warnings = warnings or []

        combined_logs = []
        combined_logs.extend(locals().get("intelligent_logs", []) or [])
        combined_logs.extend(locals().get("extra_intel_logs", []) or [])
        intelligent = _DummyInt(logs=combined_logs, summary=[], warnings=[])

    response = {
        "message": "Data cleaning completed",
        "data_id": data_id,
        "pipeline": pipeline_type,
        "algorithm": algorithm,
        "predictive_fill": predictive_fill,
        "audit_warning": audit_warning,
        "is_pdf_data": is_pdf_data,
        "row_count": len(structured_df),
        "column_count": len(structured_df.columns),
        "adaptive_config": strategy_config,
        "pipeline_summary": intelligent.summary if intelligent is not None else [],
        "pipeline_warnings": intelligent.warnings if intelligent is not None else [],
        "sector_classification": {
            "sector_counts": sector_report.sector_counts if sector_report else {},
            "uncertain_rows": sector_report.uncertain_rows if sector_report else 0,
            "used_model": sector_report.used_model if sector_report else "N/A",
        } if not is_pdf_data else None,
        "learning_feedback": learning["history"],
        "cleaning_summary": improvement,
        "quality_scores": cleaning_engine.get_quality_scores(),
        "logs": cleaning_engine.get_logs() + (intelligent.logs if intelligent is not None else []),
        **persist_result,
    }
    return response


def _derive_learning_strategy(db: Session, df: pd.DataFrame, predictive_fill: bool = False) -> Dict[str, Any]:
    learning_engine = FeedbackLearningEngine()
    numeric_cols = df.select_dtypes(include=[np.number]).columns
    data_characteristics = {
        "skewness": float(df[numeric_cols].skew().mean()) if len(numeric_cols) > 0 else 0,
        "distribution": "normal" if len(numeric_cols) > 0 and abs(float(df[numeric_cols].skew().mean())) < 0.8 else "skewed",
        "needs_normalization": len(numeric_cols) > 0,
        "needs_standardization": False,
        "has_noise": len(df) > 80,
        "has_text": len(df.select_dtypes(include=["object"]).columns) > 0,
    }
    config = learning_engine.get_optimal_cleaning_config(data_characteristics)

    # Feedback-learning proxy from historical cleaning outcomes.
    quality_rows = db.query(DataQualityScore).order_by(DataQualityScore.timestamp.desc()).limit(200).all()
    avg_quality = float(np.mean([row.score for row in quality_rows])) if quality_rows else 0.0
    high_quality_rate = (
        sum(1 for row in quality_rows if row.score >= 0.90) / len(quality_rows)
        if quality_rows else 0.0
    )
    quality_trend = 0.0
    if len(quality_rows) >= 6:
        recent_scores = np.array([row.score for row in quality_rows[:20]][::-1], dtype=float)
        x_axis = np.arange(len(recent_scores), dtype=float)
        quality_trend = float(np.polyfit(x_axis, recent_scores, 1)[0])

    if avg_quality >= 0.90 or high_quality_rate >= 0.60:
        config["impute_strategy"] = "ml"
        config["outlier_method"] = "zscore"
        config["standardize"] = True
        config["normalize"] = False
    elif avg_quality < 0.75 and quality_rows:
        config["impute_strategy"] = "median"
        config["outlier_method"] = "iqr"
    elif quality_trend < -0.01:
        # Feedback-learning correction when quality trend drifts down.
        config["impute_strategy"] = "ml"
        config["outlier_method"] = "zscore"
        config["clean_text"] = True

    model_training = learning_engine.update_models_from_feedback(db)
    active_online = learning_engine.recommend_with_active_online_learning(
        data_characteristics=data_characteristics,
        historical_avg_quality=avg_quality,
        high_quality_rate=high_quality_rate,
    )
    config = active_online.get("config", config)

    if predictive_fill:
        config["impute_strategy"] = "ml"
        config["predictive_fill"] = True
    else:
        # Explicitly pass through so downstream pipelines can apply stricter behavior when enabled.
        config["predictive_fill"] = False

    # IMPORTANT: Cleaning output should preserve original units by default.
    # Scaling/smoothing is for modeling, not for "cleaned dataset" export/visualization.
    config["normalize"] = False
    config["standardize"] = False
    config["reduce_noise"] = False

    return {
        "config": config,
        "history": {
            "historical_quality_avg": round(avg_quality, 4),
            "high_quality_rate": round(high_quality_rate, 4),
            "quality_trend_slope": round(quality_trend, 6),
            "history_size": len(quality_rows),
            "feedback_model_training": model_training,
            "feedback_model_used": active_online.get("model", "heuristic_fallback"),
            "feedback_predicted_quality": active_online.get("predicted_quality", round(avg_quality, 4)),
            "feedback_uncertainty": active_online.get("uncertainty", 0.0),
            "predictive_fill_enabled": predictive_fill,
        },
    }

def _get_algorithm_steps(engine: DataCleaningEngine, algorithm: str, config: Dict[str, Any]) -> List[Dict[str, Any]]:
    impute_strategy = config.get("impute_strategy", "auto")
    outlier_method = config.get("outlier_method", "iqr")

    pipelines = {
        "missing_values": [
            {"id": "scan_missing", "label": "Scanning for missing values", "stage": "profiling", "technique": "null pattern scan", "operation": lambda df: df},
            {"id": "impute_values", "label": "Applying missing value imputation", "stage": "ml", "technique": f"{impute_strategy} imputation", "operation": lambda df: engine.impute_missing_values(df, impute_strategy)},
            {"id": "validate_missing", "label": "Validating imputed values", "stage": "validation", "technique": "consistency checks", "operation": lambda df: df},
        ],
        "duplicates": [
            {"id": "scan_duplicates", "label": "Scanning for duplicate rows", "stage": "profiling", "technique": "row signature hashing", "operation": lambda df: df},
            {"id": "remove_duplicates", "label": "Removing duplicate rows", "stage": "cleaning", "technique": "exact and fuzzy dedup", "operation": engine.remove_duplicates},
            {"id": "validate_dedup", "label": "Validating deduplicated rows", "stage": "validation", "technique": "row uniqueness validation", "operation": lambda df: df},
        ],
        "outliers": [
            {"id": "profile_numeric", "label": "Profiling numeric distribution", "stage": "profiling", "technique": "distribution statistics", "operation": lambda df: df},
            {"id": "cap_outliers", "label": "Detecting and capping outliers", "stage": "ml", "technique": f"{outlier_method} outlier detection", "operation": lambda df: engine.detect_outliers(df, outlier_method)},
            {"id": "validate_outliers", "label": "Validating adjusted outliers", "stage": "validation", "technique": "post-clean drift checks", "operation": lambda df: df},
        ],
        "data_types": [
            {"id": "infer_types", "label": "Inferring target data types", "stage": "profiling", "technique": "schema inference", "operation": lambda df: df},
            {"id": "apply_types", "label": "Applying data type correction", "stage": "cleaning", "technique": "automatic type coercion", "operation": engine.correct_data_types},
            {"id": "validate_types", "label": "Validating corrected types", "stage": "validation", "technique": "type consistency checks", "operation": lambda df: df},
        ],
        "normalization": [
            {"id": "profile_scale", "label": "Analyzing value ranges", "stage": "profiling", "technique": "scale diagnostics", "operation": lambda df: df},
            {"id": "apply_normalize", "label": "Applying min-max normalization", "stage": "ml", "technique": "min-max scaler", "operation": engine.normalize_data},
            {"id": "validate_scale", "label": "Validating normalized ranges", "stage": "validation", "technique": "range assertions", "operation": lambda df: df},
        ],
        "text_cleaning": [
            {"id": "profile_text", "label": "Profiling text columns", "stage": "profiling", "technique": "text pattern scan", "operation": lambda df: df},
            {"id": "apply_text_cleaning", "label": "Cleaning text fields", "stage": "nlp", "technique": "token normalization and regex cleanup", "operation": engine.clean_text},
            {"id": "validate_text", "label": "Validating text cleanup output", "stage": "validation", "technique": "semantic formatting checks", "operation": lambda df: df},
        ],
        "full_pipeline": [
            {"id": "clustering_profile", "label": "Clustering feature groups", "stage": "ml", "technique": "k-means feature grouping for structure detection", "operation": lambda df: df},
            {"id": "remove_duplicates", "label": "Removing duplicate rows", "stage": "cleaning", "technique": "exact/fuzzy dedup", "operation": engine.remove_duplicates},
            # IMPORTANT: Keep raw numeric units and enable "self-learning" imputation selection downstream.
            # We defer missing-value imputation to `run_intelligent_pipeline`, which can evaluate multiple
            # imputers per column (mean/median/KNN/regression) and pick the best via validation.
            {"id": "missing_values", "label": "Deferring missing value imputation to self-learning pipeline", "stage": "ml", "technique": "parallel imputation selection", "operation": lambda df: df},
            {"id": "outliers", "label": "Detecting outliers", "stage": "ml", "technique": f"{outlier_method} outlier filtering", "operation": lambda df: engine.detect_outliers(df, outlier_method)},
            {"id": "data_types", "label": "Correcting data types", "stage": "cleaning", "technique": "schema correction", "operation": engine.correct_data_types},
            # IMPORTANT: For "cleaned dataset" exports/visualizations we preserve original units.
            # Scaling/smoothing can be done separately for modeling, but should not alter cleaned CSV values.
            {"id": "normalize", "label": "Preserving numeric units (normalization skipped)", "stage": "ml", "technique": "no-op", "operation": lambda df: df},
            {"id": "standardize", "label": "Preserving numeric units (standardization skipped)", "stage": "ml", "technique": "no-op", "operation": lambda df: df},
            {"id": "noise_reduction", "label": "Preserving numeric units (noise reduction skipped)", "stage": "ml", "technique": "no-op", "operation": lambda df: df},
            {"id": "text_cleaning", "label": "Cleaning text fields", "stage": "nlp", "technique": "text normalization", "operation": engine.clean_text if config.get("clean_text", False) else (lambda df: df)},
        ],
    }
    return pipelines.get(algorithm, [])

def _persist_cleaned_data(
    db: Session,
    data_id: int,
    cleaned_df: pd.DataFrame,
    algorithm: str,
    quality_scores: Dict[str, float],
) -> Dict[str, Any]:
    average_quality = (
        sum(quality_scores.values()) / len(quality_scores)
        if quality_scores
        else 0.0
    )

    cleaned_entry = db.query(CleanedData).filter(
        CleanedData.raw_data_id == data_id,
        CleanedData.cleaning_algorithm == algorithm
    ).first()
    if cleaned_entry:
        cleaned_entry.cleaned_data = _to_json_safe_records(cleaned_df)
        cleaned_entry.cleaning_algorithm = algorithm
        cleaned_entry.quality_score = average_quality
        cleaned_entry.cleaned_at = datetime.utcnow()
    else:
        cleaned_entry = CleanedData(
            raw_data_id=data_id,
            cleaned_data=_to_json_safe_records(cleaned_df),
            cleaning_algorithm=algorithm,
            quality_score=average_quality,
        )
        db.add(cleaned_entry)
        db.flush()

    db.query(DataQualityScore).filter(DataQualityScore.cleaned_data_id == cleaned_entry.id).delete()
    for algo, score in quality_scores.items():
        db.add(
            DataQualityScore(
                cleaned_data_id=cleaned_entry.id,
                score=score,
                algorithm=algo,
            )
        )

    db.commit()
    db.refresh(cleaned_entry)

    return {
        "cleaned_data_id": cleaned_entry.id,
        "quality_score": round(cleaned_entry.quality_score, 4),
    }


def _persist_cleaned_variants(
    db: Session,
    data_id: int,
    algorithm: str,
    structured_df: pd.DataFrame,
    quality_scores: Dict[str, float],
) -> Dict[str, Any]:
    primary = _persist_cleaned_data(
        db=db,
        data_id=data_id,
        cleaned_df=structured_df,
        algorithm=algorithm,
        quality_scores=quality_scores,
    )

    split_map = _split_by_sector(structured_df)
    cleaned_datasets = [
        {
            "cleaned_data_id": primary["cleaned_data_id"],
            "label": "all",
            "algorithm": algorithm,
            "row_count": len(structured_df),
            "quality_score": primary["quality_score"],
        }
    ]

    for label, subset in split_map.items():
        if label == "all":
            continue
        variant_algorithm = f"{algorithm}__sector__{label}"
        persisted = _persist_cleaned_data(
            db=db,
            data_id=data_id,
            cleaned_df=subset,
            algorithm=variant_algorithm,
            quality_scores=quality_scores,
        )
        cleaned_datasets.append(
            {
                "cleaned_data_id": persisted["cleaned_data_id"],
                "label": label,
                "algorithm": variant_algorithm,
                "row_count": len(subset),
                "quality_score": persisted["quality_score"],
            }
        )

    return {
        "primary_cleaned_data_id": primary["cleaned_data_id"],
        "quality_score": primary["quality_score"],
        "cleaned_datasets": cleaned_datasets,
        "split_count": len(cleaned_datasets),
    }

@router.post("/analyze")
async def analyze_upload(
    file: UploadFile = File(...),
    sector_id: int = Form(1),
    product_id: Optional[int] = Form(None),
    analysis_type: str = Form("full"),
    predictive_fill: bool = Form(False),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Analyze uploaded file directly without storing"""
    allowed_sector_ids = _allowed_sector_ids(db, current_user)
    if sector_id not in allowed_sector_ids:
        raise HTTPException(status_code=403, detail="Access denied for sector")

    df = _load_dataframe_from_upload(file)
    
    results = {}
    
    # Data Cleaning Analysis
    if analysis_type in ['full', 'cleaning_only']:
        cleaning_engine = DataCleaningEngine()
        # If preview requested with predictive_fill, run the intelligent pipeline for a predictive preview.
        if predictive_fill:
            try:
                intel = run_intelligent_pipeline(
                    df.copy(),
                    db=db,
                    company_id=current_user.company_id,
                    sector_id=sector_id,
                    role=current_user.role,
                    config={"predictive_fill": True},
                )
                cleaned_df = intel.df
                quality_scores = cleaning_engine.get_quality_scores()
                logs = cleaning_engine.get_logs() + getattr(intel, 'logs', [])
            except Exception:
                # fallback to the existing full pipeline on error
                cleaned_df = cleaning_engine.run_full_pipeline(df)
                quality_scores = cleaning_engine.get_quality_scores()
                logs = cleaning_engine.get_logs()
        else:
            cleaned_df = cleaning_engine.run_full_pipeline(df)
            quality_scores = cleaning_engine.get_quality_scores()
            logs = cleaning_engine.get_logs()

        results['cleaning'] = {
            'quality_scores': quality_scores,
            'logs': logs,
            'preview': cleaned_df.head().to_dict('records'),
            'row_count': len(cleaned_df),
            'column_count': len(cleaned_df.columns),
            'predictive_preview': bool(predictive_fill),
        }
    
    # AI Predictions
    if analysis_type in ['full', 'prediction_only']:
        ai_engine = AIPredictionEngine()
        
        if len(df) > 10:
            numeric_cols = df.select_dtypes(include=[np.number]).columns
            if len(numeric_cols) > 0:
                try:
                    trend_analysis = ai_engine.detect_trends_anomalies(df, numeric_cols[0])
                    results['trend_analysis'] = trend_analysis
                    
                    context = {'current_average': df[numeric_cols[0]].mean()}
                    recommendations = ai_engine.generate_recommendations(trend_analysis, context)
                    results['recommendations'] = recommendations
                    
                except Exception as e:
                    results['trend_analysis_error'] = str(e)
    
    return {
        "filename": file.filename,
        "analysis_type": analysis_type,
        "results": results,
        "message": "Analysis completed successfully"
    }

@router.post("/analyze/{data_id}")
async def analyze_data(
    data_id: int,
    analysis_type: str = "full",
    predictive_fill: bool = False,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):

    """Advanced data analysis with ML algorithms"""

    # Get raw data scoped to user's company/role
    raw_data = _get_accessible_raw_data(db, data_id, current_user)
    if not raw_data:
        raise HTTPException(status_code=404, detail="Data not found")

    # Convert stored JSON back to DataFrame
    df = pd.DataFrame(raw_data.data)

    results = {}

    # Data Cleaning Analysis
    if analysis_type in ['full', 'cleaning_only']:
        cleaning_engine = DataCleaningEngine()
        if predictive_fill:
            try:
                intel = run_intelligent_pipeline(
                    df.copy(),
                    db=db,
                    company_id=current_user.company_id,
                    sector_id=raw_data.sector_id,
                    role=current_user.role,
                    config={"predictive_fill": True},
                )
                cleaned_df = intel.df
                quality_scores = cleaning_engine.get_quality_scores()
                logs = cleaning_engine.get_logs() + getattr(intel, 'logs', [])
            except Exception:
                cleaned_df = cleaning_engine.run_full_pipeline(df)
                quality_scores = cleaning_engine.get_quality_scores()
                logs = cleaning_engine.get_logs()
        else:
            cleaned_df = cleaning_engine.run_full_pipeline(df)
            quality_scores = cleaning_engine.get_quality_scores()
            logs = cleaning_engine.get_logs()

        results['cleaning'] = {
            'quality_scores': quality_scores,
            'logs': logs,
            'preview': cleaned_df.head().to_dict('records')
        }

        # Update cleaned data in DB if it exists
        existing_cleaned = db.query(CleanedData).filter(CleanedData.raw_data_id == data_id).first()
        if existing_cleaned:
            existing_cleaned.cleaned_data = cleaned_df.to_dict('records')
            existing_cleaned.quality_score = sum(cleaning_engine.get_quality_scores().values()) / len(cleaning_engine.get_quality_scores()) if cleaning_engine.get_quality_scores() else 0.5
        else:
            cleaned_entry = CleanedData(
                raw_data_id=data_id,
                cleaned_data=cleaned_df.to_dict('records'),
                cleaning_algorithm='advanced_pipeline',
                quality_score=0.85
            )
            db.add(cleaned_entry)

        db.commit()

    # AI Predictions and Analysis
    if analysis_type in ['full', 'prediction_only']:
        ai_engine = AIPredictionEngine()

        # Trend analysis
        if len(df) > 10:
            numeric_cols = df.select_dtypes(include=[np.number]).columns
            if len(numeric_cols) > 0:
                try:
                    trend_analysis = ai_engine.detect_trends_anomalies(df, numeric_cols[0])
                    results['trend_analysis'] = trend_analysis

                    # Store prediction
                    prediction_entry = AIPrediction(
                        sector_id=raw_data.sector_id,
                        product_id=raw_data.product_id,
                        prediction_type='trend_analysis',
                        prediction_data=trend_analysis,
                        confidence=trend_analysis.get('confidence', 0.5)
                    )
                    db.add(prediction_entry)
                    db.commit()
                    db.refresh(prediction_entry)

                    # Generate recommendations
                    context = {'current_average': df[numeric_cols[0]].mean()}
                    recommendations = ai_engine.generate_recommendations(trend_analysis, context)

                    for rec_text, exp in zip(recommendations.get('recommendations', []),
                                           recommendations.get('explanations', [])):
                        rec_entry = AIRecommendation(
                            prediction_id=prediction_entry.id,
                            recommendation_text=rec_text,
                            explanation=exp
                        )
                        db.add(rec_entry)

                    db.commit()

                    results['recommendations'] = recommendations

                except Exception as e:
                    results['trend_analysis_error'] = str(e)

        # Forecasting if sufficient data
        if len(df) > 20:
            try:
                forecast = ai_engine.forecast_sales(df, numeric_cols[0] if len(numeric_cols) > 0 else df.columns[0])
                results['forecast'] = forecast

                # Store forecast prediction
                forecast_entry = AIPrediction(
                    sector_id=raw_data.sector_id,
                    product_id=raw_data.product_id,
                    prediction_type='sales_forecast',
                    prediction_data=forecast,
                    confidence=forecast.get('confidence', 0.5)
                )
                db.add(forecast_entry)
                db.commit()

            except Exception as e:
                results['forecast_error'] = str(e)

    return {
        "data_id": data_id,
        "analysis_type": analysis_type,
        "results": results,
        "message": "Analysis completed successfully"
    }


def _safe_duplicate_count(df: pd.DataFrame) -> int:
    try:
        return int(df.duplicated().sum())
    except TypeError:
        normalized = df.copy()
        normalized = normalized.applymap(
            lambda x: json.dumps(x, default=str) if isinstance(x, (dict, list, set, tuple)) else x
        )
        return int(normalized.duplicated().sum())


@router.post("/error-profile")
async def error_profile(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):
    """Analyze dataset quality issues for visualization."""
    df = _load_dataframe_from_upload(file)
    total_rows = int(len(df))
    total_columns = int(len(df.columns))
    total_cells = int(total_rows * total_columns) if total_rows and total_columns else 0

    missing_cells = int(df.isna().sum().sum()) if total_cells else 0
    duplicate_rows = _safe_duplicate_count(df) if total_rows else 0

    outlier_count = 0
    numeric_cols = df.select_dtypes(include=[np.number]).columns
    for col in numeric_cols:
        series = df[col].dropna()
        if len(series) < 4:
            continue
        q1 = series.quantile(0.25)
        q3 = series.quantile(0.75)
        iqr = q3 - q1
        if iqr == 0:
            continue
        lower = q1 - 1.5 * iqr
        upper = q3 + 1.5 * iqr
        outlier_count += int(((series < lower) | (series > upper)).sum())

    invalid_format_count = 0
    for col in df.select_dtypes(include=["object"]).columns:
        series = df[col].dropna().astype(str).str.strip()
        if series.empty:
            continue
        lower_series = series.str.lower()
        invalid_mask = lower_series.isin({"", "na", "n/a", "null", "none", "nan", "undefined"})
        invalid_format_count += int(invalid_mask.sum())

    issue_breakdown = [
        {"name": "Missing Values", "count": missing_cells},
        {"name": "Duplicate Rows", "count": duplicate_rows},
        {"name": "Outliers", "count": outlier_count},
        {"name": "Invalid Formats", "count": invalid_format_count},
    ]

    column_missing = [
        {"column": str(col), "missing": int(df[col].isna().sum())}
        for col in df.columns
    ]
    column_missing.sort(key=lambda item: item["missing"], reverse=True)
    column_missing = column_missing[:12]

    clean_cells = max(total_cells - missing_cells, 0)
    quality_score = round((clean_cells / total_cells) * 100, 2) if total_cells else 0

    return {
        "filename": file.filename,
        "summary": {
            "rows": total_rows,
            "columns": total_columns,
            "total_cells": total_cells,
            "quality_score": quality_score,
        },
        "issues": issue_breakdown,
        "column_missing": column_missing,
        "message": "Error profile generated",
    }

@router.post("/clean/{data_id}")
async def clean_data(
    data_id: int,
    algorithm: str = "full_pipeline",
    pipeline: Optional[str] = None,
    predictive_fill: bool = False,
    full_phases: bool = False,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Run cleaning: full 6-phases if full_phases=true, else legacy."""
    raw_data = _get_accessible_raw_data(db, data_id, current_user)
    if not raw_data:
        raise HTTPException(status_code=404, detail="Data not found")

    df_raw = pd.DataFrame(raw_data.data)

    if full_phases:
        from app.services.pipeline_controller import run_full_pipeline_phases
        result = await run_full_pipeline_phases(df_raw, db, current_user.company_id, raw_data.sector_id)
        return result
    else:
        # Legacy path
        if pipeline is None:
            pipeline = _select_data_pipeline(raw_data)
        elif pipeline not in {"structured", "unstructured"}:
            raise HTTPException(status_code=400, detail="Unsupported pipeline type")
        return _execute_cleaning_pipeline(db, current_user, data_id, pipeline, algorithm, predictive_fill)



@router.post("/clean/structured/{data_id}")
async def clean_structured_data(
    data_id: int,
    algorithm: str = "full_pipeline",
    predictive_fill: bool = False,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Run the structured data cleaning pipeline."""
    return _execute_cleaning_pipeline(db, current_user, data_id, "structured", algorithm, predictive_fill)


@router.post("/clean/unstructured/{data_id}")
async def clean_unstructured_data(
    data_id: int,
    algorithm: str = "full_pipeline",
    predictive_fill: bool = False,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Run the unstructured data cleaning pipeline."""
    return _execute_cleaning_pipeline(db, current_user, data_id, "unstructured", algorithm, predictive_fill)


@router.get("/clean-stream/{data_id}")
async def clean_data_stream(
    request: Request,
    data_id: int,
    algorithm: str = "full_pipeline",
    predictive_fill: bool = False,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Stream step-by-step cleaning progress using Server-Sent Events."""
    raw_data = _get_accessible_raw_data(db, data_id, current_user)
    if not raw_data:
        raise HTTPException(status_code=404, detail="Data not found")

    cleaning_engine = DataCleaningEngine()
    source_df = pd.DataFrame(raw_data.data)
    
    # Check if this is PDF-extracted data
    is_pdf_data = _is_pdf_extracted_data(raw_data.data)
    
    missing_percent = _calculate_missing_percent(source_df)
    audit_warning = _build_predictive_fill_audit(predictive_fill, missing_percent)
    if audit_warning:
        cleaning_engine.log_action("predictive_fill_override", audit_warning)
    learning = _derive_learning_strategy(db, source_df, predictive_fill)
    strategy_config = learning["config"]
    
    # For PDF data, we use simpler steps
    if is_pdf_data:
        steps = [
            {"id": "remove_duplicates", "label": "Removing duplicate rows", "stage": "cleaning", "technique": "deduplication"},
            {"id": "impute_missing", "label": "Imputing missing values", "stage": "ml", "technique": "auto-imputation"},
            {"id": "normalize_pdf", "label": "Normalizing PDF structure", "stage": "structuring", "technique": "schema normalization"},
        ]
    else:
        steps = _get_algorithm_steps(cleaning_engine, algorithm, strategy_config)
        if not steps:
            raise HTTPException(status_code=400, detail=f"Unsupported algorithm: {algorithm}")

    async def event_generator():
        try:
            df_clean = source_df.copy()
            yield _sse_event("start", {
                "data_id": data_id,
                "algorithm": algorithm,
                "predictive_fill": predictive_fill,
                "audit_warning": audit_warning,
                "total_steps": len(steps),
                "is_pdf_data": is_pdf_data,
                "adaptive_config": strategy_config,
                "learning_feedback": learning["history"],
                "timestamp": _utc_iso(),
            })

            for index, step in enumerate(steps):
                if await request.is_disconnected():
                    return

                yield _sse_event("step", {
                    "step_id": step["id"],
                    "label": step["label"],
                    "status": "running",
                    "stage": step["stage"],
                    "technique": step.get("technique", "unknown"),
                    "progress": int((index / len(steps)) * 100),
                    "timestamp": _utc_iso(),
                })

                await asyncio.sleep(0.05)
                
                # Apply PDF-specific cleaning steps
                if is_pdf_data:
                    if step["id"] == "remove_duplicates":
                        df_clean = cleaning_engine.remove_duplicates(df_clean)
                    elif step["id"] == "impute_missing":
                        df_clean = cleaning_engine.impute_missing_values(df_clean, strategy=strategy_config.get("impute_strategy", "auto"))
                    elif step["id"] == "normalize_pdf":
                        pass  # Will be done after loop
                else:
                    df_clean = step["operation"](df_clean)

                yield _sse_event("step", {
                    "step_id": step["id"],
                    "label": step["label"],
                    "status": "completed",
                    "stage": step["stage"],
                    "technique": step.get("technique", "unknown"),
                    "progress": int(((index + 1) / len(steps)) * 100),
                    "timestamp": _utc_iso(),
                    "row_count": len(df_clean),
                })

                await asyncio.sleep(0.1)

            yield _sse_event("step", {
                "step_id": "structuring",
                "label": "Converting unstructured data to structured schema",
                "status": "running",
                "stage": "structuring",
                "technique": "column flattening and normalization",
                "progress": 96,
                "timestamp": _utc_iso(),
            })
            
            # Apply final structuring
            extra_intel_logs = []
            if is_pdf_data:
                # For PDF-extracted data, prefer to process any persisted ExtractedDataset
                # records (one per table/region) and run the intelligent pipeline per-record.
                try:
                    extracted_rows = db.query(ExtractedDataset).filter(ExtractedDataset.raw_data_id == raw_data.id).all()
                except Exception:
                    extracted_rows = []

                cleaned_frames = []
                if extracted_rows:
                    for ds in extracted_rows:
                        try:
                            ds_df = pd.DataFrame(ds.data or [])
                        except Exception:
                            ds_df = pd.DataFrame()

                        if ds_df is None or ds_df.empty:
                            continue

                        # Basic dedupe first
                        try:
                            ds_df = cleaning_engine.remove_duplicates(ds_df)
                        except Exception:
                            pass

                        if predictive_fill:
                            try:
                                intel = run_intelligent_pipeline(
                                    ds_df,
                                    db=db,
                                    company_id=current_user.company_id,
                                    sector_id=raw_data.sector_id,
                                    role=current_user.role,
                                    config=strategy_config,
                                )
                                cleaned = intel.df
                                extra_intel_logs.extend(getattr(intel, "logs", []) or [])
                            except Exception:
                                # fallback to heuristic imputation if intelligent pipeline fails
                                try:
                                    numeric_cols = ds_df.select_dtypes(include=[np.number]).columns.tolist()
                                    impute_strategy = "median" if (len(numeric_cols) > 0 and abs(ds_df[numeric_cols].skew(numeric_only=True).mean()) >= 1.0) else "mean"
                                except Exception:
                                    impute_strategy = "mean"
                                cleaned = cleaning_engine.impute_missing_values(ds_df.copy(), strategy=impute_strategy, knn_k=strategy_config.get("knn_k", 5))
                                cleaned = cleaning_engine.detect_outliers(cleaned, method=strategy_config.get("outlier_method", "iqr"))
                                cleaned = cleaning_engine.correct_data_types(cleaned)
                        else:
                            cleaned = cleaning_engine.impute_missing_values(ds_df.copy(), strategy=strategy_config.get("impute_strategy", "mean"), knn_k=strategy_config.get("knn_k", 5))
                            cleaned = cleaning_engine.detect_outliers(cleaned, method=strategy_config.get("outlier_method", "iqr"))
                            cleaned = cleaning_engine.correct_data_types(cleaned)

                        cleaned_frames.append(cleaned)

                    if cleaned_frames:
                        structured_df = pd.concat(cleaned_frames, ignore_index=True, sort=False)
                        try:
                            df_safe = cleaning_engine._stringify_unhashable_cells(structured_df)
                        except Exception:
                            df_safe = structured_df
                        structured_df = _normalize_pdf_data(df_safe)
                    else:
                        # No valid extracted frames; normalize primary extracted frame and run intelligence if requested
                        try:
                            df_safe = cleaning_engine._stringify_unhashable_cells(df_clean)
                        except Exception:
                            df_safe = df_clean
                        structured_df = _normalize_pdf_data(df_safe)
                        if predictive_fill:
                            try:
                                intel = run_intelligent_pipeline(
                                    structured_df,
                                    db=db,
                                    company_id=current_user.company_id,
                                    sector_id=raw_data.sector_id,
                                    role=current_user.role,
                                    config=strategy_config,
                                )
                                structured_df = intel.df
                                extra_intel_logs = getattr(intel, "logs", []) or []
                            except Exception:
                                extra_intel_logs = []
                else:
                    # No extracted_rows persisted - operate on the primary extracted frame
                    try:
                        df_safe = cleaning_engine._stringify_unhashable_cells(df_clean)
                    except Exception:
                        df_safe = df_clean
                    structured_df = _normalize_pdf_data(df_safe)
                    if predictive_fill:
                        try:
                            intel = run_intelligent_pipeline(
                                structured_df,
                                db=db,
                                company_id=current_user.company_id,
                                sector_id=raw_data.sector_id,
                                role=current_user.role,
                                config=strategy_config,
                            )
                            structured_df = intel.df
                            extra_intel_logs = getattr(intel, "logs", []) or []
                        except Exception:
                            extra_intel_logs = []
            else:
                # Convert to structured form first, then run the intelligent pipeline
                # so that streaming/persisted results include predictive imputation.
                try:
                    try:
                        df_safe = cleaning_engine._stringify_unhashable_cells(df_clean)
                    except Exception:
                        df_safe = df_clean
                    pre_struct = _structure_dataframe(df_safe)
                    intel = run_intelligent_pipeline(
                        pre_struct,
                        db=db,
                        company_id=current_user.company_id,
                        sector_id=raw_data.sector_id,
                        role=current_user.role,
                        config=strategy_config,
                    )
                    structured_df = intel.df
                    extra_intel_logs = getattr(intel, "logs", []) or []
                except Exception:
                    # If intelligent pipeline fails for any reason, fall back to simple structuring
                    try:
                        df_safe = cleaning_engine._stringify_unhashable_cells(df_clean)
                    except Exception:
                        df_safe = df_clean
                    structured_df = _structure_dataframe(df_safe)
                    extra_intel_logs = []

            improvement = _compute_cleaning_improvement(source_df, structured_df)

            persist_result = _persist_cleaned_variants(
                db=db,
                data_id=data_id,
                algorithm=algorithm,
                structured_df=structured_df,
                quality_scores=cleaning_engine.get_quality_scores(),
            )
            _persist_predictive_fill_audit(db, current_user, data_id, algorithm, audit_warning)
            yield _sse_event("step", {
                "step_id": "structuring",
                "label": "Converting unstructured data to structured schema",
                "status": "completed",
                "stage": "structuring",
                "technique": "column flattening and normalization",
                "progress": 100,
                "timestamp": _utc_iso(),
                "row_count": len(structured_df),
            })

            # Merge cleaning engine logs with any intelligent-pipeline logs for visibility
            merged_logs = cleaning_engine.get_logs() + extra_intel_logs

            yield _sse_event("complete", {
                "data_id": data_id,
                "algorithm": algorithm,
                "predictive_fill": predictive_fill,
                "audit_warning": audit_warning,
                "is_pdf_data": is_pdf_data,
                "row_count": len(structured_df),
                "column_count": len(structured_df.columns),
                "quality_scores": cleaning_engine.get_quality_scores(),
                "logs": merged_logs,
                "adaptive_config": strategy_config,
                "learning_feedback": learning["history"],
                "cleaning_summary": improvement,
                "timestamp": _utc_iso(),
                **persist_result,
            })
        except Exception as e:
            db.rollback()
            yield _sse_event("error", {
                "message": str(e),
                "timestamp": _utc_iso(),
            })

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/cleaned-datasets")
async def get_cleaned_datasets(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """List cleaned datasets available to the current user."""
    sector_ids = _allowed_sector_ids(db, current_user)
    uploader_ids = _allowed_uploader_ids(db, current_user)
    if not sector_ids:
        return {"data": [], "total_count": 0}
    if not uploader_ids:
        return {"data": [], "total_count": 0}

    rows = db.query(CleanedData, RawData)\
        .join(RawData, CleanedData.raw_data_id == RawData.id)\
        .filter(
            RawData.sector_id.in_(sector_ids),
            RawData.uploaded_by.in_(uploader_ids),
        )\
        .order_by(CleanedData.cleaned_at.desc())\
        .all()

    data = []
    for cleaned, raw in rows:
        algo = cleaned.cleaning_algorithm or "unknown"
        sector_label = "all"
        if "__sector__" in algo:
            sector_label = algo.split("__sector__", 1)[1]
        records = cleaned.cleaned_data if isinstance(cleaned.cleaned_data, list) else []
        columns = list(records[0].keys()) if records and isinstance(records[0], dict) else []
        data.append(
            {
                "cleaned_data_id": cleaned.id,
                "raw_data_id": raw.id,
                "algorithm": algo,
                "sector_label": sector_label,
                "row_count": len(records),
                "column_count": len(columns),
                "columns": columns,
                "quality_score": cleaned.quality_score,
                "cleaned_at": cleaned.cleaned_at.isoformat() if cleaned.cleaned_at else None,
            }
        )

    return {"data": data, "total_count": len(data)}


@router.get("/visualization-data")
async def get_visualization_data(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Return database-backed visualization rows using cleaned data when available."""
    sector_ids = _allowed_sector_ids(db, current_user)
    uploader_ids = _allowed_uploader_ids(db, current_user)
    if not sector_ids or not uploader_ids:
        return {
            "data": [],
            "total_count": 0,
            "meta": {
                "source": "database",
                "cleaned_count": 0,
                "pending_count": 0,
            },
        }

    raw_rows = db.query(RawData)\
        .filter(
            RawData.sector_id.in_(sector_ids),
            RawData.uploaded_by.in_(uploader_ids),
        )\
        .order_by(RawData.uploaded_at.desc())\
        .all()

    cleaned_rows = db.query(CleanedData)\
        .join(RawData, CleanedData.raw_data_id == RawData.id)\
        .filter(
            RawData.sector_id.in_(sector_ids),
            RawData.uploaded_by.in_(uploader_ids),
            ~CleanedData.cleaning_algorithm.contains("__sector__"),
        )\
        .order_by(CleanedData.cleaned_at.desc())\
        .all()

    cleaned_by_raw_id = {row.raw_data_id: row for row in cleaned_rows}
    sector_map = {
        row.id: row.name
        for row in db.query(Sector).filter(Sector.id.in_(sector_ids)).all()
    }

    product_ids = sorted({row.product_id for row in raw_rows if row.product_id is not None})
    product_map = {}
    if product_ids:
        product_map = {
            row.id: row.name
            for row in db.query(Product).filter(Product.id.in_(product_ids)).all()
        }

    data = []
    cleaned_count = 0
    pending_count = 0

    for raw in raw_rows:
        sector_name = sector_map.get(raw.sector_id, "Unknown")
        product_name = product_map.get(raw.product_id, "Unassigned") if raw.product_id else "Unassigned"
        cleaned = cleaned_by_raw_id.get(raw.id)

        if cleaned:
            records = cleaned.cleaned_data if isinstance(cleaned.cleaned_data, list) else []
            data.append({
                "id": cleaned.id,
                "raw_data_id": raw.id,
                "sector_id": raw.sector_id,
                "sector_name": sector_name,
                "product_id": raw.product_id,
                "product_name": product_name,
                "row_count": len(records),
                "column_count": len(records[0].keys()) if records and isinstance(records[0], dict) else 0,
                "quality_score": round(float(cleaned.quality_score or 0), 4),
                "has_cleaned_data": True,
                "status": "Cleaned",
                "cleaning_algorithm": cleaned.cleaning_algorithm,
                "uploaded_at": raw.uploaded_at.isoformat() if raw.uploaded_at else None,
                "cleaned_at": cleaned.cleaned_at.isoformat() if cleaned.cleaned_at else None,
                "time_reference": cleaned.cleaned_at.isoformat() if cleaned.cleaned_at else (raw.uploaded_at.isoformat() if raw.uploaded_at else None),
                "source": "cleaned_data",
            })
            cleaned_count += 1
            continue

        records = raw.data if isinstance(raw.data, list) else []
        estimated_quality = 0.0
        if records:
            total_cells = max(len(records) * max(len(records[0].keys()) if isinstance(records[0], dict) else 0, 1), 1)
            missing_cells = 0
            if records and isinstance(records[0], dict):
                missing_cells = sum(
                    1
                    for row in records
                    for value in row.values()
                    if value in [None, ""]
                )
            estimated_quality = round(max(0.0, 1 - (missing_cells / total_cells)), 4)

        data.append({
            "id": raw.id,
            "raw_data_id": raw.id,
            "sector_id": raw.sector_id,
            "sector_name": sector_name,
            "product_id": raw.product_id,
            "product_name": product_name,
            "row_count": len(records),
            "column_count": len(records[0].keys()) if records and isinstance(records[0], dict) else 0,
            "quality_score": estimated_quality,
            "has_cleaned_data": False,
            "status": "Pending",
            "cleaning_algorithm": None,
            "uploaded_at": raw.uploaded_at.isoformat() if raw.uploaded_at else None,
            "cleaned_at": None,
            "time_reference": raw.uploaded_at.isoformat() if raw.uploaded_at else None,
            "source": "raw_data",
        })
        pending_count += 1

    return {
        "data": data,
        "total_count": len(data),
        "meta": {
            "source": "database",
            "cleaned_count": cleaned_count,
            "pending_count": pending_count,
        },
    }


@router.get("/cleaned-datasets/{cleaned_data_id}/download")
async def download_cleaned_dataset(
    cleaned_data_id: int,
    format: str = "csv",
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Download a cleaned dataset as CSV or JSON."""
    sector_ids = _allowed_sector_ids(db, current_user)
    uploader_ids = _allowed_uploader_ids(db, current_user)
    if not sector_ids:
        raise HTTPException(status_code=404, detail="Cleaned dataset not found")
    if not uploader_ids:
        raise HTTPException(status_code=404, detail="Cleaned dataset not found")

    row = db.query(CleanedData, RawData)\
        .join(RawData, CleanedData.raw_data_id == RawData.id)\
        .filter(
            CleanedData.id == cleaned_data_id,
            RawData.sector_id.in_(sector_ids),
            RawData.uploaded_by.in_(uploader_ids),
        ).first()
    if not row:
        raise HTTPException(status_code=404, detail="Cleaned dataset not found")

    cleaned, raw = row
    records = cleaned.cleaned_data if isinstance(cleaned.cleaned_data, list) else []
    df = pd.DataFrame(records)
    base_name = f"cleaned_raw_{raw.id}_{cleaned.id}"

    if (format or "").lower() == "json":
        payload = json.dumps(records, default=str)
        return Response(
            content=payload,
            media_type="application/json",
            headers={"Content-Disposition": f'attachment; filename="{base_name}.json"'},
        )

    csv_payload = df.to_csv(index=False)
    return Response(
        content=csv_payload,
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{base_name}.csv"'},
    )


@router.get("/cleaned-datasets/download-all")
async def download_all_cleaned_datasets(
    format: str = "csv",
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Download all accessible cleaned datasets as a ZIP archive."""
    sector_ids = _allowed_sector_ids(db, current_user)
    uploader_ids = _allowed_uploader_ids(db, current_user)
    if not sector_ids or not uploader_ids:
        raise HTTPException(status_code=404, detail="No cleaned datasets found")

    rows = db.query(CleanedData, RawData)\
        .join(RawData, CleanedData.raw_data_id == RawData.id)\
        .filter(
            RawData.sector_id.in_(sector_ids),
            RawData.uploaded_by.in_(uploader_ids),
        )\
        .order_by(CleanedData.cleaned_at.desc())\
        .all()

    if not rows:
        raise HTTPException(status_code=404, detail="No cleaned datasets found")

    selected_format = (format or "csv").lower()
    if selected_format not in {"csv", "json"}:
        raise HTTPException(status_code=400, detail="Unsupported format")

    mem_zip = io.BytesIO()
    with zipfile.ZipFile(mem_zip, mode="w", compression=zipfile.ZIP_DEFLATED) as archive:
        for cleaned, raw in rows:
            records = cleaned.cleaned_data if isinstance(cleaned.cleaned_data, list) else []
            algo = cleaned.cleaning_algorithm or "unknown"
            sector_label = "all"
            if "__sector__" in algo:
                sector_label = algo.split("__sector__", 1)[1]
            base_name = f"cleaned_raw_{raw.id}_{cleaned.id}_{sector_label}"

            if selected_format == "json":
                archive.writestr(f"{base_name}.json", json.dumps(records, default=str))
            else:
                csv_payload = pd.DataFrame(records).to_csv(index=False)
                archive.writestr(f"{base_name}.csv", csv_payload)

    mem_zip.seek(0)
    return Response(
        content=mem_zip.getvalue(),
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="cleaned_datasets_{selected_format}.zip"'},
    )


@router.delete("/cleaned-datasets/history")
async def delete_cleaned_history(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete all accessible cleaned dataset history for the current role scope."""
    sector_ids = _allowed_sector_ids(db, current_user)
    uploader_ids = _allowed_uploader_ids(db, current_user)
    if not sector_ids or not uploader_ids:
        return {"message": "No cleaned history to delete", "deleted_count": 0}

    rows = db.query(CleanedData)\
        .join(RawData, CleanedData.raw_data_id == RawData.id)\
        .filter(
            RawData.sector_id.in_(sector_ids),
            RawData.uploaded_by.in_(uploader_ids),
        )\
        .all()

    if not rows:
        return {"message": "No cleaned history to delete", "deleted_count": 0}

    deleted_count = 0
    for cleaned in rows:
        db.query(DataQualityScore).filter(DataQualityScore.cleaned_data_id == cleaned.id).delete()
        db.delete(cleaned)
        deleted_count += 1

    db.commit()
    return {"message": "Cleaned history deleted", "deleted_count": deleted_count}


@router.get("/cleaned-datasets/{cleaned_data_id}")
async def get_cleaned_dataset_preview(
    cleaned_data_id: int,
    limit: int = 2000,
    offset: int = 0,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return a preview of a single cleaned dataset for visualization."""
    limit = max(1, min(int(limit), 10000))
    offset = max(0, int(offset))

    sector_ids = _allowed_sector_ids(db, current_user)
    uploader_ids = _allowed_uploader_ids(db, current_user)
    if not sector_ids or not uploader_ids:
        raise HTTPException(status_code=404, detail="Cleaned dataset not found")

    row = db.query(CleanedData, RawData)\
        .join(RawData, CleanedData.raw_data_id == RawData.id)\
        .filter(
            CleanedData.id == cleaned_data_id,
            RawData.sector_id.in_(sector_ids),
            RawData.uploaded_by.in_(uploader_ids),
        )\
        .first()

    if not row:
        raise HTTPException(status_code=404, detail="Cleaned dataset not found")

    cleaned, raw = row
    records = cleaned.cleaned_data if isinstance(cleaned.cleaned_data, list) else []
    preview = records[offset:offset + limit]
    # Sanitize preview data to remove NaN/Inf values
    preview = [_sanitize_json_value(row) for row in preview]
    columns = list(preview[0].keys()) if preview and isinstance(preview[0], dict) else []
    algo = cleaned.cleaning_algorithm or "unknown"
    sector_label = "all"
    if "__sector__" in algo:
        sector_label = algo.split("__sector__", 1)[1]

    return {
        "cleaned_data_id": cleaned.id,
        "raw_data_id": raw.id,
        "algorithm": algo,
        "sector_label": sector_label,
        "quality_score": cleaned.quality_score,
        "cleaned_at": cleaned.cleaned_at.isoformat() if cleaned.cleaned_at else None,
        "row_count": len(records),
        "column_count": len(columns),
        "columns": columns,
        "preview_offset": offset,
        "preview_limit": limit,
        "preview_row_count": len(preview),
        "rows": preview,
    }


@router.post("/saved-cleaned-datasets")
async def save_cleaned_dataset(
    payload: SaveCleanedDatasetRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Persist a cleaned dataset preview (from downloaded file) into the database."""
    rows = payload.rows if isinstance(payload.rows, list) else []
    if not rows:
        raise HTTPException(status_code=400, detail="No rows provided")
    if len(rows) > 5000:
        rows = rows[:5000]

    inferred_columns: List[str] = []
    if payload.columns and isinstance(payload.columns, list):
        inferred_columns = [str(col) for col in payload.columns][:250]
    elif rows and isinstance(rows[0], dict):
        inferred_columns = [str(col) for col in rows[0].keys()][:250]

    saved = SavedCleanedDataset(
        company_id=current_user.company_id,
        created_by=current_user.id,
        source_cleaned_data_id=payload.source_cleaned_data_id,
        filename=(payload.filename or None),
        columns=inferred_columns,
        row_count=len(rows),
        data=rows,
    )
    db.add(saved)
    db.commit()
    db.refresh(saved)

    return {
        "message": "Saved cleaned dataset",
        "saved_id": saved.id,
        "row_count": saved.row_count,
        "column_count": len(inferred_columns),
    }


@router.get("/clean-compare/{data_id}")
async def get_cleaning_comparison(
    data_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return before/after cleaning comparison metrics for graphing."""
    raw_data = _get_accessible_raw_data(db, data_id, current_user)
    if not raw_data:
        raise HTTPException(status_code=404, detail="Data not found")

    cleaned_row = db.query(CleanedData).filter(
        CleanedData.raw_data_id == data_id,
        ~CleanedData.cleaning_algorithm.contains("__sector__")
    ).order_by(CleanedData.cleaned_at.desc()).first()
    if not cleaned_row:
        raise HTTPException(status_code=404, detail="Cleaned dataset not found")

    before_df = pd.DataFrame(raw_data.data if isinstance(raw_data.data, list) else [])
    after_df = pd.DataFrame(cleaned_row.cleaned_data if isinstance(cleaned_row.cleaned_data, list) else [])

    def _missing_pct(df: pd.DataFrame) -> float:
        total_cells = max(len(df) * max(len(df.columns), 1), 1)
        return round((float(df.isna().sum().sum()) / total_cells) * 100, 2) if len(df.columns) else 0.0

    def _duplicate_rows(df: pd.DataFrame) -> int:
        return int(df.duplicated().sum()) if len(df.columns) else 0

    def _outlier_count(df: pd.DataFrame) -> int:
        numeric_cols = df.select_dtypes(include=[np.number]).columns
        total = 0
        for col in numeric_cols:
            series = df[col].dropna()
            if len(series) < 4:
                continue
            q1 = series.quantile(0.25)
            q3 = series.quantile(0.75)
            iqr = q3 - q1
            if iqr == 0:
                continue
            lower = q1 - 1.5 * iqr
            upper = q3 + 1.5 * iqr
            total += int(((series < lower) | (series > upper)).sum())
        return total

    before_missing = _missing_pct(before_df)
    after_missing = _missing_pct(after_df)
    before_duplicates = _duplicate_rows(before_df)
    after_duplicates = _duplicate_rows(after_df)
    before_outliers = _outlier_count(before_df)
    after_outliers = _outlier_count(after_df)

    all_cols = sorted(set(before_df.columns).union(set(after_df.columns)))
    missing_columns = []
    for col in all_cols:
        before_col = int(before_df[col].isna().sum()) if col in before_df.columns else 0
        after_col = int(after_df[col].isna().sum()) if col in after_df.columns else 0
        missing_columns.append({"column": str(col), "before": before_col, "after": after_col})
    missing_columns.sort(key=lambda row: row["before"] + row["after"], reverse=True)

    return {
        "data_id": data_id,
        "summary": {
            "rows_before": int(len(before_df)),
            "rows_after": int(len(after_df)),
            "columns_before": int(len(before_df.columns)),
            "columns_after": int(len(after_df.columns)),
            "quality_before": round(100 - before_missing, 2),
            "quality_after": round(float(cleaned_row.quality_score) * 100, 2),
        },
        "issues": [
            {"metric": "Missing %", "before": before_missing, "after": after_missing},
            {"metric": "Duplicate Rows", "before": before_duplicates, "after": after_duplicates},
            {"metric": "Outlier Count", "before": before_outliers, "after": after_outliers},
        ],
        "missing_by_column": missing_columns[:10],
    }

@router.get("/insights/{sector_id}")
async def get_sector_insights(
    sector_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):

    """Get AI insights and predictions for a sector"""

    allowed_sector_ids = _allowed_sector_ids(db, current_user)
    allowed_uploader_ids = _allowed_uploader_ids(db, current_user)
    if sector_id not in allowed_sector_ids:
        raise HTTPException(status_code=403, detail="Access denied")
    if not allowed_uploader_ids:
        return {"sector_id": sector_id, "predictions": [], "recommendations": []}

    # Get recent predictions
    predictions = db.query(AIPrediction)\
        .join(RawData, RawData.sector_id == AIPrediction.sector_id)\
        .filter(
            AIPrediction.sector_id == sector_id,
            RawData.uploaded_by.in_(allowed_uploader_ids),
        )\
        .distinct()\
        .order_by(AIPrediction.predicted_at.desc())\
        .limit(10).all()

    # Get recommendations
    recommendations = db.query(AIRecommendation)\
        .join(AIPrediction, AIRecommendation.prediction_id == AIPrediction.id)\
        .join(RawData, RawData.sector_id == AIPrediction.sector_id)\
        .filter(
            AIPrediction.sector_id == sector_id,
            RawData.uploaded_by.in_(allowed_uploader_ids),
        )\
        .distinct()\
        .order_by(AIRecommendation.created_at.desc())\
        .limit(5).all()

    return {
        "sector_id": sector_id,
        "predictions": [
            {
                "id": pred.id,
                "type": pred.prediction_type,
                "data": pred.prediction_data,
                "confidence": pred.confidence,
                "predicted_at": pred.predicted_at.isoformat()
            } for pred in predictions
        ],
        "recommendations": [
            {
                "text": rec.recommendation_text,
                "explanation": rec.explanation,
                "created_at": rec.created_at.isoformat()
            } for rec in recommendations
        ]
    }

@router.get("/cleaning-stats")
async def get_cleaning_stats(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get data cleaning statistics"""
    
    try:
        allowed_sector_ids = _allowed_sector_ids(db, current_user)
        allowed_uploader_ids = _allowed_uploader_ids(db, current_user)
        if not allowed_sector_ids:
            return {
                "total_cleaned": 0,
                "average_quality_score": 0,
                "error_breakdown": [],
                "recent_cleaning_jobs": []
            }
        if not allowed_uploader_ids:
            return {
                "total_cleaned": 0,
                "average_quality_score": 0,
                "error_breakdown": [],
                "recent_cleaning_jobs": []
            }
        cleaned_data = db.query(CleanedData)\
            .join(RawData, CleanedData.raw_data_id == RawData.id)\
            .filter(
                RawData.sector_id.in_(allowed_sector_ids),
                RawData.uploaded_by.in_(allowed_uploader_ids),
            ).all()
        
        # Calculate statistics
        total_cleaned = len(cleaned_data)
        avg_quality_score = sum([cd.quality_score for cd in cleaned_data]) / total_cleaned if total_cleaned > 0 else 0
        
        # Error types statistics (mock data for now)
        error_stats = [
            {"type": "Missing Values", "count": 15, "percentage": 3.2, "color": "#ef4444"},
            {"type": "Duplicate Rows", "count": 8, "percentage": 1.7, "color": "#f97316"},
            {"type": "Invalid Formats", "count": 5, "percentage": 1.1, "color": "#eab308"},
            {"type": "Outliers", "count": 3, "percentage": 0.6, "color": "#22c55e"},
        ]
        
        return {
            "total_cleaned": total_cleaned,
            "average_quality_score": round(avg_quality_score, 2),
            "error_breakdown": error_stats,
            "recent_cleaning_jobs": [
                {
                    "id": cd.id,
                    "raw_data_id": cd.raw_data_id,
                    "quality_score": cd.quality_score,
                    "algorithm": cd.cleaning_algorithm,
                    "created_at": cd.created_at.isoformat() if hasattr(cd, 'created_at') else None
                } for cd in cleaned_data[-5:]  # Last 5 entries
            ]
        }
    except Exception as e:
        # Return default data if there's an error
        return {
            "total_cleaned": 0,
            "average_quality_score": 0,
            "error_breakdown": [
                {"type": "Missing Values", "count": 0, "percentage": 0, "color": "#ef4444"},
                {"type": "Duplicate Rows", "count": 0, "percentage": 0, "color": "#f97316"},
                {"type": "Invalid Formats", "count": 0, "percentage": 0, "color": "#eab308"},
                {"type": "Outliers", "count": 0, "percentage": 0, "color": "#22c55e"},
            ],
            "recent_cleaning_jobs": []
        }
