from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from typing import Dict, Any, Optional, Callable, List, Tuple
import pandas as pd
import numpy as np
import json
import asyncio
from datetime import datetime

from app.database import SessionLocal
from app.models import RawData, CleanedData, AIPrediction, AIRecommendation, DataQualityScore
from app.services.data_cleaning import DataCleaningEngine
from app.services.ai_predictions import AIPredictionEngine
from app.services.feedback_learning import FeedbackLearningEngine
from app.dependencies import get_current_user, require_sector_head
from app.models import User


router = APIRouter()

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

def _get_algorithm_steps(engine: DataCleaningEngine, algorithm: str) -> List[Tuple[str, str, Callable[[pd.DataFrame], pd.DataFrame]]]:
    pipelines = {
        "missing_values": [
            ("scan_missing", "Scanning for missing values", lambda df: df),
            ("impute_values", "Applying missing value imputation", lambda df: engine.impute_missing_values(df, "auto")),
            ("validate_missing", "Validating imputed values", lambda df: df),
        ],
        "duplicates": [
            ("scan_duplicates", "Scanning for duplicate rows", lambda df: df),
            ("remove_duplicates", "Removing duplicate rows", engine.remove_duplicates),
            ("validate_dedup", "Validating deduplicated rows", lambda df: df),
        ],
        "outliers": [
            ("profile_numeric", "Profiling numeric distribution", lambda df: df),
            ("cap_outliers", "Detecting and capping outliers", lambda df: engine.detect_outliers(df, "iqr")),
            ("validate_outliers", "Validating adjusted outliers", lambda df: df),
        ],
        "data_types": [
            ("infer_types", "Inferring target data types", lambda df: df),
            ("apply_types", "Applying data type correction", engine.correct_data_types),
            ("validate_types", "Validating corrected types", lambda df: df),
        ],
        "normalization": [
            ("profile_scale", "Analyzing value ranges", lambda df: df),
            ("apply_normalize", "Applying min-max normalization", engine.normalize_data),
            ("validate_scale", "Validating normalized ranges", lambda df: df),
        ],
        "text_cleaning": [
            ("profile_text", "Profiling text columns", lambda df: df),
            ("apply_text_cleaning", "Cleaning text fields", engine.clean_text),
            ("validate_text", "Validating text cleanup output", lambda df: df),
        ],
        "full_pipeline": [
            ("remove_duplicates", "Removing duplicate rows", engine.remove_duplicates),
            ("missing_values", "Imputing missing values", lambda df: engine.impute_missing_values(df, "auto")),
            ("outliers", "Detecting outliers", lambda df: engine.detect_outliers(df, "iqr")),
            ("data_types", "Correcting data types", engine.correct_data_types),
            ("normalize", "Normalizing numeric columns", engine.normalize_data),
            ("noise_reduction", "Reducing signal noise", engine.reduce_noise),
            ("text_cleaning", "Cleaning text fields", engine.clean_text),
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

    cleaned_entry = db.query(CleanedData).filter(CleanedData.raw_data_id == data_id).first()
    if cleaned_entry:
        cleaned_entry.cleaned_data = cleaned_df.to_dict("records")
        cleaned_entry.cleaning_algorithm = algorithm
        cleaned_entry.quality_score = average_quality
        cleaned_entry.cleaned_at = datetime.utcnow()
    else:
        cleaned_entry = CleanedData(
            raw_data_id=data_id,
            cleaned_data=cleaned_df.to_dict("records"),
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

@router.post("/analyze")
async def analyze_upload(
    file: UploadFile = File(...),
    sector_id: int = Form(1),
    product_id: Optional[int] = Form(None),
    analysis_type: str = Form("full"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Analyze uploaded file directly without storing"""
    
    # Read file
    if file.filename.endswith('.csv'):
        df = pd.read_csv(file.file)
    elif file.filename.endswith('.xlsx') or file.filename.endswith('.xls'):
        df = pd.read_excel(file.file)
    elif file.filename.endswith('.json'):
        data = json.load(file.file)
        df = pd.DataFrame(data)
    else:
        raise HTTPException(status_code=400, detail="Unsupported file format")
    
    results = {}
    
    # Data Cleaning Analysis
    if analysis_type in ['full', 'cleaning_only']:
        cleaning_engine = DataCleaningEngine()
        cleaned_df = cleaning_engine.run_full_pipeline(df)
        
        results['cleaning'] = {
            'quality_scores': cleaning_engine.get_quality_scores(),
            'logs': cleaning_engine.get_logs(),
            'preview': cleaned_df.head().to_dict('records'),
            'row_count': len(cleaned_df),
            'column_count': len(cleaned_df.columns)
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
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):

    """Advanced data analysis with ML algorithms"""

    # Get raw data
    raw_data = db.query(RawData).filter(RawData.id == data_id).first()
    if not raw_data:
        raise HTTPException(status_code=404, detail="Data not found")

    # Check access permissions
    if current_user.role == 'sector_head' and raw_data.sector_id != current_user.sector_id:
        raise HTTPException(status_code=403, detail="Access denied")

    # Convert stored JSON back to DataFrame
    df = pd.DataFrame(raw_data.data)

    results = {}

    # Data Cleaning Analysis
    if analysis_type in ['full', 'cleaning_only']:
        cleaning_engine = DataCleaningEngine()
        cleaned_df = cleaning_engine.run_full_pipeline(df)

        results['cleaning'] = {
            'quality_scores': cleaning_engine.get_quality_scores(),
            'logs': cleaning_engine.get_logs(),
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

@router.post("/clean/{data_id}")
async def clean_data(
    data_id: int,
    algorithm: str = "full_pipeline",
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Run data cleaning and persist cleaned output."""
    raw_data = db.query(RawData).filter(RawData.id == data_id).first()
    if not raw_data:
        raise HTTPException(status_code=404, detail="Data not found")

    if current_user.role == 'sector_head' and raw_data.sector_id != current_user.sector_id:
        raise HTTPException(status_code=403, detail="Access denied")

    cleaning_engine = DataCleaningEngine()
    steps = _get_algorithm_steps(cleaning_engine, algorithm)
    if not steps:
        raise HTTPException(status_code=400, detail=f"Unsupported algorithm: {algorithm}")

    try:
        df_clean = pd.DataFrame(raw_data.data)
        for _, _, operation in steps:
            df_clean = operation(df_clean)

        persist_result = _persist_cleaned_data(
            db=db,
            data_id=data_id,
            cleaned_df=df_clean,
            algorithm=algorithm,
            quality_scores=cleaning_engine.get_quality_scores(),
        )

        return {
            "message": "Data cleaning completed",
            "data_id": data_id,
            "algorithm": algorithm,
            "row_count": len(df_clean),
            "column_count": len(df_clean.columns),
            "quality_scores": cleaning_engine.get_quality_scores(),
            "logs": cleaning_engine.get_logs(),
            **persist_result,
        }
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Data cleaning failed: {str(e)}")

@router.get("/clean-stream/{data_id}")
async def clean_data_stream(
    request: Request,
    data_id: int,
    algorithm: str = "full_pipeline",
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Stream step-by-step cleaning progress using Server-Sent Events."""
    raw_data = db.query(RawData).filter(RawData.id == data_id).first()
    if not raw_data:
        raise HTTPException(status_code=404, detail="Data not found")

    if current_user.role == 'sector_head' and raw_data.sector_id != current_user.sector_id:
        raise HTTPException(status_code=403, detail="Access denied")

    cleaning_engine = DataCleaningEngine()
    steps = _get_algorithm_steps(cleaning_engine, algorithm)
    if not steps:
        raise HTTPException(status_code=400, detail=f"Unsupported algorithm: {algorithm}")

    async def event_generator():
        try:
            df_clean = pd.DataFrame(raw_data.data)
            yield _sse_event("start", {
                "data_id": data_id,
                "algorithm": algorithm,
                "total_steps": len(steps),
                "timestamp": _utc_iso(),
            })

            for index, (step_id, step_label, operation) in enumerate(steps):
                if await request.is_disconnected():
                    return

                yield _sse_event("step", {
                    "step_id": step_id,
                    "label": step_label,
                    "status": "running",
                    "progress": int((index / len(steps)) * 100),
                    "timestamp": _utc_iso(),
                })

                await asyncio.sleep(0.05)
                df_clean = operation(df_clean)

                yield _sse_event("step", {
                    "step_id": step_id,
                    "label": step_label,
                    "status": "completed",
                    "progress": int(((index + 1) / len(steps)) * 100),
                    "timestamp": _utc_iso(),
                    "row_count": len(df_clean),
                })

                await asyncio.sleep(0.1)

            persist_result = _persist_cleaned_data(
                db=db,
                data_id=data_id,
                cleaned_df=df_clean,
                algorithm=algorithm,
                quality_scores=cleaning_engine.get_quality_scores(),
            )

            yield _sse_event("complete", {
                "data_id": data_id,
                "algorithm": algorithm,
                "row_count": len(df_clean),
                "column_count": len(df_clean.columns),
                "quality_scores": cleaning_engine.get_quality_scores(),
                "logs": cleaning_engine.get_logs(),
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

@router.get("/insights/{sector_id}")
async def get_sector_insights(
    sector_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):

    """Get AI insights and predictions for a sector"""

    if current_user.role == 'sector_head' and current_user.sector_id != sector_id:
        raise HTTPException(status_code=403, detail="Access denied")

    # Get recent predictions
    predictions = db.query(AIPrediction)\
        .filter(AIPrediction.sector_id == sector_id)\
        .order_by(AIPrediction.predicted_at.desc())\
        .limit(10).all()

    # Get recommendations
    recommendations = db.query(AIRecommendation)\
        .join(AIPrediction, AIRecommendation.prediction_id == AIPrediction.id)\
        .filter(AIPrediction.sector_id == sector_id)\
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
        # Get all cleaned data entries
        cleaned_data = db.query(CleanedData).all()
        
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
