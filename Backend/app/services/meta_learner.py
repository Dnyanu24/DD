from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, Optional

import pandas as pd
from sqlalchemy.orm import Session

from app.models import MetaLearningExperience
from app.services.dataset_encoder import cosine_similarity, encode_dataset


class MetaLearner:
    """
    Self-evolving pipeline meta-learner.

    Stores "experience" rows:
      dataset_features/embedding -> best_config (+ best_model + best_metrics)

    Uses cosine similarity over embeddings for fast similarity search in SQLite.
    """

    def __init__(self, db: Session):
        self.db = db

    def record_experience(
        self,
        *,
        company_id: int,
        sector_id: Optional[int],
        df: pd.DataFrame,
        best_config: Dict[str, Any],
        best_model: Dict[str, Any],
        best_metrics: Dict[str, Any],
        source_cleaned_data_id: Optional[int] = None,
    ) -> int:
        dataset_features, embedding = encode_dataset(df)

        row = MetaLearningExperience(
            company_id=int(company_id),
            sector_id=int(sector_id) if sector_id is not None else None,
            dataset_features=dataset_features,
            embedding=embedding,
            best_config=dict(best_config or {}),
            best_model=dict(best_model or {}),
            best_metrics=dict(best_metrics or {}),
            source_cleaned_data_id=int(source_cleaned_data_id) if source_cleaned_data_id is not None else None,
            created_at=datetime.utcnow(),
        )
        self.db.add(row)
        self.db.commit()
        self.db.refresh(row)
        return int(row.id)

    def suggest_pipeline(
        self,
        *,
        company_id: int,
        sector_id: Optional[int],
        df: pd.DataFrame,
        min_similarity: float = 0.88,
        limit: int = 250,
    ) -> Optional[Dict[str, Any]]:
        """
        Find the most similar past dataset for the company (optionally same sector),
        and return its best_config/best_model as a warm start.
        """
        dataset_features, embedding = encode_dataset(df)

        q = self.db.query(MetaLearningExperience).filter(MetaLearningExperience.company_id == int(company_id))
        # Prefer same-sector matches first. If none exist, fall back to company-wide.
        if sector_id is not None:
            same_sector = (
                q.filter(MetaLearningExperience.sector_id == int(sector_id))
                .order_by(MetaLearningExperience.created_at.desc())
                .limit(int(limit))
                .all()
            )
            candidates = same_sector
            if not candidates:
                candidates = q.order_by(MetaLearningExperience.created_at.desc()).limit(int(limit)).all()
        else:
            candidates = q.order_by(MetaLearningExperience.created_at.desc()).limit(int(limit)).all()

        best = None
        best_sim = 0.0
        for row in candidates:
            sim = cosine_similarity(list(embedding), list(row.embedding or []))
            if sim > best_sim:
                best_sim = sim
                best = row

        if not best or best_sim < float(min_similarity):
            return None

        return {
            "match": {
                "experience_id": int(best.id),
                "similarity": round(float(best_sim), 6),
                "created_at": best.created_at.isoformat() if best.created_at else None,
            },
            "dataset_features": dataset_features,
            "best_config": dict(best.best_config or {}),
            "best_model": dict(best.best_model or {}),
            "best_metrics": dict(best.best_metrics or {}),
        }

