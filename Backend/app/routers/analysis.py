from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Dict, Any, Optional
import pandas as pd
import json

from app.database import SessionLocal
from app.models import RawData, CleanedData, AIPrediction, AIRecommendation
from app.services.data_cleaning import DataCleaningEngine
from app.services.ai_predictions import AIPredictionEngine
from app.dependencies import get_current_user, require_sector_head
from app.models import User

router = APIRouter()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@router.post("/analyze/{data_id}")
async def analyze_data(
    data_id: int,
    analysis_type: str = "full",  # full, cleaning_only, prediction_only
    current_user: User = Depends(require_sector_head),
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

@router.get("/insights/{sector_id}")
async def get_sector_insights(
    sector_id: int,
    current_user: User = Depends(require_sector_head),
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
