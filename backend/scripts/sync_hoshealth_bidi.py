#!/usr/bin/env python3
"""
Bidirectional clinical sync: hoshealth (legacy) ↔ rhumatoai (primary).

Requires env (typically /etc/ia-medical/env on the app VM):
  CHUIR_SOURCE_HOST=10.10.10.2
  CHUIR_SOURCE_USER=hoshealth_smart3
  CHUIR_SOURCE_PASSWORD=...
  CHUIR_SOURCE_DB=hoshealth
  DATABASE_URL=mysql+pymysql://...@10.10.10.5:3306/rhumatoai

Usage (from backend/ with venv):
  python -m scripts.sync_hoshealth_bidi           # dry-run (rollback)
  python -m scripts.sync_hoshealth_bidi --commit # apply both sides

Cron (every 10 min, then RAG secondary sync):
  */10 * * * * set -a && source /etc/ia-medical/env && set +a && \\
    cd /opt/ia-medical/backend && .venv/bin/python -m scripts.sync_hoshealth_bidi --commit \\
    >> /opt/ia-medical/logs/hoshealth-bidi.log 2>&1
"""

from __future__ import annotations

import argparse
import sys

from app.core.config import settings
from app.sync.hoshealth_bidi import run_bidi_sync


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Bidirectional sync hoshealth ↔ rhumatoai (last-write-wins)"
    )
    parser.add_argument(
        "--commit",
        action="store_true",
        help="Write changes (default: dry-run / rollback)",
    )
    args = parser.parse_args()

    if not settings.chu_ir_source_configured:
        print(
            "Missing CHUIR_SOURCE_HOST / CHUIR_SOURCE_USER "
            "(and usually CHUIR_SOURCE_PASSWORD).",
            file=sys.stderr,
        )
        return 1

    mode = "COMMIT" if args.commit else "DRY-RUN"
    print(
        f"=== hoshealth bidi [{mode}] "
        f"{settings.CHUIR_SOURCE_HOST}/{settings.CHUIR_SOURCE_DB} "
        f"<-> {settings.DATABASE_URL.split('@')[-1]} ==="
    )

    try:
        reports = run_bidi_sync(commit=args.commit)
    except Exception as exc:  # noqa: BLE001
        import traceback

        print(f"[ERROR] {type(exc).__name__}: {exc}", file=sys.stderr)
        traceback.print_exc()
        return 1

    for rep in reports:
        c = rep.counters
        print(
            f"  {rep.entity}: pulled={c.pulled} pushed={c.pushed} deleted={c.deleted} "
            f"skipped={c.skipped} conflicts_legacy_win={c.conflicts_legacy} "
            f"conflicts_app_win={c.conflicts_app}"
        )

    if args.commit:
        print("[COMMITTED] Both databases updated.")
    else:
        print("[ROLLED BACK] Dry-run only — re-run with --commit to apply.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
