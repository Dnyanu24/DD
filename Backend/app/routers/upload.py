from fastapi import APIRouter, UploadFile, File, Depends, HTTPException, Form
from sqlalchemy.orm import Session
from typing import Optional
import pandas as pd
import json
from datetime import datetime

from app.database import SessionLocal
from app.models import RawData, CleanedData, DataQualityScore, Sector, Product, User
from app.services.data_cleaning import DataCleaningEngine
from app.dependencies import get_current_user

router = APIRouter()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

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

    # Automatic data cleaning
    cleaning_engine = DataCleaningEngine()
    cleaned_df = cleaning_engine.run_full_pipeline(df)

    # Store cleaned data
    cleaned_data_entry = CleanedData(
        raw_data_id=raw_data_entry.id,
        cleaned_data=cleaned_df.to_dict('records'),
        cleaning_algorithm='full_pipeline',
        quality_score=0.85  # Placeholder, calculate properly
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
        "preview": cleaned_df.head().to_dict('records'),
        "quality_scores": quality_scores,
        "logs": cleaning_engine.get_logs()
    }

@router.get("/sectors")
async def get_sectors(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Get available sectors for upload"""
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
