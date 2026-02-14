from fastapi import APIRouter, UploadFile, File, Depends, HTTPException, Form, BackgroundTasks
from sqlalchemy.orm import Session
from typing import Optional
import pandas as pd
import numpy as np
import json
from datetime import datetime
import asyncio

from app.database import SessionLocal
from app.models import RawData, CleanedData, DataQualityScore, Sector, Product, User, AIPrediction
from app.services.data_cleaning import DataCleaningEngine
from app.dependencies import get_current_user

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
            else:
                normalized_row[key] = value
        normalized.append(normalized_row)
    return normalized

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

@router.post("/upload")
async def upload_data(
    file: UploadFile = File(...),
    sector_id: int = Form(...),
    product_id: Optional[int] = Form(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Upload multi-sector data with metadata tagging"""

    # Validate sector access for sector heads
    if current_user.role == 'sector_head' and current_user.sector_id != sector_id:
        raise HTTPException(status_code=403, detail="Access denied: Can only upload to assigned sector")

    # Read file based on extension
    if file.filename.endswith('.csv'):
        df = pd.read_csv(file.file)
    elif file.filename.endswith('.xlsx') or file.filename.endswith('.xls'):
        df = pd.read_excel(file.file)
    elif file.filename.endswith('.json'):
        data = json.load(file.file)
        df = pd.DataFrame(data)
    else:
        raise HTTPException(status_code=400, detail="Unsupported file format")

    # Metadata tagging
    metadata = {
        'filename': file.filename,
        'sector_id': sector_id,
        'product_id': product_id,
        'uploaded_by': current_user.id,
        'uploaded_at': datetime.utcnow().isoformat(),
        'row_count': len(df),
        'column_count': len(df.columns),
        'columns': list(df.columns)
    }

    # Store raw data
    raw_data_entry = RawData(
        sector_id=sector_id,
        product_id=product_id,
        data=df.to_dict('records'),  # Store as JSON
        uploaded_by=current_user.id
    )
    db.add(raw_data_entry)
    db.commit()
    db.refresh(raw_data_entry)

    # Get adaptive config from prior quality feedback.
    optimal_config = _adaptive_upload_config(db, df)

    # Automatic data cleaning with learned preferences
    cleaning_engine = DataCleaningEngine()
    try:
        cleaned_df = cleaning_engine.run_full_pipeline(df, optimal_config)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Data cleaning during upload failed: {str(e)}")

    # Store cleaned data
    avg_quality = (
        sum(cleaning_engine.get_quality_scores().values()) / len(cleaning_engine.get_quality_scores())
        if cleaning_engine.get_quality_scores() else 0.0
    )

    cleaned_records = _to_json_safe_records(cleaned_df)
    cleaned_data_entry = CleanedData(
        raw_data_id=raw_data_entry.id,
        cleaned_data=cleaned_records,
        cleaning_algorithm='full_pipeline',
        quality_score=avg_quality
    )
    db.add(cleaned_data_entry)
    db.commit()

    # Store quality scores
    quality_scores = cleaning_engine.get_quality_scores()
    for algorithm, score in quality_scores.items():
        score_entry = DataQualityScore(
            cleaned_data_id=cleaned_data_entry.id,
            score=score,
            algorithm=algorithm
        )
        db.add(score_entry)
    db.commit()

    # Generate AI predictions automatically
    from app.services.ai_predictions import AIPredictionEngine
    ai_engine = AIPredictionEngine()

    # Basic forecasting if time series data detected
    numeric_cols = cleaned_df.select_dtypes(include=[np.number]).columns
    if len(numeric_cols) > 0 and len(cleaned_df) > 10:
        try:
            forecast_result = ai_engine.forecast_sales(cleaned_df, numeric_cols[0], periods=6)
            # Store prediction in DB
            prediction_entry = AIPrediction(
                sector_id=sector_id,
                product_id=product_id,
                prediction_type='sales_forecast',
                prediction_data=forecast_result,
                confidence=forecast_result.get('confidence', 0.5)
            )
            db.add(prediction_entry)
            db.commit()
        except Exception as e:
            print(f"Forecasting failed: {e}")

    return {
        "message": "Data uploaded and processed successfully",
        "raw_data_id": raw_data_entry.id,
        "cleaned_data_id": cleaned_data_entry.id,
        "preview": cleaned_records[:5],
        "quality_scores": quality_scores,
        "logs": cleaning_engine.get_logs(),
        "adaptive_config": optimal_config
    }

@router.get("/sectors")
async def get_sectors(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Get available sectors for upload"""
    existing_count = db.query(Sector).count()
    if existing_count == 0:
        bootstrap_company_id = current_user.company_id or 1
        default_sectors = ["Sales", "Operations", "Finance", "HR"]
        for name in default_sectors:
            db.add(Sector(name=name, company_id=bootstrap_company_id))
        db.commit()

    if current_user.role == 'sector_head':
        sectors = db.query(Sector).filter(Sector.id == current_user.sector_id).all()
    else:
        sectors = db.query(Sector).all()

    return [{"id": s.id, "name": s.name} for s in sectors]

@router.get("/products/{sector_id}")
async def get_products(sector_id: int, db: Session = Depends(get_db)):
    """Get products for a sector"""
    products = db.query(Product).filter(Product.sector_id == sector_id).all()
    return [{"id": p.id, "name": p.name} for p in products]

@router.get("/uploaded-data")
async def get_uploaded_data(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get all uploaded data with metadata"""
    
    try:
        # Query raw data with related info
        raw_data = db.query(RawData).all()
        
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
                if data.data and isinstance(data.data, list) and len(data.data) > 0:
                    row_count = len(data.data)
                    if isinstance(data.data[0], dict):
                        column_count = len(data.data[0].keys())
                
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
