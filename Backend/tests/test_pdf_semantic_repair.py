import sys
import unittest
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.data_cleaning import DataCleaningEngine
from app.services.data_profiler import profile_dataframe
from app.services.file_ingest import (
    build_ingest_report,
    detect_file_type,
    load_dataframe_from_upload_bytes,
    repair_dataframe_semantics,
)


class PdfSemanticRepairTests(unittest.TestCase):
    def test_repairs_shifted_month_and_inferrs_sector(self):
        raw = pd.DataFrame(
            [
                {
                    "sector_name": "it",
                    "month": "feb",
                    "revenue_lakhs": "unknown",
                    "growth_%": "18.15",
                    "employees_count": "182",
                    "customer_score": "4.43",
                    "operational_status": "average",
                    "notes": "system upgrade phase",
                    "misc_data": "data pending",
                },
                {
                    "sector_name": "apr",
                    "month": "75",
                    "revenue_lakhs": "9.43",
                    "growth_%": "246",
                    "employees_count": "4.344",
                    "customer_score": "4.544",
                    "operational_status": "6954",
                    "notes": "minor financial fluctuation",
                    "misc_data": "data pending",
                },
            ]
        )

        repaired = repair_dataframe_semantics(raw)
        row = repaired.iloc[1].to_dict()

        self.assertEqual(row["sector_name"], "it")
        self.assertEqual(row["month"], "apr")
        self.assertEqual(row["revenue_lakhs"], "9.43")
        self.assertEqual(row["growth_%"], "246")
        self.assertIn("Semantically realigned", " ".join(repaired.attrs.get("ingest_warnings", [])))
        self.assertIn("Inferred", " ".join(repaired.attrs.get("ingest_warnings", [])))

    def test_pdf_like_text_reports_repairs_and_preserves_schema(self):
        text = (
            "Sector_Name,Month,Revenue_Lakhs,Growth_%,Employees_Count,Customer_Score,Operational_Status,Notes,Misc_Data\n"
            "IT,Feb,Unknown,18.15,182,4.43,Average,System upgrade phase,Data pending\n"
            "Apr,75,9.43,246,4.344,4.544,6954\n"
            "Healthcare,Mar,Unknown,3.47,450,4.07,High seasonal demand,Data pending\n"
        )

        df = load_dataframe_from_upload_bytes("sample.txt", text.encode("utf-8"), "text/plain")

        self.assertEqual(
            list(df.columns),
            [
                "Sector_Name",
                "Month",
                "Revenue_Lakhs",
                "Growth_%",
                "Employees_Count",
                "Customer_Score",
                "Operational_Status",
                "Notes",
                "Misc_Data",
            ],
        )
        self.assertEqual(df.iloc[1]["Sector_Name"], "IT")
        self.assertEqual(df.iloc[1]["Month"], "Apr")
        self.assertTrue(df.attrs.get("ingest_warnings"))

    def test_profile_and_cleaning_keep_month_category_and_growth_numeric(self):
        df = pd.DataFrame(
            {
                "sector_name": ["it", "healthcare", "manufacturing"],
                "month": ["feb", "mar", "apr"],
                "revenue_lakhs": ["unknown", "450", "75"],
                "growth_%": ["18.15", "3.47", "9.43"],
                "employees_count": ["182", "450", "246"],
                "customer_score": ["4.43", "4.07", "4.344"],
            }
        )

        profile = profile_dataframe(df)
        engine = DataCleaningEngine()
        cleaned = engine.correct_data_types(df)
        cleaned = engine.impute_missing_values(cleaned, "median")
        after_profile = profile_dataframe(cleaned)

        self.assertEqual(profile["column_types"]["month"], "category")
        self.assertEqual(after_profile["column_types"]["growth_%"], "float")
        self.assertEqual(after_profile["column_types"]["employees_count"], "integer")
        self.assertNotIn("datetime", {after_profile["column_types"]["month"], after_profile["column_types"]["growth_%"]})

    def test_customer_score_domain_rejects_shifted_large_values(self):
        df = pd.DataFrame(
            {
                "sector_name": ["healthcare", "it", "retail"],
                "month": ["may", "jun", "jul"],
                "revenue_lakhs": ["351", "97", "328"],
                "growth_%": ["16.99", "16.94", "6.1"],
                "employees_count": ["288", "180", "158"],
                "customer_score": ["526.75", "4.454", "4.69"],
            }
        )

        engine = DataCleaningEngine()
        typed = engine.correct_data_types(df)
        validated = engine.enforce_domain_constraints(typed)
        cleaned = engine.impute_missing_values(validated, "median")
        cleaned = engine.enforce_domain_constraints(cleaned)

        self.assertLessEqual(float(cleaned["customer_score"].max()), 5.0)
        self.assertGreaterEqual(float(cleaned["customer_score"].min()), 0.0)
        self.assertAlmostEqual(float(cleaned.loc[0, "customer_score"]), 4.572, places=3)

    def test_short_pdf_rows_keep_status_and_notes_in_text_columns(self):
        text = (
            "Sector_Name,Month,Revenue_Lakhs,Growth_%,Employees_Count,Customer_Score,Operational_Status,Notes,Misc_Data\n"
            "IT,Feb,Unknown,18.15,182,4.43,Average,System upgrade phase,Data pending\n"
            "IT,Nov,179,197,Critical,Cost optimization ongoing\n"
        )

        df = load_dataframe_from_upload_bytes("sample.txt", text.encode("utf-8"), "text/plain")
        row = df.iloc[1].to_dict()

        self.assertEqual(row["Sector_Name"], "IT")
        self.assertEqual(row["Month"], "Nov")
        self.assertEqual(row["Revenue_Lakhs"], "179")
        self.assertEqual(row["Growth_%"], "197")
        self.assertEqual(row["Operational_Status"], "Critical")
        self.assertEqual(row["Notes"], "Cost optimization ongoing")
        self.assertEqual(row["Employees_Count"], "")
        self.assertEqual(row["Customer_Score"], "")

    def test_note_phrases_do_not_become_operational_status(self):
        text = (
            "Sector_Name,Month,Revenue_Lakhs,Growth_%,Employees_Count,Customer_Score,Operational_Status,Notes,Misc_Data\n"
            "Healthcare,Mar,Unknown,3.47,450,4.07,High seasonal demand,Data pending\n"
            "IT,Nov,179,197,Average,Cost optimization ongoing\n"
        )

        df = load_dataframe_from_upload_bytes("sample.txt", text.encode("utf-8"), "text/plain")
        row_a = df.iloc[0].to_dict()
        row_b = df.iloc[1].to_dict()

        self.assertEqual(row_a["Operational_Status"], "")
        self.assertEqual(row_a["Notes"], "High seasonal demand")
        self.assertEqual(row_a["Misc_Data"], "Data pending")
        self.assertEqual(row_b["Operational_Status"], "Average")
        self.assertEqual(row_b["Notes"], "Cost optimization ongoing")

    def test_ingest_report_exposes_file_type_and_confidence(self):
        df = pd.DataFrame({"name": ["a", "b"], "score": [1, None]})
        df.attrs["ingest_warnings"] = ["Example extraction warning."]

        report = build_ingest_report(df, "sample.pdf", "application/pdf")

        self.assertEqual(detect_file_type("sample.pdf", "application/pdf"), "pdf")
        self.assertEqual(report["file_type"], "pdf")
        self.assertEqual(report["rows_extracted"], 2)
        self.assertEqual(report["columns_extracted"], 2)
        self.assertIn(report["confidence_label"], {"medium", "high"})
        self.assertEqual(report["warnings"], ["Example extraction warning."])

    def test_outlier_detection_does_not_clip_normal_values(self):
        df = pd.DataFrame(
            {
                "growth_%": [3.47, 6.1, 10.08, 16.99, 387.0],
                "revenue_lakhs": [59.0, 75.0, 113.0, 351.0, 9999.0],
            }
        )

        engine = DataCleaningEngine()
        cleaned = engine.detect_outliers(df, "iqr")

        self.assertEqual(float(cleaned.loc[0, "growth_%"]), 3.47)
        self.assertEqual(float(cleaned.loc[0, "revenue_lakhs"]), 59.0)
        self.assertLess(float(cleaned.loc[4, "growth_%"]), 387.0)
        self.assertLess(float(cleaned.loc[4, "revenue_lakhs"]), 9999.0)

    def test_pdf_text_blanks_are_imputed_in_categorical_columns(self):
        df = pd.DataFrame(
            {
                "sector_name": ["it", "banking", "retail"],
                "month": ["feb", "sep", "jul"],
                "revenue_lakhs": [172.8, 339.0, 328.0],
                "growth_%": [18.15, 10.08, 6.1],
                "employees_count": [182.0, 369.4, 158.0],
                "customer_score": [4.43, 3.78, 4.69],
                "operational_status": ["average", "", "critical"],
                "notes": ["system upgrade phase", "cost optimization ongoing", "performance stable"],
                "misc_data": ["data pending", "867", "data pending"],
            }
        )

        engine = DataCleaningEngine()
        cleaned = engine.impute_missing_values(df, "median")

        self.assertTrue(cleaned["operational_status"].notna().all())
        self.assertNotEqual(str(cleaned.loc[1, "operational_status"]).strip(), "")

    def test_invoice_style_pdf_text_extracts_product_table_with_metadata(self):
        text = (
            "Invoice Report\n"
            "Customer Name: John Doe\n"
            "Date: 10-01-2024\n"
            "Invoice No: INV12345\n\n"
            "Product Details\n"
            "Product Quantity Price\n"
            "Laptop 1 50000\n"
            "Mouse 2 500\n"
            "Keyboard 1 1500\n\n"
            "Total Amount: 52000\n"
        )

        df = load_dataframe_from_upload_bytes("invoice.txt", text.encode("utf-8"), "text/plain")

        self.assertEqual(list(df["product"]), ["Laptop", "Mouse", "Keyboard"])
        self.assertEqual(list(df["quantity"]), ["1", "2", "1"])
        self.assertEqual(list(df["price"]), ["50000", "500", "1500"])
        self.assertEqual(df.loc[0, "customer_name"], "John Doe")
        self.assertEqual(df.loc[0, "invoice_no"], "INV12345")
        self.assertEqual(df.loc[0, "total_amount"], "52000")


if __name__ == "__main__":
    unittest.main()
