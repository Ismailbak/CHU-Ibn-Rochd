"""
ETL: migrate legacy CHUIR rheumatology data (chuir_source) into the app DB (smarthos).

PHASE 1 scope: patients <- person, appointments <- rdv, medical_acts <- act
(+ act_diagnoses <- actdg, act_documents <- actfile). Clinical forms are deferred.

SAFETY
------
- Dry-run by default: performs the full transform inside a transaction and ROLLS BACK,
  printing what *would* happen. Nothing is written unless you pass --commit.
- --commit performs the load for real (wraps everything in one transaction).
- --truncate wipes the app-managed tables first (keeps users, ref_* and form templates).
- Reads the legacy latin1 data over a utf8mb4 connection so accents convert correctly,
  and runs an encoding health-check (counts suspicious mojibake without printing names).

USAGE (from backend/ with the venv active)
    python -m scripts.migration.migrate_chuir                 # dry-run, no changes
    python -m scripts.migration.migrate_chuir --truncate      # dry-run incl. wipe preview
    python -m scripts.migration.migrate_chuir --commit --truncate   # REAL import

The source DB name defaults to 'chuir_source' (override with env CHUIR_SOURCE_DB).
Target connection is read from the app's DATABASE_URL.
"""

from __future__ import annotations

import argparse
import os
import sys
from decimal import Decimal, InvalidOperation

import pymysql
from sqlalchemy.engine import make_url

from app.core.config import settings

SOURCE_DB = os.environ.get("CHUIR_SOURCE_DB", "chuir_source")

# ─── Value mappings (edit these if legacy semantics differ) ────────────────────
GENDER_MAP = {"m": "Homme", "f": "Femme"}
PATIENT_STATUS_MAP = {1: "Actif", 0: "Inactif"}
# Best-guess legacy rdv workflow codes -> app appointment status. CONFIRM with clinic.
RDV_STATUS_MAP = {0: "unknown", 1: "scheduled", 2: "completed", 3: "confirmed", 4: "cancelled"}
ACT_STATUS_MAP = {1: "completed", 0: "cancelled"}

# Tables this ETL owns (wiped on --truncate, child-first for FK safety).
MANAGED_TABLES = [
    "act_documents",
    "act_diagnoses",
    "act_treatments",
    "medical_act_staff",
    "act_forms",
    "act_results",
    "patient_allergies",
    "chat_messages",
    "chat_sessions",
    "appointments",
    "medical_acts",
    "patients",
]


def fix_text(value) -> str | None:
    """Decode legacy raw bytes, preserving French accents.

    Most legacy text was UTF-8 bytes stored in latin1 columns, but some lookup
    tables (notably w104_local_diag) are genuine latin1. Try UTF-8 first, then
    fall back to latin1 instead of replacing accented characters with �.
    """
    if value is None:
        return None
    if isinstance(value, bytes):
        try:
            return value.decode("utf-8")
        except UnicodeDecodeError:
            return value.decode("latin1", errors="replace")
    from app.core.utils.text_encoding import repair_utf8_mojibake

    return repair_utf8_mojibake(str(value))


def clean_str(value, maxlen=None):
    s = fix_text(value)
    if s is None:
        return None
    s = s.strip()
    if not s or s in ("0000-00-00", "0000-00-00 00:00:00"):
        return None
    return s[:maxlen] if maxlen else s


def to_date(value):
    """Return a date from a datetime/date, or None for null/zero dates."""
    if value is None:
        return None
    if hasattr(value, "date"):
        return value.date()
    return None


# medical_acts.amount is NUMERIC(15,2): max 13 digits before the decimal point.
AMOUNT_MAX = Decimal("10") ** 13


def parse_amount(value):
    s = clean_str(value)
    if not s:
        return None
    s = s.replace(",", ".").replace(" ", "")
    try:
        d = Decimal(s).quantize(Decimal("0.01"))
    except (InvalidOperation, ValueError):
        return None
    if d.copy_abs() >= AMOUNT_MAX:
        return None  # implausible value (likely a misused field) -> drop
    return d


def connect(db_name: str, raw_bytes: bool = False) -> pymysql.connections.Connection:
    """Connect to MySQL. When raw_bytes=True, string columns are returned as undecoded
    bytes (so we can decode them as UTF-8 ourselves) — used for the legacy source DB."""
    url = make_url(settings.DATABASE_URL)
    kwargs = dict(
        host=url.host or "localhost",
        port=url.port or 3306,
        user=url.username,
        password=url.password or "",
        database=db_name,
        charset="utf8mb4",
        cursorclass=pymysql.cursors.DictCursor,
    )
    if raw_bytes:
        # Return raw stored bytes without server-side transcoding or client decoding.
        kwargs["use_unicode"] = False
        kwargs["init_command"] = "SET character_set_results=NULL"
    return pymysql.connect(**kwargs)


def encoding_healthcheck(src) -> None:
    """Verify UTF-8 recovery on names WITHOUT printing patient values.

    Reports how many names still contain mojibake markers AFTER recovery (should be ~0).
    """
    with src.cursor() as cur:
        cur.execute("SELECT person_firstname, person_lastname FROM person")
        rows = cur.fetchall()
    residual = 0
    for r in rows:
        combined = (fix_text(r["person_firstname"]) or "") + (fix_text(r["person_lastname"]) or "")
        if any(m in combined for m in ("Ã", "Â", "\uFFFD")):
            residual += 1
    print(f"  encoding health-check: {len(rows)} names scanned, {residual} still suspicious after recovery")
    if residual > len(rows) * 0.01:
        print("  -> WARNING: >1% names look wrong after recovery. Review before committing.")


def truncate_targets(dst, do_it: bool) -> None:
    with dst.cursor() as cur:
        cur.execute("SET FOREIGN_KEY_CHECKS=0")
        for t in MANAGED_TABLES:
            if do_it:
                cur.execute(f"DELETE FROM {t}")
            print(f"  {'wiped' if do_it else 'would wipe'}: {t}")
        cur.execute("SET FOREIGN_KEY_CHECKS=1")


def migrate_patients(src, dst) -> set[int]:
    with src.cursor() as cur:
        cur.execute("SELECT * FROM person")
        rows = cur.fetchall()
    migrated: set[int] = set()
    payload = []
    for r in rows:
        pid = r["IDperson"]
        payload.append((
            pid,
            f"P{pid:06d}",
            clean_str(r["person_firstname"], 255) or "Inconnu",
            clean_str(r["person_lastname"], 255) or "Inconnu",
            clean_str(r["person_civility"], 10),
            GENDER_MAP.get((clean_str(r["person_sex"]) or "").lower()),
            to_date(r["person_birthdate"]),
            clean_str(r["person_tel"], 30),
            clean_str(r["person_email"], 255),
            clean_str(r["person_address"]),
            clean_str(r["person_city"], 100),
            clean_str(r["person_maritalstatus"], 50),
            clean_str(r["person_nationality"], 100),
            clean_str(r["person_profession"], 100),
            clean_str(r["person_insurance"], 100),
            clean_str(r["person_insurance_id"], 50),
            clean_str(r["person_diagnostic"], 255),
            clean_str(r["person_note"]),
            PATIENT_STATUS_MAP.get(r["person_status"], "Actif"),
        ))
        migrated.add(pid)
    with dst.cursor() as cur:
        cur.executemany(
            "INSERT INTO patients (id, ipp, first_name, last_name, civility, gender, "
            "date_of_birth, phone, email, address, city, marital_status, nationality, "
            "profession, insurance, insurance_number, primary_diagnosis, notes, status) "
            "VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
            payload,
        )
    print(f"  patients: {len(payload)} prepared")
    return migrated


def migrate_appointments(src, dst, patient_ids: set[int]) -> int:
    with src.cursor() as cur:
        cur.execute("SELECT * FROM rdv")
        rows = cur.fetchall()
    payload, orphans = [], 0
    for r in rows:
        if r["IDperson"] not in patient_ids:
            orphans += 1
            continue
        if r["rdv_date_real"] is None:
            orphans += 1
            continue
        payload.append((
            r["IDrdv"],
            r["IDperson"],
            r["rdv_date_real"],
            clean_str(r["rdv_note"]),
            RDV_STATUS_MAP.get(r["rdv_status"], "scheduled"),
        ))
    with dst.cursor() as cur:
        cur.executemany(
            "INSERT INTO appointments (id, patient_id, datetime_scheduled, reason, status) "
            "VALUES (%s,%s,%s,%s,%s)",
            payload,
        )
    print(f"  appointments: {len(payload)} prepared, {orphans} skipped (orphan/no-date)")
    return len(payload)


def migrate_acts(src, dst, patient_ids: set[int]) -> set[int]:
    with src.cursor() as cur:
        cur.execute("SELECT IDcare, IDperson FROM care")
        care_to_person = {c["IDcare"]: c["IDperson"] for c in cur.fetchall()}
        cur.execute("SELECT IDref_act, act_label, IDref_care FROM ref_act")
        ref_act = {a["IDref_act"]: a for a in cur.fetchall()}
        cur.execute("SELECT IDref_care, care_label FROM ref_care")
        ref_care = {c["IDref_care"]: c["care_label"] for c in cur.fetchall()}
        cur.execute("SELECT * FROM act")
        rows = cur.fetchall()
    payload, orphans, migrated = [], 0, set()
    for r in rows:
        person_id = care_to_person.get(r["IDcare"])
        if person_id is None or person_id not in patient_ids:
            orphans += 1
            continue
        ra = ref_act.get(r["IDref_act"]) or {}
        act_type = clean_str(ra.get("act_label"), 50)
        category = clean_str(ref_care.get(ra.get("IDref_care")), 50)
        payload.append((
            r["IDact"],
            person_id,
            act_type,
            clean_str(r["act_note"]),
            to_date(r["act_date_real"]),
            ACT_STATUS_MAP.get(r["act_status"], "completed"),
            parse_amount(r["act_bill_price"]),
            category,
        ))
        migrated.add(r["IDact"])
    with dst.cursor() as cur:
        cur.executemany(
            "INSERT INTO medical_acts (id, patient_id, act_type, description, act_date, "
            "status, amount, category) VALUES (%s,%s,%s,%s,%s,%s,%s,%s)",
            payload,
        )
    print(f"  medical_acts: {len(payload)} prepared, {orphans} skipped (unresolved patient)")
    return migrated


def migrate_diagnoses(src, dst, act_ids: set[int]) -> int:
    with src.cursor() as cur:
        # Legacy labels live in w104_local_diag (ref_diag is empty in this dump).
        cur.execute("SELECT IDdiag, diag_name FROM w104_local_diag")
        diag_by_id = {d["IDdiag"]: d["diag_name"] for d in cur.fetchall()}
        cur.execute("SELECT * FROM actdg")
        rows = cur.fetchall()
    payload, orphans = [], 0
    for r in rows:
        if r["IDact"] not in act_ids:
            orphans += 1
            continue
        label = clean_str(diag_by_id.get(r["IDdiag"]), 255)
        if not label:
            note = clean_str(r.get("dg_note"), 255)
            if note and note.lower() not in ("aucun", "none", "n/a"):
                label = note
        if not label:
            label = "Non précisé"
        payload.append((
            r["IDdg"],
            r["IDact"],
            label,
            clean_str(r["dg_note"]),
            "principal" if clean_str(r["dg_type"]) == "1" else "secondary",
        ))
    with dst.cursor() as cur:
        cur.executemany(
            "INSERT INTO act_diagnoses (id, act_id, diagnosis_label, diagnosis_notes, diagnosis_type) "
            "VALUES (%s,%s,%s,%s,%s)",
            payload,
        )
    print(f"  act_diagnoses: {len(payload)} prepared, {orphans} skipped (orphan act)")
    return len(payload)


def migrate_files(src, dst, act_ids: set[int]) -> int:
    with src.cursor() as cur:
        cur.execute("SELECT * FROM actfile")
        rows = cur.fetchall()
    payload, orphans = [], 0
    for r in rows:
        if r["IDact"] not in act_ids:
            orphans += 1
            continue
        payload.append((
            r["IDactfile"],
            r["IDact"],
            clean_str(r["actfile_name"], 255),
            clean_str(r["actfile_path"], 500),
        ))
    with dst.cursor() as cur:
        cur.executemany(
            "INSERT INTO act_documents (id, act_id, filename, file_path) VALUES (%s,%s,%s,%s)",
            payload,
        )
    print(f"  act_documents: {len(payload)} prepared, {orphans} skipped (orphan act)")
    return len(payload)


def main() -> int:
    parser = argparse.ArgumentParser(description="Migrate CHUIR legacy data into smarthos.")
    parser.add_argument("--commit", action="store_true", help="Actually write (default: dry-run).")
    parser.add_argument("--truncate", action="store_true", help="Wipe app-managed tables first.")
    args = parser.parse_args()

    mode = "COMMIT" if args.commit else "DRY-RUN"
    print(f"\n=== CHUIR migration [{mode}] source={SOURCE_DB} -> target=smarthos ===\n")

    # Source returns raw bytes (we decode UTF-8 ourselves via fix_text). Target is utf8mb4.
    src = connect(SOURCE_DB, raw_bytes=True)
    dst = connect(make_url(settings.DATABASE_URL).database)
    try:
        encoding_healthcheck(src)
        dst.begin()

        if args.truncate:
            print("\n[truncate]")
            # Always executes inside the transaction; in dry-run it is rolled back at the end.
            truncate_targets(dst, do_it=True)

        print("\n[load]")
        patient_ids = migrate_patients(src, dst)
        migrate_appointments(src, dst, patient_ids)
        act_ids = migrate_acts(src, dst, patient_ids)
        migrate_diagnoses(src, dst, act_ids)
        migrate_files(src, dst, act_ids)

        if args.commit:
            dst.commit()
            print("\n[COMMITTED] Data written to smarthos.")
        else:
            dst.rollback()
            print("\n[ROLLED BACK] Dry-run only — no changes written. Re-run with --commit to apply.")
    except Exception as exc:  # noqa: BLE001
        dst.rollback()
        print(f"\n[ERROR] Rolled back. {type(exc).__name__}: {exc}")
        return 1
    finally:
        src.close()
        dst.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
