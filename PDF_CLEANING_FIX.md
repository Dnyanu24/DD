# PDF Data Cleaning - Bug Fix Documentation

## Issue Summary

When uploading PDF files for data cleaning, both **normal** and **predictive** cleaning modes were producing the same incorrect output. The expected structured format with block-level metadata was being lost during the cleaning process.

### Expected Behavior (What Should Happen)
The cleaned PDF data should output with this format:
```
┌──────┬──────────┬──────────────┬──────────┬────────────┬───────────────────┐
│ page │ block_ind│ entity_type  │ value    │ confidence │ record_confidence │
├──────┼──────────┼──────────────┼──────────┼────────────┼───────────────────┤
│  1   │    0     │  "number"    │ "18.15"  │   0.9      │      0.85         │
│  1   │    0     │  "text"      │ "Banking"│   0.95     │      0.90         │
│  1   │    1     │  "number"    │ "4.43"   │   0.85     │      0.85         │
└──────┴──────────┴──────────────┴──────────┴────────────┴───────────────────┘
```

## Root Cause

The PDF extraction pipeline correctly parsed the unstructured PDF data and created block-level metadata (page numbers, block indices, entity types, confidence scores). However, when the cleaning pipeline executed, it was treating this data as generic structured data, causing:

1. **Loss of Block Metadata**: Page numbers and block indices were discarded
2. **Loss of Entity Types**: Entity type information was not preserved
3. **Incorrect Structure**: Output didn't match the expected schema
4. **Same Output for All Modes**: Normal and predictive cleaning both produced generic output

## Solution Implemented

### 1. PDF Data Detection
Added a detection function that identifies if uploaded data contains PDF extraction metadata:
- Looks for `_page`, `_block_index`, `entity_type`, or `block_ind` columns
- Applies special handling only to PDF-extracted data

### 2. PDF Data Normalization
Created a normalization function that:
- **Maps** old column names to standard names (`_page` → `page`, `_block_index` → `block_ind`)
- **Ensures** all required columns exist (page, block_ind, entity_type, value, confidence, record_confidence)
- **Extracts** value from available columns
- **Converts** confidence scores to proper numeric ranges (0-1)
- **Orders** columns in expected format

### 3. Updated Cleaning Pipeline
Modified both the normal and streaming cleaning endpoints to:
- **Detect** PDF-extracted data
- **Apply** consistent, simplified cleaning steps
- **Normalize** output to standard format
- **Skip** sector classification (not applicable for PDF data)

## How It Works Now

### Normal Cleaning
```
Upload PDF → Extract structured data with metadata → 
Apply basic cleaning (dedup, impute) → 
Normalize to standard format → Output clean data
```

### Predictive Cleaning
```
Upload PDF → Extract structured data with metadata → 
Apply ML-based cleaning (dedup, predictive imputation) → 
Normalize to standard format → Output clean data
```

Both modes now produce **identical, correct output** with all metadata preserved.

## Changes Made

### File: `Backend/app/routers/analysis.py`

#### New Functions Added:
1. **`_is_pdf_extracted_data(data)`**
   - Detects if input data is from PDF extraction
   - Checks for PDF-specific metadata columns

2. **`_normalize_pdf_data(df)`**
   - Normalizes PDF data to standard output format
   - Ensures proper column structure and data types
   - Handles missing fields with sensible defaults

#### Modified Functions:
1. **`_execute_cleaning_pipeline()`**
   - Added PDF detection and special handling
   - Routes PDF data through normalization instead of generic structuring
   - Skips sector classification for PDF data

2. **`clean_data_stream()`**
   - Added PDF detection to streaming endpoint
   - Uses simplified steps for PDF data
   - Applies normalization in streaming pipeline

## Testing the Fix

### Upload a PDF with Data
1. Go to "Data Upload" page
2. Upload your PDF file
3. Select sector and other metadata
4. Click "Upload"

### Run Cleaning - Normal Mode
1. Go to "Data Cleaning" page
2. Select your uploaded PDF
3. Choose "Normal Cleaning" from dropdown
4. Click "Clean Data"
5. Output should have columns: `page, block_ind, entity_type, value, confidence, record_confidence`

### Run Cleaning - Predictive Mode
1. Go to "Data Cleaning" page
2. Select your uploaded PDF
3. Choose "Predictive Cleaning" from dropdown
4. Click "Clean Data"
5. Output should be **identical** to Normal mode with same structure and values

### Verify Output
Both modes should now produce data in this exact format:
- ✓ All 6 required columns present
- ✓ Page and block_ind are numeric integers
- ✓ Confidence scores between 0 and 1
- ✓ Entity types properly classified
- ✓ Values correctly extracted from PDF

## Benefits

1. **Consistent Output**: Both cleaning modes produce identical, correct results
2. **Metadata Preservation**: Block structure and entity information preserved
3. **Proper Confidence Scores**: Confidence metrics maintained throughout pipeline
4. **Correct Format**: Output matches expected schema for downstream analytics
5. **Better Quality**: Cleaned data is properly structured for analysis

## Technical Details

### Confidence Score Handling
- **Field Confidence**: Per-field confidence scores extracted from PDF metadata
- **Record Confidence**: Overall confidence for the entire record
- **Default Values**: Missing confidence scores default to 0.5
- **Range Validation**: All confidence scores clipped to [0, 1] range

### Entity Type Detection
- Extracted from PDF block classification (KEY_VALUE, TABLE, TEXT)
- Can be "number", "text", "amount", "date", "email", "phone", etc.
- Defaults to "text" if not specified

### Block Index Mapping
- Maps `_page`, `_block_index`, `page`, `block_ind` to standard names
- Ensures unique block identification within pages
- Preserves document structure information

## Troubleshooting

If output still seems incorrect after the fix:

1. **Check PDF Format**: Ensure PDF contains extractable text/tables
2. **Verify Upload**: Confirm PDF was uploaded successfully
3. **Review Metadata**: Check that "entity_type" column is populated
4. **Check Confidence**: Ensure confidence values are between 0 and 1

## Questions or Issues?

If you encounter any issues with the PDF cleaning pipeline, please:
1. Check that the PDF contains structured data (tables, key-value pairs)
2. Verify that both normal and predictive modes produce identical output
3. Confirm output has all 6 required columns in correct order
