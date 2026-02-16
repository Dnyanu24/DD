import pandas as pd
import numpy as np
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, mean_squared_error
from sklearn.linear_model import SGDRegressor
from sklearn.neural_network import MLPRegressor
from typing import Dict, Any, List, Optional
import logging
from datetime import datetime, timedelta
from sqlalchemy.orm import Session

from app.models import FeedbackLog, DataQualityScore, AIPrediction, RawData, CleanedData

logger = logging.getLogger(__name__)

class FeedbackLearningEngine:
    def __init__(self):
        self.learning_history = {}
        self.algorithm_weights = {
            'missing_value_imputation': {'mean': 0.5, 'median': 0.3, 'ml': 0.2},
            'outlier_detection': {'iqr': 0.6, 'zscore': 0.4},
            'normalization': {'min_max': 0.7, 'z_score': 0.3}
        }
        self.prediction_adjustments = {}
        # Online learning model (incremental updates from newest quality feedback).
        self.online_quality_model = SGDRegressor(random_state=42, max_iter=1000, tol=1e-3)
        # Backpropagation model (MLP) for non-linear quality trend mapping.
        self.backprop_quality_model = MLPRegressor(
            hidden_layer_sizes=(8, 4),
            activation="relu",
            random_state=42,
            max_iter=500,
        )
        self.online_initialized = False
        self.backprop_initialized = False

    def process_feedback(self, db: Session) -> Dict[str, Any]:
        """Process all feedback logs and update learning parameters"""

        # Get recent feedback (last 30 days)
        thirty_days_ago = datetime.utcnow() - timedelta(days=30)
        feedback_logs = db.query(FeedbackLog)\
            .filter(FeedbackLog.timestamp >= thirty_days_ago)\
            .all()

        if not feedback_logs:
            return {"message": "No recent feedback to process"}

        results = {
            "processed_feedback": len(feedback_logs),
            "algorithm_updates": {},
            "prediction_improvements": {}
        }

        # Process data cleaning feedback
        cleaning_feedback = [f for f in feedback_logs if f.feedback_type == 'correction']
        if cleaning_feedback:
            results["algorithm_updates"] = self._update_cleaning_algorithms(cleaning_feedback, db)

        # Process prediction feedback
        prediction_feedback = [f for f in feedback_logs if f.feedback_type == 'validation']
        if prediction_feedback:
            results["prediction_improvements"] = self._update_prediction_models(prediction_feedback, db)

        # Store learning insights
        self._store_learning_insights(results, db)

        return results

    def _update_cleaning_algorithms(self, feedback_logs: List[FeedbackLog], db: Session) -> Dict[str, Any]:
        """Update data cleaning algorithm preferences based on feedback"""

        updates = {}

        for feedback in feedback_logs:
            try:
                feedback_data = feedback.feedback_data

                # Get the original cleaned data
                cleaned_data = db.query(CleanedData)\
                    .filter(CleanedData.raw_data_id == feedback.data_id)\
                    .first()

                if not cleaned_data:
                    continue

                algorithm = cleaned_data.cleaning_algorithm
                quality_score = cleaned_data.quality_score

                # Analyze feedback to determine if algorithm performed well
                user_rating = feedback_data.get('quality_rating', 0.5)  # Assume 0-1 scale
                issues_reported = len(feedback_data.get('issues', []))

                # Calculate performance score
                performance_score = user_rating * (1 - issues_reported * 0.1)
                performance_score = max(0, min(1, performance_score))

                # Update algorithm weights
                if algorithm in self.algorithm_weights:
                    # Boost successful algorithms, reduce unsuccessful ones
                    adjustment = (performance_score - 0.5) * 0.1  # Small adjustments
                    for method in self.algorithm_weights[algorithm]:
                        self.algorithm_weights[algorithm][method] += adjustment
                        self.algorithm_weights[algorithm][method] = max(0.1, min(1.0,
                            self.algorithm_weights[algorithm][method]))

                updates[algorithm] = {
                    "performance_score": performance_score,
                    "user_rating": user_rating,
                    "issues_reported": issues_reported,
                    "updated_weights": self.algorithm_weights.get(algorithm, {})
                }

            except Exception as e:
                logger.error(f"Error processing cleaning feedback {feedback.id}: {str(e)}")

        return updates

    def _update_prediction_models(self, feedback_logs: List[FeedbackLog], db: Session) -> Dict[str, Any]:
        """Update prediction model parameters based on feedback"""

        improvements = {}

        for feedback in feedback_logs:
            try:
                feedback_data = feedback.feedback_data

                # Find related predictions
                predictions = db.query(AIPrediction)\
                    .filter(AIPrediction.sector_id == feedback.user.sector_id)\
                    .order_by(AIPrediction.predicted_at.desc())\
                    .limit(5).all()

                for prediction in predictions:
                    accuracy_feedback = feedback_data.get('prediction_accuracy', 0.5)
                    confidence_adjustment = (accuracy_feedback - prediction.confidence) * 0.05

                    # Update future confidence scores for this prediction type
                    pred_type = prediction.prediction_type
                    if pred_type not in self.prediction_adjustments:
                        self.prediction_adjustments[pred_type] = []

                    self.prediction_adjustments[pred_type].append({
                        "original_confidence": prediction.confidence,
                        "user_accuracy": accuracy_feedback,
                        "adjustment": confidence_adjustment,
                        "timestamp": datetime.utcnow()
                    })

                    improvements[pred_type] = {
                        "avg_accuracy_feedback": accuracy_feedback,
                        "confidence_adjustment": confidence_adjustment,
                        "predictions_updated": len(self.prediction_adjustments[pred_type])
                    }

            except Exception as e:
                logger.error(f"Error processing prediction feedback {feedback.id}: {str(e)}")

        return improvements

    def _store_learning_insights(self, results: Dict[str, Any], db: Session):
        """Store learning insights for future reference"""

        # This could be stored in a new table or as metadata
        # For now, we'll log the insights
        logger.info(f"Feedback Learning Results: {results}")

        # Update algorithm preferences in a configuration table (if exists)
        # For now, we'll keep it in memory, but in production this should be persisted

    def get_optimal_cleaning_config(self, data_characteristics: Dict[str, Any]) -> Dict[str, Any]:
        """Get optimal cleaning configuration based on learned preferences"""

        config = {
            'impute_strategy': self._choose_best_imputation(data_characteristics),
            'outlier_method': self._choose_best_outlier_method(data_characteristics),
            'normalize': data_characteristics.get('needs_normalization', True),
            'standardize': data_characteristics.get('needs_standardization', False),
            'reduce_noise': data_characteristics.get('has_noise', True),
            'clean_text': data_characteristics.get('has_text', True),
            'rules': {},
            'reference_data': {}
        }

        return config

    def update_models_from_feedback(self, db: Session) -> Dict[str, Any]:
        """
        Train feedback-learning models with historical quality scores.
        - Online learning: SGDRegressor with partial_fit.
        - Backprop learning: MLPRegressor fit on rolling quality features.
        """
        rows = db.query(DataQualityScore).order_by(DataQualityScore.timestamp.asc()).limit(500).all()
        if len(rows) < 8:
            return {"trained": False, "reason": "insufficient_history"}

        scores = np.array([float(r.score) for r in rows], dtype=float)
        x_data = []
        y_data = []
        for i in range(3, len(scores)):
            window = scores[max(0, i - 5):i]
            x_data.append([
                i / max(len(scores), 1),
                float(np.mean(window)),
                float(np.std(window)),
            ])
            y_data.append(scores[i])

        X = np.array(x_data, dtype=float)
        y = np.array(y_data, dtype=float)
        if len(X) < 5:
            return {"trained": False, "reason": "insufficient_features"}

        # Online model update
        if not self.online_initialized:
            self.online_quality_model.partial_fit(X, y)
            self.online_initialized = True
        else:
            self.online_quality_model.partial_fit(X[-20:], y[-20:])

        # Backprop model refresh
        self.backprop_quality_model.fit(X, y)
        self.backprop_initialized = True

        return {"trained": True, "samples": len(X)}

    def recommend_with_active_online_learning(
        self,
        data_characteristics: Dict[str, Any],
        historical_avg_quality: float,
        high_quality_rate: float,
    ) -> Dict[str, Any]:
        """
        Active + online recommendation:
        - Build candidate cleaning configs.
        - Predict quality with online/backprop models.
        - Select candidate using uncertainty sampling near decision boundary.
        """
        base_candidates = [
            {"impute_strategy": "mean", "outlier_method": "iqr", "normalize": True, "standardize": False},
            {"impute_strategy": "median", "outlier_method": "iqr", "normalize": True, "standardize": False},
            {"impute_strategy": "ml", "outlier_method": "zscore", "normalize": False, "standardize": True},
        ]

        if not (self.online_initialized or self.backprop_initialized):
            # Fallback to weight-driven strategy when no trained model is available.
            return {
                "config": self.get_optimal_cleaning_config(data_characteristics),
                "model": "heuristic_fallback",
                "predicted_quality": historical_avg_quality,
            }

        candidates = []
        for candidate in base_candidates:
            feature = np.array([[
                float(abs(data_characteristics.get("skewness", 0.0))),
                float(historical_avg_quality),
                float(high_quality_rate),
            ]], dtype=float)
            pred_online = None
            pred_backprop = None
            if self.online_initialized:
                pred_online = float(self.online_quality_model.predict(feature)[0])
            if self.backprop_initialized:
                pred_backprop = float(self.backprop_quality_model.predict(feature)[0])

            if pred_online is not None and pred_backprop is not None:
                pred_quality = (pred_online + pred_backprop) / 2.0
                uncertainty = abs(pred_online - pred_backprop)
                model = "online+backprop"
            elif pred_online is not None:
                pred_quality = pred_online
                uncertainty = abs(pred_online - historical_avg_quality)
                model = "online"
            else:
                pred_quality = pred_backprop
                uncertainty = abs(pred_backprop - historical_avg_quality)
                model = "backprop"

            candidates.append({
                "candidate": candidate,
                "predicted_quality": float(np.clip(pred_quality, 0.0, 1.0)),
                "uncertainty": float(uncertainty),
                "model": model,
            })

        # Active learning: prefer highest predicted quality, break ties by highest uncertainty
        # to explore uncertain areas and improve next online updates.
        candidates.sort(key=lambda c: (c["predicted_quality"], c["uncertainty"]), reverse=True)
        winner = candidates[0]

        config = {
            **self.get_optimal_cleaning_config(data_characteristics),
            **winner["candidate"],
        }

        return {
            "config": config,
            "model": winner["model"],
            "predicted_quality": round(winner["predicted_quality"], 4),
            "uncertainty": round(winner["uncertainty"], 4),
        }

    def _choose_best_imputation(self, data_characteristics: Dict[str, Any]) -> str:
        """Choose best imputation strategy based on learning"""

        # Simple logic: if data is skewed, prefer median; if normal, prefer mean; else ML
        skewness = data_characteristics.get('skewness', 0)

        if abs(skewness) > 1:
            return 'median' if self.algorithm_weights['missing_value_imputation']['median'] > 0.4 else 'ml'
        elif abs(skewness) < 0.5:
            return 'mean' if self.algorithm_weights['missing_value_imputation']['mean'] > 0.4 else 'ml'
        else:
            return 'ml' if self.algorithm_weights['missing_value_imputation']['ml'] > 0.3 else 'mean'

    def _choose_best_outlier_method(self, data_characteristics: Dict[str, Any]) -> str:
        """Choose best outlier detection method"""

        # Prefer IQR for most cases, Z-score for normal distributions
        distribution_type = data_characteristics.get('distribution', 'unknown')

        if distribution_type == 'normal':
            return 'zscore' if self.algorithm_weights['outlier_detection']['zscore'] > 0.4 else 'iqr'
        else:
            return 'iqr' if self.algorithm_weights['outlier_detection']['iqr'] > 0.5 else 'zscore'

    def get_adjusted_confidence(self, prediction_type: str, base_confidence: float) -> float:
        """Get adjusted confidence score based on feedback learning"""

        if prediction_type not in self.prediction_adjustments:
            return base_confidence

        adjustments = self.prediction_adjustments[prediction_type][-10:]  # Last 10 adjustments
        if not adjustments:
            return base_confidence

        avg_adjustment = np.mean([adj['adjustment'] for adj in adjustments])
        adjusted_confidence = base_confidence + avg_adjustment

        return max(0.1, min(1.0, adjusted_confidence))

    def generate_learning_report(self) -> Dict[str, Any]:
        """Generate a report on learning progress"""

        return {
            "algorithm_weights": self.algorithm_weights,
            "prediction_adjustments": {
                pred_type: len(adjustments)
                for pred_type, adjustments in self.prediction_adjustments.items()
            },
            "learning_history": len(self.learning_history),
            "last_updated": datetime.utcnow().isoformat()
        }

    def reset_learning(self):
        """Reset all learned parameters (for testing or reinitialization)"""

        self.algorithm_weights = {
            'missing_value_imputation': {'mean': 0.5, 'median': 0.3, 'ml': 0.2},
            'outlier_detection': {'iqr': 0.6, 'zscore': 0.4},
            'normalization': {'min_max': 0.7, 'z_score': 0.3}
        }
        self.prediction_adjustments = {}
        self.learning_history = {}
        logger.info("Feedback learning parameters reset")
