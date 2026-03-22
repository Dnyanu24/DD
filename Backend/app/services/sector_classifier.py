from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import pandas as pd
from sqlalchemy.orm import Session

from app.models import SectorClassificationProfile


CANONICAL_SECTORS = ["IT", "Healthcare", "Finance", "Agriculture", "Other"]


BASE_RULES: Dict[str, List[str]] = {
    "IT": ["tech", "software", "soft", "it", "ai", "cloud", "data", "digital", "saas", "cyber", "app"],
    "Healthcare": ["care", "health", "hospital", "clinic", "pharma", "medical", "medicine", "patient"],
    "Finance": ["bank", "fin", "finance", "loan", "credit", "insurance", "investment", "trading"],
    "Agriculture": ["agro", "farm", "farming", "crop", "seed", "dairy", "irrigation", "harvest"],
}

HARD_KEYWORDS: Dict[str, List[str]] = {
    "IT": ["tech", "software", "saas", "cloud", "cyber"],
    "Healthcare": ["hospital", "clinic", "pharma", "medical"],
    "Finance": ["bank", "loan", "credit", "insurance"],
    "Agriculture": ["farm", "agro", "crop", "dairy"],
}


def _clean_text_value(value: Any) -> str:
    s = "" if value is None else str(value)
    s = s.strip().lower()
    s = re.sub(r"[^a-z0-9\\s]+", " ", s)
    s = re.sub(r"\\s+", " ", s).strip()
    return s


def _canonicalize_sector(value: Any) -> Optional[str]:
    if value is None:
        return None
    s = str(value).strip()
    if not s:
        return None
    low = s.lower().strip()
    mapping = {
        "information technology": "IT",
        "it": "IT",
        "i.t.": "IT",
        "tech": "IT",
        "technology": "IT",
        "health": "Healthcare",
        "healthcare": "Healthcare",
        "medical": "Healthcare",
        "finance": "Finance",
        "financial": "Finance",
        "banking": "Finance",
        "agriculture": "Agriculture",
        "agro": "Agriculture",
        "farming": "Agriculture",
    }
    if low in mapping:
        return mapping[low]

    # Normalize tokens like "it " -> "IT"
    if low.isalpha() and len(low) <= 3:
        cand = low.upper()
        return cand if cand in CANONICAL_SECTORS else None

    titled = " ".join([w.capitalize() for w in re.split(r"\\s+", low) if w])
    if titled in CANONICAL_SECTORS:
        return titled
    return None


def _find_sector_column(df: pd.DataFrame) -> Optional[str]:
    preferred = ["sector", "sector_name", "business_sector", "department", "division"]
    cols = [str(c) for c in df.columns]
    for p in preferred:
        if p in cols:
            return p
    for c in cols:
        if "sector" in c.lower():
            return c
    return None


def _build_row_text(df: pd.DataFrame) -> pd.Series:
    """
    Build a single text field for each row from likely "name/description"-like columns.
    """
    cols = [str(c) for c in df.columns]
    candidates = [c for c in cols if any(k in c.lower() for k in ["name", "title", "company", "product", "desc", "description", "category"])]
    if not candidates:
        candidates = [c for c in cols if df[c].dtype == object]
    candidates = candidates[:6]
    if not candidates:
        return pd.Series([""] * len(df), index=df.index)

    parts = []
    for c in candidates:
        parts.append(df[c].apply(_clean_text_value))
    combined = parts[0]
    for p in parts[1:]:
        combined = combined + " " + p
    return combined.str.strip()


def _rule_predict(text: str, rules: Dict[str, List[str]]) -> Tuple[str, float]:
    """
    Return (sector, confidence) from keyword rules.
    """
    if not text:
        return "Other", 0.0
    tokens = re.findall(r"[a-z0-9]+", text.lower())
    scores: Dict[str, float] = {}
    for sector, keywords in rules.items():
        matches = 0
        hard_hit = False
        for kw in keywords:
            if not kw:
                continue
            needle = kw.lower().strip()
            if not needle:
                continue
            # Match as exact token OR substring of a token (handles "techsoft", "bankingapp", etc.)
            if needle in tokens:
                matches += 1
                if needle in HARD_KEYWORDS.get(sector, []):
                    hard_hit = True
                continue
            if any(needle in tok for tok in tokens):
                matches += 1
                if needle in HARD_KEYWORDS.get(sector, []):
                    hard_hit = True
        if not keywords:
            continue
        # Normalized score: saturate quickly so 2 strong keyword hits is enough.
        ratio = matches / max(min(len(keywords), 4), 1)
        if hard_hit and matches >= 1:
            ratio = max(ratio, 0.5)
        scores[sector] = ratio

    if not scores:
        return "Other", 0.0
    best_sector = max(scores.keys(), key=lambda k: scores[k])
    best = float(scores[best_sector])
    # Convert to confidence scale.
    conf = min(0.95, 0.45 + best * 0.55) if best > 0 else 0.0
    return best_sector, float(round(conf, 4))


@dataclass
class SectorClassificationReport:
    sector_counts: Dict[str, int]
    uncertain_rows: int
    used_model: bool
    rule_keywords: Dict[str, List[str]]


class SectorClassifier:
    def __init__(
        self,
        db: Optional[Session],
        *,
        company_id: Optional[int] = None,
        rule_threshold: float = 0.65,
        ml_threshold: float = 0.55,
        max_profile_keywords: int = 16,
    ):
        self.db = db
        self.company_id = int(company_id) if company_id is not None else None
        self.rule_threshold = float(rule_threshold)
        self.ml_threshold = float(ml_threshold)
        self.max_profile_keywords = int(max_profile_keywords)

    def _load_profile_keywords(self) -> Dict[str, List[str]]:
        if not self.db or self.company_id is None:
            return {}
        rows = self.db.query(SectorClassificationProfile).filter(
            SectorClassificationProfile.company_id == self.company_id
        ).all()
        out: Dict[str, List[str]] = {}
        for row in rows:
            sector = str(row.sector)
            kws = row.keywords if isinstance(row.keywords, list) else []
            out[sector] = [str(k).lower() for k in kws][: self.max_profile_keywords]
        return out

    def _save_profiles(self, sector_texts: Dict[str, List[str]]) -> None:
        if not self.db or self.company_id is None:
            return

        def tokens(text: str) -> List[str]:
            return re.findall(r"[a-z]{3,}", text.lower())

        for sector, texts in sector_texts.items():
            if sector not in CANONICAL_SECTORS:
                continue
            word_counts: Dict[str, int] = {}
            sample_count = 0
            for t in texts[:500]:
                if not t:
                    continue
                sample_count += 1
                for w in tokens(t):
                    word_counts[w] = word_counts.get(w, 0) + 1
            if not word_counts:
                continue
            top = sorted(word_counts.items(), key=lambda kv: kv[1], reverse=True)[: self.max_profile_keywords]
            keywords = [w for w, _ in top]

            existing = self.db.query(SectorClassificationProfile).filter(
                SectorClassificationProfile.company_id == self.company_id,
                SectorClassificationProfile.sector == sector,
            ).first()
            if not existing:
                existing = SectorClassificationProfile(
                    company_id=self.company_id,
                    sector=sector,
                    keywords=keywords,
                    samples=sample_count,
                    updated_at=datetime.utcnow(),
                )
                self.db.add(existing)
            else:
                prev = existing.keywords if isinstance(existing.keywords, list) else []
                merged = list(dict.fromkeys([*keywords, *[str(k).lower() for k in prev]]))[: self.max_profile_keywords]
                existing.keywords = merged
                existing.samples = int(existing.samples or 0) + sample_count
                existing.updated_at = datetime.utcnow()
            self.db.commit()

    def classify(self, df: pd.DataFrame) -> Tuple[pd.DataFrame, SectorClassificationReport]:
        out = df.copy()

        # Unify/standardize existing sector column if present.
        sector_col = _find_sector_column(out)
        existing_sector = None
        if sector_col and sector_col in out.columns:
            existing_sector = out[sector_col].apply(_canonicalize_sector)
            # Always write to 'sector' for downstream split.
            out["sector"] = existing_sector
        else:
            out["sector"] = None

        row_text = _build_row_text(out)

        # Rules = base rules + meta-learning profile keywords.
        rules = {k: list(v) for k, v in BASE_RULES.items()}
        profile = self._load_profile_keywords()
        for sector, kws in profile.items():
            if sector in rules:
                rules[sector] = list(dict.fromkeys([*rules[sector], *kws]))

        rule_pred = []
        rule_conf = []
        for t in row_text.tolist():
            s, c = _rule_predict(t, rules)
            rule_pred.append(s)
            rule_conf.append(c)
        rule_pred_s = pd.Series(rule_pred, index=out.index)
        rule_conf_s = pd.Series(rule_conf, index=out.index)

        # Train a small text model if we have labels (existing sectors or high-confidence rules).
        labels = out["sector"].copy()
        labels = labels.where(labels.notna(), None)
        confident_rule_mask = (labels.isna()) & (rule_conf_s >= max(self.rule_threshold, 0.75))
        labels = labels.where(~confident_rule_mask, rule_pred_s)

        used_model = False
        ml_pred = pd.Series(["Other"] * len(out), index=out.index)
        ml_conf = pd.Series([0.0] * len(out), index=out.index, dtype=float)
        if labels.notna().sum() >= 30 and labels.dropna().nunique() >= 2:
            try:
                from sklearn.feature_extraction.text import TfidfVectorizer
                from sklearn.linear_model import LogisticRegression
                from sklearn.pipeline import Pipeline

                train_mask = labels.notna()
                X_train = row_text[train_mask].fillna("")
                y_train = labels[train_mask].astype(str)

                model = Pipeline(
                    steps=[
                        ("tfidf", TfidfVectorizer(max_features=4000, ngram_range=(1, 2), stop_words="english")),
                        ("clf", LogisticRegression(max_iter=250)),
                    ]
                )
                model.fit(X_train, y_train)
                used_model = True

                proba = model.predict_proba(row_text.fillna(""))
                classes = model.named_steps["clf"].classes_
                best_idx = np.argmax(proba, axis=1)
                ml_pred = pd.Series([str(classes[i]) for i in best_idx], index=out.index)
                ml_conf = pd.Series(np.max(proba, axis=1), index=out.index).astype(float).round(4)
            except Exception:
                used_model = False

        # Final decision per row.
        final_sector = out["sector"].copy()
        source = pd.Series(["existing"] * len(out), index=out.index)
        conf = pd.Series([1.0] * len(out), index=out.index, dtype=float)

        missing_mask = final_sector.isna()
        # Prefer strong rules
        rule_mask = missing_mask & (rule_conf_s >= self.rule_threshold)
        final_sector = final_sector.where(~rule_mask, rule_pred_s)
        source = source.where(~rule_mask, "rule")
        conf = conf.where(~rule_mask, rule_conf_s)

        # Then ML if available
        ml_mask = final_sector.isna() & used_model & (ml_conf >= self.ml_threshold)
        final_sector = final_sector.where(~ml_mask, ml_pred)
        source = source.where(~ml_mask, "ml")
        conf = conf.where(~ml_mask, ml_conf)

        # Fallback
        fallback_mask = final_sector.isna()
        final_sector = final_sector.where(~fallback_mask, "Other")
        source = source.where(~fallback_mask, "fallback")
        conf = conf.where(~fallback_mask, 0.4)

        # Ensure canonical.
        final_sector = final_sector.apply(lambda v: v if v in CANONICAL_SECTORS else "Other")

        out["sector"] = final_sector
        out["sector_confidence"] = conf.astype(float).round(4)
        out["sector_source"] = source.astype(str)

        # Uncertainty count
        uncertain = int((out["sector_confidence"] < 0.55).sum())
        counts = out["sector"].value_counts().to_dict()
        sector_counts = {k: int(counts.get(k, 0)) for k in CANONICAL_SECTORS}

        # Update meta-learning profiles.
        try:
            sector_texts: Dict[str, List[str]] = {}
            for sec in CANONICAL_SECTORS:
                mask = (out["sector"] == sec) & (out["sector_confidence"] >= 0.7)
                sector_texts[sec] = row_text[mask].tolist()
            self._save_profiles(sector_texts)
        except Exception:
            pass

        report = SectorClassificationReport(
            sector_counts=sector_counts,
            uncertain_rows=uncertain,
            used_model=used_model,
            rule_keywords=rules,
        )
        return out, report
