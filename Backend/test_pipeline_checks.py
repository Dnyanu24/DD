import sys
import os
import io
import traceback

# Ensure the 'app' package under Backend is importable
sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))

from app.services.file_ingest import load_dataframe_from_upload_bytes, detect_file_type
from app.services.data_cleaning import DataCleaningEngine
import pandas as pd


def print_df_info(tag, df, n=5):
    print(f"--- {tag} ---")
    try:
        print("shape:", getattr(df, 'shape', None))
        # show first rows safely
        if hasattr(df, 'head'):
            print(df.head(n).to_string(index=False))
        else:
            print(df)
    except Exception:
        print("(unable to render dataframe preview)")
    print()


def test_csv():
    try:
        csv_text = "id,amount,category,notes\n1,100,food,OK\n2,,food,\n3,200,,note\n4,300,drink,OK\n5,NaN,drink,special\n6,400,food,\n"
        data = csv_text.encode("utf-8")
        det = detect_file_type("sample.csv", data)
        print("CSV detection:", det)
        df = load_dataframe_from_upload_bytes("sample.csv", data)
        print_df_info("Parsed CSV", df)

        de = DataCleaningEngine()
        # Normal cleaning: mean imputation for numeric
        normal = de.impute_missing_values(df.copy(), strategy="mean", knn_k=3)
        try:
            normal = de.detect_outliers(normal)
        except Exception:
            pass
        try:
            normal = de.correct_data_types(normal)
        except Exception:
            pass
        print_df_info("CSV Normal Cleaned", normal)

        # Predictive cleaning: KNN imputation
        de2 = DataCleaningEngine()
        pred = de2.impute_missing_values(df.copy(), strategy="ml", knn_k=3)
        try:
            pred = de2.detect_outliers(pred)
        except Exception:
            pass
        try:
            pred = de2.correct_data_types(pred)
        except Exception:
            pass
        print_df_info("CSV Predictive Cleaned", pred)
    except Exception:
        print("CSV test failed:\n", traceback.format_exc())


def test_excel():
    try:
        df0 = pd.DataFrame({
            "id": [1, 2, 3, 4],
            "sales": [100.0, None, 150.5, 200.0],
            "category": ["A", "A", "B", None],
            "date": ["2023-01-01", "2023-01-02", "", "2023/01/04"]
        })
        bio = io.BytesIO()
        with pd.ExcelWriter(bio, engine="openpyxl") as writer:
            df0.to_excel(writer, index=False, sheet_name="Sheet1")
        excel_bytes = bio.getvalue()
        det = detect_file_type("sample.xlsx", excel_bytes)
        print("Excel detection:", det)
        df = load_dataframe_from_upload_bytes("sample.xlsx", excel_bytes)
        print_df_info("Parsed Excel", df)

        de = DataCleaningEngine()
        normal = de.impute_missing_values(df.copy(), strategy="median", knn_k=3)
        try:
            normal = de.detect_outliers(normal)
        except Exception:
            pass
        try:
            normal = de.correct_data_types(normal)
        except Exception:
            pass
        print_df_info("Excel Normal Cleaned", normal)

        de2 = DataCleaningEngine()
        pred = de2.impute_missing_values(df.copy(), strategy="ml", knn_k=2)
        try:
            pred = de2.detect_outliers(pred)
        except Exception:
            pass
        try:
            pred = de2.correct_data_types(pred)
        except Exception:
            pass
        print_df_info("Excel Predictive Cleaned", pred)
    except Exception:
        print("Excel test failed:\n", traceback.format_exc())


def test_pdf():
    try:
        import fitz
    except Exception:
        print("PyMuPDF (fitz) not available; skipping PDF test")
        return

    try:
        doc = fitz.open()
        page = doc.new_page(width=595, height=842)
        # aligned columns with multiple spaces to simulate table extraction
        text = "Item    Qty    Price\nApple   10     2.50\nBanana  5      1.20\nCherry  20     0.50\n"
        rect = fitz.Rect(50, 50, 550, 400)
        page.insert_textbox(rect, text, fontsize=11, fontname="helv")
        pdf_bytes = doc.write()
        doc.close()

        det = detect_file_type("sample.pdf", pdf_bytes)
        print("PDF detection:", det)
        df = load_dataframe_from_upload_bytes("sample.pdf", pdf_bytes)
        print_df_info("Parsed PDF primary_df", df)

        # try accessing extracted datasets
        pdf_datasets = df.attrs.get("pdf_datasets") if hasattr(df, "attrs") else None
        if pdf_datasets:
            print("Found pdf_datasets:", list(pdf_datasets.keys()))
            de = DataCleaningEngine()
            for name, ds in pdf_datasets.items():
                print_df_info(f"Dataset: {name}", ds)
                cleaned = de.impute_missing_values(ds.copy(), strategy="mean", knn_k=3)
                try:
                    cleaned = de.detect_outliers(cleaned)
                except Exception:
                    pass
                try:
                    cleaned = de.correct_data_types(cleaned)
                except Exception:
                    pass
                print_df_info(f"Dataset {name} normal cleaned", cleaned)

                de2 = DataCleaningEngine()
                pclean = de2.impute_missing_values(ds.copy(), strategy="ml", knn_k=3)
                try:
                    pclean = de2.detect_outliers(pclean)
                except Exception:
                    pass
                try:
                    pclean = de2.correct_data_types(pclean)
                except Exception:
                    pass
                print_df_info(f"Dataset {name} predictive cleaned", pclean)
        else:
            print('No pdf_datasets returned; running cleaning on primary df')
            de = DataCleaningEngine()
            normal = de.impute_missing_values(df.copy(), strategy="mean", knn_k=3)
            print_df_info("PDF Normal Cleaned (primary)", normal)

    except Exception:
        print("PDF test failed:\n", traceback.format_exc())


if __name__ == '__main__':
    print('\n=== CSV TEST ===\n')
    test_csv()
    print('\n=== EXCEL TEST ===\n')
    test_excel()
    print('\n=== PDF TEST ===\n')
    test_pdf()
