"""
Rank and cap retrieved facts for prompt budget.
"""

import re
from datetime import datetime
from typing import List, Optional

from app.chat.rag.retrievers.structured_retriever import RetrievedFact, _query_hints
from app.core.config_rag import rag_config

SOURCE_PRIORITY = {
    "patient": 5,
    "patient_note": 5,
    "act_result": 4,
    "medical_act": 4,
    "act_note": 4,
    "appointment": 3,
    "pdf_extract": 2,
    "chat_summary": 1,
}

CLINICAL_BOOST = 6
IDENTITY_BOOST = 6
DEMOGRAPHIC_SINK_PRIORITY = 1

_RANK_STOPWORDS = {
    "the", "and", "for", "with", "patient", "patiente", "quel", "quels", "quelle",
    "est", "sont", "dans", "pour", "une", "des", "les", "du", "de", "la", "le",
}


def _keyword_overlap_score(fact: RetrievedFact, query: Optional[str]) -> int:
    if not query:
        return 0
    text = _normalize_text(fact.fact_text, fact.snippet)
    score = 0
    for token in re.findall(r"[^\W\d_]+", query.lower(), flags=re.UNICODE):
        if len(token) < 4 or token in _RANK_STOPWORDS:
            continue
        if token in text:
            score += 1
    return score


def _normalize_text(*parts: Optional[str]) -> str:
    return " ".join(p for p in parts if p).lower()


def _effective_priority(fact: RetrievedFact, hints: dict) -> int:
    """Query-aware priority: clinical facts rise, extra demographics sink."""
    base = SOURCE_PRIORITY.get(fact.source_type, 1)

    if hints.get("identity") or hints.get("gender"):
        if fact.source_type in ("patient", "patient_note"):
            return IDENTITY_BOOST

    if hints.get("case_overview"):
        return base

    if hints.get("appointment") and fact.source_type == "appointment":
        return CLINICAL_BOOST
    if hints.get("lab") and fact.source_type == "act_result":
        return CLINICAL_BOOST
    if (
        hints.get("treatment") or hints.get("diagnosis") or hints.get("act")
    ) and fact.source_type == "medical_act":
        return CLINICAL_BOOST

    if fact.source_type in ("patient", "patient_note"):
        if fact.metadata.get("patient_field") == "composite":
            return IDENTITY_BOOST if hints.get("diagnosis") else base
        return DEMOGRAPHIC_SINK_PRIORITY

    return base


def rank_and_cap_facts(
    facts: List[RetrievedFact],
    max_facts: int = None,
    query: Optional[str] = None,
) -> List[RetrievedFact]:
    """Deduplicate, score by query-aware type priority + keywords + recency, return top N."""
    if not facts:
        return []

    cap = max_facts or rag_config.MAX_TOTAL_FACTS
    hints = _query_hints(query) if query else {}
    seen = set()
    unique: List[RetrievedFact] = []

    for fact in facts:
        key = (fact.source_type, fact.source_id, fact.snippet[:80])
        if key in seen:
            continue
        seen.add(key)
        unique.append(fact)

    def sort_key(f: RetrievedFact):
        ts = f.timestamp or datetime.min
        if hasattr(ts, "tzinfo") and ts.tzinfo:
            ts = ts.replace(tzinfo=None)
        priority = _effective_priority(f, hints) if query else SOURCE_PRIORITY.get(f.source_type, 1)
        keywords = _keyword_overlap_score(f, query)
        score = f.confidence or 0.5
        return (priority, keywords, score, ts)

    unique.sort(key=sort_key, reverse=True)
    return unique[:cap]
