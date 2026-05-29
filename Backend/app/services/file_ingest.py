import io
import csv
import json
import re
from typing import Any

import pandas as pd


def detect_file_type(filename: str, content_type: str | None = None) -> str:
    name = (filename or "").lower().strip()
    mime = (content_type or "").lower().strip()

    if name.endswith(".pdf") or mime == "application/pdf":
        return "pdf"
    if name.endswith(".csv") or mime == "text/csv":
        return "csv"
    if name.endswith((".xlsx", ".xls")) or "spreadsheet" in mime or "excel" in mime:
        return "excel"
    if name.endswith(".json") or mime == "application/json":
        return "json"
    if name.endswith(".tsv"):
        return "tsv"
    if name.endswith((".txt", ".log")) or mime.startswith("text/"):
        return "text"
    return "unknown"


def build_ingest_report(
    df: pd.DataFrame,
    filename: str = "",
    content_type: str | None = None,
) -> dict[str, Any]:
    warnings = list(df.attrs.get("ingest_warnings", []))
    rows = int(len(df))
    columns = int(len(df.columns))
    total_cells = max(rows * max(columns, 1), 1)
    missing_cells = int(df.isna().sum().sum()) if rows and columns else 0
    missing_ratio = missing_cells / total_cells if rows and columns else 1.0

    confidence = 1.0
    if rows == 0:
        confidence -= 0.5
    if columns <= 1:
        confidence -= 0.35
    if warnings:
        confidence -= min(0.4, 0.1 * len(warnings))
    if missing_ratio > 0.3:
        confidence -= 0.15
    if missing_ratio > 0.6:
        confidence -= 0.2

    confidence = max(0.0, min(1.0, confidence))
    if confidence >= 0.8:
        label = "high"
    elif confidence >= 0.55:
        label = "medium"
    else:
        label = "low"

    return {
        "file_type": detect_file_type(filename, content_type),
        "content_type": content_type or "",
        "rows_extracted": rows,
        "columns_extracted": columns,
        "missing_cells": missing_cells,
        "missing_ratio": round(missing_ratio, 4),
        "confidence_score": round(confidence, 4),
        "confidence_label": label,
        "warnings": warnings,
    }


def _read_text_bytes(data: bytes) -> str:
    for encoding in ("utf-8", "utf-8-sig", "cp1252", "latin-1"):
        try:
            return data.decode(encoding)
        except UnicodeDecodeError:
            continue
    return data.decode("utf-8", errors="ignore")


def _dataframe_from_json_payload(payload: Any) -> pd.DataFrame:
    if isinstance(payload, list):
        return pd.DataFrame(payload)
    if isinstance(payload, dict):
        if isinstance(payload.get("data"), list):
            return pd.DataFrame(payload["data"])
        return pd.DataFrame([payload])
    raise ValueError("Unsupported JSON payload")


def _is_delimited_text(text: str) -> bool:
    lines = [line for line in text.splitlines() if line.strip()]
    if len(lines) < 2:
        return False
    sample = "\n".join(lines[:10])
    return any(delimiter in sample for delimiter in [",", "\t", "|", ";"])


def _sniff_delimiter(text: str) -> str:
    sample = "\n".join([line for line in text.splitlines() if line.strip()][:20])
    try:
        dialect = csv.Sniffer().sniff(sample, delimiters=",\t|;")
        return dialect.delimiter
    except Exception:
        counts = {delimiter: sample.count(delimiter) for delimiter in [",", "\t", "|", ";"]}
        return max(counts, key=counts.get)


def _normalize_header(value: Any) -> str:
    text = str(value or "").strip()
    text = text.replace("\ufeff", "")
    text = " ".join(text.replace("\n", " ").replace("\t", " ").split())
    return text or "column"


def _flexible_merge_index(headers: list[str]) -> int:
    flexible_tokens = (
        "note", "notes", "description", "comment", "remark", "address",
        "status_detail", "message", "reason", "misc", "details",
    )
    lowered = [header.lower() for header in headers]
    for index, name in enumerate(lowered):
        if any(token in name for token in flexible_tokens):
            return index
    return max(len(headers) - 1, 0)


def _looks_like_month(value: str) -> bool:
    return value.strip().lower() in {
        "jan", "january", "feb", "february", "mar", "march", "apr", "april",
        "may", "jun", "june", "jul", "july", "aug", "august", "sep",
        "sept", "september", "oct", "october", "nov", "november",
        "dec", "december",
    }


def _numeric_value(value: str) -> float | None:
    text = str(value or "").strip()
    if not text or text.lower() in {"unknown", "na", "n/a", "null", "none", "nan"}:
        return None
    text = text.replace("%", "").replace(",", "").replace("$", "").replace("₹", "")
    try:
        return float(text)
    except ValueError:
        return None


def _looks_like_status(value: str) -> bool:
    text = str(value or "").strip().lower()
    if not text:
        return True
    canonical = {
        "average", "excellent", "good", "critical", "poor", "bad", "stable",
        "unstable", "active", "inactive", "pending", "complete", "completed",
        "failed", "warning", "ok", "normal", "high", "medium", "low",
    }
    return text in canonical


def _cell_header_score(header: str, value: str) -> int:
    name = header.lower()
    text = str(value or "").strip()
    if not text:
        return 0

    numeric_tokens = (
        "revenue", "growth", "percent", "%", "score", "count", "amount",
        "price", "cost", "sales", "profit", "loss", "qty", "quantity",
        "employee", "customer", "rating", "value", "total",
    )
    if "month" in name:
        return 8 if _looks_like_month(text) else -8
    if "customer" in name and ("score" in name or "rating" in name):
        number = _numeric_value(text)
        return 8 if number is not None and 0 <= number <= 5 else -10
    if "status" in name:
        return 8 if _looks_like_status(text) else -10
    if any(token in name for token in numeric_tokens):
        return 5 if _numeric_value(text) is not None or text.lower() == "unknown" else -4
    if any(token in name for token in ("status", "note", "misc", "description", "comment", "sector", "name")):
        return 2 if _numeric_value(text) is None else 0
    return 0


def _header_kind(header: str) -> str:
    name = header.lower()
    if "sector" in name or name in {"department", "division", "category"}:
        return "sector"
    if "month" in name:
        return "month"
    if "revenue" in name or "sales" in name or "amount" in name:
        return "revenue"
    if "growth" in name or "%" in name or "percent" in name:
        return "growth"
    if "employee" in name or "count" in name or "qty" in name or "quantity" in name:
        return "integer_number"
    if "score" in name or "rating" in name:
        return "score"
    if "status" in name:
        return "status"
    if "note" in name or "description" in name or "comment" in name or "remark" in name:
        return "notes"
    if "misc" in name or "detail" in name:
        return "misc"
    return "generic"


def _valid_for_kind(kind: str, value: str) -> bool:
    text = str(value or "").strip()
    if not text:
        return True
    lower = text.lower()
    number = _numeric_value(text)

    if kind == "sector":
        return number is None and not _looks_like_month(text)
    if kind == "month":
        return _looks_like_month(text)
    if kind in {"revenue", "growth", "integer_number", "score"}:
        if kind == "score" and number is not None:
            return 0 <= number <= 10
        return number is not None or lower in {"unknown", "na", "n/a", "null", "none"}
    if kind == "status":
        return _looks_like_status(text)
    if kind in {"notes", "misc"}:
        return True
    return True


def _semantic_row_score(headers: list[str], cells: list[str]) -> int:
    score = 0
    for header, value in zip(headers, cells):
        kind = _header_kind(header)
        if _valid_for_kind(kind, value):
            score += 3
        else:
            score -= 4
        score += _cell_header_score(header, value)
    return score


def _align_cells_to_headers(headers: list[str], cells: list[str]) -> list[str]:
    expected = len(headers)
    values = [str(cell or "").strip() for cell in cells]
    if len(values) > expected:
        return values[:expected]

    # Dynamic programming over "assign this cell to this header" or "leave this header blank".
    # This is important for PDF rows with missing middle cells, where greedy padding shifts data.
    from functools import lru_cache

    @lru_cache(maxsize=None)
    def solve(header_index: int, cell_index: int):
        if header_index == expected:
            if cell_index == len(values):
                return 0, []
            return -10_000, []

        remaining_headers = expected - header_index
        remaining_cells = len(values) - cell_index
        best_score = -10_000
        best_cells = []

        if remaining_headers > remaining_cells:
            score, tail = solve(header_index + 1, cell_index)
            score -= 1
            if score > best_score:
                best_score = score
                best_cells = [""] + tail

        if cell_index < len(values):
            score, tail = solve(header_index + 1, cell_index + 1)
            score += _cell_header_score(headers[header_index], values[cell_index])
            if score >= best_score:
                best_score = score
                best_cells = [values[cell_index]] + tail

        return best_score, best_cells

    return solve(0, 0)[1]


def _semantic_realignment(headers: list[str], cells: list[str]) -> list[str]:
    expected = len(headers)
    if len(cells) < expected:
        return _align_cells_to_headers(headers, cells)
    if len(cells) > expected:
        return cells[:expected]

    candidates = [( _semantic_row_score(headers, cells), cells )]
    for remove_index in range(expected):
        compact = cells[:remove_index] + cells[remove_index + 1:]
        for insert_index in range(expected):
            candidate = compact[:insert_index] + [""] + compact[insert_index:]
            candidates.append((_semantic_row_score(headers, candidate), candidate))

    candidates.sort(key=lambda item: item[0], reverse=True)
    best_score, best = candidates[0]
    original_score = _semantic_row_score(headers, cells)
    return best if best_score >= original_score + 5 else cells


def _infer_missing_categories(headers: list[str], rows: list[list[str]]) -> tuple[list[list[str]], list[str]]:
    warnings = []
    if not rows:
        return rows, warnings

    sector_indexes = [
        index for index, header in enumerate(headers)
        if _header_kind(header) == "sector"
    ]
    if not sector_indexes:
        return rows, warnings

    inferred_rows = [list(row) for row in rows]
    for index in sector_indexes:
        known_values = [
            str(row[index]).strip()
            for row in inferred_rows
            if index < len(row) and str(row[index]).strip()
        ]
        if not known_values:
            continue

        previous = ""
        inferred_count = 0
        for row in inferred_rows:
            value = str(row[index]).strip() if index < len(row) else ""
            if value:
                previous = value
                continue
            if previous:
                row[index] = previous
                inferred_count += 1
                continue

        next_value = ""
        for row in reversed(inferred_rows):
            value = str(row[index]).strip() if index < len(row) else ""
            if value:
                next_value = value
                continue
            if next_value:
                row[index] = next_value
                inferred_count += 1

        if inferred_count:
            warnings.append(
                f"Inferred {inferred_count} missing value(s) for column '{headers[index]}' from neighboring rows."
            )

    return inferred_rows, warnings


def _alignment_score(headers: list[str], cells: list[str]) -> int:
    return sum(_cell_header_score(header, value) for header, value in zip(headers, cells))


def _pad_short_row_by_schema(headers: list[str], cells: list[str]) -> list[str]:
    return _align_cells_to_headers(headers, cells)


def _repair_delimited_rows(rows: list[list[str]]) -> tuple[list[str], list[list[str]], list[str]]:
    warnings = []
    if not rows:
        return [], [], ["No rows found in extracted text."]

    headers = [_normalize_header(value) for value in rows[0]]
    expected = len(headers)
    if expected == 0:
        return [], [], ["No columns found in extracted text."]

    repaired_rows = []
    malformed_count = 0
    merge_index = _flexible_merge_index(headers)

    for row in rows[1:]:
        cells = ["" if cell is None else str(cell).strip() for cell in row]
        if len(cells) == expected:
            repaired_rows.append(_semantic_realignment(headers, cells))
            continue

        malformed_count += 1
        if len(cells) < expected:
            repaired_rows.append(_semantic_realignment(headers, _pad_short_row_by_schema(headers, cells)))
            continue

        overflow = len(cells) - expected
        before = cells[:merge_index]
        merged = ",".join(cells[merge_index:merge_index + overflow + 1]).strip()
        after = cells[merge_index + overflow + 1:]
        fixed = before + [merged] + after
        if len(fixed) < expected:
            fixed += [""] * (expected - len(fixed))
        repaired_rows.append(_semantic_realignment(headers, fixed[:expected]))

    if malformed_count:
        warnings.append(
            f"Repaired {malformed_count} row(s) whose extracted PDF column count did not match the header."
        )

    repaired_rows, inference_warnings = _infer_missing_categories(headers, repaired_rows)
    warnings.extend(inference_warnings)

    return headers, repaired_rows, warnings


def _dataframe_from_delimited_text(text: str) -> pd.DataFrame:
    delimiter = _sniff_delimiter(text)
    rows = [
        row
        for row in csv.reader(io.StringIO(text), delimiter=delimiter)
        if row and any(str(cell).strip() for cell in row)
    ]
    headers, repaired_rows, warnings = _repair_delimited_rows(rows)
    if not headers:
        df = pd.DataFrame()
    else:
        df = pd.DataFrame(repaired_rows, columns=headers)

    df.attrs["ingest_warnings"] = warnings
    df.attrs["ingest_meta"] = {
        "source_format": "delimited_text",
        "delimiter": delimiter,
        "repaired_rows": len(warnings) > 0,
    }
    return df


def _attach_quality_warnings(df: pd.DataFrame) -> pd.DataFrame:
    warnings = list(df.attrs.get("ingest_warnings", []))
    if df.empty:
        warnings.append("No structured rows were extracted.")
    elif len(df.columns) <= 1:
        warnings.append("Only one column was extracted; the PDF may not contain a structured table.")
    else:
        unnamed = sum(1 for col in df.columns if str(col).lower().startswith("unnamed"))
        if unnamed:
            warnings.append(f"{unnamed} unnamed column(s) detected after extraction.")

        mostly_empty = [
            str(col)
            for col in df.columns
            if len(df) > 0 and float(df[col].isna().mean()) >= 0.8
        ]
        if mostly_empty:
            warnings.append(
                "Some columns are mostly empty after extraction: " + ", ".join(mostly_empty[:5])
            )

    df.attrs["ingest_warnings"] = warnings
    return df


def repair_dataframe_semantics(df: pd.DataFrame) -> pd.DataFrame:
    """Repair already-tabular data whose cells are shifted under the wrong headers."""
    if df.empty or len(df.columns) <= 1:
        return df

    headers = [_normalize_header(col) for col in df.columns]
    rows = []
    changed_count = 0
    for _, row in df.iterrows():
        cells = ["" if pd.isna(value) else str(value).strip() for value in row.tolist()]
        if len(cells) < len(headers):
            cells = _pad_short_row_by_schema(headers, cells)
        elif len(cells) > len(headers):
            cells = cells[:len(headers)]

        repaired = _semantic_realignment(headers, cells)
        if repaired != cells:
            changed_count += 1
        rows.append(repaired)

    rows, inference_warnings = _infer_missing_categories(headers, rows)
    repaired_df = pd.DataFrame(rows, columns=headers)
    warnings = list(df.attrs.get("ingest_warnings", []))
    if changed_count:
        warnings.append(f"Semantically realigned {changed_count} row(s) before cleaning.")
    warnings.extend(inference_warnings)
    repaired_df.attrs["ingest_warnings"] = warnings
    repaired_df.attrs["ingest_meta"] = dict(df.attrs.get("ingest_meta", {}))
    return repaired_df


def _normalize_field_name(value: str) -> str:
    text = re.sub(r"[^a-zA-Z0-9]+", "_", str(value or "").strip().lower())
    return text.strip("_") or "field"


def _parse_key_value_lines(lines: list[str]) -> dict[str, str]:
    metadata = {}
    for line in lines:
        match = re.match(r"^([^:]{2,80}):\s*(.+)$", line.strip())
        if not match:
            continue
        key = _normalize_field_name(match.group(1))
        value = match.group(2).strip()
        if key and value:
            metadata[key] = value
    return metadata


def _tokens_from_document_line(line: str) -> list[str]:
    return [token.strip() for token in re.split(r"\s+", line.strip()) if token.strip()]


def _looks_like_document_table_header(tokens: list[str], following_lines: list[str]) -> bool:
    if len(tokens) < 2 or len(tokens) > 8:
        return False
    if not all(re.match(r"^[A-Za-z_/%-]+$", token) for token in tokens):
        return False
    if following_lines:
        next_tokens = _tokens_from_document_line(following_lines[0])
        if (
            len(next_tokens) >= 2
            and all(re.match(r"^[A-Za-z_/%-]+$", token) for token in next_tokens)
            and not any(_numeric_value(token) is not None for token in next_tokens)
        ):
            return False

    candidate_rows = 0
    for line in following_lines[:5]:
        row_tokens = _tokens_from_document_line(line)
        if len(row_tokens) < len(tokens):
            continue
        numeric_tail = sum(1 for token in row_tokens[-max(1, len(tokens) - 1):] if _numeric_value(token) is not None)
        if numeric_tail > 0:
            candidate_rows += 1
    return candidate_rows > 0


def _parse_document_table(lines: list[str]) -> tuple[list[str], list[list[str]], int | None]:
    for index, line in enumerate(lines):
        header_tokens = _tokens_from_document_line(line)
        if not _looks_like_document_table_header(header_tokens, lines[index + 1:]):
            continue

        rows = []
        for row_line in lines[index + 1:]:
            if ":" in row_line:
                break
            row_tokens = _tokens_from_document_line(row_line)
            if len(row_tokens) < len(header_tokens):
                if rows:
                    break
                continue
            if not any(_numeric_value(token) is not None for token in row_tokens):
                if rows:
                    break
                continue

            if len(row_tokens) == len(header_tokens):
                rows.append(row_tokens)
                continue

            leading_count = len(row_tokens) - len(header_tokens) + 1
            rows.append([" ".join(row_tokens[:leading_count])] + row_tokens[leading_count:])

        if rows:
            return [_normalize_field_name(token) for token in header_tokens], rows, index
    return [], [], None


def _dataframe_from_document_text(text: str) -> pd.DataFrame | None:
    lines = [" ".join(line.strip().split()) for line in text.splitlines() if line.strip()]
    if len(lines) < 3:
        return None

    metadata = _parse_key_value_lines(lines)
    headers, rows, _ = _parse_document_table(lines)
    if not headers or not rows:
        return None

    df = pd.DataFrame(rows, columns=headers)
    for key, value in metadata.items():
        if key not in df.columns:
            df[key] = value

    total_match = re.search(r"total\s+amount\s*:\s*([^\n\r]+)", text, flags=re.IGNORECASE)
    if total_match and "total_amount" not in df.columns:
        df["total_amount"] = total_match.group(1).strip()

    df.attrs["ingest_warnings"] = [
        "Extracted document-style PDF as a structured table with repeated metadata."
    ]
    df.attrs["ingest_meta"] = {
        "source_format": "document_text",
        "metadata_fields": sorted(metadata.keys()),
    }
    return _attach_quality_warnings(df)


def _dataframe_from_text(text: str) -> pd.DataFrame:
    stripped = (text or "").strip()
    if not stripped:
        return pd.DataFrame()

    if (stripped.startswith("{") and stripped.endswith("}")) or (
        stripped.startswith("[") and stripped.endswith("]")
    ):
        try:
            return _dataframe_from_json_payload(json.loads(stripped))
        except Exception:
            pass

    document_df = _dataframe_from_document_text(stripped)
    if document_df is not None:
        return document_df

    if _is_delimited_text(stripped):
        return _attach_quality_warnings(_dataframe_from_delimited_text(stripped))

    # Try common delimited formats first. This preserves CSV-like text extracted
    # from PDFs as real columns instead of collapsing everything into one field.
    for kwargs in (
        {"sep": None, "engine": "python"},
        {"sep": "\t"},
        {"sep": "|"},
    ):
        try:
            df = pd.read_csv(io.StringIO(stripped), **kwargs)
            if len(df.columns) > 1 or len(df) > 1:
                return _attach_quality_warnings(df)
        except Exception:
            pass

    try:
        df = pd.read_fwf(io.StringIO(stripped))
        if len(df.columns) > 1:
            return _attach_quality_warnings(df)
    except Exception:
        pass

    lines = [line for line in stripped.splitlines() if line.strip()]
    return _attach_quality_warnings(pd.DataFrame({"text": lines}))


def _extract_text_from_pdf(data: bytes) -> str:
    try:
        import pdfplumber  # type: ignore

        table_chunks = []
        text_chunks = []
        with pdfplumber.open(io.BytesIO(data)) as pdf:
            for page in pdf.pages:
                tables = page.extract_tables() or []
                for table in tables:
                    rows = [
                        ["" if cell is None else str(cell).strip() for cell in row]
                        for row in table
                        if row
                    ]
                    if rows:
                        table_chunks.append("\n".join(",".join(row) for row in rows))
                page_text = page.extract_text() or ""
                if page_text.strip():
                    text_chunks.append(page_text)
        text = "\n".join(table_chunks or text_chunks)
        if text.strip():
            return text
    except Exception:
        pass

    try:
        import fitz  # type: ignore

        doc = fitz.open(stream=data, filetype="pdf")
        text = "\n".join(page.get_text("text") for page in doc)
        if text.strip():
            return text
    except Exception:
        pass

    raise RuntimeError(
        "Could not extract text from this PDF. If it is a scanned image PDF, convert it to CSV/Excel first."
    )


def load_dataframe_from_upload_bytes(
    filename: str,
    data: bytes,
    content_type: str | None = None,
) -> pd.DataFrame:
    name = (filename or "").lower().strip()
    mime = (content_type or "").lower().strip()

    if name.endswith(".csv") or mime == "text/csv":
        return _attach_quality_warnings(pd.read_csv(io.BytesIO(data)))
    if name.endswith((".xlsx", ".xls")):
        return _attach_quality_warnings(pd.read_excel(io.BytesIO(data)))
    if name.endswith(".json") or mime == "application/json":
        return _attach_quality_warnings(_dataframe_from_json_payload(json.loads(_read_text_bytes(data))))
    if name.endswith((".txt", ".tsv", ".log")) or mime.startswith("text/"):
        return _dataframe_from_text(_read_text_bytes(data))
    if name.endswith(".pdf") or mime == "application/pdf":
        return _dataframe_from_text(_extract_text_from_pdf(data))

    raise ValueError("Unsupported file format")


def load_dataframe_from_uploadfile(file) -> pd.DataFrame:
    filename = getattr(file, "filename", "") or ""
    content_type = getattr(file, "content_type", "") or ""
    data = file.file.read()
    return load_dataframe_from_upload_bytes(filename, data, content_type)
