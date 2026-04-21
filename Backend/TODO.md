# Data Analysis Software TODO

## Current Working Directory: c:/Users/lenovo/Desktop/Dtata Analysis Softwere

## BACKEND PRIORITY (High → Low)

### 🔴 CRITICAL - PDF Pipeline Diagnosis Complete ✅
**Status: INVESTIGATED - Root cause identified, fixes proposed below**

**Findings from analysis:**
```
1. PDF Pipeline in Backend/app/services/file_ingest.py:_parse_pdf_pipeline()
   - Uses PyMuPDF(fitz) + pdfplumber for layout/tables
   - Detects blocks (KEY_VALUE/TABLE/TEXT)
   - Produces pdf_datasets dict + primary_df with attrs

2. Upload (Backend/app/routers/upload.py):
   - Stores primary_df → RawData
   - Stores pdf_datasets → ExtractedDataset table

3. Cleaning Fix Already Implemented (PDF_CLEANING_FIX.md):
   - Backend/app/routers/analysis.py:_is_pdf_extracted_data() + _normalize_pdf_data()
   - Normalizes to: page/block_ind/entity_type/value/confidence/record_confidence
   - test_pdf_cleaning.py validates format

4. Test Results (Backend/test_pipeline_results.json):
   - Simple table PDF → CORRECTLY extracts "products" dataset
   - Shape (3,8) with _page/_block_index/_confidence columns
   - Cleaning preserves metadata ✓

5. ISSUE DIAGNOSED with provided sample data:
   - Text detection (not true PDF bytes) → _parse_text_pipeline()
   - Single column "document_text" (no table/block detection)
   - No pdf_datasets generated → Falls back to unstructured text
   - _normalize_pdf_data() limited on single-column text
```

**ROOT CAUSE**: Pipeline expects **binary PDF** with %PDF header + layout. Provided data is **plain text** → treated as TXT.

**SOLUTION** (No CSV/Excel changes):
```
1. Enhance _parse_pdf_pipeline() for poor-layout PDFs
2. Improve text→table parsing in _table_from_aligned_text()
3. Add table detection to text fallback path
4. Test with actual PDF bytes containing sample data
```

### 🟡 MEDIUM PRIORITY - Implement PDF Fixes
```
[ ] 1. Fix table parsing for aligned text (improve _table_from_aligned_text)
[ ] 2. Enhance block detection for messy layouts  
[ ] 3. Add confidence-based filtering in normalization
[ ] 4. Create real PDF test file with sample data
[ ] 5. Run end-to-end upload+cleaning test
[ ] 6. Verify ExtractedDataset storage works
```

### 🟢 LOW PRIORITY
```
[ ] Polish normalization output format
[ ] Add PDF-specific quality metrics
[ ] Frontend PDF upload validation
```

## FRONTEND PRIORITY
```
[ ] PDF preview in upload modal
[ ] Cleaning progress bar for PDF files
[ ] Table visualization for extracted datasets
```

## TESTING CHECKLIST
```
✅ File structure analyzed (20+ files)
✅ PDF pipeline fully mapped (file_ingest.py)
✅ Current test outputs verified (sample table → products dataset ✓)
✅ Text fallback path diagnosed (single-column issue)
✅ Cleaning normalization confirmed (analysis.py)
✅ No CSV/Excel changes made ✓
```

**Next Step**: Approve PDF extraction improvements for messy layouts (table parsing enhancements).
