import sys
import unittest
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.data_cleaner import clean_dataframe
from app.services.data_profiler import profile_dataframe
from app.services.file_ingest import load_dataframe_from_upload_bytes


class ProfileCleanPipelineTests(unittest.TestCase):
    def test_profiler_detects_quality_issues(self):
        df = pd.DataFrame(
            {
                "Revenue": ["1,000.50", None, "bad", "1,000.50"],
                "Month": ["2026-01-01", "not-date", "2026-03-01", "2026-01-01"],
                "Category": [" A ", "NA", "B", " A "],
            }
        )

        report = profile_dataframe(df)

        self.assertGreaterEqual(report["missing_values"], 1)
        self.assertEqual(report["duplicates"], 1)
        self.assertGreaterEqual(report["invalid_formats"], 2)
        self.assertEqual(report["column_types"]["Revenue"], "float")
        self.assertIn(report["column_types"]["Month"], {"datetime", "text"})
        self.assertIn("schema", report)
        self.assertIn("column_profiles", report)

    def test_cleaner_returns_cleaned_dataset_and_report(self):
        df = pd.DataFrame(
            {
                "Revenue": ["1,000", None, "2,000", "2,000"],
                "Month": ["2026-01-01", "2026-02-01", "2026-03-01", "2026-03-01"],
                "Category": [" A ", "NA", "B", "B"],
            }
        )

        before_report = profile_dataframe(df)
        cleaned, cleaning_report = clean_dataframe(df, before_report)
        after_report = profile_dataframe(cleaned)

        self.assertEqual(cleaning_report["duplicate_rows_removed"], 1)
        self.assertGreaterEqual(cleaning_report["missing_values_fixed"], 1)
        self.assertEqual(int(cleaned.isna().sum().sum()), 0)
        self.assertLessEqual(after_report["missing_values"], before_report["missing_values"])
        self.assertIn("actions", cleaning_report)
        self.assertIn("quality_score", cleaning_report)

    def test_extraction_profile_clean_sequence_for_text_table(self):
        payload = b"Revenue|Month|Category\n1000|2026-01-01| A \n|bad-date|NA\n1000|2026-01-01| A \n"
        extracted = load_dataframe_from_upload_bytes("sample.txt", payload)
        profile = profile_dataframe(extracted)
        cleaned, cleaning_report = clean_dataframe(extracted, profile)

        self.assertEqual(list(extracted.columns), ["Revenue", "Month", "Category"])
        self.assertIn("missing_values", profile)
        self.assertIn("invalid_formats", profile)
        self.assertGreaterEqual(cleaning_report["duplicate_rows_removed"], 1)
        self.assertEqual(int(cleaned.isna().sum().sum()), 0)


if __name__ == "__main__":
    unittest.main()
