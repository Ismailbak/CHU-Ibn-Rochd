#!/usr/bin/env python3
"""
Compute accuracy, precision, recall, and F1 from human-scored Ollama E2E batch JSON.

Usage (from backend/):
    python scripts/eval_ollama_metrics.py --batch results/ollama_e2e_batch.json
    python scripts/eval_ollama_metrics.py --batch results/ollama_e2e_batch.json --json-out results/ollama_e2e_metrics.json
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.chat.rag.e2e_eval import aggregate_e2e_metrics, CRITERIA  # noqa: E402


def print_report(summary: dict) -> None:
    print("\n=== Ollama E2E Evaluation Metrics ===")
    print(f"Cases: {summary['case_count']} total, {summary['scored_case_count']} with human scores")
    print(f"Pass threshold: >= {summary['pass_threshold']}/5")
    print(f"Macro F1 (across criteria with applicable cases): {summary['macro_f1']}")

    if summary.get("mean_rubric_score_by_criterion"):
        print("\nMean rubric scores (1-5, primary quality indicator):")
        for crit, mean in summary["mean_rubric_score_by_criterion"].items():
            print(f"  {crit}: {mean:.2f}/5")

    if summary.get("pass_rate_by_criterion"):
        print("\nPass rates (human score >= threshold):")
        for crit, rate in summary["pass_rate_by_criterion"].items():
            print(f"  {crit}: {rate * 100:.1f}%")

    if summary.get("gold_all_positive_expectations"):
        print(
            "\nWARNING: Gold labels are all positive (no expected failures). "
            "Accuracy/F1 mainly measure recall on a curated set — report mean rubric scores "
            "and limitations in the thesis, not 100% F1 as model capability."
        )

    print("\nPer criterion (gold expectation vs human pass/fail):")
    for crit in CRITERIA:
        m = summary["per_criterion"].get(crit, {})
        if m.get("applicable_cases", 0) == 0:
            print(f"  {crit}: no applicable scored cases")
            continue
        print(
            f"  {crit}: accuracy={m['accuracy']:.1%} precision={m['precision']:.1%} "
            f"recall={m['recall']:.1%} F1={m['f1']:.1%} "
            f"(n={m['applicable_cases']}, TP={m['true_positive']} FP={m['false_positive']} "
            f"FN={m['false_negative']} TN={m['true_negative']})"
        )


def main() -> int:
    parser = argparse.ArgumentParser(description="Aggregate Ollama E2E human rubric metrics")
    parser.add_argument("--batch", type=Path, required=True, help="Batch JSON with human_scores filled")
    parser.add_argument("--json-out", type=Path, help="Optional path to write metrics JSON")
    parser.add_argument("--threshold", type=int, default=None, help="Override pass threshold (default: from batch)")
    args = parser.parse_args()

    if not args.batch.exists():
        print(f"Batch file not found: {args.batch}", file=sys.stderr)
        return 1

    with args.batch.open(encoding="utf-8") as f:
        batch = json.load(f)

    threshold = args.threshold or batch.get("pass_threshold", 4)
    cases = batch.get("cases", [])
    summary = aggregate_e2e_metrics(cases, pass_threshold=threshold)
    summary["batch_path"] = str(args.batch)
    summary["ollama_available_at_run"] = batch.get("ollama_available")
    summary["generated_at"] = batch.get("generated_at")

    print_report(summary)

    if args.json_out:
        args.json_out.parent.mkdir(parents=True, exist_ok=True)
        with args.json_out.open("w", encoding="utf-8") as f:
            json.dump(summary, f, indent=2)
        print(f"\nWrote {args.json_out}")

    un_scored = summary["case_count"] - summary["scored_case_count"]
    if un_scored:
        print(f"\nNote: {un_scored} case(s) still need human_scores in the batch JSON.")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
