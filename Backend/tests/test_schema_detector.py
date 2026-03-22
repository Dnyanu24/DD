import unittest
import pandas as pd
import sys
from pathlib import Path

# Ensure `app.*` imports work when running tests from repo root.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.schema_detector import detect_schema, apply_type_corrections


class SchemaDetectorTests(unittest.TestCase):
    def test_does_not_blindly_convert_numeric_to_datetime(self):
        df = pd.DataFrame(
            {
                "employees": ["10", "11", "12", None],
                "sales": ["1000.5", "1200", "1300.75", ""],
                "random_numbers": ["1", "2", "3", "4"],
            }
        )
        schema = detect_schema(df)
        corrected, _ = apply_type_corrections(df, schema)

        # Should be numeric, not datetime
        self.assertFalse(pd.api.types.is_datetime64_any_dtype(corrected["employees"]))
        self.assertTrue(pd.api.types.is_numeric_dtype(corrected["employees"]))
        self.assertFalse(pd.api.types.is_datetime64_any_dtype(corrected["sales"]))

    def test_datetime_requires_date_pattern(self):
        df = pd.DataFrame(
            {
                "created_at": ["2025-03-22", "2025-03-23", None],
                "id": ["1", "2", "3"],
            }
        )
        schema = detect_schema(df)
        self.assertEqual(schema["created_at"].kind, "datetime")
        corrected, _ = apply_type_corrections(df, schema)
        self.assertTrue(pd.api.types.is_datetime64_any_dtype(corrected["created_at"]))

    def test_employees_detected_as_integer(self):
        df = pd.DataFrame({"employees": ["10", "11", None, "12"], "sales": ["100.5", "200", "", "300.25"]})
        schema = detect_schema(df)
        self.assertIn(schema["employees"].kind, ("integer", "id"))
        corrected, _ = apply_type_corrections(df, schema)
        self.assertTrue(str(corrected["employees"].dtype).lower().startswith("int"))


if __name__ == "__main__":
    unittest.main()
