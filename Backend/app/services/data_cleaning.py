import pandas as pd
import numpy as np
from sklearn.impute import SimpleImputer, KNNImputer
from sklearn.preprocessing import StandardScaler, MinMaxScaler
from scipy import stats
import logging
from typing import Dict, Any, List
import re
from datetime import datetime

logger = logging.getLogger(__name__)

class DataCleaningEngine:
    def __init__(self):
        self.quality_scores = {}
        self.logs = []

    def log_action(self, action: str, details: Dict[str, Any]):
        """Log cleaning action with timestamp"""
        log_entry = {
            "timestamp": datetime.utcnow().isoformat(),
            "action": action,
            "details": details
        }
        self.logs.append(log_entry)
        logger.info(f"Data Cleaning: {action} - {details}")

    def calculate_quality_score(self, df_before: pd.DataFrame, df_after: pd.DataFrame, algorithm: str) -> float:
        """Calculate data quality score based on improvements"""
        # Simple quality score based on completeness and consistency
        completeness_before = df_before.notna().mean().mean()
        completeness_after = df_after.notna().mean().mean()

        # Basic score calculation
        score = min(1.0, completeness_after / max(completeness_before, 0.01))
        self.quality_scores[algorithm] = score
        return score

    # 1. Missing Value Imputation
    def impute_missing_values(self, df: pd.DataFrame, strategy: str = 'auto') -> pd.DataFrame:
        df_clean = df.copy()
        numeric_cols = df.select_dtypes(include=[np.number]).columns
        categorical_cols = df.select_dtypes(include=['object']).columns

        if strategy == 'mean' or (strategy == 'auto' and len(numeric_cols) > 0):
            imputer = SimpleImputer(strategy='mean')
            df_clean[numeric_cols] = imputer.fit_transform(df_clean[numeric_cols])
        elif strategy == 'median':
            imputer = SimpleImputer(strategy='median')
            df_clean[numeric_cols] = imputer.fit_transform(df_clean[numeric_cols])
        elif strategy == 'ml' or strategy == 'auto':
            imputer = KNNImputer(n_neighbors=5)
            df_clean[numeric_cols] = imputer.fit_transform(df_clean[numeric_cols])

        # For categorical, use most frequent
        if len(categorical_cols) > 0:
            imputer_cat = SimpleImputer(strategy='most_frequent')
            df_clean[categorical_cols] = imputer_cat.fit_transform(df_clean[categorical_cols])

        score = self.calculate_quality_score(df, df_clean, 'missing_value_imputation')
        self.log_action('missing_value_imputation', {
            'strategy': strategy,
            'columns_affected': len(numeric_cols) + len(categorical_cols),
            'quality_score': score
        })
        return df_clean

    # 2. Duplicate Detection & Removal
    def remove_duplicates(self, df: pd.DataFrame) -> pd.DataFrame:
        df_clean = df.drop_duplicates()
        duplicates_removed = len(df) - len(df_clean)

        score = self.calculate_quality_score(df, df_clean, 'duplicate_removal')
        self.log_action('duplicate_removal', {
            'duplicates_removed': duplicates_removed,
            'quality_score': score
        })
        return df_clean

    # 3. Outlier Detection
    def detect_outliers(self, df: pd.DataFrame, method: str = 'iqr') -> pd.DataFrame:
        df_clean = df.copy()
        numeric_cols = df.select_dtypes(include=[np.number]).columns

        for col in numeric_cols:
            if method == 'zscore':
                z_scores = np.abs(stats.zscore(df_clean[col].dropna()))
                outliers = z_scores > 3
            elif method == 'iqr':
                Q1 = df_clean[col].quantile(0.25)
                Q3 = df_clean[col].quantile(0.75)
                IQR = Q3 - Q1
                outliers = (df_clean[col] < (Q1 - 1.5 * IQR)) | (df_clean[col] > (Q3 + 1.5 * IQR))

            # Cap outliers at percentiles
            lower_bound = df_clean[col].quantile(0.05)
            upper_bound = df_clean[col].quantile(0.95)
            df_clean[col] = np.clip(df_clean[col], lower_bound, upper_bound)

        score = self.calculate_quality_score(df, df_clean, 'outlier_detection')
        self.log_action('outlier_detection', {
            'method': method,
            'columns_affected': len(numeric_cols),
            'quality_score': score
        })
        return df_clean

    # 4. Data Type Correction
    def correct_data_types(self, df: pd.DataFrame) -> pd.DataFrame:
        df_clean = df.copy()

        for col in df_clean.columns:
            # Try to convert to numeric
            try:
                pd.to_numeric(df_clean[col])
                df_clean[col] = pd.to_numeric(df_clean[col])
            except:
                pass

            # Try to convert to datetime
            try:
                pd.to_datetime(df_clean[col])
                df_clean[col] = pd.to_datetime(df_clean[col])
            except:
                pass

        score = self.calculate_quality_score(df, df_clean, 'data_type_correction')
        self.log_action('data_type_correction', {
            'columns_processed': len(df_clean.columns),
            'quality_score': score
        })
        return df_clean

    # 5. Normalization (Min-Max)
    def normalize_data(self, df: pd.DataFrame) -> pd.DataFrame:
        df_clean = df.copy()
        numeric_cols = df.select_dtypes(include=[np.number]).columns

        scaler = MinMaxScaler()
        df_clean[numeric_cols] = scaler.fit_transform(df_clean[numeric_cols])

        score = self.calculate_quality_score(df, df_clean, 'normalization')
        self.log_action('normalization', {
            'method': 'min_max',
            'columns_affected': len(numeric_cols),
            'quality_score': score
        })
        return df_clean

    # 6. Standardization (Z-Score)
    def standardize_data(self, df: pd.DataFrame) -> pd.DataFrame:
        df_clean = df.copy()
        numeric_cols = df.select_dtypes(include=[np.number]).columns

        scaler = StandardScaler()
        df_clean[numeric_cols] = scaler.fit_transform(df_clean[numeric_cols])

        score = self.calculate_quality_score(df, df_clean, 'standardization')
        self.log_action('standardization', {
            'method': 'z_score',
            'columns_affected': len(numeric_cols),
            'quality_score': score
        })
        return df_clean

    # 7. Noise Reduction (Moving Average)
    def reduce_noise(self, df: pd.DataFrame, window: int = 5) -> pd.DataFrame:
        df_clean = df.copy()
        numeric_cols = df.select_dtypes(include=[np.number]).columns

        for col in numeric_cols:
            df_clean[col] = df_clean[col].rolling(window=window, center=True).mean()

        score = self.calculate_quality_score(df, df_clean, 'noise_reduction')
        self.log_action('noise_reduction', {
            'method': 'moving_average',
            'window': window,
            'columns_affected': len(numeric_cols),
            'quality_score': score
        })
        return df_clean

    # 8. Text Cleaning (NLP Preprocessing)
    def clean_text(self, df: pd.DataFrame) -> pd.DataFrame:
        df_clean = df.copy()
        text_cols = df.select_dtypes(include=['object']).columns

        for col in text_cols:
            # Basic text cleaning
            df_clean[col] = df_clean[col].astype(str).str.lower()
            df_clean[col] = df_clean[col].str.replace(r'[^\w\s]', '', regex=True)
            df_clean[col] = df_clean[col].str.strip()

        score = self.calculate_quality_score(df, df_clean, 'text_cleaning')
        self.log_action('text_cleaning', {
            'columns_affected': len(text_cols),
            'quality_score': score
        })
        return df_clean

    # 9. Rule-based Validation
    def validate_rules(self, df: pd.DataFrame, rules: Dict[str, Any]) -> pd.DataFrame:
        df_clean = df.copy()

        # Example rules - can be extended
        for col, rule in rules.items():
            if col in df_clean.columns:
                if rule.get('type') == 'range':
                    min_val, max_val = rule['min'], rule['max']
                    df_clean[col] = np.clip(df_clean[col], min_val, max_val)
                elif rule.get('type') == 'regex':
                    pattern = rule['pattern']
                    df_clean[col] = df_clean[col].astype(str).str.replace(pattern, '', regex=True)

        score = self.calculate_quality_score(df, df_clean, 'rule_based_validation')
        self.log_action('rule_based_validation', {
            'rules_applied': len(rules),
            'quality_score': score
        })
        return df_clean

    # 10. Multi-source Data Integration
    def integrate_data_sources(self, dfs: List[pd.DataFrame], key_column: str) -> pd.DataFrame:
        if len(dfs) == 1:
            return dfs[0]

        integrated_df = dfs[0]
        for df in dfs[1:]:
            integrated_df = pd.merge(integrated_df, df, on=key_column, how='outer')

        score = 0.8  # Placeholder score
        self.log_action('multi_source_integration', {
            'sources_integrated': len(dfs),
            'key_column': key_column,
            'quality_score': score
        })
        return integrated_df

    # 11. Cross-table Consistency Checks
    def check_cross_table_consistency(self, df: pd.DataFrame, reference_data: Dict[str, Any]) -> pd.DataFrame:
        df_clean = df.copy()

        # Example: Check if values exist in reference tables
        for col, ref_values in reference_data.items():
            if col in df_clean.columns:
                valid_mask = df_clean[col].isin(ref_values)
                df_clean = df_clean[valid_mask]

        score = self.calculate_quality_score(df, df_clean, 'cross_table_consistency')
        self.log_action('cross_table_consistency', {
            'reference_checks': len(reference_data),
            'quality_score': score
        })
        return df_clean

    def run_full_pipeline(self, df: pd.DataFrame, config: Dict[str, Any] = None) -> pd.DataFrame:
        """Run the complete cleaning pipeline"""
        if config is None:
            config = {
                'impute_strategy': 'auto',
                'outlier_method': 'iqr',
                'normalize': True,
                'standardize': False,
                'reduce_noise': True,
                'clean_text': True,
                'rules': {},
                'reference_data': {}
            }

        df_clean = df.copy()

        # Run all algorithms in sequence
        df_clean = self.remove_duplicates(df_clean)
        df_clean = self.impute_missing_values(df_clean, config.get('impute_strategy', 'auto'))
        df_clean = self.detect_outliers(df_clean, config.get('outlier_method', 'iqr'))
        df_clean = self.correct_data_types(df_clean)

        if config.get('normalize', False):
            df_clean = self.normalize_data(df_clean)
        if config.get('standardize', False):
            df_clean = self.standardize_data(df_clean)
        if config.get('reduce_noise', False):
            df_clean = self.reduce_noise(df_clean)
        if config.get('clean_text', False):
            df_clean = self.clean_text(df_clean)

        if config.get('rules'):
            df_clean = self.validate_rules(df_clean, config['rules'])

        if config.get('reference_data'):
            df_clean = self.check_cross_table_consistency(df_clean, config['reference_data'])

        return df_clean

    def get_logs(self) -> List[Dict]:
        return self.logs

    def get_quality_scores(self) -> Dict[str, float]:
        return self.quality_scores
