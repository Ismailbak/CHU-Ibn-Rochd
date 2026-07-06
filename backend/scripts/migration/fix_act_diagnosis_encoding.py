"""
Fix mojibake in act_diagnoses.diagnosis_label (UTF-8 mis-imported as Latin-1/CP437).

Usage (from backend/ on app VM, with DATABASE_URL pointing at rhumatoai):
    python -m scripts.migration.fix_act_diagnosis_encoding          # dry-run
    python -m scripts.migration.fix_act_diagnosis_encoding --commit
"""

from __future__ import annotations

import argparse

import pymysql
from sqlalchemy.engine import make_url

from app.core.config import settings
from app.core.utils.text_encoding import looks_like_mojibake, repair_utf8_mojibake
from scripts.migration.migrate_chuir import connect


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--commit", action="store_true", help="Apply updates (default: dry-run)")
    args = parser.parse_args()

    target_url = make_url(settings.DATABASE_URL)
    db = connect(target_url.database, raw_bytes=False)

    with db.cursor() as cur:
        cur.execute("SELECT id, diagnosis_label FROM act_diagnoses")
        rows = cur.fetchall()

    updates: list[tuple[str, int]] = []
    for row in rows:
        label = row["diagnosis_label"]
        if not label or not looks_like_mojibake(label):
            continue
        fixed = repair_utf8_mojibake(label)
        if fixed and fixed != label:
            updates.append((fixed, row["id"]))

    print(f"Scanned {len(rows)} rows, {len(updates)} need repair.")
    for fixed, row_id in updates[:10]:
        print(f"  id={row_id}: {fixed!r}")
    if len(updates) > 10:
        print(f"  ... and {len(updates) - 10} more")

    if args.commit and updates:
        with db.cursor() as cur:
            cur.executemany(
                "UPDATE act_diagnoses SET diagnosis_label = %s WHERE id = %s",
                updates,
            )
        db.commit()
        print(f"Updated {len(updates)} rows.")
    elif not args.commit:
        print("Dry-run only. Pass --commit to apply.")

    db.close()


if __name__ == "__main__":
    main()
