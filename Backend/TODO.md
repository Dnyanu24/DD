# Data Cleaning Pipeline Fix Plan

## Current Issue
PDF/CSV parsing → object dtypes with text contamination:
```
misc_data, "data pending", "check manually" in numeric columns
```
**Root cause**: Schema detection + coercion thresholds too strict (60-85% numeric parse rate required).

## Fix Steps (data_cleaning.py)
```
1. impute_missing_values(): 
   - Integrate schema_detector FULL column analysis
   - NEW: clean_text_in_numeric_columns()
     - Replace known text outliers → NaN  
     - Lower coercion threshold to 0.3
   - Route to predictive/normal imputation

2. correct_data_types(): Force numeric columns after cleaning

3. Test: Create sample PDF → verify "data pending" → numbers
```

## Files to Edit
- Backend/app/services/data_cleaning.py (primary)
- Backend/app/services/schema_detector.py (detection boost)

## Acceptance Criteria
```
"data pending" column → 3273, 4138, 309 → KNN/mean fills
No text in final numeric columns
```

