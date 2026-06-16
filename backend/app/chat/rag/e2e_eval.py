"""
End-to-end Ollama response evaluation helpers (human rubric → classification metrics).

Workflow:
  1. eval_ollama_batch.py — run cases through live API + Ollama, write JSON
  2. Human fills human_scores (1–5) per criterion in the JSON
  3. eval_ollama_metrics.py — compare scores (pass if >= threshold) to gold expectations
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence


CRITERIA = (
    "correctness",
    "relevance",
    "grounding",
    "uncertainty_handling",
    "safety",
)


@dataclass
class CriterionMetrics:
    name: str
    applicable: int = 0
    true_positive: int = 0
    false_positive: int = 0
    true_negative: int = 0
    false_negative: int = 0

    def precision(self) -> float:
        denom = self.true_positive + self.false_positive
        return self.true_positive / denom if denom else 0.0

    def recall(self) -> float:
        denom = self.true_positive + self.false_negative
        return self.true_positive / denom if denom else 0.0

    def f1(self) -> float:
        p, r = self.precision(), self.recall()
        return 2 * p * r / (p + r) if (p + r) else 0.0

    def accuracy(self) -> float:
        total = self.applicable
        if not total:
            return 0.0
        correct = self.true_positive + self.true_negative
        return correct / total

    def to_dict(self) -> Dict[str, Any]:
        return {
            "applicable_cases": self.applicable,
            "true_positive": self.true_positive,
            "false_positive": self.false_positive,
            "true_negative": self.true_negative,
            "false_negative": self.false_negative,
            "accuracy": round(self.accuracy(), 4),
            "precision": round(self.precision(), 4),
            "recall": round(self.recall(), 4),
            "f1": round(self.f1(), 4),
        }


def load_gold_set(path: Path) -> Dict[str, Any]:
    with path.open(encoding="utf-8") as f:
        return json.load(f)


def score_to_pass(score: Optional[int], threshold: int = 4) -> Optional[bool]:
    if score is None:
        return None
    return score >= threshold


def compute_criterion_metrics(
    cases: Sequence[Dict[str, Any]],
    criterion: str,
    pass_threshold: int = 4,
) -> CriterionMetrics:
    metrics = CriterionMetrics(name=criterion)
    for case in cases:
        gold = case.get("gold") or {}
        expected = gold.get(criterion)
        if expected is None:
            continue

        human = case.get("human_scores") or {}
        predicted_pass = score_to_pass(human.get(criterion), pass_threshold)
        if predicted_pass is None:
            continue

        metrics.applicable += 1
        expected_bool = bool(expected)
        if expected_bool and predicted_pass:
            metrics.true_positive += 1
        elif not expected_bool and predicted_pass:
            metrics.false_positive += 1
        elif expected_bool and not predicted_pass:
            metrics.false_negative += 1
        else:
            metrics.true_negative += 1

    return metrics


def aggregate_e2e_metrics(
    cases: Sequence[Dict[str, Any]],
    pass_threshold: int = 4,
    criteria: Sequence[str] = CRITERIA,
) -> Dict[str, Any]:
    per_criterion = {
        c: compute_criterion_metrics(cases, c, pass_threshold).to_dict()
        for c in criteria
    }

    scored_cases = [
        c
        for c in cases
        if c.get("human_scores")
        and any((c.get("human_scores") or {}).get(crit) is not None for crit in criteria)
    ]

    pass_rates: Dict[str, float] = {}
    for crit in criteria:
        scores = [
            score_to_pass((c.get("human_scores") or {}).get(crit), pass_threshold)
            for c in scored_cases
            if (c.get("human_scores") or {}).get(crit) is not None
        ]
        if scores:
            pass_rates[crit] = round(sum(1 for s in scores if s) / len(scores), 4)

    macro_f1 = 0.0
    f1_vals = [per_criterion[c]["f1"] for c in criteria if per_criterion[c]["applicable_cases"]]
    if f1_vals:
        macro_f1 = round(sum(f1_vals) / len(f1_vals), 4)

    mean_rubric: Dict[str, float] = {}
    for crit in criteria:
        values = [
            (c.get("human_scores") or {}).get(crit)
            for c in cases
            if (c.get("human_scores") or {}).get(crit) is not None
        ]
        if values:
            mean_rubric[crit] = round(sum(values) / len(values), 3)

    gold_positive_only = all(
        (c.get("gold") or {}).get(crit) is not False
        for c in cases
        for crit in criteria
        if (c.get("gold") or {}).get(crit) is not None
    )

    return {
        "pass_threshold": pass_threshold,
        "case_count": len(cases),
        "scored_case_count": len(scored_cases),
        "pass_rate_by_criterion": pass_rates,
        "mean_rubric_score_by_criterion": mean_rubric,
        "macro_f1": macro_f1,
        "per_criterion": per_criterion,
        "gold_all_positive_expectations": gold_positive_only,
    }


@dataclass
class BatchCaseResult:
    case_id: str
    query: str
    mode: str
    patient_id: Optional[int]
    user_id: int
    success: bool
    error: Optional[str] = None
    response_text: Optional[str] = None
    model: Optional[str] = None
    confidence: Optional[str] = None
    source_count: int = 0
    warnings: List[str] = field(default_factory=list)
    retrieval_type: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "case_id": self.case_id,
            "query": self.query,
            "mode": self.mode,
            "patient_id": self.patient_id,
            "user_id": self.user_id,
            "success": self.success,
            "error": self.error,
            "response_text": self.response_text,
            "model": self.model,
            "confidence": self.confidence,
            "source_count": self.source_count,
            "warnings": self.warnings,
            "retrieval_type": self.retrieval_type,
            "human_scores": {
                "correctness": None,
                "relevance": None,
                "grounding": None,
                "uncertainty_handling": None,
                "safety": None,
                "comments": "",
            },
        }
