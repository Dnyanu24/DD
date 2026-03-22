from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity


@dataclass(frozen=True)
class RagChunk:
    chunk_id: str
    source: str  # software | database | dataset
    title: str
    text: str
    meta: Dict[str, Any]


@dataclass(frozen=True)
class RagHit:
    chunk: RagChunk
    score: float


class RagIndex:
    def __init__(self, chunks: List[RagChunk]):
        self.chunks = list(chunks or [])
        self.vectorizer: Optional[TfidfVectorizer] = None
        self.matrix = None

    def fit(self) -> "RagIndex":
        texts = [c.text for c in self.chunks]
        if not texts:
            self.vectorizer = TfidfVectorizer(stop_words="english")
            self.matrix = None
            return self

        self.vectorizer = TfidfVectorizer(
            stop_words="english",
            ngram_range=(1, 2),
            max_features=25000,
        )
        self.matrix = self.vectorizer.fit_transform(texts)
        return self

    def search(self, query: str, *, top_k: int = 5, min_score: float = 0.08) -> List[RagHit]:
        if not self.chunks or not self.vectorizer or self.matrix is None:
            return []
        q = (query or "").strip()
        if not q:
            return []
        qv = self.vectorizer.transform([q])
        scores = cosine_similarity(self.matrix, qv).ravel()
        if scores.size == 0:
            return []

        order = np.argsort(-scores)
        hits: List[RagHit] = []
        for idx in order[: max(1, int(top_k) * 3)]:
            score = float(scores[idx])
            if score < float(min_score):
                continue
            hits.append(RagHit(chunk=self.chunks[int(idx)], score=score))
            if len(hits) >= int(top_k):
                break
        return hits

    def score_extra_chunks(self, query: str, extra_chunks: List[RagChunk], *, top_k: int = 3) -> List[RagHit]:
        """
        Score additional chunks using the existing vectorizer. Useful for per-request dataset chunks.
        """
        if not extra_chunks or not self.vectorizer:
            return []
        q = (query or "").strip()
        if not q:
            return []
        qv = self.vectorizer.transform([q])
        dv = self.vectorizer.transform([c.text for c in extra_chunks])
        scores = cosine_similarity(dv, qv).ravel()
        order = np.argsort(-scores)
        out: List[RagHit] = []
        for idx in order[: max(1, int(top_k) * 3)]:
            out.append(RagHit(chunk=extra_chunks[int(idx)], score=float(scores[idx])))
            if len(out) >= int(top_k):
                break
        return out


def build_software_chunks() -> List[RagChunk]:
    now = datetime.utcnow().isoformat()
    chunks = [
        RagChunk(
            chunk_id="software:upload",
            source="software",
            title="Upload Data",
            text=(
                "SDAS Upload supports CSV/JSON/TXT/PDF ingestion. Use Data Upload to attach files, "
                "assign sector/product, and store them in the database for cleaning and visualization."
            ),
            meta={"updated_at": now},
        ),
        RagChunk(
            chunk_id="software:cleaning",
            source="software",
            title="Self-Learning Data Cleaning",
            text=(
                "SDAS Cleaning removes duplicates, corrects types, standardizes text categories, and imputes missing values. "
                "The self-learning pipeline evaluates multiple imputers per column (mean/median/KNN/regression) and picks the best "
                "using validation, then records the best config for similar datasets (meta-learning)."
            ),
            meta={"updated_at": now},
        ),
        RagChunk(
            chunk_id="software:visualizations",
            source="software",
            title="Visualizations Dashboard",
            text=(
                "Visualizations are generated from real SQLite values. The overview shows mixed charts: "
                "sector vs sales, region distribution, sales vs profit scatter, histograms, quality donut, and growth waves."
            ),
            meta={"updated_at": now},
        ),
        RagChunk(
            chunk_id="software:roles",
            source="software",
            title="Role Management",
            text=(
                "CEO/Admin can manage roles, approve join requests, assign Sector Heads to a sector, "
                "and control access for other roles (Student/Individual focus on upload, cleaning, visualization)."
            ),
            meta={"updated_at": now},
        ),
        RagChunk(
            chunk_id="software:profile",
            source="software",
            title="Profile & Avatar",
            text=(
                "Profile allows updating display name, email, bio, and avatar image. "
                "Header shows the latest display name and avatar after saving."
            ),
            meta={"updated_at": now},
        ),
        RagChunk(
            chunk_id="software:notifications",
            source="software",
            title="Notifications",
            text=(
                "Notifications are company announcements. You can mark them read by opening the bell menu, "
                "or clear them to remove from all dashboards."
            ),
            meta={"updated_at": now},
        ),
    ]
    return chunks


def format_dataset_table(rows: List[Dict[str, Any]], limit: int = 6) -> str:
    if not rows:
        return "No recent datasets."
    lines = []
    for item in rows[: max(1, int(limit))]:
        cid = item.get("cleaned_data_id") or item.get("id") or "-"
        rc = item.get("row_count") or "-"
        cc = item.get("column_count") or "-"
        q = item.get("quality_score")
        qtxt = f"{round(float(q) * 100, 1)}%" if isinstance(q, (float, int)) else "-"
        algo = item.get("algorithm") or item.get("cleaning_algorithm") or "unknown"
        cols = item.get("columns") or []
        if isinstance(cols, list):
            cols = ", ".join([str(c) for c in cols[:8]])
        lines.append(f"- cleaned_id={cid} rows={rc} cols={cc} quality={qtxt} algo={algo} columns={cols}")
    return "\n".join(lines)

