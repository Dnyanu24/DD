import numpy as np
import pandas as pd
from typing import Dict, Any, List
from sqlalchemy.orm import Session
from app.models import FeedbackIteration, ClassificationResult, ClusteringResult, DataQualityScore

class ConfidenceScorer:
    def __init__(self, db: Session = None):
        self.db = db

    def compute_weighted_confidence(self, df: pd.DataFrame, weights: Dict[str, float] = None) -> pd.Series:
        """Phase 5: Weighted confidence = classif(0.4) + clustering(0.3) + anomaly(0.3)."""
        default_weights = {'classification': 0.4, 'clustering': 0.3, 'anomaly': 0.3}
        if weights:
            default_weights.update(weights)
        
        conf_cols = ['confidence_product', 'confidence_sector', 'confidence_hierarchical', 'fusion_confidence']
        classif_mean = df[conf_cols].mean().mean() if any(c in df.columns for c in conf_cols) else 0.5
        
        cluster_score = df.get('silhouette_score', 0.0).mean() if 'silhouette_score' in df else 0.0
        anomaly_proxy = 1.0 - df.get('missing_percent', 0.0)/100  # Quality as anomaly inverse
        
        weighted = (default_weights['classification'] * classif_mean +
                   default_weights['clustering'] * max(0, cluster_score) +
                   default_weights['anomaly'] * anomaly_proxy)
        
        df['overall_confidence'] = weighted
        return df['overall_confidence']

    def rule_validation(self, df: pd.DataFrame, rules: Dict[str, Any]) -> Dict[str, Any]:
        """Rule-based validation (business rules)."""
        violations = []
        for col, rule in rules.items():
            if col not in df.columns:
                continue
            if rule.get('type') == 'range':
                mask = (df[col] < rule['min']) | (df[col] > rule['max'])
                violations.append({'column': col, 'rule': 'range', 'violations': int(mask.sum())})
            elif rule.get('type') == 'category':
                valid_cats = set(rule['valid_values'])
                invalid_mask = ~df[col].isin(valid_cats)
                violations.append({'column': col, 'rule': 'category', 'violations': int(invalid_mask.sum())})
        
        valid_pct = max(0, 1.0 - sum(v['violations'] for v in violations) / len(df))
        return {'valid_pct': valid_pct, 'violations': violations}

    def cross_validation(self, df: pd.DataFrame, n_folds: int = 5) -> Dict[str, Any]:
        """K-fold stability check (proxy CV)."""
        numeric_cols = df.select_dtypes(include=[np.number]).columns
        if len(numeric_cols) == 0:
            return {'cv_stability': 1.0}
        
        stability_scores = []
        for col in numeric_cols[:3]:  # Sample cols
            series = df[col].dropna()
            if len(series) < n_folds:
                continue
            folds = np.array_split(series, n_folds)
            fold_means = [f.mean() for f in folds]
            stability = 1.0 - (np.std(fold_means) / max(np.mean(fold_means), 1e-8))
            stability_scores.append(stability)
        
        cv_score = np.mean(stability_scores) if stability_scores else 1.0
        return {'cv_stability': float(cv_score), 'n_folds': n_folds}

    def detect_conflicts(self, df: pd.DataFrame) -> List[Dict[str, Any]]:
        """Conflict detection (e.g., inconsistent classifications)."""
        conflicts = []
        if 'sector_class' in df and 'product_class' in df:
            sector_product_mismatches = df[df['sector_class'] == 'IT']['product_class'].isin(['Food', 'Apparel']).sum()
            if sector_product_mismatches > 0:
                conflicts.append({
                    'type': 'semantic_inconsistency',
                    'count': int(sector_product_mismatches),
                    'description': 'IT sector with Food/Apparel products'
                })
        return conflicts

    def active_feedback_loop(self, df: pd.DataFrame, prev_confidence: float, current_confidence: float, db: Session) -> Dict[str, Any]:
        """Feedback loop: improve if drop detected."""
        if prev_confidence is None:
            prev_confidence = 0.5
        
        improvement = current_confidence - prev_confidence
        feedback = {
            'delta': float(improvement),
            'action': 'none'
        }
        
        if improvement < -0.1:  # Significant drop
            # Log for meta-learner
            feedback['action'] = 'retrain_weights'
            if db:
                iteration = FeedbackIteration(
                    cleaned_data_id=getattr(df, 'cleaned_data_id', None),
                    iteration=1,
                    confidence_weights={'classification': 0.3, 'clustering': 0.4, 'anomaly': 0.3},  # Adjust
                    validation_errors={'drop_detected': True},
                    feedback_applied={'weight_shift': True},
                    improved_score=float(current_confidence)
                )
                db.add(iteration)
                db.commit()
        
        return feedback

    def run_confidence_pipeline(self, df: pd.DataFrame, rules: Dict[str, Any] = None, prev_conf: float = None, db: Session = None) -> Dict[str, Any]:
        """Full Phase 5 pipeline."""
        df['confidence_before'] = df.get('overall_confidence', 0.5)
        
        conf_series = self.compute_weighted_confidence(df)
        rule_valid = self.rule_validation(df, rules or {})
        cv_stability = self.cross_validation(df)
        conflicts = self.detect_conflicts(df)
        
        final_conf = conf_series.mean() * rule_valid['valid_pct'] * cv_stability['cv_stability']
        feedback = self.active_feedback_loop(df, prev_conf, final_conf, db)
        
        df['final_confidence'] = final_conf
        
        return {
            'df': df,
            'overall_confidence': float(final_conf),
            'rule_validation': rule_valid,
            'cv_stability': cv_stability,
            'conflicts': conflicts,
            'feedback': feedback
        }


# Usage in orchestrator:
# scorer = ConfidenceScorer(db)
# conf_result = scorer.run_confidence_pipeline(df_classified)

