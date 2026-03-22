import unittest
import pandas as pd
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.sector_classifier import SectorClassifier


class SectorClassifierTests(unittest.TestCase):
    def test_rule_based_classification(self):
        df = pd.DataFrame(
            {
                "name": ["TechSoft Pvt Ltd", "Care Hospital", "Bank of India", "Agro Farm Co"],
                "sales": [1000, 2000, 1500, 900],
            }
        )
        classifier = SectorClassifier(db=None, company_id=None)
        out, report = classifier.classify(df)

        self.assertIn("sector", out.columns)
        self.assertEqual(out.loc[0, "sector"], "IT")
        self.assertEqual(out.loc[1, "sector"], "Healthcare")
        self.assertEqual(out.loc[2, "sector"], "Finance")
        self.assertEqual(out.loc[3, "sector"], "Agriculture")
        self.assertTrue(report.sector_counts["IT"] >= 1)


if __name__ == "__main__":
    unittest.main()

