import sys
import os
import io
import json
import traceback

sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))

from app.services.file_ingest import load_dataframe_from_upload_bytes, detect_file_type
from app.services.data_cleaning import DataCleaningEngine
import pandas as pd

results = {}


def df_preview(df, limit=5):
    try:
        if df is None:
            return None
        if hasattr(df, 'to_dict'):
            recs = df.head(limit).to_dict('records')
            # convert non-serializable values
            out = []
            for r in recs:
                row = {}
                for k, v in r.items():
                    try:
                        json.dumps(v)
                        row[k] = v
                    except Exception:
                        row[k] = str(v)
                out.append(row)
            return out
    except Exception:
        return str(traceback.format_exc())
    return None


# CSV
try:
    csv_text = "id,amount,category,notes\n1,100,food,OK\n2,,food,\n3,200,,note\n4,300,drink,OK\n5,NaN,drink,special\n6,400,food,\n"
    csv_bytes = csv_text.encode('utf-8')
    det = detect_file_type('sample.csv', csv_bytes)
    df = load_dataframe_from_upload_bytes('sample.csv', csv_bytes)
    de = DataCleaningEngine()
    normal = de.impute_missing_values(df.copy(), strategy='mean', knn_k=3)
    try:
        normal = de.detect_outliers(normal)
    except Exception:
        pass
    try:
        normal = de.correct_data_types(normal)
    except Exception:
        pass
    de2 = DataCleaningEngine()
    pred = de2.impute_missing_values(df.copy(), strategy='ml', knn_k=3)
    try:
        pred = de2.detect_outliers(pred)
    except Exception:
        pass
    try:
        pred = de2.correct_data_types(pred)
    except Exception:
        pass

    results['csv'] = {
        'detection': det,
        'parsed_preview': df_preview(df),
        'parsed_shape': getattr(df, 'shape', None),
        'normal_preview': df_preview(normal),
        'predictive_preview': df_preview(pred)
    }
except Exception:
    results['csv'] = {'error': traceback.format_exc()}

# EXCEL
try:
    df0 = pd.DataFrame({
        'id': [1,2,3,4],
        'sales': [100.0, None, 150.5, 200.0],
        'category': ['A','A','B', None],
        'date': ['2023-01-01','2023-01-02','','2023/01/04']
    })
    bio = io.BytesIO()
    with pd.ExcelWriter(bio, engine='openpyxl') as writer:
        df0.to_excel(writer, index=False, sheet_name='Sheet1')
    excel_bytes = bio.getvalue()
    det = detect_file_type('sample.xlsx', excel_bytes)
    df = load_dataframe_from_upload_bytes('sample.xlsx', excel_bytes)
    de = DataCleaningEngine()
    normal = de.impute_missing_values(df.copy(), strategy='median', knn_k=3)
    try:
        normal = de.detect_outliers(normal)
    except Exception:
        pass
    try:
        normal = de.correct_data_types(normal)
    except Exception:
        pass
    de2 = DataCleaningEngine()
    pred = de2.impute_missing_values(df.copy(), strategy='ml', knn_k=2)
    try:
        pred = de2.detect_outliers(pred)
    except Exception:
        pass
    try:
        pred = de2.correct_data_types(pred)
    except Exception:
        pass
    results['excel'] = {
        'detection': det,
        'parsed_preview': df_preview(df),
        'parsed_shape': getattr(df, 'shape', None),
        'normal_preview': df_preview(normal),
        'predictive_preview': df_preview(pred)
    }
except Exception:
    results['excel'] = {'error': traceback.format_exc()}

# PDF
try:
    try:
        import fitz
    except Exception:
        fitz = None
    if fitz is None:
        results['pdf'] = {'error': 'PyMuPDF (fitz) not available'}
    else:
        doc = fitz.open()
        page = doc.new_page(width=595, height=842)
        text = 'Item    Qty    Price\nApple   10     2.50\nBanana  5      1.20\nCherry  20     0.50\n'
        rect = fitz.Rect(50,50,550,400)
        page.insert_textbox(rect, text, fontsize=11, fontname='helv')
        pdf_bytes = doc.write()
        doc.close()
        det = detect_file_type('sample.pdf', pdf_bytes)
        df = load_dataframe_from_upload_bytes('sample.pdf', pdf_bytes)
        # Collect primary df preview
        primary_preview = df_preview(df)
        pdf_datasets = df.attrs.get('pdf_datasets') if hasattr(df, 'attrs') else None
        ds_results = {}
        if pdf_datasets:
            for name, ds in pdf_datasets.items():
                de = DataCleaningEngine()
                try:
                    normal = de.impute_missing_values(ds.copy(), strategy='mean', knn_k=3)
                except Exception:
                    normal = {'error': traceback.format_exc()}
                try:
                    de2 = DataCleaningEngine()
                    pred = de2.impute_missing_values(ds.copy(), strategy='ml', knn_k=3)
                except Exception:
                    pred = {'error': traceback.format_exc()}
                ds_results[name] = {
                    'parsed_preview': df_preview(ds),
                    'normal_preview': df_preview(normal) if not isinstance(normal, dict) else normal,
                    'predictive_preview': df_preview(pred) if not isinstance(pred, dict) else pred,
                    'shape': getattr(ds, 'shape', None)
                }
        else:
            ds_results = None
        results['pdf'] = {
            'detection': det,
            'primary_preview': primary_preview,
            'datasets': ds_results
        }
except Exception:
    results['pdf'] = {'error': traceback.format_exc()}

# Write results
out_path = os.path.join(os.path.dirname(__file__), 'test_pipeline_results.json')
with open(out_path, 'w', encoding='utf-8') as f:
    json.dump(results, f, ensure_ascii=False, indent=2)
print('WROTE', out_path)
