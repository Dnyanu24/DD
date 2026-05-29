import math
import re
from typing import Any, Dict

import numpy as np
import pandas as pd


NULL_LIKE_VALUES = {"", "na", "n/a", "null", "none", "nan", "undefined", "-", "--"}
EMAIL_PATTERN = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _json_safe(value: Any) -> Any:
    if value is None:
        return None
    if isinstance(value, dict):
        return {str(key): _json_safe(item) for key, item in value.items()}
    if isinstance(value, (list, tuple, set)):
        return [_json_safe(item) for item in value]
    if isinstance(value, (np.integer,)):
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


def _normalized_string_series(series: pd.Series) -> pd.Series:
    return series.dropna().astype(str).str.strip()


def _infer_column_type(series: pd.Series) -> str:
    non_null = _normalized_string_series(series)
    if non_null.empty:
        return "unknown"

    column_name = str(series.name).lower()
    numeric_source = (
        non_null
        .str.replace("%", "", regex=False)
        .str.replace(",", "", regex=False)
        .str.replace("$", "", regex=False)
        .str.replace("₹", "", regex=False)
        .str.replace("€", "", regex=False)
        .str.replace("£", "", regex=False)
    )
    numeric = pd.to_numeric(numeric_source, errors="coerce")
    numeric_ratio = float(numeric.notna().mean())
    numeric_named_column = any(
        token in column_name
        for token in (
            "revenue", "growth", "percent", "%", "score", "count", "amount",
            "price", "cost", "sales", "profit", "loss", "qty", "quantity",
            "employee", "customer", "rating", "value", "total", "avg", "mean",
        )
    )
    if (numeric_ratio >= 0.60 or (numeric_named_column and numeric_ratio >= 0.40)) and numeric.notna().sum() >= 2:
        numeric_values = numeric.dropna().astype(float)
        if not numeric_values.empty and numeric_values.apply(lambda value: value.is_integer()).mean() >= 0.95:
            return "integer"
        return "float"

    # Month names by themselves are categorical periods, not full dates.
    month_values = {
        "jan", "january", "feb", "february", "mar", "march", "apr", "april",
        "may", "jun", "june", "jul", "july", "aug", "august", "sep",
        "sept", "september", "oct", "october", "nov", "november",
        "dec", "december",
    }
    if "month" in column_name:
        month_ratio = float(non_null.str.lower().isin(month_values).mean())
        if month_ratio >= 0.50:
            return "category"

    date_named_column = any(
        token in column_name
        for token in ("date", "timestamp", "created_at", "updated_at")
    )
    if date_named_column:
        datetime_values = pd.to_datetime(non_null, errors="coerce", format="mixed")
        datetime_ratio = float(datetime_values.notna().mean())
        if datetime_ratio >= 0.75:
            return "datetime"

    unique_ratio = float(non_null.nunique(dropna=True) / max(len(non_null), 1))
    if unique_ratio <= 0.35:
        return "category"
    return "text"


def _invalid_count(series: pd.Series, inferred_type: str) -> int:
    non_null = _normalized_string_series(series)
    if non_null.empty:
        return 0

    null_like = non_null.str.lower().isin(NULL_LIKE_VALUES)
    invalid = int(null_like.sum())
    values = non_null[~null_like]

    if inferred_type in {"integer", "float"}:
        numeric = pd.to_numeric(
            values
            .str.replace("%", "", regex=False)
            .str.replace(",", "", regex=False)
            .str.replace("$", "", regex=False)
            .str.replace("₹", "", regex=False)
            .str.replace("€", "", regex=False)
            .str.replace("£", "", regex=False),
            errors="coerce",
        )
        invalid += int(numeric.isna().sum())
    elif inferred_type == "datetime":
        dates = pd.to_datetime(values, errors="coerce", format="mixed")
        invalid += int(dates.isna().sum())
    elif "email" in str(series.name).lower():
        invalid += int((~values.map(lambda item: bool(EMAIL_PATTERN.match(item)))).sum())

    return invalid


def profile_dataframe(df: pd.DataFrame) -> Dict[str, Any]:
    working = df.copy()
    row_count = int(len(working))
    column_count = int(len(working.columns))
    duplicate_count = int(working.duplicated().sum()) if row_count else 0
    missing_by_column = {str(col): int(working[col].isna().sum()) for col in working.columns}
    null_like_by_column = {}
    column_types = {}
    invalid_by_column = {}
    column_profiles = {}
    anomaly_hints = []

    for col in working.columns:
        series = working[col]
        string_values = _normalized_string_series(series)
        null_like_count = int(string_values.str.lower().isin(NULL_LIKE_VALUES).sum()) if not string_values.empty else 0
        inferred_type = _infer_column_type(series)
        invalid_count = _invalid_count(series, inferred_type)

        null_like_by_column[str(col)] = null_like_count
        column_types[str(col)] = inferred_type
        invalid_by_column[str(col)] = invalid_count

        profile = {
            "missing": missing_by_column[str(col)],
            "null_like": null_like_count,
            "invalid": invalid_count,
            "unique": int(series.nunique(dropna=True)),
            "inferred_type": inferred_type,
        }

        if inferred_type in {"integer", "float"}:
            numeric = pd.to_numeric(
                string_values
                .str.replace("%", "", regex=False)
                .str.replace(",", "", regex=False)
                .str.replace("$", "", regex=False)
                .str.replace("₹", "", regex=False)
                .str.replace("€", "", regex=False)
                .str.replace("£", "", regex=False),
                errors="coerce",
            )
            profile["statistics"] = {
                "min": _json_safe(numeric.min()),
                "max": _json_safe(numeric.max()),
                "mean": _json_safe(numeric.mean()),
                "median": _json_safe(numeric.median()),
                "std": _json_safe(numeric.std()),
            }
            if numeric.notna().sum() >= 4:
                q1 = numeric.quantile(0.25)
                q3 = numeric.quantile(0.75)
                iqr = q3 - q1
                if iqr:
                    outliers = int(((numeric < q1 - 1.5 * iqr) | (numeric > q3 + 1.5 * iqr)).sum())
                    profile["outliers"] = outliers
                    if outliers:
                        anomaly_hints.append(f"{col}: {outliers} numeric outlier(s) detected")
        elif inferred_type == "datetime":
            dates = pd.to_datetime(string_values, errors="coerce", format="mixed")
            profile["statistics"] = {
                "min": _json_safe(dates.min()),
                "max": _json_safe(dates.max()),
            }
        else:
            top_values = series.dropna().astype(str).str.strip().value_counts().head(5)
            profile["top_values"] = {str(key): int(value) for key, value in top_values.items()}

        if invalid_count:
            anomaly_hints.append(f"{col}: {invalid_count} invalid value(s) for inferred {inferred_type}")
        column_profiles[str(col)] = _json_safe(profile)

    total_missing = int(sum(missing_by_column.values()) + sum(null_like_by_column.values()))
    total_invalid = int(sum(invalid_by_column.values()))
    total_cells = max(row_count * max(column_count, 1), 1)
    quality_score = round(max(0.0, 100.0 - ((total_missing + total_invalid + duplicate_count) / total_cells * 100)), 2)

    return _json_safe(
        {
            "row_count": row_count,
            "column_count": column_count,
            "missing_values": total_missing,
            "duplicates": duplicate_count,
            "invalid_formats": total_invalid,
            "datatype_mismatches": total_invalid,
            "column_types": column_types,
            "schema": [{"name": str(col), "type": column_types[str(col)]} for col in working.columns],
            "missing_by_column": missing_by_column,
            "null_like_by_column": null_like_by_column,
            "invalid_by_column": invalid_by_column,
            "column_profiles": column_profiles,
            "statistical_summary": working.describe(include="all").replace({np.nan: None}).to_dict(),
            "anomaly_hints": anomaly_hints[:20],
            "quality_score": quality_score,
        }
    )
