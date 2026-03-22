from __future__ import annotations

from typing import Any, Dict, List, Tuple

import numpy as np
import pandas as pd


def extract_dataset_features(df: pd.DataFrame) -> Dict[str, Any]:
    """
    Extract compact dataset metadata useful for meta-learning.

    Required by spec:
    - Missing %
    - Skewness
    - Feature count
    """
    if df is None or not isinstance(df, pd.DataFrame) or df.shape[0] == 0:
        return {
            "rows": 0,
            "feature_count": 0,
            "missing_percent": 0.0,
            "skewness_mean": 0.0,
            "numeric_features": 0,
            "categorical_features": 0,
        }

    rows = int(df.shape[0])
    cols = int(df.shape[1])
    total_cells = max(rows * max(cols, 1), 1)
    missing_percent = float(df.isna().sum().sum()) / total_cells * 100.0

    numeric = df.select_dtypes(include=[np.number]).replace([np.inf, -np.inf], np.nan)
    numeric_features = int(numeric.shape[1])
    categorical_features = int(df.select_dtypes(include=["object"]).shape[1])

    if numeric_features > 0:
        skew = numeric.skew(numeric_only=True).replace([np.inf, -np.inf], np.nan).dropna()
        skewness_mean = float(skew.mean()) if not skew.empty else 0.0
    else:
        skewness_mean = 0.0

    return {
        "rows": rows,
        "feature_count": cols,
        "missing_percent": round(float(missing_percent), 6),
        "skewness_mean": round(float(skewness_mean), 6),
        "numeric_features": numeric_features,
        "categorical_features": categorical_features,
    }


def encode_dataset(df: pd.DataFrame) -> Tuple[Dict[str, Any], List[float]]:
    """
    Convert dataset features to a numeric embedding for similarity search.

    The embedding is intentionally small and stable so it works well in SQLite.
    """
    feats = extract_dataset_features(df)

    rows = float(feats.get("rows", 0) or 0)
    feature_count = float(feats.get("feature_count", 0) or 0)
    missing = float(feats.get("missing_percent", 0.0) or 0.0)
    skew = float(feats.get("skewness_mean", 0.0) or 0.0)
    numeric = float(feats.get("numeric_features", 0) or 0)
    categorical = float(feats.get("categorical_features", 0) or 0)

    total_feats = max(feature_count, 1.0)
    numeric_ratio = numeric / total_feats
    categorical_ratio = categorical / total_feats

    # Log-scale rows/features keeps distances sane across different dataset sizes.
    emb = [
        float(np.log1p(rows)),
        float(np.log1p(feature_count)),
        float(missing / 100.0),
        float(np.tanh(skew)),
        float(numeric_ratio),
        float(categorical_ratio),
    ]
    return feats, emb


def cosine_similarity(a: List[float], b: List[float]) -> float:
    if not a or not b or len(a) != len(b):
        return 0.0
    av = np.array(a, dtype=float)
    bv = np.array(b, dtype=float)
    denom = float(np.linalg.norm(av) * np.linalg.norm(bv))
    if denom <= 0:
        return 0.0
    return float(np.dot(av, bv) / denom)

