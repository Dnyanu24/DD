from fastapi import APIRouter, UploadFile, File, Depends, HTTPException, Form
from sqlalchemy.orm import Session
from typing import Optional
import pandas as pd
import numpy as np
import json
import math
import re
import uuid
from datetime import datetime
from pathlib import Path

from app.database import SessionLocal
from app.models import RawData, CleanedData, DataQualityScore, Sector, Product, User
from app.dependencies import get_current_user
from app.services.file_ingest import (
    build_ingest_report,
    load_dataframe_from_upload_bytes,
    repair_dataframe_semantics,
)
from app.services.data_profiler import profile_dataframe

router = APIRouter()
UPLOAD_STORAGE_ROOT = Path(__file__).resolve().parents[2] / "storage" / "uploads"

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


def _dataset_missing_profile(records: list) -> dict:
    if not records or not isinstance(records[0], dict):
        return {
            "missing_cells": 0,
            "total_cells": 0,
            "missing_percent": 0.0,
            "missing_columns": [],
        }

    columns = list(records[0].keys())
    missing_by_column = {str(col): 0 for col in columns}
    missing_tokens = {"", "na", "n/a", "null", "none", "nan", "undefined", "unknown", "-", "--"}

    for row in records:
        if not isinstance(row, dict):
            continue
        for col in columns:
            value = row.get(col)
            is_missing = value is None
            if not is_missing and isinstance(value, str):
                is_missing = value.strip().lower() in missing_tokens
            if is_missing:
                missing_by_column[str(col)] += 1

    total_cells = len(records) * len(columns)
    missing_cells = sum(missing_by_column.values())
    missing_percent = round((missing_cells / total_cells) * 100, 2) if total_cells else 0.0
    missing_columns = [
        {
            "column": column,
            "missing": count,
            "percent": round((count / len(records)) * 100, 2) if records else 0.0,
        }
        for column, count in missing_by_column.items()
        if count > 0
    ]
    missing_columns.sort(key=lambda item: item["missing"], reverse=True)

    return {
        "missing_cells": missing_cells,
        "total_cells": total_cells,
        "missing_percent": missing_percent,
        "missing_columns": missing_columns[:8],
    }


def _safe_filename(filename: str) -> str:
    base = Path(filename or "uploaded_file").name
    safe = re.sub(r"[^a-zA-Z0-9._-]+", "_", base).strip("._")
    return safe or "uploaded_file"


def _store_original_upload(filename: str, content_type: str | None, data: bytes) -> dict:
    originals_dir = UPLOAD_STORAGE_ROOT / "originals"
    originals_dir.mkdir(parents=True, exist_ok=True)
    stored_name = (
        f"{datetime.utcnow().strftime('%Y%m%d%H%M%S')}_"
        f"{uuid.uuid4().hex[:8]}_{_safe_filename(filename)}"
    )
    stored_path = originals_dir / stored_name
    stored_path.write_bytes(data)
    backend_root = Path(__file__).resolve().parents[2]

    return {
        "filename": filename or "uploaded_file",
        "stored_name": stored_name,
        "stored_path": str(stored_path.relative_to(backend_root)),
        "size_bytes": len(data),
        "content_type": content_type or "",
    }


def _write_upload_manifest(raw_data_id: int, manifest: dict) -> str:
    manifests_dir = UPLOAD_STORAGE_ROOT / "manifests"
    manifests_dir.mkdir(parents=True, exist_ok=True)
    manifest_path = manifests_dir / f"raw_{raw_data_id}.json"
    manifest_path.write_text(
        json.dumps(_sanitize_json_payload(manifest), indent=2),
        encoding="utf-8",
    )
    backend_root = Path(__file__).resolve().parents[2]
    return str(manifest_path.relative_to(backend_root))


def _read_upload_manifest(raw_data_id: int) -> dict:
    manifest_path = UPLOAD_STORAGE_ROOT / "manifests" / f"raw_{raw_data_id}.json"
    if not manifest_path.exists():
        return {}
    try:
        return json.loads(manifest_path.read_text(encoding="utf-8"))
    except Exception:
        return {}


def _delete_upload_artifacts(raw_data_id: int) -> None:
    backend_root = Path(__file__).resolve().parents[2].resolve()
    storage_root = UPLOAD_STORAGE_ROOT.resolve()
    manifest = _read_upload_manifest(raw_data_id)

    original_path = (manifest.get("original_file") or {}).get("stored_path")
    if original_path:
        candidate = (backend_root / original_path).resolve()
        if storage_root in candidate.parents and candidate.exists():
            candidate.unlink()

    manifest_path = (UPLOAD_STORAGE_ROOT / "manifests" / f"raw_{raw_data_id}.json").resolve()
    if storage_root in manifest_path.parents and manifest_path.exists():
        manifest_path.unlink()

def _adaptive_upload_config(db: Session, df: pd.DataFrame) -> dict:
    from app.services.feedback_learning import FeedbackLearningEngine
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
    sector_id: Optional[int] = Form(None),
    product_id: Optional[int] = Form(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Upload multi-sector data with metadata tagging"""

    if not sector_id:
        sector_query = db.query(Sector).filter(Sector.company_id == current_user.company_id)
        if current_user.role == "sector_head":
            sector_query = sector_query.filter(Sector.id == current_user.sector_id)
        sector = sector_query.order_by(Sector.id.asc()).first()
        if not sector:
            default_sector = Sector(name="General", company_id=current_user.company_id)
            db.add(default_sector)
            db.commit()
            db.refresh(default_sector)
            sector = default_sector
        sector_id = sector.id
    else:
        sector = db.query(Sector).filter(
            Sector.id == sector_id,
            Sector.company_id == current_user.company_id
        ).first()
    if not sector:
        raise HTTPException(status_code=403, detail="Access denied: Sector not in your company")
    if current_user.role == 'sector_head' and current_user.sector_id != sector_id:
        raise HTTPException(status_code=403, detail="Access denied: Can only upload to assigned sector")

    try:
        file_bytes = await file.read()
        original_file = _store_original_upload(file.filename, file.content_type, file_bytes)
        df = repair_dataframe_semantics(
            load_dataframe_from_upload_bytes(file.filename, file_bytes, file.content_type)
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    # Metadata tagging
    # Store raw data
    safe_records = _to_json_safe_records(df)
    schema_profile = profile_dataframe(df)
    extraction = build_ingest_report(df, file.filename, file.content_type)
    ingest_warnings = extraction["warnings"]
    raw_data_entry = RawData(
        sector_id=sector_id,
        product_id=product_id,
        data=safe_records,  # Store JSON-safe records (no NaN/Inf)
        uploaded_by=current_user.id
    )
    db.add(raw_data_entry)
    db.commit()
    db.refresh(raw_data_entry)

    manifest_path = _write_upload_manifest(raw_data_entry.id, {
        "raw_data_id": raw_data_entry.id,
        "sector_id": sector_id,
        "product_id": product_id,
        "original_file": original_file,
        "extraction": extraction,
        "uploaded_by": current_user.id,
        "uploaded_at": datetime.utcnow().isoformat(),
    })

    # Upload keeps dataset in pending state; cleaning happens from Data Cleaning page.
    optimal_config = _adaptive_upload_config(db, df)

    payload = {
        "message": "Data uploaded successfully. Run cleaning from Data Cleaning page.",
        "raw_data_id": raw_data_entry.id,
        "cleaned_data_id": None,
        "preview": safe_records[:5],
        "quality_scores": {},
        "logs": [],
        "adaptive_config": optimal_config,
        "schema_profile": schema_profile,
        "ingest_warnings": ingest_warnings,
        "file_type": extraction["file_type"],
        "original_file": original_file,
        "extraction": extraction,
        "manifest_path": manifest_path,
    }
    return _sanitize_json_payload(payload)

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
                manifest = _read_upload_manifest(data.id)
                original_file = manifest.get("original_file") or {}
                extraction = manifest.get("extraction") or {}
                
                # Safely get row and column counts
                row_count = 0
                column_count = 0
                if data.data and isinstance(data.data, list) and len(data.data) > 0:
                    row_count = len(data.data)
                    if isinstance(data.data[0], dict):
                        column_count = len(data.data[0].keys())
                missing_profile = _dataset_missing_profile(data.data if isinstance(data.data, list) else [])
                
                result.append({
                    "id": data.id,
                    "name": original_file.get("filename") or f"dataset_{data.id}",
                    "file_type": extraction.get("file_type") or "unknown",
                    "original_file": original_file,
                    "extraction": extraction,
                    "sector_id": data.sector_id,
                    "sector_name": sector_name,
                    "product_id": data.product_id,
                    "product_name": product_name,
                    "uploaded_by": data.uploaded_by,
                    "uploaded_at": data.uploaded_at.isoformat() if hasattr(data, 'uploaded_at') and data.uploaded_at else None,
                    "row_count": row_count,
                    "column_count": column_count,
                    "missing_cells": missing_profile["missing_cells"],
                    "total_cells": missing_profile["total_cells"],
                    "missing_percent": missing_profile["missing_percent"],
                    "missing_columns": missing_profile["missing_columns"],
                    "columns": list(data.data[0].keys()) if row_count > 0 and isinstance(data.data[0], dict) else [],
                    "has_cleaned_data": cleaned is not None,
                    "cleaned_data_id": cleaned.id if cleaned else None,
                    "quality_score": cleaned.quality_score if cleaned else None
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
    _delete_upload_artifacts(data_id)
    return {"message": "Dataset deleted successfully", "deleted_data_id": data_id}
