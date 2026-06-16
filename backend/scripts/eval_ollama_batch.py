#!/usr/bin/env python3
"""
Run end-to-end Ollama evaluation cases (live DB + Ollama required).

Usage (from backend/):
    python scripts/eval_ollama_batch.py
    python scripts/eval_ollama_batch.py --gold tests/fixtures/ollama_e2e_gold.json
    python scripts/eval_ollama_batch.py --limit 2 --timeout 120
    python scripts/eval_ollama_batch.py --json-out results/ollama_e2e_batch.json

After the run, open the JSON and fill human_scores (1-5) for each case, then:
    python scripts/eval_ollama_metrics.py --batch results/ollama_e2e_batch.json
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

BACKEND_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_GOLD = BACKEND_ROOT / "tests" / "fixtures" / "ollama_e2e_gold.json"

# Reduce noisy HF/tokenizer warnings before any heavy imports.
os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")
os.environ.setdefault("TRANSFORMERS_NO_ADVISORY_WARNINGS", "1")
os.environ.setdefault("RAG_SEMANTIC_ENABLED", "false")


def _ensure_backend_on_path() -> None:
    if str(BACKEND_ROOT) not in sys.path:
        sys.path.insert(0, str(BACKEND_ROOT))


def _load_app_modules() -> dict[str, Any]:
    """Import app code lazily so argparse/--help stays fast."""
    _ensure_backend_on_path()
    print("Loading app modules (DB, RAG, Ollama)...", flush=True)
    t0 = time.perf_counter()
    from app.chat.rag.e2e_eval import BatchCaseResult, load_gold_set
    from app.chat.rag.chat_service import get_grounded_chat_response
    from app.chat.service import get_chat_response
    from app.core.database import SessionLocal
    from app.models.llm import llm

    elapsed = time.perf_counter() - t0
    print(f"  Modules loaded in {elapsed:.1f}s", flush=True)
    return {
        "BatchCaseResult": BatchCaseResult,
        "load_gold_set": load_gold_set,
        "get_grounded_chat_response": get_grounded_chat_response,
        "get_chat_response": get_chat_response,
        "SessionLocal": SessionLocal,
        "llm": llm,
    }


async def _run_grounded(
    modules: dict[str, Any],
    db,
    query: str,
    user_id: int,
    patient_id: int | None,
) -> dict:
    get_grounded = modules["get_grounded_chat_response"]
    return await get_grounded(
        message=query,
        user_id=user_id,
        db=db,
        patient_id=patient_id,
        language="fr",
    )


async def _run_plain(
    modules: dict[str, Any],
    db,
    query: str,
    user_id: int,
    patient_id: int | None,
) -> dict:
    get_chat = modules["get_chat_response"]
    return await asyncio.to_thread(
        get_chat,
        message=query,
        user_id=user_id,
        db=db,
        patient_id=patient_id,
        language="fr",
    )


async def run_case(
    modules: dict[str, Any],
    db,
    case: dict,
    default_user_id: int,
    timeout_seconds: int,
) -> dict:
    BatchCaseResult = modules["BatchCaseResult"]
    case_id = case["id"]
    query = case["query"]
    mode = case.get("mode", "grounded")
    patient_id = case.get("patient_id")
    user_id = case.get("user_id", default_user_id)

    result = BatchCaseResult(
        case_id=case_id,
        query=query,
        mode=mode,
        patient_id=patient_id,
        user_id=user_id,
        success=False,
    )

    try:
        if mode == "grounded":
            runner: Callable = lambda: _run_grounded(modules, db, query, user_id, patient_id)
        elif mode == "plain":
            runner = lambda: _run_plain(modules, db, query, user_id, patient_id)
        else:
            result.error = f"Unknown mode: {mode}"
            return result.to_dict()

        out = await asyncio.wait_for(runner(), timeout=timeout_seconds)

        if mode == "grounded":
            result.response_text = out.get("response") or out.get("message")
            result.model = out.get("model")
            result.confidence = out.get("confidence")
            result.source_count = len(out.get("sources") or [])
            result.warnings = list(out.get("warnings") or [])
            result.retrieval_type = out.get("retrieval_type")
        else:
            result.response_text = out.get("response")
            result.model = out.get("model")

        result.success = bool(result.response_text)
        if not result.success:
            result.error = "Empty response from API"
    except asyncio.TimeoutError:
        result.error = f"Timed out after {timeout_seconds}s"
    except Exception as exc:
        result.error = str(exc)

    row = result.to_dict()
    row["gold"] = case.get("gold")
    row["notes"] = case.get("notes")
    return row


def _filter_cases(cases: list[dict], case_ids: list[str] | None, limit: int | None) -> list[dict]:
    filtered = cases
    if case_ids:
        wanted = set(case_ids)
        filtered = [c for c in filtered if c["id"] in wanted]
        missing = wanted - {c["id"] for c in filtered}
        if missing:
            print(f"WARNING: case id(s) not in gold set: {', '.join(sorted(missing))}", file=sys.stderr)
    if limit is not None:
        filtered = filtered[:limit]
    return filtered


def _merge_existing(existing: dict | None, new_cases: list[dict]) -> list[dict]:
    if not existing:
        return new_cases
    by_id = {c["case_id"]: c for c in existing.get("cases", [])}
    merged: list[dict] = []
    for row in new_cases:
        prev = by_id.get(row["case_id"])
        if prev and prev.get("success") and prev.get("response_text") and not row.get("success"):
            prev = dict(prev)
            prev["gold"] = row.get("gold")
            prev["notes"] = row.get("notes")
            merged.append(prev)
        else:
            merged.append(row)
    return merged


async def run_batch(
    modules: dict[str, Any],
    gold_path: Path,
    timeout_seconds: int,
    case_ids: list[str] | None,
    limit: int | None,
    resume_path: Path | None,
) -> dict:
    load_gold_set = modules["load_gold_set"]
    SessionLocal = modules["SessionLocal"]
    llm = modules["llm"]

    gold = load_gold_set(gold_path)
    default_user_id = gold.get("default_user_id", 1)
    cases = _filter_cases(gold["cases"], case_ids, limit)
    total = len(cases)

    existing_report: dict | None = None
    if resume_path and resume_path.exists():
        with resume_path.open(encoding="utf-8") as f:
            existing_report = json.load(f)
        print(f"Resuming: will keep successful rows from {resume_path}", flush=True)

    print(f"Running {total} case(s) (timeout {timeout_seconds}s each)...", flush=True)
    db = SessionLocal()
    results: list[dict] = []
    try:
        for index, case in enumerate(cases, start=1):
            label = f"[{index}/{total}] {case['id']} ({case.get('mode', 'grounded')})"
            print(f"  {label} ...", end="", flush=True)
            t0 = time.perf_counter()
            row = await run_case(modules, db, case, default_user_id, timeout_seconds)
            elapsed = time.perf_counter() - t0
            status = "OK" if row.get("success") else "FAIL"
            detail = ""
            if row.get("error"):
                detail = f" — {row['error'][:120]}"
            elif row.get("response_text"):
                detail = f" — {len(row['response_text'])} chars"
            print(f" {status} ({elapsed:.1f}s){detail}", flush=True)
            results.append(row)
    finally:
        db.close()

    merged = _merge_existing(existing_report, results)
    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "gold_path": str(gold_path),
        "ollama_available": llm.is_available,
        "pass_threshold": gold.get("pass_threshold", 4),
        "timeout_seconds": timeout_seconds,
        "cases": merged,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Batch run Ollama E2E evaluation cases")
    parser.add_argument("--gold", type=Path, default=DEFAULT_GOLD)
    parser.add_argument(
        "--json-out",
        type=Path,
        default=BACKEND_ROOT / "results" / "ollama_e2e_batch.json",
    )
    parser.add_argument(
        "--timeout",
        type=int,
        default=120,
        help="Per-case timeout in seconds (default: 120)",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Run only the first N cases (after --case-id filter)",
    )
    parser.add_argument(
        "--case-id",
        action="append",
        dest="case_ids",
        metavar="ID",
        help="Run only this case id (repeatable)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="List cases that would run, without calling DB/Ollama",
    )
    parser.add_argument(
        "--continue",
        dest="resume",
        action="store_true",
        help="Keep successful rows from existing --json-out when re-running",
    )
    parser.add_argument(
        "--skip-ollama-check",
        action="store_true",
        help="Skip Ollama /api/tags preflight (still attempts generation)",
    )
    args = parser.parse_args()

    if not args.gold.exists():
        print(f"Gold set not found: {args.gold}", file=sys.stderr)
        return 1

    _ensure_backend_on_path()
    from app.chat.rag.e2e_eval import load_gold_set

    gold = load_gold_set(args.gold)
    cases = _filter_cases(gold["cases"], args.case_ids, args.limit)

    if args.dry_run:
        print(f"Dry run: {len(cases)} case(s) from {args.gold}")
        for case in cases:
            print(f"  - {case['id']} mode={case.get('mode', 'grounded')} patient_id={case.get('patient_id')}")
        return 0

    modules = _load_app_modules()
    llm = modules["llm"]

    if not args.skip_ollama_check:
        print("Checking Ollama availability...", flush=True)
        t0 = time.perf_counter()
        llm.load()
        print(f"  Ollama check finished in {time.perf_counter() - t0:.1f}s (available={llm.is_available})", flush=True)
        if not llm.is_available:
            print(
                "WARNING: Ollama health check failed. Cases may return errors or time out.",
                file=sys.stderr,
            )

    resume_path = args.json_out if args.resume else None
    report = asyncio.run(
        run_batch(
            modules,
            args.gold,
            timeout_seconds=args.timeout,
            case_ids=args.case_ids,
            limit=args.limit,
            resume_path=resume_path,
        )
    )

    args.json_out.parent.mkdir(parents=True, exist_ok=True)
    with args.json_out.open("w", encoding="utf-8") as f:
        json.dump(report, f, indent=2, ensure_ascii=False)

    ok = sum(1 for c in report["cases"] if c.get("success"))
    print(f"\nDone: {ok}/{len(report['cases'])} cases returned a response")
    print(f"Wrote {args.json_out}")
    print("Next: fill human_scores (1-5) in the JSON, then run eval_ollama_metrics.py")
    return 0 if ok == len(report["cases"]) else 2


if __name__ == "__main__":
    raise SystemExit(main())
