import unittest
import pandas as pd
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.pipeline_controller import run_intelligent_pipeline


class ParallelImputationTests(unittest.TestCase):
    def test_parallel_imputation_selects_method_and_fills(self):
        df = pd.DataFrame(
            {
                "sales": [100.0, 110.0, None, 130.0, 125.0, None, 140.0, 150.0, 160.0, None, 170.0, 175.0],
                "profit": [10.0, 11.0, 12.0, None, 12.5, 13.0, None, 15.0, 16.0, 16.5, 17.0, None],
                "name": ["TechSoft", "TechSoft", "TechSoft", "TechSoft", "TechSoft", "TechSoft", "TechSoft", "TechSoft", "TechSoft", "TechSoft", "TechSoft", "TechSoft"],
            }
        )

        out = run_intelligent_pipeline(df, config={"parallel_imputation": True, "max_missing_percent": 80.0})
        self.assertIn("sales", out.df.columns)
        self.assertFalse(out.df["sales"].isna().any())
        # Ensure logs include selection map
        stages = [row.get("stage") for row in out.logs]
        self.assertIn("parallel_imputation", stages)


if __name__ == "__main__":
    unittest.main()

