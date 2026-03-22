from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import pandas as pd


@dataclass(frozen=True)
class RootCauseResult:
    dataset_stats: Dict[str, Any]
    root_causes: List[Dict[str, Any]]
    recommended_config_updates: Dict[str, Any]


class RootCauseAnalyzer:
    """
    Lightweight heuristics-based analyzer that correlates performance drops with
    dataset characteristics and proposes pipeline adjustments.
    """

    def __init__(
        self,
        missing_high_threshold_pct: float = 15.0,
        variance_high_threshold: float = 1_000.0,
        variance_max_threshold: float = 1_000_000.0,
    ):
        self.missing_high_threshold_pct = float(missing_high_threshold_pct)
        self.variance_high_threshold = float(variance_high_threshold)
        self.variance_max_threshold = float(variance_max_threshold)

    @staticmethod
    def _missing_percent(df: pd.DataFrame) -> float:
        if df is None or not isinstance(df, pd.DataFrame) or df.shape[0] == 0:
            return 0.0
        total_cells = max(int(df.shape[0]) * max(int(df.shape[1]), 1), 1)
        missing_cells = int(df.isna().sum().sum())
        return (missing_cells / total_cells) * 100.0

    @staticmethod
    def _numeric_variance(df: pd.DataFrame) -> Tuple[float, float, float, List[Dict[str, Any]]]:
        if df is None or not isinstance(df, pd.DataFrame) or df.shape[0] == 0:
            return 0.0, 0.0, 0.0, []
        numeric = df.select_dtypes(include=[np.number])
        if numeric.shape[1] == 0:
            return 0.0, 0.0, 0.0, []
        variances = numeric.var(axis=0, ddof=0).replace([np.inf, -np.inf], np.nan).dropna()
        if variances.empty:
            return 0.0, 0.0, 0.0, []
        top = (
            variances.sort_values(ascending=False)
            .head(8)
            .to_dict()
        )
        top_list = [{"column": str(k), "variance": float(v)} for k, v in top.items()]
        return float(variances.mean()), float(variances.median()), float(variances.max()), top_list

    @staticmethod
    def _constant_columns(df: pd.DataFrame) -> List[str]:
        if df is None or not isinstance(df, pd.DataFrame) or df.shape[0] == 0:
            return []
        constants = []
        for col in df.columns:
            try:
                nunique = int(df[col].nunique(dropna=True))
            except Exception:
                continue
            if nunique <= 1:
                constants.append(str(col))
        return constants[:20]

    @staticmethod
    def _top_missing_by_column(df: pd.DataFrame, limit: int = 10) -> List[Dict[str, Any]]:
        if df is None or not isinstance(df, pd.DataFrame) or df.shape[0] == 0:
            return []
        missing_counts = df.isna().sum().sort_values(ascending=False)
        items = []
        for col, count in missing_counts.head(limit).items():
            if int(count) <= 0:
                continue
            items.append({"column": str(col), "missing": int(count)})
        return items

    def compute_dataset_stats(self, raw_df: pd.DataFrame, cleaned_df: pd.DataFrame) -> Dict[str, Any]:
        raw_missing = self._missing_percent(raw_df)
        cleaned_missing = self._missing_percent(cleaned_df)
        var_mean, var_median, var_max, var_top = self._numeric_variance(cleaned_df)

        stats: Dict[str, Any] = {
            "raw_rows": int(raw_df.shape[0]) if isinstance(raw_df, pd.DataFrame) else 0,
            "raw_cols": int(raw_df.shape[1]) if isinstance(raw_df, pd.DataFrame) else 0,
            "cleaned_rows": int(cleaned_df.shape[0]) if isinstance(cleaned_df, pd.DataFrame) else 0,
            "cleaned_cols": int(cleaned_df.shape[1]) if isinstance(cleaned_df, pd.DataFrame) else 0,
            "missing_raw_percent": round(raw_missing, 3),
            "missing_cleaned_percent": round(cleaned_missing, 3),
            "top_missing_raw": self._top_missing_by_column(raw_df, limit=10),
            "top_missing_cleaned": self._top_missing_by_column(cleaned_df, limit=10),
            "numeric_variance_mean": round(var_mean, 6),
            "numeric_variance_median": round(var_median, 6),
            "numeric_variance_max": round(var_max, 6),
            "high_variance_columns": var_top,
            "constant_columns": self._constant_columns(cleaned_df),
            "numeric_columns": int(cleaned_df.select_dtypes(include=[np.number]).shape[1]) if isinstance(cleaned_df, pd.DataFrame) else 0,
            "categorical_columns": int(cleaned_df.select_dtypes(include=["object"]).shape[1]) if isinstance(cleaned_df, pd.DataFrame) else 0,
        }
        return stats

    def analyze(
        self,
        raw_df: pd.DataFrame,
        cleaned_df: pd.DataFrame,
        metrics: Dict[str, Any],
        previous_metrics: Optional[Dict[str, Any]] = None,
        cleaning_config: Optional[Dict[str, Any]] = None,
    ) -> RootCauseResult:
        cleaning_config = dict(cleaning_config or {})
        stats = self.compute_dataset_stats(raw_df, cleaned_df)

        root_causes: List[Dict[str, Any]] = []
        recommended: Dict[str, Any] = {}

        missing_raw = float(stats.get("missing_raw_percent", 0.0))
        missing_cleaned = float(stats.get("missing_cleaned_percent", 0.0))

        var_mean = float(stats.get("numeric_variance_mean", 0.0))
        var_max = float(stats.get("numeric_variance_max", 0.0))

        # Root cause 1: missingness is high -> imputation issue.
        if missing_raw >= self.missing_high_threshold_pct or missing_cleaned >= 1.0:
            confidence = 0.7 if missing_raw >= self.missing_high_threshold_pct else 0.55
            root_causes.append(
                {
                    "cause": "imputation_issue",
                    "confidence": round(confidence, 2),
                    "evidence": {
                        "missing_raw_percent": round(missing_raw, 2),
                        "missing_cleaned_percent": round(missing_cleaned, 2),
                        "top_missing_raw": stats.get("top_missing_raw", [])[:6],
                    },
                }
            )

            # Strategy: if not using KNN (ml) yet, switch. Otherwise tune k.
            current_strategy = str(cleaning_config.get("impute_strategy", "auto"))
            current_k = int(cleaning_config.get("knn_k", 5) or 5)
            if current_strategy not in ("ml", "knn"):
                recommended["impute_strategy"] = "ml"
                recommended["knn_k"] = max(3, min(25, current_k))
            else:
                # KNN already: nudge k towards a more stable neighborhood.
                # We'll pick the next candidate in a deterministic sequence.
                candidates = [3, 5, 7, 9, 11, 15]
                candidates = [c for c in candidates if 2 <= c <= 25]
                # Choose closest candidate that's different from current.
                best = None
                best_dist = 1e9
                for c in candidates:
                    if c == current_k:
                        continue
                    dist = abs(c - current_k)
                    if dist < best_dist:
                        best = c
                        best_dist = dist
                if best is not None:
                    recommended["knn_k"] = int(best)

        # Root cause 2: high variance after cleaning -> feature engineering/scaling issue.
        if var_mean >= self.variance_high_threshold or var_max >= self.variance_max_threshold:
            confidence = 0.65 if var_max >= self.variance_max_threshold else 0.5
            root_causes.append(
                {
                    "cause": "feature_engineering_issue",
                    "confidence": round(confidence, 2),
                    "evidence": {
                        "numeric_variance_mean": round(var_mean, 3),
                        "numeric_variance_max": round(var_max, 3),
                        "high_variance_columns": stats.get("high_variance_columns", [])[:6],
                    },
                }
            )
            # Recommend standardization for high variance. Avoid applying both normalize+standardize.
            recommended["standardize"] = True
            recommended["normalize"] = False
            # Outlier handling can help stabilize very high-variance features.
            recommended.setdefault("outlier_method", "zscore")

        # Minor signal: too many constant columns might indicate bad feature extraction.
        constant_cols = stats.get("constant_columns") or []
        if len(constant_cols) >= 8:
            root_causes.append(
                {
                    "cause": "low_information_features",
                    "confidence": 0.35,
                    "evidence": {"constant_columns": constant_cols[:12]},
                }
            )

        # If there is a performance drop, slightly increase confidence of causes we found.
        if previous_metrics and root_causes:
            for item in root_causes:
                try:
                    item["confidence"] = round(min(0.95, float(item["confidence"]) + 0.05), 2)
                except Exception:
                    pass

        return RootCauseResult(dataset_stats=stats, root_causes=root_causes, recommended_config_updates=recommended)

