"""
Test script to verify PDF cleaning output format
"""
import pandas as pd
import sys
sys.path.insert(0, '/Backend')

from app.routers.analysis import _is_pdf_extracted_data, _normalize_pdf_data

# Test 1: Create sample PDF-extracted data similar to what the PDF parser would produce
sample_pdf_data = [
    {
        "page": 1,
        "block_ind": 0,
        "entity_type": "number",
        "value": "18.15",
        "confidence": 0.9,
        "_record_confidence": 0.85
    },
    {
        "page": 1,
        "block_ind": 0,
        "entity_type": "text",
        "value": "Banking",
        "confidence": 0.95,
        "_record_confidence": 0.90
    },
    {
        "_page": 1,
        "_block_index": 1,
        "entity_type": "number",
        "value": "4.43",
        "_field_confidence": {"value": 0.85},
        "_record_confidence": 0.85
    },
]

print("Test 1: Is PDF data detection")
print("-" * 50)
print(f"Sample data is PDF extracted: {_is_pdf_extracted_data(sample_pdf_data)}")
print()

# Test 2: Create DataFrame and normalize
print("Test 2: Normalize PDF data")
print("-" * 50)
df = pd.DataFrame(sample_pdf_data)
print(f"Input columns: {list(df.columns)}")
print(f"Input shape: {df.shape}")
print()

normalized = _normalize_pdf_data(df)
print(f"Output columns: {list(normalized.columns)}")
print(f"Output shape: {normalized.shape}")
print()
print("Output DataFrame:")
print(normalized)
print()

# Test 3: Verify output format matches expected schema
print("Test 3: Verify output schema")
print("-" * 50)
expected_columns = {"page", "block_ind", "entity_type", "value", "confidence", "record_confidence"}
actual_columns = set(normalized.columns)
print(f"Expected columns: {expected_columns}")
print(f"Actual columns: {actual_columns}")
print(f"Columns match: {expected_columns == actual_columns}")
print()

# Test 4: Verify data types
print("Test 4: Verify data types")
print("-" * 50)
print(f"page dtype: {normalized['page'].dtype}")
print(f"block_ind dtype: {normalized['block_ind'].dtype}")
print(f"entity_type dtype: {normalized['entity_type'].dtype}")
print(f"value dtype: {normalized['value'].dtype}")
print(f"confidence dtype: {normalized['confidence'].dtype}")
print(f"record_confidence dtype: {normalized['record_confidence'].dtype}")
print()

# Test 5: Verify value ranges for confidence
print("Test 5: Verify confidence value ranges")
print("-" * 50)
print(f"confidence range: {normalized['confidence'].min():.2f} - {normalized['confidence'].max():.2f}")
print(f"record_confidence range: {normalized['record_confidence'].min():.2f} - {normalized['record_confidence'].max():.2f}")
print(f"All values in [0,1]: {(normalized['confidence'] >= 0).all() and (normalized['confidence'] <= 1).all()}")
print()

print("✓ All tests completed!")
