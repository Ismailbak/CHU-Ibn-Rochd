#!/usr/bin/env python3
"""
Run structured RAG retrieval evaluation against live MySQL (no Ollama).

Usage (from backend/):
    python scripts/eval_retrieval_metrics.py
    python scripts/eval_retrieval_metrics.py --json-out results/retrieval_metrics.json
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.chat.rag.retrieval_eval import (  # noqa: E402
    aggregate_metrics,
    evaluate_case,
    load_gold_set,
    rank_retrieved_facts,
)
from app.chat.rag.retrievers.structured_retriever import StructuredRetrievalPipeline  # noqa: E402
from app.core.database import SessionLocal  # noqa: E402
from app.patients.service import PatientService  # noqa: E402

DEFAULT_GOLD = BACKEND_ROOT / "tests" / "fixtures" / "rag_retrieval_gold.json"


async def run_evaluation(gold_path: Path) -> dict:
    gold = load_gold_set(gold_path)
    k_values = gold.get("k_values", [5, 10])
    default_user_id = gold.get("default_user_id", 1)

    db = SessionLocal()
    try:
        patient_service = PatientService(db)
        pipeline = StructuredRetrievalPipeline(db, patient_service)
        case_results = []

        for case in gold["cases"]:
            user_id = case.get("user_id", default_user_id)
            patient_id = case.get("patient_id")
            raw = await pipeline.retrieve_with_authorization(
                case["query"],
                patient_id=patient_id,
                user_id=user_id,
            )
            ranked = rank_retrieved_facts(raw)
            case_results.append(
                evaluate_case(ranked, case, k_values, raw_count=len(raw))
            )

        summary = aggregate_metrics(case_results, k_values)
        return {
            "gold_path": str(gold_path),
            "summary": summary,
            "cases": [r.to_dict() for r in case_results],
        }
    finally:
        db.close()


def print_report(report: dict) -> None:
    summary = report["summary"]
    print("\n=== Structured RAG Retrieval Evaluation ===")
    print(f"Gold set: {report['gold_path']}")
    print(f"Cases: {summary.get('case_count', 0)}")
    for key in sorted(summary.keys()):
        if key.startswith(("accuracy", "hit_rate", "mean_precision", "mean_recall")):
            print(f"  {key}: {summary[key]}")


def main() -> int:
    parser = argparse.ArgumentParser(description="Evaluate structured RAG retrieval metrics")
    parser.add_argument(
        "--gold",
        type=Path,
        default=DEFAULT_GOLD,
        help="Path to rag_retrieval_gold.json",
    )
    parser.add_argument("--json-out", type=Path, help="Write full report JSON to this path")
    args = parser.parse_args()

    if not args.gold.exists():
        print(f"Gold set not found: {args.gold}", file=sys.stderr)
        return 1

    report = asyncio.run(run_evaluation(args.gold))
    print_report(report)

    if args.json_out:
        args.json_out.parent.mkdir(parents=True, exist_ok=True)
        with args.json_out.open("w", encoding="utf-8") as f:
            json.dump(report, f, indent=2, ensure_ascii=False)
        print(f"\nWrote {args.json_out}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
