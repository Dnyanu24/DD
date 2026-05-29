import asyncio
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.models import CleanedData, RawData
from app.routers import analysis, upload
from app.services.data_cleaner import clean_dataframe
from app.services.data_profiler import profile_dataframe
from app.services.file_ingest import load_dataframe_from_upload_bytes


class _FakeUploadFile:
    filename = "sample.txt"
    content_type = "text/plain"

    async def read(self):
        return b"name,score\nA,10\nB,\n"


class _FakeQuery:
    def __init__(self, first_value):
        self.first_value = first_value

    def filter(self, *args, **kwargs):
        return self

    def first(self):
        return self.first_value


class _FakeDb:
    def __init__(self):
        self.added = []
        self.next_id = 1

    def query(self, model):
        return _FakeQuery(SimpleNamespace(id=1, company_id=1))

    def add(self, item):
        self.added.append(item)

    def commit(self):
        pass

    def refresh(self, item):
        if getattr(item, "id", None) is None:
            item.id = self.next_id
            self.next_id += 1


class SdasPipelineFlowTests(unittest.TestCase):
    def test_pdf_csv_like_extraction_preserves_columns(self):
        text = (
            "Sector_Name,Month,Revenue_Lakhs,Growth_%,Employees_Count,Customer_Score,Operational_Status,Notes,Misc_Data\n"
            "IT,Feb,Unknown,18.15,182,4.43,Average,System upgrade phase,Data pending\n"
        )
        with patch("app.services.file_ingest._extract_text_from_pdf", return_value=text):
            df = load_dataframe_from_upload_bytes("sector.pdf", b"%PDF", "application/pdf")

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
        self.assertNotEqual(list(df.columns), ["text"])

    def test_upload_stores_raw_without_cleaning(self):
        fake_db = _FakeDb()
        user = SimpleNamespace(id=7, company_id=1, role="analyst", sector_id=None)

        with patch("app.routers.upload._store_original_file", return_value="stored/sample.txt"):
            response = asyncio.run(upload.upload_data(_FakeUploadFile(), 1, None, fake_db, user))

        self.assertEqual(response["file_id"], 1)
        self.assertEqual(response["file_type"], "txt")
        self.assertTrue(response["storage_status"]["raw_dataset_stored"])
        self.assertFalse(response["storage_status"]["cleaned_csv_created"])
        self.assertNotIn("cleaned_preview", response)
        self.assertFalse(any(isinstance(item, CleanedData) for item in fake_db.added))
        self.assertTrue(any(isinstance(item, RawData) for item in fake_db.added))

    def test_analyze_profiles_without_cleaning(self):
        raw = SimpleNamespace(id=3, data=[{"name": "A", "score": None}, {"name": "A", "score": None}])
        user = SimpleNamespace(id=7, company_id=1, role="analyst", sector_id=None)

        with patch("app.routers.analysis._get_accessible_raw_data", return_value=raw):
            with patch("app.routers.analysis.DataCleaningEngine.run_full_pipeline") as cleaner:
                response = asyncio.run(analysis.analyze_data(3, "full", user, SimpleNamespace()))

        cleaner.assert_not_called()
        self.assertEqual(response["summary"]["missing_values_count"], 2)
        self.assertEqual(response["summary"]["duplicate_count"], 1)
        self.assertIn("column_wise_error_summary", response)

    def test_normal_cleaning_uses_selected_strategies(self):
        df = pd.DataFrame({"score": [10, None, 30], "group": [" A ", None, "A"]})
        profile = profile_dataframe(df)

        cleaned, report = clean_dataframe(df, profile, numeric_strategy="mean", categorical_strategy="unknown", method="normal")

        self.assertEqual(int(cleaned.isna().sum().sum()), 0)
        self.assertIn("normal", report["method"])
        self.assertTrue(any(item.get("strategy") == "mean" for item in report["actions"]))
        self.assertTrue(any(item.get("strategy") == "unknown" for item in report["actions"]))

    def test_predictive_cleaning_fills_missing_and_logs_models(self):
        df = pd.DataFrame(
            {
                "revenue": [100.0, None, 300.0, 400.0],
                "employees": [10.0, 20.0, 30.0, 40.0],
                "status": ["Good", None, "Good", "Average"],
            }
        )
        profile = profile_dataframe(df)

        cleaned, report = clean_dataframe(df, profile, method="predictive")

        self.assertEqual(int(cleaned.isna().sum().sum()), 0)
        self.assertEqual(report["method"], "predictive")
        self.assertTrue(any(item.get("action") == "predictive_numeric_imputation" for item in report["actions"]))


if __name__ == "__main__":
    unittest.main()
