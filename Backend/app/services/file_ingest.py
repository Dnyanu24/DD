
import csv
import io
import json
import math
import mimetypes
import os
import re
from typing import Any, Dict, List, Optional, Tuple

import pandas as pd


def _read_text_bytes(data: bytes) -> str:
    # Best-effort decoding for plain text uploads.
    # We intentionally avoid chardet dependency and just fall back safely.
    for encoding in ("utf-8", "utf-8-sig", "cp1252", "latin-1"):
        try:
            return data.decode(encoding)
        except Exception:
            continue
    return data.decode("utf-8", errors="ignore")


def _guess_mime_type(filename: str, upload_content_type: str = "") -> str:
    if upload_content_type:
        return upload_content_type
    guessed, _ = mimetypes.guess_type(filename or "")
    return guessed or "application/octet-stream"


def _infer_text_format(text: str) -> str:
    stripped = (text or "").strip()
    if not stripped:
        return "txt"

    if stripped.startswith("{") or stripped.startswith("["):
        try:
            json.loads(stripped)
            return "json"
        except Exception:
            pass
    if stripped.startswith("<") and "</" in stripped:
        return "xml"

    lines = [line for line in stripped.splitlines() if line.strip()]
    if len(lines) < 2:
        return "txt"

    delimiter_scores = {
        ",": lines[0].count(","),
        "\t": lines[0].count("\t"),
        ";": lines[0].count(";"),
        "|": lines[0].count("|")
    }
    best_delimiter = max(delimiter_scores, key=delimiter_scores.get)
    if delimiter_scores[best_delimiter] > 0:
        return "tsv" if best_delimiter == "\t" else "csv"

    return "txt"


def _dataframe_from_json_payload(payload: Any) -> pd.DataFrame:
    if isinstance(payload, list):
        return pd.DataFrame(payload)
    if isinstance(payload, dict):
        # Common shape: {"data":[...]} or nested record maps
        if isinstance(payload.get("data"), list):
            return pd.DataFrame(payload["data"])
        return pd.DataFrame([payload])
    raise ValueError("Unsupported JSON payload")


def _dataframe_from_text(text: str) -> pd.DataFrame:
    stripped = (text or "").strip()
    if not stripped:
        return pd.DataFrame()

    # Try JSON first (either object or array).
    if (stripped.startswith("{") and stripped.endswith("}")) or (stripped.startswith("[") and stripped.endswith("]")):
        try:
            payload = json.loads(stripped)
            return _dataframe_from_json_payload(payload)
        except Exception:
            pass

    # Try delimited text (csv/tsv/pipe) with separator inference.
    try:
        return pd.read_csv(io.StringIO(text), sep=None, engine="python")
    except Exception:
        # Fall back to one-column dataset.
        lines = [line for line in stripped.splitlines() if line.strip()]
        return pd.DataFrame({"text": lines})


def _clean_header_names(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df.columns = [re.sub(r"[^0-9A-Za-z_]+", "_", str(c)).strip("_") if c is not None else "" for c in df.columns]
    return df


def _parse_csv_pipeline(filename: str, data: bytes) -> pd.DataFrame:
    text = _read_text_bytes(data)
    # File Size & Memory Check
    if len(data) > 150_000_000:
        raise ValueError("CSV file is too large to parse safely")

    # Character Encoding Detection + Delimiter Sniffing
    sep = None
    try:
        sample = text[:8192]
        dialect = csv.Sniffer().sniff(sample)
        sep = dialect.delimiter
    except Exception:
        sep = None

    if sep not in {",", "\t", ";", "|"}:
        sep = None

    # Safe Data Parsing
    df = pd.read_csv(io.StringIO(text), sep=sep, engine="python", skip_blank_lines=True)
    df = df.dropna(how="all").dropna(axis=1, how="all")
    df = _clean_header_names(df)
    return df


def _parse_excel_pipeline(filename: str, data: bytes) -> pd.DataFrame:
    if len(data) > 200_000_000:
        raise ValueError("Excel file is too large to parse safely")

    bio = io.BytesIO(data)
    file_ext = os.path.splitext(filename.lower())[1]
    engine = "openpyxl" if file_ext == ".xlsx" else "xlrd"
    try:
        xls = pd.ExcelFile(bio, engine=engine)
    except Exception as exc:
        raise RuntimeError(f"Excel engine failed: {exc}")

    # Sheet Detection & Mapping
    sheet_candidates = [(name, pd.read_excel(xls, sheet_name=name, header=None, nrows=10)) for name in xls.sheet_names]
    best_sheet = None
    best_count = -1
    for name, preview in sheet_candidates:
        non_empty = int(preview.notna().sum().sum())
        if non_empty > best_count:
            best_sheet = name
            best_count = non_empty

    header_row = 0
    df = pd.read_excel(xls, sheet_name=best_sheet, header=None)
    for idx, row in df.iterrows():
        if int(row.notna().sum()) >= max(1, int(len(row) * 0.5)):
            header_row = int(idx)
            break
    df = pd.read_excel(xls, sheet_name=best_sheet, header=header_row)

    # Header & Metadata Stripping, merged cell fill, specific range extraction
    df = df.dropna(how="all").dropna(axis=1, how="all")
    if df.columns.dtype == object:
        df.columns = [str(c).strip() for c in df.columns]
    df = df.ffill(axis=0)
    df = _clean_header_names(df)
    return df


def _normalize_json_payload(payload: Any) -> pd.DataFrame:
    if isinstance(payload, list):
        df = pd.json_normalize(payload, sep="_")
    elif isinstance(payload, dict):
        if isinstance(payload.get("data"), list):
            df = pd.json_normalize(payload["data"], sep="_")
        else:
            df = pd.json_normalize(payload, sep="_")
    else:
        raise ValueError("Unsupported JSON payload")

    # Flatten nested objects and arrays
    list_cols = [c for c in df.columns if df[c].apply(lambda v: isinstance(v, list)).any()]
    for col in list_cols:
        try:
            df = df.explode(col)
        except Exception:
            continue
    return df


def _parse_json_pipeline(filename: str, data: bytes) -> pd.DataFrame:
    """Phase 2: JSON flattening + unpacking nested structures."""
    text = _read_text_bytes(data)
    payload = json.loads(text)
    df = _normalize_json_payload(payload)
    # Unpack arrays of objects if present
    object_array_cols = [c for c in df.columns if df[c].apply(lambda x: isinstance(x, list) and len(x)>0 and isinstance(x[0], dict)).any()]
    for col in object_array_cols:
        df = df.explode(col)
    df = df.dropna(how="all").dropna(axis=1, how="all")
    df = _clean_header_names(df)
    return df



def _extract_key_value_lines(lines: List[str]) -> List[Dict[str, Any]]:
    kv_pattern = re.compile(r"^\s*([^:=\-\t]+?)\s*[:=\-]\s*(.+)$")
    extracted = []
    for line in lines:
        match = kv_pattern.match(line)
        if match:
            extracted.append({match.group(1).strip(): match.group(2).strip()})
    return extracted


def _detect_table_like_text(text: str) -> bool:
    lines = [line for line in text.splitlines() if line.strip()]
    if len(lines) < 2:
        return False
    delimiter_scores = {
        ",": lines[0].count(","),
        "\t": lines[0].count("\t"),
        ";": lines[0].count(";"),
        "|": lines[0].count("|")
    }
    top_score = max(delimiter_scores.values())
    return top_score >= 1


def _parse_text_pipeline(filename: str, data: bytes) -> pd.DataFrame:
    text = _read_text_bytes(data)
    lines = [line.strip() for line in text.splitlines() if line.strip()]

    if _detect_table_like_text(text):
        return _dataframe_from_text(text)

    kv_rows = _extract_key_value_lines(lines)
    if kv_rows:
        df = pd.DataFrame(kv_rows)
        df = df.dropna(how="all").dropna(axis=1, how="all")
        df = _clean_header_names(df)
        return df

    return pd.DataFrame({"document_text": [text]})


def _parse_xml_pipeline(filename: str, data: bytes) -> pd.DataFrame:
    """Parse XML files into a DataFrame."""
    try:
        import xml.etree.ElementTree as ET
    except ImportError:
        raise RuntimeError("XML support requires xml library (built-in)")
    
    text = _read_text_bytes(data)
    
    try:
        root = ET.fromstring(text)
    except Exception as exc:
        raise ValueError(f"Invalid XML: {exc}")
    
    # Try to extract rows from XML
    rows = []
    
    # Strategy 1: Look for repeating elements (common for table-like data)
    for elem in root:
        row_dict = {}
        for child in elem:
            key = child.tag
            value = child.text or ""
            # Handle elements with multiple children (nested structure)
            if len(child) > 0:
                value = ET.tostring(child, encoding='unicode')
            row_dict[key] = value
        if row_dict:
            rows.append(row_dict)
    
    # Strategy 2: If no repeating elements, flatten the entire root
    if not rows or len(rows) == 1:
        rows = [_flatten_xml_element(root)]
    
    if rows:
        df = pd.DataFrame(rows)
        df = df.dropna(how="all").dropna(axis=1, how="all")
        df = _clean_header_names(df)
        return df
    
    # Fallback: treat as raw text
    return pd.DataFrame({"xml_content": [text]})


def _flatten_xml_element(elem) -> Dict[str, Any]:
    """Recursively flatten XML element to dictionary."""
    result = {}
    
    # Add element's text if exists
    if elem.text and elem.text.strip():
        result[elem.tag if not elem.tag else "value"] = elem.text.strip()
    
    # Add attributes
    for key, value in elem.attrib.items():
        result[f"{elem.tag}_{key}"] = value
    
    # Add children
    for child in elem:
        child_dict = _flatten_xml_element(child)
        for key, value in child_dict.items():
            result[key] = value
    
    return result if result else {elem.tag: ""}


def _parse_html_pipeline(filename: str, data: bytes) -> pd.DataFrame:
    """Parse HTML files into a DataFrame (extract tables or text)."""
    try:
        from html.parser import HTMLParser
    except ImportError:
        raise RuntimeError("HTML support requires html library (built-in)")
    
    text = _read_text_bytes(data)
    
    try:
        import pandas as pd
        # Try to extract tables from HTML
        tables = pd.read_html(io.StringIO(text))
        if tables:
            df = pd.concat(tables, ignore_index=True)
            df = df.dropna(how="all").dropna(axis=1, how="all")
            df = _clean_header_names(df)
            return df
    except Exception:
        pass
    
    # Fallback: extract text from HTML tags
    class HTMLTextExtractor(HTMLParser):
        def __init__(self):
            super().__init__()
            self.text_parts = []
            self.in_script = False
        
        def handle_starttag(self, tag, attrs):
            if tag in {"script", "style"}:
                self.in_script = True
        
        def handle_endtag(self, tag):
            if tag in {"script", "style"}:
                self.in_script = False
            elif tag in {"p", "div", "li", "tr", "td"}:
                self.text_parts.append("\n")
        
        def handle_data(self, data):
            if not self.in_script:
                text = data.strip()
                if text:
                    self.text_parts.append(text)
    
    extractor = HTMLTextExtractor()
    try:
        extractor.feed(text)
        extracted_text = " ".join(extractor.text_parts)
        if extracted_text.strip():
            return pd.DataFrame({"html_content": [extracted_text]})
    except Exception:
        pass
    
    # Last resort: raw text
    return pd.DataFrame({"html_content": [text]})


def detect_file_type(filename: str, data: bytes, upload_content_type: str = "") -> Dict[str, Any]:
    extension = os.path.splitext((filename or "").strip().lower())[1]
    extension = extension if extension else ""
    guessed_mime = _guess_mime_type(filename, upload_content_type)
    detected_format = "unknown"

    if data.startswith(b"%PDF"):
        detected_format = "pdf"
    elif data.startswith((b"PK\x03\x04", b"PK\x05\x06", b"PK\x07\x08")):
        detected_format = "xlsx"
    elif data.startswith(b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"):
        detected_format = "xls"
    else:
        try:
            text = _read_text_bytes(data)
            if text.strip().startswith("{") or text.strip().startswith("["):
                json.loads(text)
                detected_format = "json"
            elif text.strip().startswith("<") and "</" in text:
                detected_format = "xml"
            else:
                detected_format = _infer_text_format(text)
        except Exception:
            detected_format = "txt"

    if detected_format == "unknown" and extension:
        if extension in {".csv"}:
            detected_format = "csv"
        elif extension in {".json"}:
            detected_format = "json"
        elif extension in {".txt", ".log"}:
            detected_format = "txt"
        elif extension in {".xls", ".xlsx"}:
            detected_format = "xlsx"
        elif extension == ".pdf":
            detected_format = "pdf"
        elif extension == ".xml":
            detected_format = "xml"

    if detected_format == "unknown":
        if guessed_mime and "json" in guessed_mime:
            detected_format = "json"
        elif guessed_mime and "pdf" in guessed_mime:
            detected_format = "pdf"
        elif guessed_mime and "xml" in guessed_mime:
            detected_format = "xml"
        elif guessed_mime and "text" in guessed_mime:
            detected_format = "txt"

    if detected_format == "unknown":
        detected_format = "txt"

    category_map = {
        "csv": "structured",
        "tsv": "structured",
        "xlsx": "structured",
        "xls": "structured",
        "json": "semi-structured",
        "xml": "semi-structured",
        "txt": "unstructured",
        "pdf": "unstructured",
        "html": "unstructured",
    }
    file_category = category_map.get(detected_format, "unstructured")

    pipeline_map = {
        "structured": "structured",
        "semi-structured": "structured",
        "unstructured": "unstructured",
    }

    return {
        "filename": filename,
        "extension": extension,
        "content_type": upload_content_type,
        "mime_type": guessed_mime,
        "detected_format": detected_format,
        "file_category": file_category,
        "recommended_pipeline": pipeline_map[file_category],
        "inference_source": "content" if detected_format not in {"unknown", "txt"} else "extension_or_mime",
    }


def _extract_tables_from_pdf(data: bytes) -> List[Tuple[int, pd.DataFrame]]:
    """Extract tables from PDF pages (best-effort)."""
    try:
        import pdfplumber  # type: ignore

        extracted: List[Tuple[int, pd.DataFrame]] = []
        with pdfplumber.open(io.BytesIO(data)) as pdf:
            for page_num, page in enumerate(pdf.pages, start=1):
                page_tables = page.extract_tables()
                if page_tables:
                    for table in page_tables:
                        if table and len(table) > 1:
                            rows = [r for r in table if r and any(cell for cell in r if cell)]
                            if len(rows) < 2:
                                continue
                            headers = rows[0]
                            df = pd.DataFrame(rows[1:], columns=headers)
                            df = df.dropna(how="all").dropna(axis=1, how="all")
                            df = _clean_header_names(df)
                            if not df.empty:
                                extracted.append((page_num, df))
    except Exception:
        pass

    return extracted


def _df_to_json_safe_records(df: pd.DataFrame, *, limit: Optional[int] = None) -> List[Dict[str, Any]]:
    safe_df = df.copy()
    if limit is not None and limit >= 0:
        safe_df = safe_df.head(limit)

    records = safe_df.to_dict("records")
    normalized: List[Dict[str, Any]] = []
    for row in records:
        normalized_row: Dict[str, Any] = {}
        for key, value in row.items():
            if value is None:
                normalized_row[str(key)] = None
            elif isinstance(value, float) and not math.isfinite(value):
                normalized_row[str(key)] = None
            elif pd.isna(value):
                normalized_row[str(key)] = None
            else:
                normalized_row[str(key)] = value
        normalized.append(normalized_row)
    return normalized


def _normalize_field_name(value: str) -> str:
    raw = str(value or "").strip().lower()
    raw = re.sub(r"[^0-9a-z]+", "_", raw)
    raw = re.sub(r"_+", "_", raw).strip("_")
    return raw or "field"


def _try_parse_amount(value: Any) -> Optional[float]:
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    text = re.sub(r"[^\d\.\,\-\(\)]", "", text)
    text = text.replace(",", "")
    if not text:
        return None
    negative = False
    if text.startswith("(") and text.endswith(")"):
        negative = True
        text = text[1:-1]
    try:
        num = float(text)
        return -num if negative else num
    except Exception:
        return None


def _looks_like_date(value: Any) -> bool:
    if value is None:
        return False
    text = str(value).strip()
    if not text:
        return False
    if re.search(r"\b\d{4}-\d{2}-\d{2}\b", text):
        return True
    if re.search(r"\b\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\b", text):
        return True
    if re.search(r"\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)\b", text.lower()):
        return True
    return False


def _detect_block_type(lines: List[str]) -> str:
    if not lines:
        return "TEXT"
    kv_count = sum(1 for line in lines if re.search(r"^\s*([^:=\-\t]{1,80}?)\s*[:=\-]\s*(.+)$", line))
    kv_ratio = kv_count / max(len(lines), 1)
    joined = "\n".join(lines)
    if kv_ratio >= 0.5 and kv_count >= 1:
        return "KEY_VALUE"
    if _detect_table_like_text(joined):
        return "TABLE"
    # aligned columns (2+ spaces) heuristic
    split_counts = []
    for line in lines[:20]:
        parts = [p for p in re.split(r"\s{2,}", line.strip()) if p]
        if len(parts) >= 3:
            split_counts.append(len(parts))
    if split_counts and (sum(1 for c in split_counts if c == split_counts[0]) / len(split_counts)) >= 0.6:
        return "TABLE"
    return "TEXT"


def _pdf_detect_blocks(layout_lines: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Step 2/3: layout blocks + block classification."""
    blocks: List[Dict[str, Any]] = []
    current: Dict[str, Any] = {"page": None, "items": []}

    def _y0(item: Dict[str, Any]) -> float:
        bbox = item.get("bbox") or [0, 0, 0, 0]
        try:
            return float(bbox[1])
        except Exception:
            return 0.0

    prev_y: Optional[float] = None
    prev_font_size: Optional[float] = None
    for item in layout_lines:
        page = int(item.get("page") or 1)
        text = str(item.get("text") or "").strip()
        if not text:
            continue
        y = _y0(item)
        font_size = item.get("font_size")
        font_size = float(font_size) if isinstance(font_size, (int, float)) else None

        new_block = False
        if current["page"] is None:
            current["page"] = page
        if page != current["page"]:
            new_block = True
        if prev_y is not None and page == current["page"]:
            gap = y - prev_y
            # Use a generous threshold to keep multi-line regions together.
            threshold = 28.0
            if prev_font_size is not None:
                threshold = max(threshold, prev_font_size * 2.2)
            if font_size is not None:
                threshold = max(threshold, font_size * 2.2)
            if gap > threshold:
                new_block = True

        if new_block and current["items"]:
            block_lines = [str(x.get("text") or "").strip() for x in current["items"] if str(x.get("text") or "").strip()]
            blocks.append(
                {
                    "page": int(current["page"] or 1),
                    "lines": block_lines,
                    "type": _detect_block_type(block_lines),
                }
            )
            current = {"page": page, "items": []}

        current["items"].append(item)
        prev_y = y
        prev_font_size = font_size

    if current["items"]:
        block_lines = [str(x.get("text") or "").strip() for x in current["items"] if str(x.get("text") or "").strip()]
        blocks.append({"page": int(current["page"] or 1), "lines": block_lines, "type": _detect_block_type(block_lines)})

    for idx, block in enumerate(blocks):
        block["block_index"] = idx
        preview = " ".join(block.get("lines") or [])[:200]
        block["preview"] = preview

    return blocks


def _table_from_aligned_text(lines: List[str]) -> Optional[pd.DataFrame]:
    if not lines:
        return None

    def _split_cols(line: str) -> List[str]:
        return [p.strip() for p in re.split(r"\s{2,}", (line or "").strip()) if p.strip()]

    non_empty_lines = [str(line or "").rstrip() for line in lines if str(line or "").strip()]
    if len(non_empty_lines) < 2:
        return None

    header_parts = _split_cols(non_empty_lines[0])
    expected_cols = len(header_parts)
    if expected_cols < 2:
        return None

    rows: List[List[Optional[str]]] = [header_parts]
    for line in non_empty_lines[1:]:
        parts = _split_cols(line)
        if len(parts) == expected_cols:
            rows.append(parts)
            continue

        tokens = [t for t in re.split(r"\s+", (line or "").strip()) if t]
        if len(tokens) >= expected_cols:
            # Merge any extra tokens into the first column (common for product descriptions).
            head = " ".join(tokens[: len(tokens) - (expected_cols - 1)])
            tail = tokens[len(tokens) - (expected_cols - 1) :]
            rows.append([head] + tail)
        else:
            rows.append(parts + [None] * (expected_cols - len(parts)))

    padded = [list(r) + [None] * (expected_cols - len(r)) for r in rows]
    header = padded[0]
    header_is_labels = (
        sum(1 for h in header if h and not re.fullmatch(r"[\d\.\,\-\(\)]+", str(h).strip()))
        >= max(1, int(expected_cols * 0.6))
    )
    if header_is_labels:
        columns = [_normalize_field_name(h) for h in header]
        data_rows = padded[1:]
    else:
        columns = [f"col_{i+1}" for i in range(expected_cols)]
        data_rows = padded

    df = pd.DataFrame(data_rows, columns=columns)
    df = df.dropna(how="all").dropna(axis=1, how="all")
    return df if not df.empty else None


def _extract_entities_from_text(text: str) -> List[Dict[str, Any]]:
    """Step 4C: simple NLP-ish entity extraction (regex-based)."""
    t = str(text or "")
    entities: List[Dict[str, Any]] = []

    def _add(entity_type: str, value: str, confidence: float):
        value = value.strip()
        if not value:
            return
        entities.append({"entity_type": entity_type, "value": value, "confidence": float(confidence)})

    for m in re.finditer(r"\b[\w\.-]+@[\w\.-]+\.\w+\b", t):
        _add("EMAIL", m.group(0), 0.9)
    for m in re.finditer(r"\b(?:\+?\d{1,3}[\s\-]?)?(?:\(?\d{3}\)?[\s\-]?)?\d{3}[\s\-]?\d{4}\b", t):
        _add("PHONE", m.group(0), 0.7)
    for m in re.finditer(r"\b\d{4}-\d{2}-\d{2}\b", t):
        _add("DATE", m.group(0), 0.85)
    for m in re.finditer(r"\b\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\b", t):
        _add("DATE", m.group(0), 0.75)
    for m in re.finditer("(?:\u20B9|\\$|\u20AC|\u00A3)\\s?\\d[\\d,]*(?:\\.\\d{1,2})?", t):
        _add("AMOUNT", m.group(0), 0.8)
    for m in re.finditer(r"(?:₹|\$|€|£)\s?\d[\d,]*(?:\.\d{1,2})?", t):
        _add("AMOUNT", m.group(0), 0.8)
    for m in re.finditer(r"\b\d[\d,]*(?:\.\d{1,2})\b", t):
        # weak amount candidate; avoid single small numbers
        if len(m.group(0)) >= 4:
            _add("NUMBER", m.group(0), 0.4)

    return entities


def _kv_entity_for_key(normalized_key: str) -> str:
    k = normalized_key
    if any(token in k for token in ("invoice", "bill", "inv_no", "invoice_no", "invoice_number")):
        return "invoice"
    if any(token in k for token in ("customer", "buyer", "client", "ship_to", "bill_to", "gstin", "pan", "address", "email", "phone")):
        return "customer"
    if any(token in k for token in ("total", "subtotal", "tax", "gst", "cgst", "sgst", "igst", "amount_due", "balance", "paid", "payment", "grand_total")):
        return "payment"
    if any(token in k for token in ("supplier", "seller", "vendor", "company", "from")):
        return "vendor"
    return "document"


def _classify_table_dataset(df: pd.DataFrame) -> str:
    cols = {str(c).lower() for c in df.columns}
    if {"qty", "quantity", "rate", "price"}.intersection(cols) and ({"item", "product", "description", "name"}.intersection(cols)):
        return "products"
    if {"debit", "credit", "balance", "transaction", "txn"}.intersection(cols) or ({"date", "amount"}.issubset(cols)):
        return "financial"
    return "table"


def _compute_kv_field_confidence(key: str, value: Any) -> float:
    k = _normalize_field_name(key)
    base = 0.75
    if not value or str(value).strip() == "":
        return 0.3
    if _looks_like_date(value) and any(token in k for token in ("date", "dt")):
        base += 0.15
    amt = _try_parse_amount(value)
    if amt is not None and any(token in k for token in ("amount", "total", "subtotal", "tax", "price", "rate")):
        base += 0.15
    if any(token in k for token in ("invoice", "customer", "gst", "pan", "email", "phone")):
        base += 0.05
    return float(min(0.95, max(0.05, base)))


def _attach_confidence_columns(df: pd.DataFrame, *, base: float) -> pd.DataFrame:
    if df is None or df.empty:
        return df
    df2 = df.copy()
    field_conf_list: List[Dict[str, float]] = []
    record_conf_list: List[float] = []
    for _, row in df2.iterrows():
        field_conf: Dict[str, float] = {}
        for col in df2.columns:
            if str(col).startswith("_"):
                continue
            val = row.get(col)
            conf = base
            if val is None or (isinstance(val, str) and not val.strip()):
                conf = max(0.1, base - 0.35)
            field_conf[str(col)] = float(conf)
        avg = float(sum(field_conf.values()) / max(len(field_conf), 1))
        field_conf_list.append(field_conf)
        record_conf_list.append(avg)
    df2["_field_confidence"] = field_conf_list
    df2["_record_confidence"] = record_conf_list
    return df2


def _validate_pdf_outputs(datasets: Dict[str, pd.DataFrame]) -> List[Dict[str, Any]]:
    issues: List[Dict[str, Any]] = []

    invoice = datasets.get("invoice")
    payment = datasets.get("payment")
    products = datasets.get("products")

    if invoice is not None and not invoice.empty:
        inv_cols = {str(c).lower() for c in invoice.columns}
        if not any("invoice" in c and ("no" in c or "number" in c) for c in inv_cols):
            issues.append({"type": "missing_field", "dataset": "invoice", "field": "invoice_number", "severity": "warning"})

    if payment is not None and not payment.empty:
        row = payment.iloc[0].to_dict()
        total = None
        subtotal = None
        tax = None
        for k, v in row.items():
            nk = _normalize_field_name(k)
            if total is None and "total" in nk:
                total = _try_parse_amount(v)
            if subtotal is None and "subtotal" in nk:
                subtotal = _try_parse_amount(v)
            if tax is None and nk in {"tax", "gst", "cgst", "sgst", "igst"}:
                tax = _try_parse_amount(v)
        if total is not None and subtotal is not None and tax is not None:
            if abs((subtotal + tax) - total) > max(1.0, abs(total) * 0.02):
                issues.append(
                    {
                        "type": "inconsistency",
                        "dataset": "payment",
                        "rule": "subtotal_plus_tax_equals_total",
                        "severity": "warning",
                        "details": {"subtotal": subtotal, "tax": tax, "total": total},
                    }
                )

    if products is not None and not products.empty:
        cols = {str(c).lower() for c in products.columns}
        qty_col = next((c for c in products.columns if str(c).lower() in {"qty", "quantity"}), None)
        price_col = next((c for c in products.columns if str(c).lower() in {"price", "rate", "unit_price"}), None)
        amt_col = next((c for c in products.columns if str(c).lower() in {"amount", "total", "line_total"}), None)
        if qty_col and price_col and amt_col:
            mismatches = 0
            checked = 0
            for _, r in products.head(50).iterrows():
                qty = _try_parse_amount(r.get(qty_col))
                price = _try_parse_amount(r.get(price_col))
                amt = _try_parse_amount(r.get(amt_col))
                if qty is None or price is None or amt is None:
                    continue
                checked += 1
                if abs((qty * price) - amt) > max(1.0, abs(amt) * 0.05):
                    mismatches += 1
            if checked >= 5 and mismatches / checked >= 0.4:
                issues.append(
                    {
                        "type": "inconsistency",
                        "dataset": "products",
                        "rule": "qty_times_price_equals_amount",
                        "severity": "info",
                        "details": {"checked": checked, "mismatches": mismatches},
                    }
                )

    return issues


def _extract_layout_lines_from_pdf(data: bytes) -> List[Dict[str, Any]]:
    """
    Layout detection + text extraction using PyMuPDF (fitz) when available.
    Returns ordered line items: page, bbox, font_size, text.
    """
    try:
        import fitz  # type: ignore
    except Exception:
        return []

    lines: List[Dict[str, Any]] = []
    doc = fitz.open(stream=data, filetype="pdf")
    try:
        for page_index, page in enumerate(doc, start=1):
            text_dict = page.get_text("dict")
            for block in text_dict.get("blocks", []):
                if block.get("type") != 0:
                    continue
                for line in block.get("lines", []):
                    spans = line.get("spans", [])
                    line_text = "".join((span.get("text", "") for span in spans)).strip()
                    if not line_text:
                        continue
                    sizes = [float(span.get("size")) for span in spans if span.get("size") is not None]
                    font_size = (sum(sizes) / len(sizes)) if sizes else None
                    bbox = line.get("bbox") or block.get("bbox")
                    lines.append(
                        {
                            "page": page_index,
                            "bbox": bbox,
                            "font_size": font_size,
                            "text": line_text,
                        }
                    )
    finally:
        doc.close()

    def _sort_key(item: Dict[str, Any]) -> Tuple[int, float, float]:
        bbox = item.get("bbox") or [0, 0, 0, 0]
        x0 = float(bbox[0]) if len(bbox) > 0 else 0.0
        y0 = float(bbox[1]) if len(bbox) > 1 else 0.0
        return (int(item.get("page") or 0), y0, x0)

    lines.sort(key=_sort_key)
    return lines


def _detect_document_layout(layout_lines: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Heuristic layout detection (e.g., single vs two column)."""
    x0s: List[float] = []
    for item in layout_lines:
        bbox = item.get("bbox") or [0, 0, 0, 0]
        if len(bbox) >= 1:
            try:
                x0s.append(float(bbox[0]))
            except Exception:
                continue

    if len(x0s) < 20:
        return {"columns": 1}

    min_x = min(x0s)
    max_x = max(x0s)
    mid = (min_x + max_x) / 2.0
    left = sum(1 for x in x0s if x < mid)
    right = len(x0s) - left
    columns = 2 if left >= len(x0s) * 0.3 and right >= len(x0s) * 0.3 else 1
    return {"columns": columns, "min_x": float(min_x), "max_x": float(max_x)}


def _identify_sections(layout_lines: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Split document into sections based on heading-like lines."""
    font_sizes = [item.get("font_size") for item in layout_lines if isinstance(item.get("font_size"), (int, float))]
    typical_size = float(sorted(font_sizes)[len(font_sizes) // 2]) if font_sizes else None

    def _looks_like_heading(text: str, font_size: Optional[float]) -> bool:
        t = (text or "").strip()
        if not t:
            return False
        if len(t) > 80:
            return False
        words = [w for w in re.split(r"\s+", t) if w]
        if font_size is not None and typical_size is not None and font_size >= typical_size + 2.0 and len(words) <= 10:
            return True
        if t.endswith(":") and 1 <= len(words) <= 8:
            return True
        if t.isupper() and 2 <= len(words) <= 8:
            return True
        return False

    sections: List[Dict[str, Any]] = []
    current = {"title": "Document", "page": 1, "lines": []}
    for item in layout_lines:
        text = (item.get("text") or "").strip()
        if not text:
            continue
        page = int(item.get("page") or 1)
        font_size = item.get("font_size")
        font_size = float(font_size) if isinstance(font_size, (int, float)) else None

        if _looks_like_heading(text, font_size):
            if current["lines"]:
                sections.append(current)
            title = text[:-1].strip() if text.endswith(":") else text
            current = {"title": title or "Section", "page": page, "lines": []}
            continue

        current["lines"].append(text)

    if current["lines"]:
        sections.append(current)
    return sections


def _extract_key_values_from_sections(sections: List[Dict[str, Any]]) -> pd.DataFrame:
    rows: List[Dict[str, Any]] = []
    for section in sections:
        title = section.get("title") or "Section"
        page = int(section.get("page") or 1)
        lines = [str(l) for l in (section.get("lines") or [])]
        kv_dicts = _extract_key_value_lines(lines)
        for kv in kv_dicts:
            for k, v in kv.items():
                rows.append({"section": title, "page": page, "key": str(k), "value": str(v)})

    if not rows:
        return pd.DataFrame()
    return pd.DataFrame(rows)


def _extract_tables_from_sections(sections: List[Dict[str, Any]]) -> List[pd.DataFrame]:
    tables: List[pd.DataFrame] = []
    for section in sections:
        title = section.get("title") or "Section"
        page = int(section.get("page") or 1)
        text = "\n".join([str(l) for l in (section.get("lines") or [])]).strip()
        if not text:
            continue
        if not _detect_table_like_text(text):
            continue
        try:
            df = _dataframe_from_text(text)
        except Exception:
            continue
        if df is None or df.empty:
            continue
        df = df.dropna(how="all").dropna(axis=1, how="all")
        if df.empty:
            continue
        df["_section"] = title
        df["_page"] = page
        df["_source"] = "text_table"
        tables.append(df)
    return tables


def _parse_pdf_pipeline(filename: str, data: bytes) -> pd.DataFrame:
    """
    PDF Input
      ↓
    Text Extraction (PDFMiner / OCR) [best-effort via PyMuPDF/pdfplumber]
      ↓
    Layout Detection
      ↓
    Section Identification
      ↓
    ├── Key-Value Extraction
    ├── Table Extraction
      ↓
    Data Structuring
      ↓
    Final Tables
    """
    # Step 1: TEXT EXTRACTION (preserve line breaks)
    layout_lines = _extract_layout_lines_from_pdf(data)
    if layout_lines:
        full_text = "\n".join([str(item.get("text") or "") for item in layout_lines if item.get("text")])
    else:
        full_text = _extract_text_from_pdf(data)
        layout_lines = [
            {"page": 1, "bbox": [0, 0, 0, 0], "font_size": None, "text": line}
            for line in full_text.splitlines()
            if line.strip()
        ]

    # Step 2: LAYOUT DETECTION (blocks)
    layout_info = _detect_document_layout(layout_lines)
    blocks = _pdf_detect_blocks(layout_lines)

    # Step 3: BLOCK CLASSIFICATION
    # (done in _pdf_detect_blocks as "type": KEY_VALUE/TABLE/TEXT)

    # Step 4: PARALLEL EXTRACTION (best-effort, sequential implementation)
    kv_rows: List[Dict[str, Any]] = []
    table_frames: List[Tuple[str, pd.DataFrame]] = []
    entity_rows: List[Dict[str, Any]] = []

    for block in blocks:
        btype = block.get("type")
        page = int(block.get("page") or 1)
        bidx = int(block.get("block_index") or 0)
        lines = [str(x) for x in (block.get("lines") or [])]
        if btype == "KEY_VALUE":
            kv_dicts = _extract_key_value_lines(lines)
            for kv in kv_dicts:
                for k, v in kv.items():
                    kv_rows.append({"page": page, "block_index": bidx, "key": str(k), "value": str(v)})
        elif btype == "TABLE":
            # delimiter-based parse first
            joined = "\n".join(lines)
            df = None
            has_explicit_delim = any(d in joined for d in (",", "\t", ";", "|"))
            if not has_explicit_delim:
                df = _table_from_aligned_text(lines)
            if df is None or df.empty:
                try:
                    df = _dataframe_from_text(joined)
                except Exception:
                    df = None
            if df is not None and not df.empty:
                df = df.dropna(how="all").dropna(axis=1, how="all")
                if not df.empty:
                    df["_page"] = page
                    df["_block_index"] = bidx
                    table_frames.append(("text_table", df))
        else:
            joined = "\n".join(lines).strip()
            if joined:
                ents = _extract_entities_from_text(joined)
                for e in ents:
                    entity_rows.append(
                        {
                            "page": page,
                            "block_index": bidx,
                            "entity_type": e.get("entity_type"),
                            "value": e.get("value"),
                            "confidence": e.get("confidence"),
                        }
                    )

    # pdfplumber table extraction (often higher-quality)
    for table_index, (page_num, df) in enumerate(_extract_tables_from_pdf(data), start=1):
        tdf = df.copy()
        tdf["_page"] = page_num
        tdf["_table_index"] = table_index
        table_frames.append(("pdf_table", tdf))

    # Step 5: SCHEMA DETECTION (group into logical entities)
    kv_df = pd.DataFrame(kv_rows) if kv_rows else pd.DataFrame()
    datasets: Dict[str, pd.DataFrame] = {}
    kv_entities: Dict[str, Dict[str, Any]] = {}
    if not kv_df.empty:
        for _, row in kv_df.iterrows():
            key = str(row.get("key") or "").strip()
            value = row.get("value")
            if not key:
                continue
            norm_key = _normalize_field_name(key)
            entity = _kv_entity_for_key(norm_key)
            if entity not in kv_entities:
                kv_entities[entity] = {}
            kv_entities[entity][norm_key] = value
            # track a confidence for this field
            kv_entities[entity][f"{norm_key}__conf"] = _compute_kv_field_confidence(key, value)

        for entity_name, fields in kv_entities.items():
            # Split out confidence keys
            base_fields: Dict[str, Any] = {}
            conf_map: Dict[str, float] = {}
            for k, v in fields.items():
                if k.endswith("__conf"):
                    conf_map[k[:-6]] = float(v) if v is not None else 0.5
                else:
                    base_fields[k] = v
            df_entity = pd.DataFrame([base_fields]) if base_fields else pd.DataFrame()
            if not df_entity.empty:
                df_entity["_field_confidence"] = [conf_map]
                df_entity["_record_confidence"] = [float(sum(conf_map.values()) / max(len(conf_map), 1)) if conf_map else 0.6]
                datasets[entity_name] = df_entity

    # Tables -> datasets
    table_datasets: Dict[str, List[pd.DataFrame]] = {}
    for source, tdf in table_frames:
        base = 0.85 if source == "pdf_table" else 0.65
        tdf2 = _attach_confidence_columns(tdf, base=base)
        dtype = _classify_table_dataset(tdf2)
        if dtype == "table":
            dtype = f"table_{len(table_datasets) + 1}"
        table_datasets.setdefault(dtype, []).append(tdf2.assign(_source=source))

    for name, frames in table_datasets.items():
        merged = pd.concat(frames, ignore_index=True, sort=False)
        merged = merged.dropna(how="all").dropna(axis=1, how="all")
        if not merged.empty:
            datasets[name] = merged

    # Entities dataset
    if entity_rows:
        ent_df = pd.DataFrame(entity_rows)
        ent_df = ent_df.dropna(how="all").dropna(axis=1, how="all")
        if not ent_df.empty:
            ent_df["_record_confidence"] = ent_df.get("confidence", 0.5)
            datasets["entities"] = ent_df

    # Step 6/7/8: STRUCTURE + TYPE CLASSIFICATION + MULTI OUTPUT
    validation_issues = _validate_pdf_outputs(datasets)
    dataset_reports: Dict[str, Any] = {}
    for name, ddf in datasets.items():
        avg_conf = float(ddf["_record_confidence"].mean()) if "_record_confidence" in ddf.columns else 0.6
        dataset_reports[name] = {
            "csv": f"{name}.csv",
            "row_count": int(len(ddf)),
            "columns": [str(c) for c in ddf.columns],
            "avg_record_confidence": avg_conf,
            "type": name,
            "preview_records": _df_to_json_safe_records(ddf, limit=20),
        }

    # Choose a primary structured dataset to return for the rest of the system.
    primary_name = None
    if "products" in datasets and not datasets["products"].empty:
        primary_name = "products"
    else:
        # prefer tables with most rows
        candidates = [(n, int(len(d))) for n, d in datasets.items() if n.startswith("table_") or n in {"financial"}]
        candidates.sort(key=lambda x: x[1], reverse=True)
        if candidates:
            primary_name = candidates[0][0]
        elif "invoice" in datasets:
            primary_name = "invoice"
        elif datasets:
            primary_name = next(iter(datasets.keys()))

    if primary_name and primary_name in datasets and not datasets[primary_name].empty:
        primary_df = datasets[primary_name].copy()
    else:
        primary_df = pd.DataFrame({"content": [full_text]})
        primary_df = _attach_confidence_columns(primary_df, base=0.4)

    # Step 9/10: CONFIDENCE + VALIDATION report (returned via attrs)
    primary_df.attrs["pdf_report"] = {
        "objective": "pdf_to_structured_multi_dataset",
        "steps": {
            "text_extraction": {"text_length": int(len(full_text)), "has_text": bool(full_text.strip())},
            "layout_detection": layout_info,
            "block_classification": {
                "total_blocks": int(len(blocks)),
                "counts": {
                    "KEY_VALUE": int(sum(1 for b in blocks if b.get("type") == "KEY_VALUE")),
                    "TABLE": int(sum(1 for b in blocks if b.get("type") == "TABLE")),
                    "TEXT": int(sum(1 for b in blocks if b.get("type") == "TEXT")),
                },
            },
        },
        "primary_dataset": primary_name,
        "datasets": dataset_reports,
        "validation": {"issues": validation_issues},
        "blocks": [
            {"page": int(b.get("page") or 1), "type": b.get("type"), "preview": b.get("preview"), "block_index": b.get("block_index")}
            for b in blocks[:80]
        ],
    }
    # In-memory only: allows the upload route to persist multiple extracted datasets to DB.
    primary_df.attrs["pdf_datasets"] = datasets

    return primary_df


def _extract_text_from_pdf(data: bytes) -> str:
    # Optional dependency: PyMuPDF (fitz) or pdfplumber. Try both.
    try:
        import pdfplumber  # type: ignore

        with pdfplumber.open(io.BytesIO(data)) as pdf:
            return "\n".join((page.extract_text() or "") for page in pdf.pages)
    except Exception:
        pass

    try:
        import fitz  # type: ignore

        doc = fitz.open(stream=data, filetype="pdf")
        try:
            return "\n".join(page.get_text("text") for page in doc)
        finally:
            doc.close()
    except Exception:
        pass

    raise RuntimeError("PDF support requires installing `pymupdf` or `pdfplumber`.")


def infer_parsed_output_pipeline(df: pd.DataFrame) -> str:
    if df is None or df.empty:
        return "structured"

    text_columns = [c for c in df.select_dtypes(include=["object"]).columns]
    if len(df.columns) == 1 and text_columns:
        col = text_columns[0]
        sample = df[col].dropna().astype(str).head(20)
        if not sample.empty:
            long_text_ratio = float(sum(len(text.split()) > 8 for text in sample)) / len(sample)
            if long_text_ratio >= 0.6:
                return "unstructured"

    if any(str(c).lower() in {"document_text", "text", "content", "body"} for c in df.columns):
        return "unstructured"

    if len(text_columns) >= len(df.columns) - 1 and len(df.columns) <= 3:
        text_only_ratio = float(len(text_columns)) / max(len(df.columns), 1)
        if text_only_ratio >= 0.75:
            return "unstructured"

    return "structured"


def _parallel_pdf_extract(data: bytes) -> Tuple[Optional[pd.DataFrame], Optional[pd.DataFrame]]:
    """Phase 2: PDF parallel table/text extraction + route decision."""
    pdf_tables = _extract_tables_from_pdf(data)
    text = _extract_text_from_pdf(data)
    text_df = pd.DataFrame({"content": [text]}) if text else None
    table_df = pdf_tables[0][1] if pdf_tables else None
    return table_df, text_df


def load_dataframe_from_upload_bytes(filename: str, data: bytes) -> pd.DataFrame:
    detection = detect_file_type(filename, data)
    file_format = detection.get("detected_format", "txt")

    if file_format == "csv":
        return _parse_csv_pipeline(filename, data)
    if file_format in {"xlsx", "xls"}:
        return _parse_excel_pipeline(filename, data)
    if file_format == "json":
        return _parse_json_pipeline(filename, data)
    if file_format in {"txt", "tsv"}:
        return _parse_text_pipeline(filename, data)
    if file_format == "pdf":
        df = _parse_pdf_pipeline(filename, data)
        if df is None or df.empty:
            raise ValueError("PDF extraction failed")
        return df
    if file_format == "xml":
        return _parse_xml_pipeline(filename, data)
    if file_format == "html":
        return _parse_html_pipeline(filename, data)

    raise ValueError("Unsupported file format")


def load_dataframe_from_uploadfile(file) -> pd.DataFrame:
    # Works with FastAPI's UploadFile-like object.
    filename = getattr(file, "filename", "") or ""
    data = file.file.read()
    return load_dataframe_from_upload_bytes(filename, data)
