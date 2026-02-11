import pandas as pd
import numpy as np
from sklearn.linear_model import LinearRegression
from sklearn.ensemble import RandomForestRegressor
from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_squared_error, r2_score
from statsmodels.tsa.arima.model import ARIMA
from statsmodels.tsa.holtwinters import ExponentialSmoothing
import logging
from typing import Dict, Any, List, Optional
from datetime import datetime, timedelta
import json

logger = logging.getLogger(__name__)

class AIPredictionEngine:
    def __init__(self):
        self.models = {}
        self.predictions = []
        self.confidence_scores = {}

    def log_prediction(self, prediction_type: str, details: Dict[str, Any]):
        """Log prediction action"""
        log_entry = {
            "timestamp": datetime.utcnow().isoformat(),
            "type": prediction_type,
            "details": details
        }
        self.predictions.append(log_entry)
        logger.info(f"AI Prediction: {prediction_type} - {details}")

    def calculate_confidence(self, y_true: np.ndarray, y_pred: np.ndarray) -> float:
        """Calculate prediction confidence score"""
        if len(y_true) == 0:
            return 0.5  # Default confidence

        mse = mean_squared_error(y_true, y_pred)
        r2 = r2_score(y_true, y_pred)

        # Confidence based on R² score (higher is better)
        confidence = max(0.1, min(1.0, (r2 + 1) / 2))
        return confidence

    # 1. Sales/Demand Forecasting
    def forecast_sales(self, data: pd.DataFrame, target_column: str,
                      periods: int = 12, method: str = 'arima') -> Dict[str, Any]:
        """Forecast sales or demand using time series methods"""

        if target_column not in data.columns:
            raise ValueError(f"Target column '{target_column}' not found in data")

        # Prepare time series data
        ts_data = data[target_column].dropna()

        if len(ts_data) < 10:
            raise ValueError("Insufficient data for forecasting")

        try:
            if method == 'arima':
                model = ARIMA(ts_data, order=(1, 1, 1))
                model_fit = model.fit()
                forecast = model_fit.forecast(steps=periods)
            elif method == 'exponential_smoothing':
                model = ExponentialSmoothing(ts_data, seasonal='add', seasonal_periods=12)
                model_fit = model.fit()
                forecast = model_fit.forecast(periods)
            else:
                # Simple linear regression on time index
                X = np.arange(len(ts_data)).reshape(-1, 1)
                y = ts_data.values
                model = LinearRegression()
                model.fit(X, y)
                future_X = np.arange(len(ts_data), len(ts_data) + periods).reshape(-1, 1)
                forecast = model.predict(future_X)

            # Calculate confidence (using in-sample prediction)
            train_pred = model_fit.predict() if hasattr(model_fit, 'predict') else model.predict(X)
            confidence = self.calculate_confidence(y, train_pred)

            result = {
                'forecast': forecast.tolist(),
                'confidence': confidence,
                'method': method,
                'periods': periods,
                'historical_data_points': len(ts_data)
            }

            self.log_prediction('sales_forecast', {
                'target_column': target_column,
                'method': method,
                'periods': periods,
                'confidence': confidence
            })

            return result

        except Exception as e:
            logger.error(f"Forecasting failed: {str(e)}")
            return {'error': str(e), 'confidence': 0.0}

    # 2. Trend & Anomaly Detection
    def detect_trends_anomalies(self, data: pd.DataFrame, target_column: str) -> Dict[str, Any]:
        """Detect trends and anomalies in time series data"""

        if target_column not in data.columns:
            raise ValueError(f"Target column '{target_column}' not found in data")

        values = data[target_column].dropna().values

        if len(values) < 10:
            raise ValueError("Insufficient data for trend analysis")

        # Calculate moving averages
        ma_short = pd.Series(values).rolling(window=7).mean()
        ma_long = pd.Series(values).rolling(window=30).mean()

        # Detect trend
        trend = 'stable'
        if ma_short.iloc[-1] > ma_long.iloc[-1] * 1.05:
            trend = 'increasing'
        elif ma_short.iloc[-1] < ma_long.iloc[-1] * 0.95:
            trend = 'decreasing'

        # Detect anomalies using Z-score
        z_scores = np.abs((values - np.mean(values)) / np.std(values))
        anomalies = np.where(z_scores > 3)[0]

        # Calculate trend strength
        trend_strength = abs(ma_short.iloc[-1] - ma_long.iloc[-1]) / ma_long.iloc[-1] if ma_long.iloc[-1] != 0 else 0

        result = {
            'trend': trend,
            'trend_strength': trend_strength,
            'anomalies': anomalies.tolist(),
            'anomaly_count': len(anomalies),
            'moving_average_short': ma_short.iloc[-1],
            'moving_average_long': ma_long.iloc[-1],
            'confidence': 0.8  # Placeholder confidence
        }

        self.log_prediction('trend_anomaly_detection', {
            'target_column': target_column,
            'trend': trend,
            'anomalies_detected': len(anomalies)
        })

        return result

    # 3. Risk Prediction
    def predict_risk(self, data: pd.DataFrame, features: List[str], target_column: str) -> Dict[str, Any]:
        """Predict risk using machine learning classification/regression"""

        if target_column not in data.columns:
            raise ValueError(f"Target column '{target_column}' not found in data")

        # Prepare features
        X = data[features].dropna()
        y = data.loc[X.index, target_column]

        if len(X) < 10:
            raise ValueError("Insufficient data for risk prediction")

        # Split data
        X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

        # Train model
        model = RandomForestRegressor(n_estimators=100, random_state=42)
        model.fit(X_train, y_train)

        # Make predictions
        y_pred = model.predict(X_test)
        confidence = self.calculate_confidence(y_test, y_pred)

        # Feature importance
        feature_importance = dict(zip(features, model.feature_importances_))

        result = {
            'predicted_risk': float(np.mean(y_pred)),
            'confidence': confidence,
            'feature_importance': feature_importance,
            'model_type': 'random_forest',
            'test_score': float(model.score(X_test, y_test))
        }

        self.log_prediction('risk_prediction', {
            'target_column': target_column,
            'features': features,
            'confidence': confidence
        })

        return result

    # 4. AI Decision Recommendation Engine
    def generate_recommendations(self, predictions: Dict[str, Any], context: Dict[str, Any]) -> Dict[str, Any]:
        """Generate AI-powered recommendations based on predictions"""

        recommendations = []
        explanations = []

        # Sales forecasting recommendations
        if 'forecast' in predictions:
            forecast_data = predictions['forecast']
            if isinstance(forecast_data, dict) and 'forecast' in forecast_data:
                forecast_values = forecast_data['forecast']
                avg_forecast = np.mean(forecast_values)

                if avg_forecast > context.get('current_average', 0) * 1.1:
                    recommendations.append("Increase production capacity - strong sales growth expected")
                    explanations.append("Forecast shows 10%+ growth above current average")
                elif avg_forecast < context.get('current_average', 0) * 0.9:
                    recommendations.append("Implement cost reduction measures - sales decline expected")
                    explanations.append("Forecast indicates potential sales decline")

        # Trend-based recommendations
        if 'trend' in predictions:
            trend = predictions['trend']
            if trend == 'increasing':
                recommendations.append("Scale up marketing efforts to capitalize on growth trend")
                explanations.append("Positive trend detected in key metrics")
            elif trend == 'decreasing':
                recommendations.append("Conduct market analysis to identify decline causes")
                explanations.append("Negative trend detected requiring immediate attention")

        # Risk-based recommendations
        if 'predicted_risk' in predictions:
            risk_level = predictions['predicted_risk']
            if risk_level > 0.7:
                recommendations.append("Implement risk mitigation strategies immediately")
                explanations.append(f"High risk score of {risk_level:.2f} detected")
            elif risk_level > 0.4:
                recommendations.append("Monitor risk indicators closely")
                explanations.append(f"Moderate risk level of {risk_level:.2f}")

        # Anomaly-based recommendations
        if 'anomaly_count' in predictions and predictions['anomaly_count'] > 0:
            recommendations.append("Investigate data anomalies for potential issues")
            explanations.append(f"{predictions['anomaly_count']} anomalies detected in recent data")

        result = {
            'recommendations': recommendations,
            'explanations': explanations,
            'priority_level': 'high' if len(recommendations) > 2 else 'medium',
            'generated_at': datetime.utcnow().isoformat()
        }

        self.log_prediction('decision_recommendations', {
            'recommendations_count': len(recommendations),
            'priority': result['priority_level']
        })

        return result

    # 5. Sector Ranking & Comparison
    def rank_sectors(self, sector_data: Dict[str, pd.DataFrame], metrics: List[str]) -> Dict[str, Any]:
        """Rank sectors based on multiple performance metrics"""

        rankings = {}
        scores = {}

        for sector, data in sector_data.items():
            sector_score = 0
            metric_scores = {}

            for metric in metrics:
                if metric in data.columns:
                    values = data[metric].dropna()
                    if len(values) > 0:
                        # Normalize to 0-1 scale
                        normalized_score = (values.mean() - values.min()) / (values.max() - values.min()) if values.max() != values.min() else 0.5
                        metric_scores[metric] = normalized_score
                        sector_score += normalized_score

            scores[sector] = sector_score / len(metrics) if metrics else 0
            rankings[sector] = metric_scores

        # Sort by score
        sorted_sectors = sorted(scores.items(), key=lambda x: x[1], reverse=True)

        result = {
            'rankings': [{'sector': sector, 'score': score, 'metrics': rankings[sector]} for sector, score in sorted_sectors],
            'top_performer': sorted_sectors[0][0] if sorted_sectors else None,
            'comparison_insights': self._generate_comparison_insights(sorted_sectors, rankings)
        }

        self.log_prediction('sector_ranking', {
            'sectors_ranked': len(sorted_sectors),
            'top_sector': result['top_performer']
        })

        return result

    def _generate_comparison_insights(self, sorted_sectors: List[tuple], rankings: Dict) -> List[str]:
        """Generate insights from sector comparison"""
        insights = []

        if len(sorted_sectors) >= 2:
            top_sector = sorted_sectors[0][0]
            bottom_sector = sorted_sectors[-1][0]

            insights.append(f"{top_sector} leads in overall performance")
            insights.append(f"{bottom_sector} shows potential for improvement")

            # Compare specific metrics
            for sector, metrics in rankings.items():
                for metric, score in metrics.items():
                    if score > 0.8:
                        insights.append(f"{sector} excels in {metric}")
                    elif score < 0.3:
                        insights.append(f"{sector} needs improvement in {metric}")

        return insights

    # 6. Natural Language Query Support (Basic)
    def process_nl_query(self, query: str, available_data: Dict[str, Any]) -> Dict[str, Any]:
        """Process natural language queries about data insights"""

        query_lower = query.lower()

        response = {
            'query': query,
            'insights': [],
            'data_requested': [],
            'confidence': 0.7
        }

        # Simple keyword-based processing
        if 'trend' in query_lower:
            response['insights'].append("Analyzing current trends in your data")
            response['data_requested'].append('trend_analysis')
        elif 'forecast' in query_lower or 'predict' in query_lower:
            response['insights'].append("Generating predictions based on historical data")
            response['data_requested'].append('forecasting')
        elif 'risk' in query_lower:
            response['insights'].append("Assessing risk factors in your operations")
            response['data_requested'].append('risk_analysis')
        elif 'compare' in query_lower or 'ranking' in query_lower:
            response['insights'].append("Comparing performance across sectors")
            response['data_requested'].append('sector_comparison')
        else:
            response['insights'].append("Please specify what you'd like to analyze (trends, forecasts, risks, comparisons)")

        self.log_prediction('nl_query_processing', {
            'query': query,
            'insights_generated': len(response['insights'])
        })

        return response

    def get_predictions_log(self) -> List[Dict]:
        """Get all prediction logs"""
        return self.predictions

    def get_confidence_scores(self) -> Dict[str, float]:
        """Get confidence scores for predictions"""
        return self.confidence_scores
