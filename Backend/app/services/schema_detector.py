from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import pandas as pd


DATE_PATTERNS = [
    re.compile(r"^\d{4}-\d{1,2}-\d{1,2}$"),  # 2024-03-22
    re.compile(r"^\d{4}/\d{1,2}/\d{1,2}$"),  # 2024/03/22
    re.compile(r"^\d{1,2}/\d{1,2}/\d{2,4}$"),  # 22/03/2024
    re.compile(r"^\d{1,2}-\d{1,2}-\d{2,4}$"),  # 22-03-2024
    re.compile(r"^\d{4}-\d{1,2}-\d{1,2}[ T]\d{1,2}:\d{2}(:\d{2})?$"),  # 2024-03-22 10:30[:00]
]


@dataclass(frozen=True)
class ColumnSchema:
    name: str
    kind: str  # numeric | integer | categorical | datetime | id
    confidence: float
    notes: Dict[str, Any]


def _sample_values(series: pd.Series, sample_size: int = 200) -> List[Any]:
    if series is None:
        return []
    values = series.dropna()
    if values.empty:
        return []
    if len(values) <= sample_size:
        return values.tolist()
    return values.sample(sample_size, random_state=42).tolist()


def _looks_like_date_string(value: Any) -> bool:
    if not isinstance(value, str):
        return False
    s = value.strip()
    if not s:
        return False
    return any(p.match(s) for p in DATE_PATTERNS)


def _numeric_parse_rate(values: List[Any]) -> float:
    if not values:
        return 0.0
    ok = 0
    for v in values:
        try:
            s = str(v).strip()
            if s == "":
                continue
            float(s.replace(",", ""))
            ok += 1
        except Exception:
            continue
    return ok / max(len(values), 1)


def _int_parse_rate(values: List[Any]) -> float:
    if not values:
        return 0.0
    ok = 0
    for v in values:
        try:
            s = str(v).strip()
            if s == "":
                continue
            # Avoid "1.0" being treated as int
            if re.match(r"^[+-]?\d+$", s.replace(",", "")):
                int(s.replace(",", ""))
                ok += 1
        except Exception:
            continue
    return ok / max(len(values), 1)


def _datetime_parse_rate(values: List[Any]) -> float:
    if not values:
        return 0.0
    candidates = [v for v in values if _looks_like_date_string(v)]
    if not candidates:
        return 0.0
    ok = 0
    for v in candidates:
        try:
            parsed = pd.to_datetime(str(v).strip(), errors="raise", utc=False)
            if pd.isna(parsed):
                continue
            ok += 1
        except Exception:
            continue
    return ok / max(len(candidates), 1)


def _name_hints(col_name: str) -> Dict[str, bool]:
    name = (col_name or "").strip().lower()
    return {
        "is_id": name == "id" or name.endswith("_id") or name.startswith("id_") or " id" in name,
        "is_employee": "employee" in name or "employees" in name or "staff" in name,
        "is_sales": "sales" in name or "revenue" in name or "profit" in name or "amount" in name,
        "is_date": "date" in name or "time" in name or name.endswith("_at"),
    }


def detect_column_schema(series: pd.Series, *, sample_size: int = 200) -> ColumnSchema:
    name = str(series.name)
    hints = _name_hints(name)
    values = _sample_values(series, sample_size=sample_size)

    numeric_rate = _numeric_parse_rate(values)
    int_rate = _int_parse_rate(values)
    dt_rate = _datetime_parse_rate(values)

    notes: Dict[str, Any] = {
        "numeric_parse_rate": round(float(numeric_rate), 4),
        "int_parse_rate": round(float(int_rate), 4),
        "datetime_parse_rate": round(float(dt_rate), 4),
        "hints": hints,
    }

    # ID: strong name hint + mostly integer-like.
    if hints["is_id"] and int_rate >= 0.85:
        return ColumnSchema(name=name, kind="id", confidence=0.9, notes=notes)

    # Datetime: only if strings match date patterns and parse rate is high.
    if hints["is_date"] and dt_rate >= 0.8:
        return ColumnSchema(name=name, kind="datetime", confidence=0.85, notes=notes)
    if dt_rate >= 0.9 and numeric_rate < 0.7:
        return ColumnSchema(name=name, kind="datetime", confidence=0.8, notes=notes)

    # Numeric: parseable and not primarily date-like.
    # Integer-like columns: employees, counts, etc. Keep them int after imputation.
    if (hints["is_employee"] and int_rate >= 0.75) or (int_rate >= 0.95 and numeric_rate >= 0.85 and not hints["is_sales"]):
        return ColumnSchema(name=name, kind="integer", confidence=0.82, notes=notes)

    if numeric_rate >= 0.85:
        return ColumnSchema(name=name, kind="numeric", confidence=0.85, notes=notes)
    if hints["is_sales"] and numeric_rate >= 0.6:
        return ColumnSchema(name=name, kind="numeric", confidence=0.75, notes=notes)
    if hints["is_employee"] and int_rate >= 0.6:
        return ColumnSchema(name=name, kind="numeric", confidence=0.7, notes=notes)

    return ColumnSchema(name=name, kind="categorical", confidence=0.7, notes=notes)


def detect_schema(df: pd.DataFrame, *, sample_size: int = 200) -> Dict[str, ColumnSchema]:
    schema: Dict[str, ColumnSchema] = {}
    for col in df.columns:
        schema[str(col)] = detect_column_schema(df[col], sample_size=sample_size)
    return schema


def apply_type_corrections(df: pd.DataFrame, schema: Dict[str, ColumnSchema]) -> Tuple[pd.DataFrame, List[str]]:
    """
    Apply safe type conversions based on detected schema.
    Returns (corrected_df, log_lines).
    """
    out = df.copy()
    logs: List[str] = []

    for col, col_schema in schema.items():
        if col not in out.columns:
            continue

        if col_schema.kind == "datetime":
            # Only parse if schema explicitly says datetime (we avoid epoch -> 1970 issues).
            before_na = int(out[col].isna().sum())
            out[col] = pd.to_datetime(out[col].astype(str).str.strip(), errors="coerce")
            after_na = int(out[col].isna().sum())
            logs.append(f"Converted '{col}' to datetime (coerced {after_na - before_na} values).")
            continue

        if col_schema.kind in ("numeric", "id"):
            series = out[col]
            # Preserve missing markers and commas.
            numeric = pd.to_numeric(series.astype(str).str.replace(",", "", regex=False).str.strip(), errors="coerce")
            if col_schema.kind == "id":
                # IDs should be integer but allow missing.
                out[col] = numeric.round().astype("Int64")
                logs.append(f"Converted '{col}' to integer ID.")
            else:
                out[col] = numeric.astype(float)
                logs.append(f"Converted '{col}' to numeric.")
            continue

        if col_schema.kind == "integer":
            series = out[col]
            numeric = pd.to_numeric(series.astype(str).str.replace(",", "", regex=False).str.strip(), errors="coerce")
            out[col] = numeric.round().astype("Int64")
            logs.append(f"Converted '{col}' to integer.")
            continue

        # categorical: keep as string-like, but preserve NaN.
        if col_schema.kind == "categorical":
            # Don’t cast everything to string; keep nulls.
            out[col] = out[col].where(out[col].isna(), out[col].astype(str))
            continue

    return out, logs
