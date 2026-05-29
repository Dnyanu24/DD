import pandas as pd
import numpy as np
from sklearn.impute import SimpleImputer, KNNImputer
from sklearn.preprocessing import StandardScaler, MinMaxScaler
from scipy import stats
import logging
import json
from typing import Dict, Any, List
import re
from datetime import datetime
from sklearn.experimental import enable_iterative_imputer
from sklearn.impute import IterativeImputer
from sklearn.ensemble import ExtraTreesRegressor
from sklearn.preprocessing import OrdinalEncoder
import difflib

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
    def impute_missing_values(self, df: pd.DataFrame, strategy: str = 'auto', knn_k: int = 5) -> pd.DataFrame:
        df_clean = df.copy()
        # Treat blank/whitespace strings as missing so imputation can fill them.
        try:
            df_clean = df_clean.replace(r"^\s*$", np.nan, regex=True)
        except Exception:
            pass

        # Identify numeric columns and coerce numeric-like object columns
        numeric_cols = list(df_clean.select_dtypes(include=[np.number]).columns)
        obj_cols = [c for c in df_clean.select_dtypes(include=['object', 'string']).columns]
        coerced_numeric = []
        for col in obj_cols:
            sample = df_clean[col].dropna().astype(str).head(200)
            if sample.empty:
                continue
            coerced = pd.to_numeric(sample, errors='coerce')
            non_na_frac = float(coerced.notna().sum()) / max(len(sample), 1)
            if non_na_frac >= 0.6:
                df_clean[col] = pd.to_numeric(df_clean[col], errors='coerce')
                coerced_numeric.append(col)

        numeric_cols = list(dict.fromkeys(numeric_cols + coerced_numeric))
        # Exclude identifier-like numeric columns (keep IDs stable)
        id_like = {c for c in numeric_cols if str(c).strip().lower() == "id" or str(c).strip().lower().endswith("_id")}
        numeric_cols = [c for c in numeric_cols if c not in id_like]

        # Prepare categorical columns: exclude internal/meta and complex types
        categorical_cols = df_clean.select_dtypes(include=['object', 'string']).columns.tolist()
        filtered_cats = []
        for col in categorical_cols:
            if str(col).startswith("_"):
                continue
            sample_vals = df_clean[col].dropna().head(200).tolist()
            if any(isinstance(v, (list, dict)) for v in sample_vals):
                continue
            filtered_cats.append(col)
        categorical_cols = filtered_cats

        # Numeric imputation
        if strategy == 'mean' or (strategy == 'auto' and len(numeric_cols) > 0):
            if numeric_cols:
                try:
                    imputer = SimpleImputer(strategy='mean')
                    df_clean[numeric_cols] = imputer.fit_transform(df_clean[numeric_cols])
                except Exception:
                    for col in numeric_cols:
                        try:
                            mean_val = pd.to_numeric(df_clean[col], errors='coerce').mean()
                            df_clean[col] = pd.to_numeric(df_clean[col], errors='coerce').fillna(mean_val)
                        except Exception:
                            pass
        elif strategy == 'ml':
            df_clean = self.advanced_ml_impute(df_clean, knn_k)
        elif strategy == 'median':
            if numeric_cols:
                try:
                    imputer = SimpleImputer(strategy='median')
                    df_clean[numeric_cols] = imputer.fit_transform(df_clean[numeric_cols])
                except Exception:
                    for col in numeric_cols:
                        try:
                            med_val = pd.to_numeric(df_clean[col], errors='coerce').median()
                            df_clean[col] = pd.to_numeric(df_clean[col], errors='coerce').fillna(med_val)
                        except Exception:
                            pass
        elif strategy == 'ml' or strategy == 'auto':
            safe_k = int(knn_k) if knn_k is not None else 5
            safe_k = max(2, min(25, safe_k))
            if numeric_cols:
                try:
                    imputer = KNNImputer(n_neighbors=safe_k)
                    df_clean[numeric_cols] = imputer.fit_transform(df_clean[numeric_cols])
                except Exception:
                    for col in numeric_cols:
                        try:
                            fill = pd.to_numeric(df_clean[col], errors='coerce').median()
                            if pd.isna(fill):
                                fill = pd.to_numeric(df_clean[col], errors='coerce').mean()
                            if pd.isna(fill):
                                fill = 0.0
                            df_clean[col] = pd.to_numeric(df_clean[col], errors='coerce').fillna(float(fill))
                        except Exception:
                            pass

        # Categorical imputation (safe)
        if len(categorical_cols) > 0:
            for col in categorical_cols:
                try:
                    df_clean[col] = df_clean[col].astype('object')
                except Exception:
                    pass
            try:
                imputer_cat = SimpleImputer(strategy='most_frequent')
                df_clean[categorical_cols] = imputer_cat.fit_transform(df_clean[categorical_cols])
            except Exception:
                for col in categorical_cols:
                    try:
                        mode_val = df_clean[col].mode(dropna=True)
                        if not mode_val.empty:
                            df_clean[col] = df_clean[col].fillna(mode_val.iloc[0])
                    except Exception:
                        pass

        # Final safety net: ensure no remaining missing values in numeric/categorical columns
        # Numeric fallback: median -> mean -> 0.0
        for col in numeric_cols:
            try:
                if df_clean[col].isna().any():
                    fill = pd.to_numeric(df_clean[col], errors='coerce').median()
                    if pd.isna(fill):
                        fill = pd.to_numeric(df_clean[col], errors='coerce').mean()
                    if pd.isna(fill):
                        fill = 0.0
                    df_clean[col] = pd.to_numeric(df_clean[col], errors='coerce').fillna(float(fill))
            except Exception:
                continue

        # Categorical fallback: mode -> 'unknown'
        for col in categorical_cols:
            try:
                if df_clean[col].isna().any():
                    mode_val = df_clean[col].mode(dropna=True)
                    if not mode_val.empty:
                        df_clean[col] = df_clean[col].fillna(mode_val.iloc[0])
                    else:
                        df_clean[col] = df_clean[col].fillna('unknown')
            except Exception:
                try:
                    df_clean[col] = df_clean[col].fillna('unknown')
                except Exception:
                    pass

        # UNIVERSAL final pass: for any remaining missing values, try coercion and fill.
        for col in df_clean.columns:
            if not df_clean[col].isna().any():
                continue
            # Skip ID-like columns
            if str(col).strip().lower() == 'id' or str(col).strip().lower().endswith('_id'):
                continue
            series = df_clean[col]
            # Try numeric coercion with a low threshold
            coerced = pd.to_numeric(series, errors='coerce')
            non_na_frac = float(coerced.notna().sum()) / max(len(coerced), 1)
            if non_na_frac >= 0.3:
                # treat as numeric-like
                try:
                    fill = coerced.median()
                    if pd.isna(fill):
                        fill = coerced.mean()
                    if pd.isna(fill):
                        fill = 0.0
                    df_clean[col] = coerced.fillna(float(fill))
                    continue
                except Exception:
                    pass
            # Otherwise categorical fallback
            try:
                mode_val = series.mode(dropna=True)
                if not mode_val.empty:
                    df_clean[col] = series.fillna(mode_val.iloc[0])
                else:
                    df_clean[col] = series.fillna('unknown')
            except Exception:
                try:
                    df_clean[col] = series.fillna('unknown')
                except Exception:
                    pass

        score = self.calculate_quality_score(df, df_clean, 'missing_value_imputation')
        self.log_action('missing_value_imputation', {
            'strategy': strategy,
            'knn_k': knn_k,
            'columns_affected': len(numeric_cols) + len(categorical_cols),
            'quality_score': score
        })
        return df_clean

    def _stringify_unhashable_cells(self, df: pd.DataFrame) -> pd.DataFrame:
        """Convert unhashable cell types (dict, list, set, ndarray) to JSON-safe strings for operations like drop_duplicates."""
        df_safe = df.copy()
        for col in df_safe.columns:
            try:
                sample = df_safe[col].dropna().head(200).tolist()
            except Exception:
                continue
            if any(isinstance(v, (dict, list, set, tuple, np.ndarray)) for v in sample):
                def _safe_serialize(v):
                    if v is None or (isinstance(v, float) and np.isnan(v)):
                        return None
                    if isinstance(v, (dict, list, set, tuple, np.ndarray)):
                        try:
                            return json.dumps(v, default=str, ensure_ascii=False)
                        except Exception:
                            return str(v)
                    return v
                try:
                    df_safe[col] = df_safe[col].apply(_safe_serialize)
                except Exception:
                    # fallback: convert entire column to string
                    df_safe[col] = df_safe[col].astype(str)
        return df_safe

    # 2. Duplicate Detection & Removal
    def remove_duplicates(self, df: pd.DataFrame) -> pd.DataFrame:
        # Some extracted PDF cells may contain dict/list values which are unhashable
        # and cause drop_duplicates to fail. Convert those cells to JSON-safe strings first.
        try:
            df_safe = self._stringify_unhashable_cells(df)
            df_clean = df_safe.drop_duplicates()
            # Preserve original types where possible by selecting rows from original df
            # that match the unique index of df_safe
            if len(df_clean) == len(df_safe):
                # Map back to original rows using index
                df_clean = df.loc[df_safe.index[df_safe.duplicated(keep='first') == False]]
            else:
                df_clean = df_safe.drop_duplicates()
        except Exception:
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
        outlier_counts = {}
        # Never treat identifier columns as outliers (keeps IDs stable).
        id_like = {
            c
            for c in numeric_cols
            if str(c).strip().lower() == "id" or str(c).strip().lower().endswith("_id")
        }
        numeric_cols = [c for c in numeric_cols if c not in id_like]

        for col in numeric_cols:
            series = df_clean[col].dropna()
            if len(series) < 4:
                continue

            if method == 'zscore':
                z_scores = pd.Series(np.abs(stats.zscore(series)), index=series.index)
                outlier_mask = pd.Series(False, index=df_clean.index)
                outlier_mask.loc[z_scores.index] = z_scores > 3
            elif method == 'iqr':
                Q1 = series.quantile(0.25)
                Q3 = series.quantile(0.75)
                IQR = Q3 - Q1
                if IQR == 0 or pd.isna(IQR):
                    continue
                lower_bound = Q1 - 1.5 * IQR
                upper_bound = Q3 + 1.5 * IQR
                outlier_mask = (df_clean[col] < lower_bound) | (df_clean[col] > upper_bound)
            else:
                continue

            count = int(outlier_mask.fillna(False).sum())
            if not count:
                continue

            lower_cap = series.quantile(0.05)
            upper_cap = series.quantile(0.95)
            df_clean.loc[outlier_mask & (df_clean[col] < lower_cap), col] = lower_cap
            df_clean.loc[outlier_mask & (df_clean[col] > upper_cap), col] = upper_cap
            outlier_counts[str(col)] = count

        score = self.calculate_quality_score(df, df_clean, 'outlier_detection')
        self.log_action('outlier_detection', {
            'method': method,
            'columns_affected': len(numeric_cols),
            'outliers_capped': outlier_counts,
            'quality_score': score
        })
        return df_clean

    def _domain_bounds(self, col: str):
        name = str(col).lower()
        if "customer" in name and ("score" in name or "rating" in name):
            return 0.0, 5.0
        if "score" in name or "rating" in name:
            return 0.0, 100.0
        if "percent" in name or "%" in name:
            return -1000.0, 1000.0
        if "employee" in name or "count" in name or "qty" in name or "quantity" in name:
            return 0.0, None
        return None

    def enforce_domain_constraints(self, df: pd.DataFrame) -> pd.DataFrame:
        df_clean = df.copy()
        invalid_counts = {}

        for col in df_clean.select_dtypes(include=[np.number]).columns:
            bounds = self._domain_bounds(col)
            if not bounds:
                continue
            lower, upper = bounds
            invalid_mask = pd.Series(False, index=df_clean.index)
            if lower is not None:
                invalid_mask = invalid_mask | (df_clean[col] < lower)
            if upper is not None:
                invalid_mask = invalid_mask | (df_clean[col] > upper)
            count = int(invalid_mask.fillna(False).sum())
            if count:
                df_clean.loc[invalid_mask, col] = np.nan
                invalid_counts[str(col)] = count

        self.quality_scores["domain_validation"] = 1.0
        self.log_action("domain_validation", {
            "invalid_values_nullified": invalid_counts,
            "columns_affected": len(invalid_counts),
            "quality_score": 1.0,
        })
        return df_clean

    # 4. Data Type Correction
    def correct_data_types(self, df: pd.DataFrame) -> pd.DataFrame:
        df_clean = df.copy()
        applied = []
        missing_tokens = {"", "na", "n/a", "null", "none", "nan", "undefined", "unknown", "-", "--"}
        numeric_tokens = (
            "revenue", "growth", "percent", "%", "score", "count", "amount",
            "price", "cost", "sales", "profit", "loss", "qty", "quantity",
            "employee", "customer", "rating", "value", "total", "avg", "mean",
        )
        date_tokens = ("date", "time", "timestamp", "created_at", "updated_at")
        date_blocked = ("growth", "percent", "%", "score", "revenue", "employee", "customer", "count")

        for col in df_clean.columns:
            name = str(col).lower()
            series = df_clean[col]
            if pd.api.types.is_numeric_dtype(series) or pd.api.types.is_datetime64_any_dtype(series):
                continue

            normalized = series.astype("object").copy()
            mask = normalized.notna()
            normalized.loc[mask] = normalized.loc[mask].astype(str).str.strip()
            normalized = normalized.mask(normalized.astype(str).str.lower().isin(missing_tokens), np.nan)

            numeric_candidate = pd.to_numeric(
                normalized.astype("string")
                .str.replace("%", "", regex=False)
                .str.replace(",", "", regex=False)
                .str.replace("$", "", regex=False),
                errors="coerce",
            )
            non_null_count = int(normalized.notna().sum())
            numeric_ratio = float(numeric_candidate.notna().sum()) / max(non_null_count, 1)
            should_numeric = numeric_ratio >= 0.7 or (
                any(token in name for token in numeric_tokens) and numeric_ratio >= 0.4
            )
            if should_numeric:
                df_clean[col] = numeric_candidate
                applied.append({"column": str(col), "type": "numeric"})
                continue

            should_datetime = (
                any(token in name for token in date_tokens)
                and not any(token in name for token in date_blocked)
            )
            if should_datetime:
                parsed = pd.to_datetime(normalized, errors="coerce", format="mixed")
                if float(parsed.notna().sum()) / max(non_null_count, 1) >= 0.75:
                    df_clean[col] = parsed
                    applied.append({"column": str(col), "type": "datetime"})
                    continue

            df_clean[col] = normalized

        score = self.calculate_quality_score(df, df_clean, 'data_type_correction')
        self.log_action('data_type_correction', {
            'columns_processed': len(df_clean.columns),
            'actions': applied[:20],
            'quality_score': score
        })
        return self.enforce_domain_constraints(df_clean)

    # 5. Normalization (Min-Max)
    def normalize_data(self, df: pd.DataFrame) -> pd.DataFrame:
        df_clean = df.copy()
        numeric_cols = df.select_dtypes(include=[np.number]).columns
        id_like = {
            c
            for c in numeric_cols
            if str(c).strip().lower() == "id" or str(c).strip().lower().endswith("_id")
        }
        numeric_cols = [c for c in numeric_cols if c not in id_like]
        if len(numeric_cols) == 0:
            self.log_action('normalization', {
                'method': 'min_max',
                'columns_affected': 0,
                'quality_score': 1.0
            })
            self.quality_scores['normalization'] = 1.0
            return df_clean

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
    def advanced_ml_impute(self, df: pd.DataFrame, knn_k: int = 5) -> pd.DataFrame:
        '''Advanced predictive cleaning per specs.
        Handle missing, standardize, logical fills.
        '''
        df_clean = df.copy()
        
        # 1. Early NaN/blanks
        df_clean = df_clean.replace([np.nan, None, '', ' '], np.nan)
        
        # 2. Text standardization
        text_cols = df_clean.select_dtypes(include=['object']).columns
        for col in text_cols:
            df_clean[col] = df_clean[col].astype(str).str.lower().str.strip().str.replace(r'\s+', ' ', regex=True)
        
        # 3. Sector correction/spelling
        common_sectors = {'it': 'it', 'healthcare': 'healthcare', 'finance': 'finance', 'agriculture': 'agriculture'}
        sector_col = next((c for c in ['sector', 'industry'] if c in df_clean.columns), None)
        if sector_col:
            for idx, val in df_clean[sector_col].items():
                if pd.isna(val):
                    continue
                val_str = str(val).lower()
                similar = difflib.get_close_matches(val_str, common_sectors.keys(), n=1, cutoff=0.6)
                if similar:
                    df_clean.at[idx, sector_col] = similar[0]
        
        # 4. Groupby sector impute
        sector_cols = [sector_col] if sector_col else []
        num_cols = df_clean.select_dtypes(np.number).columns.tolist()
        id_cols = [c for c in num_cols if 'id' in str(c).lower()]
        num_cols = [c for c in num_cols if c not in id_cols]
        if sector_cols:
            for col in num_cols:
                df_clean[col] = df_clean.groupby(sector_cols)[col].transform(lambda x: x.fillna(x.mean()))
            for col in text_cols:
                df_clean[col] = df_clean.groupby(sector_cols)[col].transform(lambda x: x.fillna(x.mode().iloc[0] if len(x.mode()) > 0 else 'unknown'))
        
        # 5. Logical relationships
        sales_col = next((c for c in ['sales', 'revenue'] if c in df_clean.columns), None)
        profit_col = next((c for c in ['profit', 'margin'] if c in df_clean.columns), None)
        if sales_col and profit_col:
            mask = df_clean[profit_col].isna()
            df_clean.loc[mask, profit_col] = 0.15 * df_clean.loc[mask, sales_col]
        
        # 6. IterativeImputer numeric
        if num_cols:
            imp = IterativeImputer(random_state=0, estimator=ExtraTreesRegressor(n_estimators=10), max_iter=10)
            df_clean[num_cols] = imp.fit_transform(df_clean[num_cols])
        
        # 7. Final KNN fallback
        if num_cols:
            safe_k = min(knn_k, max(2, len(df_clean) // 3))
            try:
                imputer = KNNImputer(n_neighbors=safe_k)
                df_clean[num_cols] = imputer.fit_transform(df_clean[num_cols])
            except Exception as e:
                logger.warning(f'KNN fallback failed: {e}')
        
        # 8. Final cat fill & 'nan' str
        for col in text_cols:
            df_clean[col] = df_clean[col].fillna('unknown')
            df_clean[col] = df_clean[col].replace('nan', 'unknown')
        
        # 9. Region mode if missing
        region_col = next((c for c in ['region', 'location'] if c in df_clean.columns), None)
        if region_col:
            mode_region = df_clean[region_col].mode()
            if not mode_region.empty:
                df_clean[region_col] = df_clean[region_col].fillna(mode_region.iloc[0])
        
        # 10. Fuzzy dup removal (simple std dup)
        try:
            df_clean = self._stringify_unhashable_cells(df_clean).drop_duplicates()
        except Exception:
            try:
                df_clean = df_clean.drop_duplicates()
            except Exception:
                # If dedupe still fails, skip it to avoid crashing the pipeline
                logger.warning('Deduplication skipped due to unhashable values')
                df_clean = df_clean
        
        score = self.calculate_quality_score(df, df_clean, 'advanced_ml')
        self.log_action('advanced_ml_impute', {'knn_k': knn_k, 'nan_pre': int(df.isna().sum().sum()), 'nan_post': int(df_clean.isna().sum().sum()), 'quality_score': score})
        return df_clean
    
    def standardize_data(self, df: pd.DataFrame) -> pd.DataFrame:
        df_clean = df.copy()
        numeric_cols = df.select_dtypes(include=[np.number]).columns
        id_like = {
            c
            for c in numeric_cols
            if str(c).strip().lower() == "id" or str(c).strip().lower().endswith("_id")
        }
        numeric_cols = [c for c in numeric_cols if c not in id_like]
        if len(numeric_cols) == 0:
            self.log_action('standardization', {
                'method': 'z_score',
                'columns_affected': 0,
                'quality_score': 1.0
            })
            self.quality_scores['standardization'] = 1.0
            return df_clean

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
        id_like = {
            c
            for c in numeric_cols
            if str(c).strip().lower() == "id" or str(c).strip().lower().endswith("_id")
        }
        numeric_cols = [c for c in numeric_cols if c not in id_like]

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
            series = df_clean[col].astype("string")
            series = series.str.lower()
            series = series.str.replace(r'[^\w\s]', '', regex=True)
            series = series.str.strip()
            # Preserve missing values (avoid turning NaN into the string "nan")
            series = series.where(series.notna(), pd.NA)
            # Treat empty strings as missing after cleanup
            series = series.replace(r"^\s*$", pd.NA, regex=True)
            df_clean[col] = series

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
                'knn_k': 5,
                'outlier_method': 'iqr',
                # Preserve original units by default.
                'normalize': False,
                'standardize': False,
                'reduce_noise': False,
                'clean_text': True,
                'rules': {},
                'reference_data': {}
            }

        df_clean = df.copy()

        # Run all algorithms in sequence
        df_clean = self.remove_duplicates(df_clean)
        df_clean = self.impute_missing_values(
            df_clean,
            config.get('impute_strategy', 'auto'),
            config.get('knn_k', 5),
        )
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
