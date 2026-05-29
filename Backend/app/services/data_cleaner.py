import math
from typing import Any, Dict, Tuple

import numpy as np
import pandas as pd
from sklearn.impute import KNNImputer

from app.services.data_profiler import NULL_LIKE_VALUES, profile_dataframe


def _json_safe(value: Any) -> Any:
    if value is None:
        return None
    if isinstance(value, dict):
        return {str(key): _json_safe(item) for key, item in value.items()}
    if isinstance(value, (list, tuple, set)):
        return [_json_safe(item) for item in value]
    if isinstance(value, np.integer):
        return int(value)
    if isinstance(value, (np.floating, float)):
        return float(value) if math.isfinite(float(value)) else None
    if isinstance(value, pd.Timestamp):
        return value.isoformat()
    try:
        if pd.isna(value):
            return None
    except (TypeError, ValueError):
        pass
    return value


def _normalize_missing_values(df: pd.DataFrame) -> pd.DataFrame:
    cleaned = df.copy()
    for col in cleaned.columns:
        if cleaned[col].dtype == object:
            stripped = cleaned[col].astype(str).str.strip()
            cleaned[col] = cleaned[col].where(~stripped.str.lower().isin(NULL_LIKE_VALUES), np.nan)
    return cleaned


def _clean_column_names(df: pd.DataFrame) -> Tuple[pd.DataFrame, int]:
    cleaned = df.copy()
    original = list(cleaned.columns)
    next_columns = []
    used = {}
    for col in original:
        base = str(col).strip().replace("\n", " ").replace("\t", " ")
        base = " ".join(base.split()) or "column"
        candidate = base
        if candidate in used:
            used[candidate] += 1
            candidate = f"{candidate}_{used[base]}"
        else:
            used[candidate] = 1
        next_columns.append(candidate)
    cleaned.columns = next_columns
    changed = sum(1 for before, after in zip(original, next_columns) if str(before) != after)
    return cleaned, changed


def _coerce_numeric(series: pd.Series) -> pd.Series:
    return pd.to_numeric(series.astype(str).str.replace(",", "", regex=False).str.strip(), errors="coerce")


def _clean_text_series(series: pd.Series) -> Tuple[pd.Series, int]:
    before = series.copy()
    cleaned = series.astype("object")
    mask = cleaned.notna()
    cleaned.loc[mask] = (
        cleaned.loc[mask]
        .astype(str)
        .str.strip()
        .str.replace(r"\s+", " ", regex=True)
    )
    changed = int((before.fillna("__NULL__").astype(str) != cleaned.fillna("__NULL__").astype(str)).sum())
    return cleaned, changed


def _clip_outliers(series: pd.Series) -> Tuple[pd.Series, int]:
    numeric = pd.to_numeric(series, errors="coerce")
    values = numeric.dropna()
    if len(values) < 4:
        return numeric, 0
    q1 = values.quantile(0.25)
    q3 = values.quantile(0.75)
    iqr = q3 - q1
    if not iqr:
        return numeric, 0
    lower = q1 - 1.5 * iqr
    upper = q3 + 1.5 * iqr
    outlier_mask = (numeric < lower) | (numeric > upper)
    clipped = numeric.clip(lower=lower, upper=upper)
    return clipped, int(outlier_mask.sum())


def _fill_categorical_with_model(cleaned: pd.DataFrame, col: str) -> Tuple[pd.Series, str]:
    text, _changed = _clean_text_series(cleaned[col])
    missing_mask = text.isna()
    if not missing_mask.any():
        return text, "none"

    non_missing = text[~missing_mask]
    if non_missing.empty:
        return text.fillna("Unknown"), "unknown"

    try:
        features = cleaned.drop(columns=[col]).copy()
        for feature in features.columns:
            if features[feature].dtype == object:
                features[feature] = _clean_text_series(features[feature])[0].fillna("Unknown").astype("category").cat.codes
            else:
                features[feature] = pd.to_numeric(features[feature], errors="coerce")
        features = features.fillna(features.median(numeric_only=True)).fillna(0)

        train_x = features.loc[~missing_mask]
        predict_x = features.loc[missing_mask]
        if len(train_x) >= 3 and not predict_x.empty and non_missing.nunique(dropna=True) > 1:
            from sklearn.ensemble import RandomForestClassifier

            model = RandomForestClassifier(n_estimators=50, random_state=42)
            model.fit(train_x, non_missing.astype(str))
            text.loc[missing_mask] = model.predict(predict_x)
            return text, "random_forest_classifier"
    except Exception:
        pass

    mode = non_missing.mode()
    fill_value = mode.iloc[0] if not mode.empty else "Unknown"
    return text.fillna(fill_value), "mode_fallback"


def _predictive_numeric_impute(frame: pd.DataFrame, numeric_columns: list[str]) -> Tuple[pd.DataFrame, str]:
    if not numeric_columns:
        return frame, "none"

    numeric_frame = frame[numeric_columns].apply(_coerce_numeric)
    if not numeric_frame.isna().any().any():
        frame[numeric_columns] = numeric_frame
        return frame, "none"

    try:
        n_neighbors = max(1, min(5, len(numeric_frame)))
        imputer = KNNImputer(n_neighbors=n_neighbors)
        frame[numeric_columns] = imputer.fit_transform(numeric_frame)
        return frame, "knn_imputer"
    except Exception:
        frame[numeric_columns] = numeric_frame.fillna(numeric_frame.median(numeric_only=True)).fillna(0)
        return frame, "median_fallback"


def clean_dataframe(
    df: pd.DataFrame,
    profiling_report: Dict[str, Any] | None = None,
    numeric_strategy: str = "median",
    categorical_strategy: str = "mode",
    method: str = "normal",
) -> Tuple[pd.DataFrame, Dict[str, Any]]:
    before = df.copy()
    cleaned, renamed_columns = _clean_column_names(before)
    cleaned = _normalize_missing_values(cleaned)
    profiling = profiling_report or profile_dataframe(cleaned)
    column_types = profiling.get("column_types", {})
    actions = []

    duplicate_count_before = int(cleaned.duplicated().sum()) if len(cleaned) else 0
    if duplicate_count_before:
        cleaned = cleaned.drop_duplicates().reset_index(drop=True)
    actions.append({"action": "duplicate_removal", "stage": "before_standardization", "rows_removed": duplicate_count_before})

    whitespace_fixes = 0
    datatype_corrections = 0
    invalid_formats_corrected = 0
    outliers_handled = 0
    missing_before = int(cleaned.isna().sum().sum())
    numeric_columns = [
        col for col in cleaned.columns
        if column_types.get(str(col), column_types.get(col, "text")) in {"integer", "float"}
    ]
    numeric_imputer = "none"

    if method == "predictive":
        cleaned, numeric_imputer = _predictive_numeric_impute(cleaned, [str(col) for col in numeric_columns])
        actions.append({"action": "predictive_numeric_imputation", "model": numeric_imputer, "columns": [str(col) for col in numeric_columns]})

    for col in cleaned.columns:
        inferred_type = column_types.get(str(col), column_types.get(col, "text"))
        if inferred_type in {"integer", "float"}:
            numeric = _coerce_numeric(cleaned[col])
            invalid_formats_corrected += int(cleaned[col].notna().sum() - numeric.notna().sum())
            fill_value = None
            if method != "predictive" or numeric.isna().any():
                fill_value = numeric.mean() if numeric_strategy == "mean" else numeric.median()
                if pd.isna(fill_value):
                    fill_value = numeric.median() if numeric_strategy == "mean" else numeric.mean()
                if pd.isna(fill_value):
                    fill_value = 0
                numeric = numeric.fillna(fill_value)
            numeric, outlier_count = _clip_outliers(numeric)
            outliers_handled += outlier_count
            if inferred_type == "integer":
                numeric = numeric.round().astype("Int64")
            cleaned[col] = numeric
            datatype_corrections += 1
            actions.append({
                "action": "numeric_standardization",
                "column": str(col),
                "fill_value": _json_safe(fill_value),
                "strategy": numeric_imputer if method == "predictive" else numeric_strategy,
            })
        elif inferred_type == "datetime":
            parsed = pd.to_datetime(cleaned[col], errors="coerce", format="mixed")
            invalid_formats_corrected += int(cleaned[col].notna().sum() - parsed.notna().sum())
            if parsed.notna().any():
                fill_value = parsed.dropna().mode()
                replacement = fill_value.iloc[0] if not fill_value.empty else parsed.dropna().median()
                parsed = parsed.fillna(replacement)
            cleaned[col] = parsed.dt.strftime("%Y-%m-%d")
            datatype_corrections += 1
            actions.append({"action": "date_normalization", "column": str(col)})
        else:
            if method == "predictive":
                text, model_name = _fill_categorical_with_model(cleaned, str(col))
                changed = int((cleaned[col].fillna("__NULL__").astype(str) != text.fillna("__NULL__").astype(str)).sum())
                fill_value = model_name
            else:
                text, changed = _clean_text_series(cleaned[col])
                if categorical_strategy == "unknown":
                    fill_value = "Unknown"
                else:
                    mode = text.dropna().mode()
                    fill_value = mode.iloc[0] if not mode.empty else "Unknown"
                text = text.fillna(fill_value)
            whitespace_fixes += changed
            cleaned[col] = text
            actions.append({
                "action": "categorical_null_handling",
                "column": str(col),
                "fill_value": str(fill_value),
                "strategy": "model_based" if method == "predictive" else categorical_strategy,
            })

    duplicate_count_after = int(cleaned.duplicated().sum()) if len(cleaned) else 0
    if duplicate_count_after:
        cleaned = cleaned.drop_duplicates().reset_index(drop=True)
    if duplicate_count_after:
        actions.append({"action": "duplicate_removal", "stage": "after_standardization", "rows_removed": duplicate_count_after})

    missing_after = int(cleaned.isna().sum().sum())
    missing_fixed = max(0, missing_before - missing_after)
    after_profile = profile_dataframe(cleaned)
    total_cells = max(len(cleaned) * max(len(cleaned.columns), 1), 1)
    quality_score = round(max(0.0, 100.0 - ((missing_after + after_profile["invalid_formats"]) / total_cells * 100)), 2)

    report = {
        "duplicate_rows_removed": duplicate_count_before + duplicate_count_after,
        "missing_values_fixed": missing_fixed,
        "invalid_formats_corrected": max(0, invalid_formats_corrected),
        "datatype_corrections": datatype_corrections,
        "whitespace_fixes": whitespace_fixes,
        "renamed_columns": renamed_columns,
        "outliers_handled": outliers_handled,
        "before_shape": [int(len(before)), int(len(before.columns))],
        "after_shape": [int(len(cleaned)), int(len(cleaned.columns))],
        "quality_score": quality_score,
        "method": method,
        "actions": actions,
    }
    return cleaned, _json_safe(report)
