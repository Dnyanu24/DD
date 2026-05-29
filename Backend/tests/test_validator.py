import sys
import unittest
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.data_cleaner import clean_dataframe
from app.services.data_profiler import profile_dataframe
from app.services.file_ingest import load_dataframe_from_upload_bytes
from app.services.validator import validate_dataframe


class ValidationEngineTests(unittest.TestCase):
    def test_detects_required_columns_negative_values_and_categories(self):
        df = pd.DataFrame(
            {
                "Revenue": [100, -5, 200],
                "Status": ["active", "archived", "pending"],
                "Month": ["2026-01-01", "not-date", "2026-03-01"],
            }
        )
        profile = profile_dataframe(df)

        report = validate_dataframe(df, profile, required_columns=["Revenue", "Customer"])

        issues = report["issues"]
        self.assertGreaterEqual(report["total_issues"], 4)
        self.assertGreaterEqual(report["critical_issues"], 3)
        self.assertTrue(any(item["issue"] == "Required column missing" for item in issues))
        self.assertTrue(any(item["issue"] == "Negative value detected" for item in issues))
        self.assertTrue(any(item["issue"] == "Invalid category detected" for item in issues))
        self.assertTrue(any(item["issue"] == "Invalid date/month value" for item in issues))

    def test_detects_empty_rows_and_business_rules(self):
        df = pd.DataFrame(
            {
                "Quantity": [10, None, 999],
                "Priority": ["low", None, "urgent"],
            }
        )

        report = validate_dataframe(
            df,
            profile_dataframe(df),
            business_rules={"Quantity": {"max": 100}, "Priority": {"allowed": ["low", "medium", "high"]}},
        )

        self.assertTrue(any(item["issue"] == "Value above maximum 100" for item in report["issues"]))
        self.assertTrue(any(item["issue"] == "Invalid category detected" for item in report["issues"]))
        self.assertGreater(report["warnings"], 0)

    def test_validation_after_extraction_profile_cleaning(self):
        payload = b"Revenue|Month|Status\n100|2026-01-01|active\n-10|bad-date|archived\n|2026-03-01|pending\n"
        extracted = load_dataframe_from_upload_bytes("sample.txt", payload)
        profile = profile_dataframe(extracted)
        cleaned, _ = clean_dataframe(extracted, profile)
        cleaned_profile = profile_dataframe(cleaned)
        report = validate_dataframe(cleaned, cleaned_profile)

        self.assertIn("total_issues", report)
        self.assertIn("passed_checks", report)
        self.assertTrue(any(item["column"] == "Revenue" for item in report["issues"]))
        self.assertTrue(any(item["column"] == "Status" for item in report["issues"]))


if __name__ == "__main__":
    unittest.main()
