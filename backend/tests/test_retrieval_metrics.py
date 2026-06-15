"""
Integration tests for structured retrieval metrics (live DB).
Skipped when DATABASE_URL is unavailable.
"""

import asyncio
from pathlib import Path

import pytest

from app.chat.rag.retrieval_eval import (
    aggregate_metrics,
    case_is_correct_at_k,
    evaluate_case,
    fact_is_relevant,
    load_gold_set,
    precision_at_k,
    rank_retrieved_facts,
    recall_at_k,
)
from app.chat.rag.retrievers.structured_retriever import RetrievedFact, StructuredRetrievalPipeline
from sqlalchemy import text

from app.core.database import SessionLocal
from app.patients.service import PatientService

GOLD_PATH = Path(__file__).resolve().parent / "fixtures" / "rag_retrieval_gold.json"


def _db_available() -> bool:
    try:
        db = SessionLocal()
        db.execute(text("SELECT 1"))
        db.close()
        return True
    except Exception:
        return False


pytestmark = pytest.mark.skipif(not _db_available(), reason="MySQL not available")


class TestRetrievalMetricHelpers:
    def test_fact_is_relevant_with_keywords(self):
        fact = RetrievedFact(
            source_type="patient",
            source_id=1,
            fact_text="Patient: Soukaina AGHLALOU (IPP: P018874)",
            snippet="Soukaina AGHLALOU",
        )
        assert fact_is_relevant(fact, ["patient"], ["AGHLALOU"])
        assert not fact_is_relevant(fact, ["patient"], ["NOUREDDINE"])

    def test_case_accuracy_at_k(self):
        facts = [
            RetrievedFact(source_type="patient", source_id=1, fact_text="a", snippet="a"),
            RetrievedFact(source_type="medical_act", source_id=2, fact_text="b", snippet="b"),
        ]
        assert case_is_correct_at_k(facts, 2, required_source_types=["patient", "medical_act"])
        assert not case_is_correct_at_k(facts, 2, required_source_types=["appointment"])
        assert case_is_correct_at_k([], 5, expect_empty=True)
        assert case_is_correct_at_k(facts, 5, expect_miss=True, required_source_types=["act_result"])

    def test_precision_and_recall_at_k(self):
        facts = [
            RetrievedFact(source_type="patient", source_id=1, fact_text="a", snippet="a"),
            RetrievedFact(source_type="medical_act", source_id=2, fact_text="b", snippet="b"),
            RetrievedFact(source_type="appointment", source_id=3, fact_text="c", snippet="c"),
        ]
        assert precision_at_k(facts, 3, ["medical_act", "appointment"]) == pytest.approx(2 / 3)
        assert recall_at_k(facts, 3, ["patient", "medical_act"]) == pytest.approx(1.0)


@pytest.mark.asyncio
async def test_gold_set_retrieval_metrics():
    gold = load_gold_set(GOLD_PATH)
    k_values = gold.get("k_values", [5, 10])
    default_user_id = gold.get("default_user_id", 1)

    db = SessionLocal()
    try:
        pipeline = StructuredRetrievalPipeline(db, PatientService(db))
        results = []
        for case in gold["cases"]:
            raw = await pipeline.retrieve_with_authorization(
                case["query"],
                patient_id=case.get("patient_id"),
                user_id=case.get("user_id", default_user_id),
            )
            ranked = rank_retrieved_facts(raw)
            results.append(evaluate_case(ranked, case, k_values, raw_count=len(raw)))

        summary = aggregate_metrics(results, k_values)

        # Clinical lookups should retrieve required types within top-10
        clinical = [
            r for r in results if not r.expect_empty and not r.expect_miss
        ]
        assert all(r.recall_at_k[10] >= 0.5 for r in clinical), [
            (r.case_id, r.recall_at_k[10]) for r in clinical if r.recall_at_k[10] < 0.5
        ]

        assert summary["accuracy@10"] >= 0.9
        assert summary["accuracy@10_clinical_only"] >= 0.85
        assert summary["mean_recall@10_clinical_only"] >= 0.85

        lab = next(r for r in results if r.case_id == "lab_3")
        assert not lab.hit_at_k[10]

        # Authorization / invalid patient must return empty
        for case_id in ("invalid_patient", "unauthorized_user"):
            row = next(r for r in results if r.case_id == case_id)
            assert row.ranked_count == 0
            assert row.hit_at_k[5]
    finally:
        db.close()
