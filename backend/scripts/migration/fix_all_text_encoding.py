"""
Fix mojibake in all user-visible text columns across the rhumatoai database.

Usage (from backend/ on app VM, with DATABASE_URL pointing at rhumatoai):
    python -m scripts.migration.fix_all_text_encoding          # dry-run
    python -m scripts.migration.fix_all_text_encoding --commit
"""

from __future__ import annotations

import argparse

from sqlalchemy.engine import make_url

from app.core.config import settings
from app.core.utils.text_encoding import looks_like_mojibake, repair_text
from scripts.migration.migrate_chuir import connect

# table -> text columns to scan/repair
TEXT_COLUMNS: dict[str, list[str]] = {
    "patients": [
        "first_name", "last_name", "civility", "address", "city",
        "marital_status", "nationality", "profession", "insurance",
        "emergency_contact_name", "emergency_contact_relation",
        "primary_diagnosis", "notes", "notes_admin",
    ],
    "act_diagnoses": ["diagnosis_label", "diagnosis_notes"],
    "act_treatments": ["drug_name", "dosage", "frequency", "duration", "notes"],
    "medical_acts": ["act_type", "description", "report", "notes", "category"],
    "appointments": ["reason"],
    "patient_allergies": ["allergen", "reaction_type", "notes"],
    "act_results": ["result_name", "result_value", "notes"],
    "notifications": ["title", "message"],
}


def repair_row(row: dict, columns: list[str]) -> dict[str, str]:
    updates: dict[str, str] = {}
    for col in columns:
        value = row.get(col)
        if not value or not isinstance(value, str) or not looks_like_mojibake(value):
            continue
        fixed = repair_text(value)
        if fixed and fixed != value:
            updates[col] = fixed
    return updates


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--commit", action="store_true", help="Apply updates (default: dry-run)")
    args = parser.parse_args()

    target_url = make_url(settings.DATABASE_URL)
    db = connect(target_url.database, raw_bytes=False)

    total_scanned = 0
    total_updated = 0

    for table, columns in TEXT_COLUMNS.items():
        col_list = ", ".join(["id"] + columns)
        with db.cursor() as cur:
            cur.execute(f"SELECT {col_list} FROM {table}")
            rows = cur.fetchall()

        table_updates: list[tuple] = []
        for row in rows:
            total_scanned += 1
            fixed_cols = repair_row(row, columns)
            if not fixed_cols:
                continue
            for col, fixed in fixed_cols.items():
                table_updates.append((fixed, row["id"], col))

        print(f"\n{table}: scanned {len(rows)} rows, {len(table_updates)} column values to repair")
        for fixed, row_id, col in table_updates[:5]:
            print(f"  id={row_id} {col}: {fixed!r}")
        if len(table_updates) > 5:
            print(f"  ... and {len(table_updates) - 5} more")

        if args.commit and table_updates:
            with db.cursor() as cur:
                for fixed, row_id, col in table_updates:
                    cur.execute(
                        f"UPDATE {table} SET {col} = %s WHERE id = %s",
                        (fixed, row_id),
                    )
            db.commit()
            total_updated += len(table_updates)

    print(f"\nDone. Scanned {total_scanned} rows across {len(TEXT_COLUMNS)} tables.")
    if args.commit:
        print(f"Updated {total_updated} column values.")
    else:
        print("Dry-run only. Pass --commit to apply.")


if __name__ == "__main__":
    main()
