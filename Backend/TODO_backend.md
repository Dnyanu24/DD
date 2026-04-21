# Data Analysis Software - Backend TODO

## ✅ COMPLETE
- [x] **PDF Pipeline** - Text extraction → Multi-dataset ✓
- [x] **File Upload** - All types → CSV RawData ✓  
- [x] **Cleaning** - Normal + Predictive ✓
- [x] **Import Fix** - `io` added ✓

## 🔄 IN PROGRESS
- [ ] **Auto-clean after filetype** - PDF/TXT → Clean CSV ✓
- [ ] **Normal + Predictive** - Both after parsing ✓

## 📊 PIPELINE STATUS
```
File Input → Detection → Filetype Parser → Normal Cleaning → Predictive Cleaning → Storage
  ↓ PDF/TXT         ↓ CSV/DF      ↓ Impute/Dedupe  ↓ ML Impute    ↓ Clean CSV ✓
```

**RUNNING**: `python Backend/test_pipeline_checks.py` ✓

**NEXT**: Test text upload → No "failed to fetch" ✓
