import sys
import os
import io
import json
import traceback
import pandas as pd

sys.path.insert(0, os.path.dirname(__file__))

from app.services.file_ingest import detect_file_type, load_dataframe_from_upload_bytes
from app.services.data_cleaning import DataCleaningEngine
from app.routers.analysis import _is_pdf_extracted_data, _normalize_pdf_data

def df_preview(df, limit=10):
    if df is None or df.empty:
        return "Empty DataFrame"
    try:
        preview = df.head(limit).to_dict('records')
        return preview
    except Exception as e:
        return f"Preview error: {str(e)}"

with open('data pdf.pdf', 'rb') as f:
    pdf_bytes = f.read()

print(f"PDF size: {len(pdf_bytes)} bytes")
print("Actual PDF binary ✓")

print("=== PDF PIPELINE TEST WITH CUSTOM DATA ===")
print("Using real PDF file")

# Step 1: Detection
det = detect_file_type('data pdf.pdf', pdf_bytes)
print("\nDetection:", json.dumps(det, indent=2))

# Step 2: Parsing (will treat as unstructured text/PDF)
try:
    df_primary = load_dataframe_from_upload_bytes('sample_data.pdf', pdf_bytes)
    print("\n=== PRIMARY PARSED DF ===")
    print("Shape:", df_primary.shape if hasattr(df_primary, 'shape') else "No shape")
    print("Columns:", list(df_primary.columns))
    print("Preview:", df_preview(df_primary))
    
    pdf_datasets = df_primary.attrs.get('pdf_datasets') if hasattr(df_primary, 'attrs') else None
    pdf_report = df_primary.attrs.get('pdf_report') if hasattr(df_primary, 'attrs') else None
    
    print("\nPDF Datasets:", pdf_datasets.keys() if pdf_datasets else "None")
    print("PDF Report:", pdf_report)
    
    if pdf_datasets:
        for name, ds in pdf_datasets.items():
            print(f"\n--- Dataset: {name} ---")
            print("Shape:", ds.shape)
            print("Columns:", list(ds.columns))
            print("Preview:", df_preview(ds))
    
except Exception as e:
    print("Parsing failed:", traceback.format_exc())

# Step 3: Check if detected as PDF-extracted data
print("\n=== PDF DATA DETECTION ===")
is_pdf = _is_pdf_extracted_data(df_primary.to_dict('records') if hasattr(df_primary, 'to_dict') else [])
print("Is PDF extracted data:", is_pdf)

# Step 4: Normalize
print("\n=== NORMALIZATION TEST ===")
try:
    normalized = _normalize_pdf_data(df_primary)
    print("Normalized shape:", normalized.shape)
    print("Normalized columns:", list(normalized.columns))
    print("Normalized preview:", df_preview(normalized))
except Exception as e:
    print("Normalization failed:", traceback.format_exc())

# Step 5: Cleaning simulation
print("\n=== CLEANING SIMULATION ===")
de = DataCleaningEngine()
try:
    cleaned_normal = de.impute_missing_values(df_primary.copy(), strategy="mean")
    print("Normal cleaning preview:", df_preview(cleaned_normal))
except Exception as e:
    print("Normal cleaning failed:", str(e))

print("\n=== TEST COMPLETE ===")

