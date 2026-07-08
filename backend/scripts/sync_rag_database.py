#!/usr/bin/env python3
"""
Sync clinical data from primary DB to secondary DB for RAG.

Usage (on app VM with env loaded):
    python -m scripts.sync_rag_database
    python -m scripts.sync_rag_database --init-schema
"""

from __future__ import annotations

import argparse
import sys

from app.core.database import SessionLocal, RAGSessionLocal
from app.core.config import settings
from app.sync.rag_sync import sync_primary_to_secondary


def main() -> int:
    parser = argparse.ArgumentParser(description="Sync primary → secondary for RAG")
    parser.add_argument(
        "--init-schema",
        action="store_true",
        help="Create RAG tables on secondary before syncing",
    )
    args = parser.parse_args()

    if not settings.use_rag_secondary:
        print(
            "RAG_DATABASE_URL is not set or equals DATABASE_URL — nothing to sync.",
            file=sys.stderr,
        )
        return 1

    print(f"Primary:   {settings.DATABASE_URL.split('@')[-1]}")
    print(f"Secondary: {settings.rag_database_url.split('@')[-1]}")

    stats = sync_primary_to_secondary(
        SessionLocal,
        RAGSessionLocal,
        init_schema=args.init_schema,
    )

    for row in stats:
        print(f"  {row.table}: {row.rows} rows")
    print("Sync complete.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
