import math
import sys
import unittest
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.routers.upload import _to_json_safe_records
from app.services.file_ingest import load_dataframe_from_upload_bytes


class FileIngestTests(unittest.TestCase):
    def test_plain_text_is_not_misread_as_csv(self):
        df = load_dataframe_from_upload_bytes("notes.txt", b"hello\nworld\n")

        self.assertEqual(list(df.columns), ["text"])
        self.assertEqual(df["text"].tolist(), ["hello", "world"])

    def test_delimited_text_becomes_table(self):
        df = load_dataframe_from_upload_bytes("rows.txt", b"name|score\nA|10\nB|20\n")

        self.assertEqual(list(df.columns), ["name", "score"])
        self.assertEqual(len(df), 2)

    def test_nested_values_are_json_safe(self):
        df = pd.DataFrame(
            {
                "items": [[1, 2], {"nested": float("nan")}],
                "score": [1.5, float("inf")],
            }
        )

        records = _to_json_safe_records(df)

        self.assertEqual(records[0]["items"], [1, 2])
        self.assertIsNone(records[1]["items"]["nested"])
        self.assertIsNone(records[1]["score"])
        self.assertFalse(any(isinstance(row["score"], float) and math.isinf(row["score"]) for row in records))


if __name__ == "__main__":
    unittest.main()
