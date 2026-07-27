"""
Backfill act_diagnoses.diagnosis_label from chuir_source.w104_local_diag.

The initial import used ref_diag (empty); labels were stored as "Non précisé".
This script updates smarthos in place from the legacy lookup table.

Usage (from backend/):
    python -m scripts.migration.backfill_diagnosis_labels          # dry-run counts
    python -m scripts.migration.backfill_diagnosis_labels --commit
"""

from __future__ import annotations

import argparse
import os

import pymysql
from sqlalchemy.engine import make_url

from app.core.config import settings
from scripts.migration.migrate_chuir import SOURCE_DB, clean_str, connect

SKIP_NOTES = {"aucun", "none", "n/a", ""}


def resolve_label(diag_by_id: dict, id_diag: int, dg_note: str | None) -> str:
    label = clean_str(diag_by_id.get(id_diag), 255)
    if label:
        return label
    note = clean_str(dg_note, 255)
    if note and note.lower() not in SKIP_NOTES:
        return note
    return "Non précisé"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--commit", action="store_true", help="Apply updates (default: dry-run)")
    args = parser.parse_args()

    target_url = make_url(settings.DATABASE_URL)
    src = connect(SOURCE_DB, raw_bytes=True)
    dst = connect(target_url.database, raw_bytes=False)

    with src.cursor() as cur:
        cur.execute("SELECT IDdiag, diag_name FROM w104_local_diag")
        diag_by_id = {r["IDdiag"]: r["diag_name"] for r in cur.fetchall()}
        cur.execute("SELECT IDdg, IDdiag, dg_note FROM actdg")
        legacy_rows = cur.fetchall()

    updates = []
    for r in legacy_rows:
        label = resolve_label(diag_by_id, r["IDdiag"], r.get("dg_note"))
        updates.append((label, r["IDdg"]))

    with dst.cursor() as cur:
        cur.execute(
            "SELECT diagnosis_label, COUNT(*) FROM act_diagnoses GROUP BY diagnosis_label ORDER BY COUNT(*) DESC LIMIT 5"
        )
        print("Before (top labels):", cur.fetchall())

    if args.commit:
        with dst.cursor() as cur:
            cur.executemany(
                "UPDATE act_diagnoses SET diagnosis_label = %s WHERE id = %s",
                updates,
            )
        dst.commit()
        print(f"Updated {len(updates)} act_diagnoses rows.")
    else:
        print(f"Dry-run: would update {len(updates)} rows. Pass --commit to apply.")

    with dst.cursor() as cur:
        cur.execute(
            "SELECT diagnosis_label, COUNT(*) FROM act_diagnoses GROUP BY diagnosis_label ORDER BY COUNT(*) DESC LIMIT 8"
        )
        rows = cur.fetchall()
        print("After (top labels):")
        for row in rows:
            print(f"  {row['COUNT(*)']}: {row['diagnosis_label']}")

    src.close()
    dst.close()


if __name__ == "__main__":
    main()
