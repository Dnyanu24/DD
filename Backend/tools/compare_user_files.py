import sys
import json
import pandas as pd
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.data_cleaning import DataCleaningEngine
from app.services.pipeline_controller import run_intelligent_pipeline


def load_file(path):
    p = Path(path)
    if not p.exists():
        raise FileNotFoundError(path)
    if p.suffix.lower() in ('.csv', '.txt'):
        return pd.read_csv(p)
    elif p.suffix.lower() in ('.xls', '.xlsx'):
        return pd.read_excel(p)
    else:
        raise ValueError('Unsupported file type: ' + p.suffix)


def to_preview(df, rows=50):
    return json.loads(df.head(rows).to_json(orient='records', date_format='iso'))


def main(input_path, expected_path=None, out_dir='compare_out'):
    inp = load_file(input_path)
    engine = DataCleaningEngine()

    # Normal: mean and median
    normal_mean = engine.impute_missing_values(inp.copy(), strategy='mean', knn_k=5)
    normal_median = engine.impute_missing_values(inp.copy(), strategy='median', knn_k=5)

    # Predictive: use intelligent pipeline
    pred_out = run_intelligent_pipeline(inp.copy(), config={'parallel_imputation': True, 'predictive_fill': True})
    predictive_df = pred_out.df

    out = {
        'input_preview': to_preview(inp, 20),
        'normal_mean_preview': to_preview(normal_mean, 20),
        'normal_median_preview': to_preview(normal_median, 20),
        'predictive_preview': to_preview(predictive_df, 20),
        'predictive_best_methods': pred_out.logs if hasattr(pred_out, 'logs') else [],
    }

    Path(out_dir).mkdir(parents=True, exist_ok=True)
    with open(Path(out_dir) / 'compare_report.json', 'w', encoding='utf-8') as f:
        json.dump(out, f, indent=2, ensure_ascii=False)

    # Save CSVs
    normal_mean.to_csv(Path(out_dir) / 'normal_mean.csv', index=False)
    normal_median.to_csv(Path(out_dir) / 'normal_median.csv', index=False)
    predictive_df.to_csv(Path(out_dir) / 'predictive.csv', index=False)

    print('Report written to', Path(out_dir) / 'compare_report.json')


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print('Usage: python compare_user_files.py <input_file> [expected_file]')
        sys.exit(2)
    inp = sys.argv[1]
    exp = sys.argv[2] if len(sys.argv) > 2 else None
    main(inp, exp)
