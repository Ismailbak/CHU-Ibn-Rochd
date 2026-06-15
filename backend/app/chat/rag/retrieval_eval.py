"""
Structured retrieval evaluation helpers (no LLM).
Used by scripts/eval_retrieval_metrics.py and integration tests.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence

from app.chat.rag.fact_ranking import rank_and_cap_facts
from app.chat.rag.retrievers.structured_retriever import RetrievedFact


def _normalize_text(*parts: Optional[str]) -> str:
    return " ".join(p for p in parts if p).lower()


def fact_is_relevant(
    fact: RetrievedFact,
    relevant_source_types: Optional[Sequence[str]] = None,
    must_include_keywords: Optional[Sequence[str]] = None,
) -> bool:
    if relevant_source_types and fact.source_type not in relevant_source_types:
        return False
    if must_include_keywords:
        text = _normalize_text(fact.fact_text, fact.snippet)
        if not any(kw.lower() in text for kw in must_include_keywords):
            return False
    return True


def precision_at_k(
    facts: List[RetrievedFact],
    k: int,
    relevant_source_types: Optional[Sequence[str]] = None,
    must_include_keywords: Optional[Sequence[str]] = None,
) -> float:
    top = facts[:k]
    if not top:
        return 0.0
    relevant = sum(
        1
        for f in top
        if fact_is_relevant(f, relevant_source_types, must_include_keywords)
    )
    return relevant / len(top)


def recall_at_k(
    facts: List[RetrievedFact],
    k: int,
    required_source_types: Optional[Sequence[str]] = None,
) -> float:
    if not required_source_types:
        return 1.0
    top = facts[:k]
    found = {f.source_type for f in top}
    required = set(required_source_types)
    return len(found & required) / len(required)


def hit_at_k(
    facts: List[RetrievedFact],
    k: int,
    relevant_source_types: Optional[Sequence[str]] = None,
    must_include_keywords: Optional[Sequence[str]] = None,
) -> bool:
    return any(
        fact_is_relevant(f, relevant_source_types, must_include_keywords)
        for f in facts[:k]
    )


def case_is_correct_at_k(
    ranked_facts: List[RetrievedFact],
    k: int,
    *,
    expect_empty: bool = False,
    expect_miss: bool = False,
    required_source_types: Optional[Sequence[str]] = None,
) -> bool:
    """
    Case-level accuracy: did retrieval match the expected outcome?

    - expect_empty: no facts in top-k (authorization / invalid patient)
    - expect_miss: required types absent in top-k (e.g. lab rows missing in DB)
    - otherwise: all required source types present in top-k (recall@k = 1.0)
    """
    if expect_empty:
        return len(ranked_facts[:k]) == 0
    if expect_miss:
        return recall_at_k(ranked_facts, k, required_source_types) == 0.0
    return recall_at_k(ranked_facts, k, required_source_types) == 1.0


@dataclass
class CaseResult:
    case_id: str
    query: str
    patient_id: Optional[int]
    raw_count: int
    ranked_count: int
    expect_empty: bool
    hit_at_k: Dict[int, bool] = field(default_factory=dict)
    precision_at_k: Dict[int, float] = field(default_factory=dict)
    recall_at_k: Dict[int, float] = field(default_factory=dict)
    correct_at_k: Dict[int, bool] = field(default_factory=dict)
    top_source_types: List[str] = field(default_factory=list)
    notes: Optional[str] = None
    expect_miss: bool = False

    def to_dict(self) -> Dict[str, Any]:
        return {
            "case_id": self.case_id,
            "query": self.query,
            "patient_id": self.patient_id,
            "raw_count": self.raw_count,
            "ranked_count": self.ranked_count,
            "expect_empty": self.expect_empty,
            "hit_at_k": self.hit_at_k,
            "precision_at_k": self.precision_at_k,
            "recall_at_k": self.recall_at_k,
            "correct_at_k": self.correct_at_k,
            "top_source_types": self.top_source_types,
            "notes": self.notes,
            "expect_miss": self.expect_miss,
        }


def evaluate_case(
    ranked_facts: List[RetrievedFact],
    case: Dict[str, Any],
    k_values: Sequence[int],
    raw_count: int = 0,
) -> CaseResult:
    expect_empty = bool(case.get("expect_empty"))
    relevant_types = case.get("relevant_source_types")
    required_types = case.get("required_source_types")
    keywords = case.get("must_include_keywords")

    result = CaseResult(
        case_id=case["id"],
        query=case["query"],
        patient_id=case.get("patient_id"),
        raw_count=raw_count,
        ranked_count=len(ranked_facts),
        expect_empty=expect_empty,
        top_source_types=[f.source_type for f in ranked_facts[:5]],
        notes=case.get("notes"),
        expect_miss=bool(case.get("expect_miss")),
    )

    for k in k_values:
        if expect_empty:
            empty = len(ranked_facts[:k]) == 0
            result.hit_at_k[k] = empty
            result.precision_at_k[k] = 1.0 if empty else 0.0
            result.recall_at_k[k] = 1.0 if empty else 0.0
        else:
            result.hit_at_k[k] = hit_at_k(ranked_facts, k, relevant_types, keywords)
            result.precision_at_k[k] = precision_at_k(
                ranked_facts, k, relevant_types, keywords
            )
            result.recall_at_k[k] = recall_at_k(ranked_facts, k, required_types)

        result.correct_at_k[k] = case_is_correct_at_k(
            ranked_facts,
            k,
            expect_empty=expect_empty,
            expect_miss=result.expect_miss,
            required_source_types=required_types,
        )

    return result


def aggregate_metrics(
    case_results: List[CaseResult], k_values: Sequence[int]
) -> Dict[str, Any]:
    if not case_results:
        return {}

    summary: Dict[str, Any] = {"k_values": list(k_values), "case_count": len(case_results)}
    for k in k_values:
        hits = [r.hit_at_k[k] for r in case_results]
        precs = [r.precision_at_k[k] for r in case_results]
        recs = [r.recall_at_k[k] for r in case_results]
        correct = [r.correct_at_k[k] for r in case_results]
        summary[f"accuracy@{k}"] = round(sum(correct) / len(correct), 3)
        summary[f"hit_rate@{k}"] = round(sum(hits) / len(hits), 3)
        summary[f"mean_precision@{k}"] = round(sum(precs) / len(precs), 3)
        summary[f"mean_recall@{k}"] = round(sum(recs) / len(recs), 3)

    clinical = [
        r for r in case_results if not r.expect_empty and not r.expect_miss
    ]
    if clinical:
        for k in k_values:
            hits = [r.hit_at_k[k] for r in clinical]
            precs = [r.precision_at_k[k] for r in clinical]
            recs = [r.recall_at_k[k] for r in clinical]
            correct = [r.correct_at_k[k] for r in clinical]
            summary[f"accuracy@{k}_clinical_only"] = round(sum(correct) / len(correct), 3)
            summary[f"hit_rate@{k}_clinical_only"] = round(sum(hits) / len(hits), 3)
            summary[f"mean_precision@{k}_clinical_only"] = round(sum(precs) / len(precs), 3)
            summary[f"mean_recall@{k}_clinical_only"] = round(sum(recs) / len(recs), 3)

    return summary


def load_gold_set(path: Path) -> Dict[str, Any]:
    with path.open(encoding="utf-8") as f:
        return json.load(f)


def rank_retrieved_facts(facts: List[RetrievedFact]) -> List[RetrievedFact]:
    return rank_and_cap_facts(facts)
