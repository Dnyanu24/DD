import io
import json
from typing import Any, List

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


def _extract_text_from_pdf(data: bytes) -> str:
    # Optional dependency: PyMuPDF (fitz) or pdfplumber. We try both.
    try:
        import fitz  # type: ignore

        doc = fitz.open(stream=data, filetype="pdf")
        return "\n".join(page.get_text("text") for page in doc)
    except Exception:
        pass

    try:
        import pdfplumber  # type: ignore

        with pdfplumber.open(io.BytesIO(data)) as pdf:
            return "\n".join((page.extract_text() or "") for page in pdf.pages)
    except Exception:
        pass

    raise RuntimeError("PDF support requires installing `pymupdf` or `pdfplumber`.")


def load_dataframe_from_upload_bytes(filename: str, data: bytes) -> pd.DataFrame:
    name = (filename or "").lower().strip()
    if name.endswith(".csv"):
        return pd.read_csv(io.BytesIO(data))
    if name.endswith(".xlsx") or name.endswith(".xls"):
        return pd.read_excel(io.BytesIO(data))
    if name.endswith(".json"):
        payload = json.loads(_read_text_bytes(data))
        return _dataframe_from_json_payload(payload)
    if name.endswith(".txt") or name.endswith(".tsv") or name.endswith(".log"):
        return _dataframe_from_text(_read_text_bytes(data))
    if name.endswith(".pdf"):
        text = _extract_text_from_pdf(data)
        return _dataframe_from_text(text)

    raise ValueError("Unsupported file format")


def load_dataframe_from_uploadfile(file) -> pd.DataFrame:
    # Works with FastAPI's UploadFile-like object.
    filename = getattr(file, "filename", "") or ""
    data = file.file.read()
    return load_dataframe_from_upload_bytes(filename, data)

