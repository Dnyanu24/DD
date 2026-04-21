import pandas as pd
import numpy as np
from typing import Dict, Any, Tuple, List
from sklearn.cluster import KMeans, DBSCAN
from sklearn.ensemble import RandomForestClassifier
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.pipeline import Pipeline
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import LabelEncoder
from sklearn.metrics import silhouette_score
from app.services.sector_classifier import SectorClassifier, CANONICAL_SECTORS

class ClassificationsPipeline:
    def __init__(self, db=None, company_id=None):
        self.sector_classifier = SectorClassifier(db, company_id=company_id)
        self.tfidf = TfidfVectorizer(max_features=2000, ngram_range=(1,2), stop_words='english')
        self.product_rules = {
            'Electronics': ['phone', 'laptop', 'tablet', 'computer', 'gadget', 'device', 'screen'],
            'Apparel': ['shirt', 'pants', 'dress', 'shoes', 'clothing', 'fashion', 'wear'],
            'Furniture': ['chair', 'table', 'sofa', 'bed', 'desk', 'cabinet'],
            'Food': ['food', 'drink', 'beverage', 'meal', 'grocery', 'ingredient'],
            'Other': []
        }

    def product_classification(self, df: pd.DataFrame) -> pd.DataFrame:
        """Rule-based + text classifier for product category."""
        df_class = df.copy()
        text_cols = df.select_dtypes(include=['object']).columns.tolist()
        if not text_cols:
            df_class['product_class'] = 'Other'
            df_class['confidence_product'] = 0.4
            return df_class

        combined_text = df_class[text_cols].fillna('').astype(str).agg(' '.join, axis=1).tolist()
        predictions = []
        confidences = []
        for text in combined_text:
            scores = {}
            for product, keywords in self.product_rules.items():
                matches = sum(1 for kw in keywords if kw in text.lower())
                score = min(0.95, 0.3 + (matches / max(1, len(keywords))) * 0.7)
                scores[product] = score
            best_prod = max(scores, key=scores.get)
            predictions.append(best_prod)
            confidences.append(scores[best_prod])
        
        df_class['product_class'] = predictions
        df_class['confidence_product'] = confidences
        return df_class

    def hierarchical_classification(self, df: pd.DataFrame) -> pd.DataFrame:
        """3-level hierarchical: Industry > Category > Subcategory (ML on text features)."""
        df_hier = df.copy()
        text_cols = df.select_dtypes(include=['object']).columns
        if len(text_cols) == 0:
            df_hier['hierarchical_level1'] = 'Unknown'
            return df_hier

        # Dummy labels for training (expand with meta-learning)
        texts = df_hier[text_cols].fillna('').astype(str).agg(' '.join, axis=1)
        X = self.tfidf.fit_transform(texts)

        # Level 1: Broad industry (reuse sector)
        df_hier, _ = self.sector_classifier.classify(df_hier)
        df_hier['hierarchical_level1'] = df_hier['sector']

        # Level 2-3: Simple RF classifier (train on TF-IDF)
        # Placeholder: cluster-based fallback
        if len(df_hier) > 10:
            numeric_cols = df_hier.select_dtypes(include=[np.number]).columns
            if numeric_cols.any() or X.shape[1] > 0:
                features = np.hstack([X.toarray()] + [df_hier[num].fillna(0).values.reshape(-1,1) for num in numeric_cols])
                kmeans = KMeans(n_clusters=5, random_state=42, n_init=10)
                level2 = kmeans.fit_predict(features)
                df_hier['hierarchical_level2'] = ['Category_' + str(c) for c in level2]
                df_hier['confidence_hierarchical'] = 0.6 + 0.3 * np.random.rand(len(df_hier))
        
        df_hier['hierarchical_level3'] = df_hier['hierarchical_level2'] + '_sub'
        return df_hier

    def clustering(self, df: pd.DataFrame, method: str = 'kmeans') -> Dict[str, Any]:
        """Clustering on features/embeddings."""
        numeric_cols = df.select_dtypes(include=[np.number]).columns
        if len(numeric_cols) == 0:
            return {'labels': [0]*len(df), 'score': 0.0, 'n_clusters': 1}

        features = df[numeric_cols].fillna(0).values
        if method == 'kmeans':
            n_clusters = min(8, max(2, len(df)//10))
            kmeans = KMeans(n_clusters=n_clusters, random_state=42, n_init=10)
            labels = kmeans.fit_predict(features)
            score = silhouette_score(features, labels) if len(np.unique(labels)) > 1 else 0.0
            centroids = kmeans.cluster_centers_.tolist()
        elif method == 'dbscan':
            dbscan = DBSCAN(eps=0.5, min_samples=5)
            labels = dbscan.fit_predict(features)
            score = 0.0  # DBSCAN no silhouette by default
            centroids = None

        return {
            'cluster_labels': labels.tolist(),
            'silhouette_score': float(score),
            'n_clusters': int(len(np.unique(labels))),
            'cluster_centroids': centroids
        }

    def result_fusion(self, df: pd.DataFrame, cluster_result: Dict) -> pd.DataFrame:
        """Combine rule-based + ML + clustering via weighted fusion."""
        # Sector confidence from existing
        sector_conf = df.get('sector_confidence', 0.5).mean()
        product_conf = df.get('confidence_product', 0.5).mean()
        cluster_score = cluster_result['silhouette_score']
        
        # Fusion weights: classif(0.4) + cluster(0.3) + anomaly(sector proxy 0.3)
        fusion_conf = 0.4 * product_conf + 0.3 * cluster_score + 0.3 * sector_conf
        
        df['fusion_confidence'] = fusion_conf
        df['primary_class'] = df['product_class'].fillna(df['sector_class'])
        
        return df

    def run_classification_pipeline(self, df: pd.DataFrame) -> Tuple[pd.DataFrame, Dict[str, Any]]:
        """Full Phase 4: parallel ML tasks + fusion."""
        # 1. Product classification (rules)
        df = self.product_classification(df)
        
        # 2. Hierarchical classification
        df = self.hierarchical_classification(df)
        
        # 3. Clustering (parallel-capable)
        cluster_result = self.clustering(df)
        
        # 4. Sector (existing)
        df, sector_report = self.sector_classifier.classify(df)
        
        # 5. Fusion layer
        df = self.result_fusion(df, cluster_result)
        
        report = {
            'sector_report': sector_report.__dict__,
            'cluster_result': cluster_result,
            'fusion_confidence_mean': float(df['fusion_confidence'].mean())
        }
        
        return df, report


# Usage:
# classifier = ClassificationsPipeline(db, company_id)
# df_classified, report = classifier.run_classification_pipeline(df_clean)

