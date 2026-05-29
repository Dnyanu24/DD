import math
import re
from typing import Any, Dict, Iterable, List, Optional

import numpy as np
import pandas as pd

from app.services.data_profiler import NULL_LIKE_VALUES, profile_dataframe


NEGATIVE_VALUE_KEYWORDS = {
    "revenue",
    "sales",
    "quantity",
    "qty",
    "employee",
    "employees",
    "employee_count",
    "count",
    "amount",
    "price",
    "cost",
    "profit",
    "salary",
    "stock",
    "inventory",
}

COMMON_ALLOWED_CATEGORIES = {
    "status": {"active", "inactive", "pending", "approved", "rejected", "complete", "completed", "cancelled", "canceled"},
    "priority": {"low", "medium", "high", "critical"},
    "gender": {"male", "female", "other", "unknown"},
    "yes_no": {"yes", "no", "true", "false", "y", "n"},
}


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


def _normalize_column_name(name: Any) -> str:
    return re.sub(r"[^a-z0-9]+", "_", str(name).strip().lower()).strip("_")


def _issue(column: Optional[str], issue: str, severity: str, row: Optional[int] = None, value: Any = None) -> Dict[str, Any]:
    payload = {
        "column": column,
        "issue": issue,
        "severity": severity,
        "row": row,
    }
    if value is not None:
        payload["value"] = _json_safe(value)
    return payload


def _is_null_like(value: Any) -> bool:
    if value is None:
        return True
    try:
        if pd.isna(value):
            return True
    except (TypeError, ValueError):
        pass
    return str(value).strip().lower() in NULL_LIKE_VALUES


def _series_as_clean_strings(series: pd.Series) -> pd.Series:
    return series.dropna().astype(str).str.strip()


def _coerce_for_type(series: pd.Series, inferred_type: str) -> pd.Series:
    values = _series_as_clean_strings(series)
    if inferred_type in {"integer", "float"}:
        return pd.to_numeric(values.str.replace(",", "", regex=False), errors="coerce")
    if inferred_type == "datetime":
        return pd.to_datetime(values, errors="coerce", format="mixed")
    return values


def _category_rule_for_column(column_name: str) -> Optional[set]:
    normalized = _normalize_column_name(column_name)
    if "status" in normalized:
        return COMMON_ALLOWED_CATEGORIES["status"]
    if "priority" in normalized:
        return COMMON_ALLOWED_CATEGORIES["priority"]
    if "gender" in normalized:
        return COMMON_ALLOWED_CATEGORIES["gender"]
    if normalized in {"active", "is_active", "enabled", "is_enabled"}:
        return COMMON_ALLOWED_CATEGORIES["yes_no"]
    return None


def _is_negative_restricted(column_name: str) -> bool:
    normalized = _normalize_column_name(column_name)
    return any(keyword in normalized for keyword in NEGATIVE_VALUE_KEYWORDS)


def _validate_business_rules(df: pd.DataFrame, rules: Optional[Dict[str, Any]], issues: List[Dict[str, Any]]) -> int:
    passed = 0
    if not rules:
        return passed

    for column, rule in rules.items():
        if column not in df.columns:
            issues.append(_issue(str(column), "Business rule target column is missing", "medium"))
            continue
        series = df[column]
        if isinstance(rule, dict):
            if "min" in rule:
                numeric = pd.to_numeric(series, errors="coerce")
                invalid_rows = numeric[numeric < rule["min"]]
                for idx, value in invalid_rows.head(50).items():
                    issues.append(_issue(str(column), f"Value below minimum {rule['min']}", "high", int(idx), value))
                if invalid_rows.empty:
                    passed += 1
            if "max" in rule:
                numeric = pd.to_numeric(series, errors="coerce")
                invalid_rows = numeric[numeric > rule["max"]]
                for idx, value in invalid_rows.head(50).items():
                    issues.append(_issue(str(column), f"Value above maximum {rule['max']}", "high", int(idx), value))
                if invalid_rows.empty:
                    passed += 1
            if "allowed" in rule:
                allowed = {str(item).strip().lower() for item in rule["allowed"]}
                values = _series_as_clean_strings(series)
                invalid_rows = values[~values.str.lower().isin(allowed)]
                for idx, value in invalid_rows.head(50).items():
                    issues.append(_issue(str(column), "Value outside allowed business categories", "medium", int(idx), value))
                if invalid_rows.empty:
                    passed += 1
    return passed


def validate_dataframe(
    df: pd.DataFrame,
    profiling_report: Optional[Dict[str, Any]] = None,
    required_columns: Optional[Iterable[str]] = None,
    business_rules: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    working = df.copy()
    profile = profiling_report or profile_dataframe(working)
    column_types = profile.get("column_types", {})
    issues: List[Dict[str, Any]] = []
    passed_checks = 0

    if working.empty:
        issues.append(_issue(None, "Dataset is empty after cleaning", "high"))
    else:
        passed_checks += 1

    duplicate_columns = working.columns[working.columns.duplicated()].tolist()
    if duplicate_columns:
        for column in duplicate_columns:
            issues.append(_issue(str(column), "Duplicate schema column detected", "high"))
    else:
        passed_checks += 1

    normalized_columns = {_normalize_column_name(col): str(col) for col in working.columns}
    for required in required_columns or []:
        if _normalize_column_name(required) not in normalized_columns:
            issues.append(_issue(str(required), "Required column missing", "high"))
        else:
            passed_checks += 1

    empty_rows = working.apply(lambda row: all(_is_null_like(value) for value in row), axis=1)
    for idx in empty_rows[empty_rows].index[:50]:
        issues.append(_issue(None, "Empty row detected", "medium", int(idx)))
    if not bool(empty_rows.any()):
        passed_checks += 1

    for column in working.columns:
        column_name = str(column)
        series = working[column]
        inferred_type = column_types.get(column_name, "text")

        if str(column_name).startswith("Unnamed"):
            issues.append(_issue(column_name, "Unclear schema column name", "low"))
        else:
            passed_checks += 1

        null_like_rows = series[series.map(_is_null_like)]
        for idx, value in null_like_rows.head(50).items():
            issues.append(_issue(column_name, "Null or empty value remained after cleaning", "medium", int(idx), value))
        if null_like_rows.empty:
            passed_checks += 1

        if inferred_type in {"integer", "float", "datetime"}:
            values = _series_as_clean_strings(series)
            coerced = _coerce_for_type(series, inferred_type)
            mismatch_rows = values[coerced.isna()]
            for idx, value in mismatch_rows.head(50).items():
                issues.append(_issue(column_name, f"Datatype mismatch: expected {inferred_type}", "high", int(idx), value))
            if mismatch_rows.empty:
                passed_checks += 1

        if inferred_type in {"integer", "float"}:
            numeric = pd.to_numeric(series.astype(str).str.replace(",", "", regex=False), errors="coerce")
            if _is_negative_restricted(column_name):
                negative_rows = numeric[numeric < 0]
                for idx, value in negative_rows.head(50).items():
                    issues.append(_issue(column_name, "Negative value detected", "high", int(idx), value))
                if negative_rows.empty:
                    passed_checks += 1

            values = numeric.dropna()
            if len(values) >= 4:
                q1 = values.quantile(0.25)
                q3 = values.quantile(0.75)
                iqr = q3 - q1
                if iqr:
                    low = q1 - 1.5 * iqr
                    high = q3 + 1.5 * iqr
                    outliers = numeric[(numeric < low) | (numeric > high)]
                    for idx, value in outliers.head(50).items():
                        issues.append(_issue(column_name, "Value outside expected range", "medium", int(idx), value))
                    if outliers.empty:
                        passed_checks += 1

        if inferred_type == "datetime" or any(token in _normalize_column_name(column_name) for token in ("date", "month", "year")):
            values = _series_as_clean_strings(series)
            parsed = pd.to_datetime(values, errors="coerce", format="mixed")
            invalid_dates = values[parsed.isna()]
            for idx, value in invalid_dates.head(50).items():
                issues.append(_issue(column_name, "Invalid date/month value", "high", int(idx), value))
            if invalid_dates.empty:
                passed_checks += 1

            if _normalize_column_name(column_name) == "month":
                numeric_month = pd.to_numeric(values, errors="coerce")
                month_rows = numeric_month[(numeric_month.notna()) & ((numeric_month < 1) | (numeric_month > 12))]
                for idx, value in month_rows.head(50).items():
                    issues.append(_issue(column_name, "Month must be between 1 and 12", "high", int(idx), value))
                if month_rows.empty:
                    passed_checks += 1

        allowed_categories = _category_rule_for_column(column_name)
        if allowed_categories:
            values = _series_as_clean_strings(series)
            invalid_categories = values[~values.str.lower().isin(allowed_categories)]
            for idx, value in invalid_categories.head(50).items():
                issues.append(_issue(column_name, "Invalid category detected", "medium", int(idx), value))
            if invalid_categories.empty:
                passed_checks += 1

    passed_checks += _validate_business_rules(working, business_rules, issues)

    high_count = sum(1 for item in issues if item["severity"] == "high")
    medium_count = sum(1 for item in issues if item["severity"] == "medium")
    low_count = sum(1 for item in issues if item["severity"] == "low")

    return _json_safe(
        {
            "total_issues": len(issues),
            "critical_issues": high_count,
            "warnings": medium_count + low_count,
            "passed_checks": int(passed_checks),
            "severity_counts": {
                "high": high_count,
                "medium": medium_count,
                "low": low_count,
            },
            "issues": issues[:200],
        }
    )
