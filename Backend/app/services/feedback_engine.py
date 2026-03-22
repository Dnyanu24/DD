from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

import pandas as pd
from sqlalchemy.orm import Session

from app.models import PipelineIterationLog
from app.services.ai_predictions import AIPredictionEngine
from app.services.data_cleaning import DataCleaningEngine
from app.services.root_cause_analyzer import RootCauseAnalyzer


@dataclass
class FeedbackRunResult:
    run_key: str
    status: str
    iterations: int
    best_result: Dict[str, Any]
    best_metrics: Dict[str, Any]
    best_cleaning_config: Dict[str, Any]
    best_score: float
    baseline_previous_metrics: Optional[Dict[str, Any]]
    logs: List[Dict[str, Any]]
    cleaned_df: Optional[pd.DataFrame] = None


class FeedbackEngine:
    """
    Cross-layer feedback loop:
    - Run pipeline + model evaluation.
    - Detect performance drop vs previous runs.
    - Analyze root cause from dataset stats.
    - Tune preprocessing (imputation/scaling) and re-run until improvement or max iterations.
    - Persist iteration logs to SQLite via PipelineIterationLog.
    """

    def __init__(
        self,
        db: Session,
        company_id: int,
        sector_id: Optional[int],
        task: str,
        *,
        max_iterations: int = 3,
        performance_drop_threshold: float = 0.02,
        min_iteration_improvement: float = 0.005,
    ):
        self.db = db
        self.company_id = int(company_id)
        self.sector_id = int(sector_id) if sector_id is not None else None
        self.task = str(task)
        self.max_iterations = int(max(1, max_iterations))
        self.performance_drop_threshold = float(performance_drop_threshold)
        self.min_iteration_improvement = float(min_iteration_improvement)

        self.cleaning_engine = DataCleaningEngine()
        self.ai_engine = AIPredictionEngine()
        self.analyzer = RootCauseAnalyzer()

    @staticmethod
    def _utc_iso() -> str:
        return datetime.utcnow().isoformat()

    @staticmethod
    def _primary_score(metrics: Dict[str, Any]) -> Tuple[float, str]:
        """
        Convert heterogeneous metrics to a single "higher is better" score.
        Returns (score, metric_name).
        """
        if not isinstance(metrics, dict):
            return 0.0, "unknown"

        if "f1" in metrics and metrics.get("f1") is not None:
            try:
                return float(metrics["f1"]), "f1"
            except Exception:
                pass

        if "accuracy" in metrics and metrics.get("accuracy") is not None:
            try:
                return float(metrics["accuracy"]), "accuracy"
            except Exception:
                pass

        # Regression: prefer -rmse (lower rmse is better).
        if "rmse" in metrics and metrics.get("rmse") is not None:
            try:
                return -float(metrics["rmse"]), "-rmse"
            except Exception:
                pass

        if "r2" in metrics and metrics.get("r2") is not None:
            try:
                return float(metrics["r2"]), "r2"
            except Exception:
                pass

        return 0.0, "unknown"

    def _latest_previous_run(self) -> Optional[PipelineIterationLog]:
        q = self.db.query(PipelineIterationLog).filter(
            PipelineIterationLog.company_id == self.company_id,
            PipelineIterationLog.task == self.task,
        )
        if self.sector_id is not None:
            q = q.filter(PipelineIterationLog.sector_id == self.sector_id)
        return q.order_by(PipelineIterationLog.created_at.desc()).first()

    def _log_iteration(
        self,
        *,
        run_key: str,
        iteration: int,
        status: str,
        metrics: Dict[str, Any],
        previous_metrics: Optional[Dict[str, Any]],
        dataset_stats: Dict[str, Any],
        cleaning_config: Dict[str, Any],
        root_cause: Dict[str, Any],
        notes: Optional[str] = None,
    ) -> int:
        entry = PipelineIterationLog(
            company_id=self.company_id,
            sector_id=self.sector_id,
            task=self.task,
            run_key=str(run_key),
            iteration=int(iteration),
            status=str(status),
            metrics=dict(metrics or {}),
            previous_metrics=dict(previous_metrics or {}) if previous_metrics else None,
            dataset_stats=dict(dataset_stats or {}),
            cleaning_config=dict(cleaning_config or {}),
            root_cause=dict(root_cause or {}),
            notes=notes,
            created_at=datetime.utcnow(),
        )
        self.db.add(entry)
        self.db.commit()
        self.db.refresh(entry)
        return int(entry.id)

    @staticmethod
    def _default_cleaning_config() -> Dict[str, Any]:
        return {
            "impute_strategy": "auto",
            "knn_k": 5,
            "outlier_method": "iqr",
            "normalize": True,
            "standardize": False,
            "reduce_noise": True,
            "clean_text": True,
            "rules": {},
            "reference_data": {},
        }

    @staticmethod
    def _merge_config(base: Dict[str, Any], updates: Dict[str, Any]) -> Dict[str, Any]:
        merged = dict(base or {})
        for k, v in (updates or {}).items():
            merged[k] = v
        # Avoid normalize + standardize simultaneously.
        if merged.get("standardize") and merged.get("normalize"):
            merged["normalize"] = False
        return merged

    def _evaluate_once(
        self,
        raw_df: pd.DataFrame,
        features: List[str],
        target_column: str,
        cleaning_config: Dict[str, Any],
    ) -> Tuple[pd.DataFrame, Dict[str, Any]]:
        cleaned_df = self.cleaning_engine.run_full_pipeline(raw_df, cleaning_config)

        missing_features = [f for f in features if f not in cleaned_df.columns]
        if missing_features:
            raise ValueError(f"Missing feature columns after cleaning: {missing_features}")
        if target_column not in cleaned_df.columns:
            raise ValueError(f"Missing target column after cleaning: {target_column}")

        result = self.ai_engine.predict_risk(cleaned_df, features, target_column)
        metrics = result.get("metrics") or {}
        return cleaned_df, {"result": result, "metrics": metrics}

    def optimize_risk_prediction(
        self,
        raw_df: pd.DataFrame,
        *,
        features: List[str],
        target_column: str,
        initial_cleaning_config: Optional[Dict[str, Any]] = None,
        run_key: Optional[str] = None,
    ) -> FeedbackRunResult:
        run_key = run_key or f"{self.task}:{self.company_id}:{self.sector_id or 'all'}:{datetime.utcnow().strftime('%Y%m%dT%H%M%S')}"

        prev_log = self._latest_previous_run()
        baseline_prev_metrics = (prev_log.metrics if prev_log and isinstance(prev_log.metrics, dict) else None)
        baseline_prev_score, baseline_prev_metric_name = self._primary_score(baseline_prev_metrics or {})

        config = self._merge_config(self._default_cleaning_config(), initial_cleaning_config or {})

        best_score = float("-inf")
        best_result: Dict[str, Any] = {}
        best_metrics: Dict[str, Any] = {}
        best_config: Dict[str, Any] = dict(config)
        best_df: Optional[pd.DataFrame] = None

        logs: List[Dict[str, Any]] = []
        attempted_configs = set()

        def config_fingerprint(cfg: Dict[str, Any]) -> str:
            keep = {
                "impute_strategy": cfg.get("impute_strategy"),
                "knn_k": cfg.get("knn_k"),
                "outlier_method": cfg.get("outlier_method"),
                "normalize": bool(cfg.get("normalize")),
                "standardize": bool(cfg.get("standardize")),
                "reduce_noise": bool(cfg.get("reduce_noise")),
                "clean_text": bool(cfg.get("clean_text")),
            }
            return str(sorted(keep.items()))

        # Iteration 0 is the "current pipeline" run. Only optimize further if we detect a drop vs last run.
        status = "completed"
        optimize_needed = True

        last_iter_score = None
        last_iter_metrics = None

        for iteration in range(self.max_iterations):
            fp = config_fingerprint(config)
            attempted_configs.add(fp)

            cleaned_df, eval_out = self._evaluate_once(
                raw_df, features=features, target_column=target_column, cleaning_config=config
            )
            result = eval_out["result"]
            metrics = eval_out["metrics"]
            score, score_name = self._primary_score(metrics)

            root = self.analyzer.analyze(
                raw_df,
                cleaned_df,
                metrics=metrics,
                previous_metrics=baseline_prev_metrics if iteration == 0 else last_iter_metrics,
                cleaning_config=config,
            )

            # Compare vs historical baseline (previous run from DB) only on iteration 0.
            if iteration == 0 and baseline_prev_metrics:
                drop = (baseline_prev_score - score) > self.performance_drop_threshold
                optimize_needed = bool(drop)
            elif iteration == 0:
                # No baseline exists; do one run and stop unless caller provided explicit config updates.
                optimize_needed = False

            iter_notes = (
                f"score_metric={score_name}; score={round(score, 6)}; "
                f"baseline_metric={baseline_prev_metric_name}; baseline_score={round(baseline_prev_score, 6)}; "
                f"optimize_needed={optimize_needed}"
            )

            log_id = self._log_iteration(
                run_key=run_key,
                iteration=iteration,
                status="completed",
                metrics=dict(metrics),
                previous_metrics=(baseline_prev_metrics if iteration == 0 else (last_iter_metrics or None)),
                dataset_stats=root.dataset_stats,
                cleaning_config=config,
                root_cause={
                    "root_causes": root.root_causes,
                    "recommended_config_updates": root.recommended_config_updates,
                },
                notes=iter_notes,
            )

            logs.append(
                {
                    "id": int(log_id),
                    "iteration": int(iteration),
                    "metrics": dict(metrics),
                    "score": float(score),
                    "score_name": str(score_name),
                    "cleaning_config": dict(config),
                    "root_causes": list(root.root_causes),
                    "recommended_updates": dict(root.recommended_config_updates),
                }
            )

            if score > best_score:
                best_score = float(score)
                best_result = dict(result or {})
                best_metrics = dict(metrics)
                best_config = dict(config)
                best_df = cleaned_df

            # Stop if no optimization is needed.
            if iteration == 0 and not optimize_needed:
                status = "completed"
                break

            # Stop if we improved enough vs previous iteration.
            if last_iter_score is not None:
                if (score - last_iter_score) >= self.min_iteration_improvement:
                    status = "completed"
                    break

            # Stop if we recovered to within threshold of baseline.
            if baseline_prev_metrics and score >= (baseline_prev_score - (self.performance_drop_threshold / 2)):
                status = "completed"
                break

            # Prepare next config.
            updates = dict(root.recommended_config_updates or {})
            if not updates:
                status = "stopped"
                break

            next_config = self._merge_config(config, updates)
            # Avoid repeating configs: if we'd repeat, try a small KNN k perturbation.
            if config_fingerprint(next_config) in attempted_configs:
                if str(next_config.get("impute_strategy")) in ("ml", "knn"):
                    k = int(next_config.get("knn_k", 5) or 5)
                    for candidate in [k + 2, k - 2, k + 4, k - 4]:
                        candidate = max(2, min(25, int(candidate)))
                        alt = dict(next_config)
                        alt["knn_k"] = candidate
                        if config_fingerprint(alt) not in attempted_configs:
                            next_config = alt
                            break

            if config_fingerprint(next_config) in attempted_configs:
                status = "stopped"
                break

            last_iter_score = float(score)
            last_iter_metrics = dict(metrics)
            config = next_config

        # Final "stop" record if we ended early without improvement but with optimization intent.
        return FeedbackRunResult(
            run_key=run_key,
            status=status,
            iterations=len(logs),
            best_result=best_result,
            best_metrics=best_metrics,
            best_cleaning_config=best_config,
            best_score=float(best_score if best_score != float("-inf") else 0.0),
            baseline_previous_metrics=baseline_prev_metrics,
            logs=logs,
            cleaned_df=best_df,
        )
