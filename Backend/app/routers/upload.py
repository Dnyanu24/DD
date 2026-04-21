from fastapi import APIRouter, UploadFile, File, Depends, HTTPException, Form
from sqlalchemy.orm import Session
from typing import Optional
import pandas as pd
import numpy as np
import json
import math
import io
from datetime import datetime

from app.database import SessionLocal
from app.models import RawData, CleanedData, DataQualityScore, Sector, Product, User, ExtractedDataset
from app.dependencies import get_current_user
from app.services.file_ingest import load_dataframe_from_upload_bytes, detect_file_type, infer_parsed_output_pipeline

router = APIRouter()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def _to_json_safe_records(df: pd.DataFrame):
    safe_df = df.copy()
    for col in safe_df.columns:
        if pd.api.types.is_datetime64_any_dtype(safe_df[col]):
            safe_df[col] = safe_df[col].dt.strftime("%Y-%m-%dT%H:%M:%S")

    records = safe_df.to_dict("records")
    normalized = []
    for row in records:
        normalized_row = {}
        for key, value in row.items():
            if pd.isna(value):
                normalized_row[key] = None
            elif isinstance(value, str) and value.strip() == "":
                normalized_row[key] = None
            elif isinstance(value, pd.Timestamp):
                normalized_row[key] = value.isoformat()
            elif isinstance(value, float) and not math.isfinite(value):
                normalized_row[key] = None
            elif isinstance(value, np.generic):
                casted = value.item()
                if isinstance(casted, float) and not math.isfinite(casted):
                    normalized_row[key] = None
                else:
                    normalized_row[key] = casted
            else:
                normalized_row[key] = value
        normalized.append(normalized_row)
    return normalized


def _sanitize_json_payload(value):
    """Recursively convert values to JSON-safe primitives (no NaN/Inf)."""
    if value is None:
        return None
    if isinstance(value, dict):
        return {str(k): _sanitize_json_payload(v) for k, v in value.items()}
    if isinstance(value, (list, tuple, set)):
        return [_sanitize_json_payload(v) for v in value]
    if isinstance(value, pd.Timestamp):
        return value.isoformat()
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, np.generic):
        return _sanitize_json_payload(value.item())
    if isinstance(value, float):
        return value if math.isfinite(value) else None
    if isinstance(value, np.ndarray):
        return [_sanitize_json_payload(v) for v in value.tolist()]
    return value

def _adaptive_upload_config(db: Session, df: pd.DataFrame, *, company_id: int, sector_id: int) -> dict:
    from app.services.feedback_learning import FeedbackLearningEngine
    from app.services.meta_learner import MetaLearner
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

    # Lightweight feedback learning from historical quality.
    recent_scores = db.query(DataQualityScore).order_by(DataQualityScore.timestamp.desc()).limit(200).all()
    avg_quality = float(np.mean([score.score for score in recent_scores])) if recent_scores else 0.0
    if avg_quality >= 0.90:
        config["impute_strategy"] = "ml"
        config["outlier_method"] = "zscore"
        config["standardize"] = True
        config["normalize"] = False
    elif 0 < avg_quality < 0.75:
        config["impute_strategy"] = "median"
        config["outlier_method"] = "iqr"

    # Meta-learning warm start: use best_config from similar historical datasets (if any).
    try:
        meta = MetaLearner(db).suggest_pipeline(company_id=company_id, sector_id=sector_id, df=df)
        if meta and isinstance(meta.get("best_config"), dict):
            # Meta suggestion wins for core knobs; keep any extra defaults from feedback learning.
            config.update(meta["best_config"])
            config["_meta_match"] = meta.get("match")
    except Exception:
        # Meta-learner should never break uploads.
        pass

    return config


def _user_sector_ids_query(db: Session, current_user: User):
    query = db.query(Sector.id).filter(Sector.company_id == current_user.company_id)
    if current_user.role == "sector_head":
        query = query.filter(Sector.id == current_user.sector_id)
    return query


def _role_scoped_user_ids_query(db: Session, current_user: User):
    return db.query(User.id).filter(
        User.company_id == current_user.company_id,
        User.role == current_user.role
    )

@router.post("/upload")
async def upload_data(
    file: UploadFile = File(...),
    sector_id: int = Form(...),
    product_id: Optional[int] = Form(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Upload multi-sector data with metadata tagging"""

    sector = db.query(Sector).filter(
        Sector.id == sector_id,
        Sector.company_id == current_user.company_id
    ).first()
    if not sector:
        raise HTTPException(status_code=403, detail="Access denied: Sector not in your company")
    if current_user.role == 'sector_head' and current_user.sector_id != sector_id:
        raise HTTPException(status_code=403, detail="Access denied: Can only upload to assigned sector")

    # Read file based on extension and content detection.
    filename = getattr(file, "filename", "") or ""
    upload_content_type = getattr(file, "content_type", "") or ""
    raw_bytes = file.file.read()

    file_detection = detect_file_type(filename, raw_bytes, upload_content_type)
    try:
        df = load_dataframe_from_upload_bytes(filename, raw_bytes)
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception:
        raise HTTPException(status_code=400, detail="Unsupported file format")

    # Convert ALL to CSV format for unified storage
    csv_buffer = io.StringIO()
    df.to_csv(csv_buffer, index=False)
    csv_content = csv_buffer.getvalue()
    
    # Parse CSV back to records (standard format for ALL files)
    df_csv = pd.read_csv(io.StringIO(csv_content))
    safe_records = _to_json_safe_records(df_csv)
    
    # File detection metadata
    output_pipeline = "structured"  # ALL become structured CSV
    file_detection["detected_format"] = "csv"
    file_detection["file_category"] = "structured"
    file_detection["recommended_pipeline"] = "structured"
    
    raw_data_entry = RawData(
        sector_id=sector_id,
        product_id=product_id,
        data=safe_records,  # Store standardized CSV records
        uploaded_by=current_user.id
    )
    db.add(raw_data_entry)
    db.commit()
    db.refresh(raw_data_entry)

    extracted_dataset_ids = []
    if file_detection.get("detected_format") == "pdf" and isinstance(pdf_datasets, dict) and pdf_datasets:
        MAX_DATASET_ROWS = 5000
        for dataset_name, dataset_df in pdf_datasets.items():
            try:
                if dataset_df is None or dataset_df.empty:
                    continue

                safe_dataset_records = _to_json_safe_records(dataset_df.head(MAX_DATASET_ROWS))
                avg_conf = None
                if "_record_confidence" in dataset_df.columns:
                    try:
                        avg_conf = float(dataset_df["_record_confidence"].mean())
                    except Exception:
                        avg_conf = None

                ds = ExtractedDataset(
                    raw_data_id=raw_data_entry.id,
                    name=str(dataset_name),
                    dataset_type=str(dataset_name),
                    data=safe_dataset_records,
                    schema={
                        "columns": [str(c) for c in dataset_df.columns],
                        "row_count": int(len(dataset_df)),
                        "stored_row_count": int(min(len(dataset_df), MAX_DATASET_ROWS)),
                    },
                    avg_record_confidence=avg_conf,
                )
                db.add(ds)
                db.flush()
                extracted_dataset_ids.append({"name": str(dataset_name), "id": int(ds.id)})
            except Exception:
                continue
        db.commit()

    # Upload keeps dataset in pending state; cleaning happens from Data Cleaning page.
    optimal_config = _adaptive_upload_config(db, df, company_id=current_user.company_id, sector_id=sector_id)

    payload = {
        "message": "Data uploaded successfully. Run cleaning from Data Cleaning page.",
        "raw_data_id": raw_data_entry.id,
        "cleaned_data_id": None,
        "preview": safe_records[:5],
        "quality_scores": {},
        "logs": [],
        "adaptive_config": optimal_config,
        "file_detection": file_detection,
        "file_detection_pipeline": file_detection["recommended_pipeline"],
        "output_pipeline": output_pipeline,
    }
    if file_detection.get("detected_format") == "pdf" and isinstance(pdf_report, dict):
        payload["pdf_report"] = pdf_report
        payload["extracted_dataset_tables"] = extracted_dataset_ids
    return _sanitize_json_payload(payload)


@router.get("/datasets/{raw_data_id}")
async def list_extracted_datasets(
    raw_data_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    raw_data = (
        db.query(RawData)
        .join(Sector, Sector.id == RawData.sector_id)
        .filter(RawData.id == raw_data_id, Sector.company_id == current_user.company_id)
        .first()
    )
    if not raw_data:
        raise HTTPException(status_code=404, detail="Data not found")

    datasets = (
        db.query(ExtractedDataset)
        .filter(ExtractedDataset.raw_data_id == raw_data_id)
        .order_by(ExtractedDataset.id.asc())
        .all()
    )
    return [
        {
            "id": d.id,
            "name": d.name,
            "dataset_type": d.dataset_type,
            "avg_record_confidence": d.avg_record_confidence,
            "schema": d.schema,
            "created_at": d.created_at,
        }
        for d in datasets
    ]


@router.get("/datasets/{raw_data_id}/{dataset_name}")
async def get_extracted_dataset(
    raw_data_id: int,
    dataset_name: str,
    limit: int = 2000,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    raw_data = (
        db.query(RawData)
        .join(Sector, Sector.id == RawData.sector_id)
        .filter(RawData.id == raw_data_id, Sector.company_id == current_user.company_id)
        .first()
    )
    if not raw_data:
        raise HTTPException(status_code=404, detail="Data not found")

    ds = (
        db.query(ExtractedDataset)
        .filter(ExtractedDataset.raw_data_id == raw_data_id, ExtractedDataset.name == dataset_name)
        .order_by(ExtractedDataset.id.desc())
        .first()
    )
    if not ds:
        raise HTTPException(status_code=404, detail="Dataset not found")

    rows = ds.data or []
    if isinstance(limit, int) and limit > 0:
        rows = rows[:limit]
    return {
        "id": ds.id,
        "name": ds.name,
        "dataset_type": ds.dataset_type,
        "avg_record_confidence": ds.avg_record_confidence,
        "schema": ds.schema,
        "rows": rows,
    }

@router.get("/sectors")
async def get_sectors(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Get available sectors for upload"""
    existing_count = db.query(Sector).filter(Sector.company_id == current_user.company_id).count()
    if existing_count == 0:
        default_sectors = ["Sales", "Operations", "Finance", "HR"]
        for name in default_sectors:
            db.add(Sector(name=name, company_id=current_user.company_id))
        db.commit()

    sector_query = db.query(Sector).filter(Sector.company_id == current_user.company_id)
    if current_user.role == 'sector_head':
        sector_query = sector_query.filter(Sector.id == current_user.sector_id)
    sectors = sector_query.all()

    return [{"id": s.id, "name": s.name} for s in sectors]

@router.get("/products/{sector_id}")
async def get_products(
    sector_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get products for a sector"""
    sector = db.query(Sector).filter(
        Sector.id == sector_id,
        Sector.company_id == current_user.company_id
    ).first()
    if not sector:
        raise HTTPException(status_code=403, detail="Access denied")
    products = db.query(Product).filter(Product.sector_id == sector_id).all()
    return [{"id": p.id, "name": p.name} for p in products]

@router.get("/uploaded-data")
async def get_uploaded_data(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get all uploaded data with metadata"""
    
    try:
        allowed_sector_ids = [row[0] for row in _user_sector_ids_query(db, current_user).all()]
        allowed_user_ids = [row[0] for row in _role_scoped_user_ids_query(db, current_user).all()]
        if not allowed_sector_ids:
            return {"data": [], "total_count": 0}
        if not allowed_user_ids:
            return {"data": [], "total_count": 0}
        raw_data = db.query(RawData).filter(
            RawData.sector_id.in_(allowed_sector_ids),
            RawData.uploaded_by.in_(allowed_user_ids)
        ).all()
        
        result = []
        for data in raw_data:
            try:
                # Get sector name
                sector = db.query(Sector).filter(Sector.id == data.sector_id).first()
                sector_name = sector.name if sector else "Unknown"
                
                # Get product name if exists
                product_name = None
                if data.product_id:
                    product = db.query(Product).filter(Product.id == data.product_id).first()
                    product_name = product.name if product else None
                
                # Get cleaned data info
                cleaned = db.query(CleanedData).filter(CleanedData.raw_data_id == data.id).first()
                
                # Safely get row and column counts
                row_count = 0
                column_count = 0
                missing_cells = 0
                missing_percent = 0.0
                if data.data and isinstance(data.data, list) and len(data.data) > 0:
                    row_count = len(data.data)
                    if isinstance(data.data[0], dict):
                        column_count = len(data.data[0].keys())
                        total_cells = max(row_count * max(column_count, 1), 1)
                        missing_cells = sum(
                            1
                            for row in data.data
                            if isinstance(row, dict)
                            for value in row.values()
                            if value in [None, ""]
                        )
                        missing_percent = round((missing_cells / total_cells) * 100, 2)
                
                result.append({
                    "id": data.id,
                    "name": f"dataset_{data.id}.csv",
                    "sector_id": data.sector_id,
                    "sector_name": sector_name,
                    "product_id": data.product_id,
                    "product_name": product_name,
                    "uploaded_by": data.uploaded_by,
                    "uploaded_at": data.uploaded_at.isoformat() if hasattr(data, 'uploaded_at') and data.uploaded_at else None,
                    "row_count": row_count,
                    "column_count": column_count,
                    "missing_cells": missing_cells,
                    "missing_percent": missing_percent,
                    "columns": list(data.data[0].keys()) if row_count > 0 and isinstance(data.data[0], dict) else [],
                    "has_cleaned_data": cleaned is not None,
                    "cleaned_data_id": cleaned.id if cleaned else None,
                    "quality_score": cleaned.quality_score if cleaned else None,
                    "estimated_quality_score": round(max(0.0, 1 - (missing_percent / 100)), 4),
                })
            except Exception as item_error:
                # Skip items that cause errors
                continue
        
        return {
            "data": result,
            "total_count": len(result)
        }
    except Exception as e:
        # Return empty data on error
        return {
            "data": [],
            "total_count": 0,
            "error": str(e)
        }


@router.delete("/uploaded-data/{data_id}")
async def delete_uploaded_dataset(
    data_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Delete an uploaded dataset and its cleaned derivatives."""
    raw_data = db.query(RawData).filter(RawData.id == data_id).first()
    if not raw_data:
        raise HTTPException(status_code=404, detail="Dataset not found")

    sector = db.query(Sector).filter(Sector.id == raw_data.sector_id).first()
    if not sector or sector.company_id != current_user.company_id:
        raise HTTPException(status_code=403, detail="Access denied")
    if current_user.role == "sector_head" and raw_data.sector_id != current_user.sector_id:
        raise HTTPException(status_code=403, detail="Access denied")
    allowed_user_ids = [row[0] for row in _role_scoped_user_ids_query(db, current_user).all()]
    if raw_data.uploaded_by not in allowed_user_ids:
        raise HTTPException(status_code=403, detail="Access denied")

    cleaned_rows = db.query(CleanedData).filter(CleanedData.raw_data_id == raw_data.id).all()
    for cleaned in cleaned_rows:
        db.query(DataQualityScore).filter(DataQualityScore.cleaned_data_id == cleaned.id).delete()
        db.delete(cleaned)

    db.delete(raw_data)
    db.commit()
    return {"message": "Dataset deleted successfully", "deleted_data_id": data_id}
