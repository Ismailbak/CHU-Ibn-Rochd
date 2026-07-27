"""
Bidirectional clinical sync: legacy hoshealth ↔ app smarthos.

Conflict policy: last-write-wins (compare timestamps; if both sides changed
since last sync and timestamps tie, prefer hoshealth).

Phase 1 entities: patients/person, appointments/rdv, medical_acts/act,
act_diagnoses/actdg, act_documents/actfile.
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
from dataclasses import dataclass, field
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from typing import Any, Dict, Iterable, List, Optional, Tuple

import pymysql
from pymysql.cursors import DictCursor
from sqlalchemy.engine import make_url

from app.core.config import settings
from app.core.utils.text_encoding import repair_utf8_mojibake

logger = logging.getLogger(__name__)

GENDER_TO_APP = {"m": "Homme", "f": "Femme", "h": "Homme"}
GENDER_TO_LEGACY = {"homme": "m", "femme": "f", "m": "m", "f": "f", "h": "m"}
STATUS_TO_APP = {1: "Actif", 0: "Inactif"}
STATUS_TO_LEGACY = {"actif": 1, "inactif": 0}
RDV_TO_APP = {0: "unknown", 1: "scheduled", 2: "completed", 3: "confirmed", 4: "cancelled"}
RDV_TO_LEGACY = {
    "unknown": 0,
    "scheduled": 1,
    "completed": 2,
    "confirmed": 3,
    "cancelled": 4,
    "en attente": 1,
    "pending": 1,
}
ACT_TO_APP = {1: "completed", 0: "cancelled"}
ACT_TO_LEGACY = {"completed": 1, "cancelled": 0, "scheduled": 1, "in_progress": 1}

AMOUNT_MAX = Decimal("10") ** 13

# Legacy CHUIR tables often require IDuser (NO DEFAULT under strict SQL mode).
DEFAULT_LEGACY_USER_ID = int(os.environ.get("CHUIR_DEFAULT_IDUSER", "1"))

_LEGACY_COL_CACHE: Dict[str, List[Dict[str, Any]]] = {}


def _as_text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, (bytes, bytearray)):
        return bytes(value).decode("utf-8", errors="replace")
    return str(value)


def _legacy_columns(
    conn: pymysql.connections.Connection, table: str
) -> List[Dict[str, Any]]:
    if table not in _LEGACY_COL_CACHE:
        with conn.cursor() as cur:
            cur.execute(f"SHOW COLUMNS FROM `{table}`")
            rows = []
            for raw in cur.fetchall():
                norm: Dict[str, Any] = {}
                for k, v in raw.items():
                    key = _as_text(k)
                    if key == "Default":
                        if v is None:
                            norm[key] = None
                        elif isinstance(v, (bytes, bytearray)):
                            norm[key] = _as_text(v)
                        else:
                            norm[key] = v
                    else:
                        norm[key] = _as_text(v) if isinstance(v, (bytes, bytearray)) else v
                rows.append(norm)
            _LEGACY_COL_CACHE[table] = rows
    return _LEGACY_COL_CACHE[table]


def _default_for_mysql_col(col: Dict[str, Any]) -> Any:
    name = _as_text(col.get("Field")).lower()
    typ = _as_text(col.get("Type")).lower()
    if "user" in name and any(t in typ for t in ("int", "bigint", "smallint", "tinyint")):
        return DEFAULT_LEGACY_USER_ID
    if "fulltext" in name:
        return " "
    if "datetime" in typ or "timestamp" in typ:
        return datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
    if typ.startswith("date"):
        return date.today().isoformat()
    if any(t in typ for t in ("int", "decimal", "float", "double", "numeric", "bit", "bool")):
        return 0
    if "blob" in typ or "binary" in typ:
        return b""
    return ""


def _legacy_upsert(
    conn: pymysql.connections.Connection,
    table: str,
    pk_col: str,
    pk_val: Any,
    values: Dict[str, Any],
) -> None:
    """UPDATE when PK exists; INSERT otherwise, auto-filling required columns."""
    cols = _legacy_columns(conn, table)
    col_names = {_as_text(c["Field"]) for c in cols}
    payload = {k: v for k, v in values.items() if k in col_names}
    payload[pk_col] = pk_val

    with conn.cursor() as cur:
        cur.execute(f"SELECT `{pk_col}` FROM `{table}` WHERE `{pk_col}`=%s LIMIT 1", (pk_val,))
        exists = cur.fetchone() is not None

        if exists:
            assignments = [k for k in payload if k != pk_col]
            if not assignments:
                return
            sets = ", ".join(f"`{k}`=%s" for k in assignments)
            params = [payload[k] for k in assignments]
            params.append(pk_val)
            cur.execute(
                f"UPDATE `{table}` SET {sets} WHERE `{pk_col}`=%s",
                params,
            )
            return

        for col in cols:
            field = _as_text(col["Field"])
            if field in payload and payload[field] is not None:
                continue
            auto = "auto_increment" in _as_text(col.get("Extra")).lower()
            if auto:
                continue
            null_ok = _as_text(col.get("Null")).upper() == "YES"
            has_default = col.get("Default") is not None
            if not null_ok and not has_default:
                payload[field] = _default_for_mysql_col(col)

        if "person_name_fulltext" in col_names:
            ft = payload.get("person_name_fulltext")
            if not ft or (isinstance(ft, str) and not str(ft).strip()):
                fn = payload.get("person_firstname") or ""
                ln = payload.get("person_lastname") or ""
                payload["person_name_fulltext"] = f"{fn} {ln}".strip() or "Inconnu"

        fields = list(payload.keys())
        col_sql = ", ".join(f"`{f}`" for f in fields)
        placeholders = ", ".join(["%s"] * len(fields))
        cur.execute(
            f"INSERT INTO `{table}` ({col_sql}) VALUES ({placeholders})",
            [payload[f] for f in fields],
        )


@dataclass
class SyncCounters:
    pulled: int = 0
    pushed: int = 0
    skipped: int = 0
    deleted: int = 0
    conflicts_legacy: int = 0
    conflicts_app: int = 0


@dataclass
class SyncReport:
    entity: str
    counters: SyncCounters = field(default_factory=SyncCounters)


def _fix_text(value: Any) -> Optional[str]:
    if value is None:
        return None
    if isinstance(value, bytes):
        try:
            return value.decode("utf-8")
        except UnicodeDecodeError:
            return value.decode("latin1", errors="replace")
    return repair_utf8_mojibake(str(value))


def _clean(value: Any, maxlen: Optional[int] = None) -> Optional[str]:
    s = _fix_text(value)
    if s is None:
        return None
    s = s.strip()
    if not s or s in ("0000-00-00", "0000-00-00 00:00:00"):
        return None
    return s[:maxlen] if maxlen else s


def _to_date(value: Any) -> Optional[date]:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    return None


def _to_datetime(value: Any) -> Optional[datetime]:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value
    if isinstance(value, date):
        return datetime(value.year, value.month, value.day)
    return None


def _parse_amount(value: Any) -> Optional[Decimal]:
    s = _clean(value)
    if not s:
        return None
    s = s.replace(",", ".").replace(" ", "")
    try:
        d = Decimal(s).quantize(Decimal("0.01"))
    except (InvalidOperation, ValueError):
        return None
    if d.copy_abs() >= AMOUNT_MAX:
        return None
    return d


def _hash_payload(payload: Dict[str, Any]) -> str:
    blob = json.dumps(payload, sort_keys=True, default=str, ensure_ascii=True)
    return hashlib.sha256(blob.encode("utf-8")).hexdigest()


def _ts(value: Any) -> datetime:
    dt = _to_datetime(value)
    return dt or datetime(1970, 1, 1)


def connect_legacy(*, raw_bytes: bool = False) -> pymysql.connections.Connection:
    if not settings.chu_ir_source_configured:
        raise RuntimeError(
            "CHUIR/hoshealth source is not configured "
            "(set CHUIR_SOURCE_HOST, CHUIR_SOURCE_USER, CHUIR_SOURCE_PASSWORD)."
        )
    kwargs: Dict[str, Any] = dict(
        host=settings.CHUIR_SOURCE_HOST,
        port=settings.CHUIR_SOURCE_PORT,
        user=settings.CHUIR_SOURCE_USER,
        password=settings.CHUIR_SOURCE_PASSWORD or "",
        database=settings.CHUIR_SOURCE_DB,
        charset="utf8mb4",
        cursorclass=DictCursor,
        autocommit=False,
    )
    if raw_bytes:
        kwargs["use_unicode"] = False
        kwargs["init_command"] = "SET character_set_results=NULL"
    return pymysql.connect(**kwargs)


def connect_primary() -> pymysql.connections.Connection:
    url = make_url(settings.DATABASE_URL)
    return pymysql.connect(
        host=url.host or "localhost",
        port=url.port or 3306,
        user=url.username,
        password=url.password or "",
        database=url.database,
        charset="utf8mb4",
        cursorclass=DictCursor,
        autocommit=False,
    )


def ensure_sync_state_table(primary: pymysql.connections.Connection) -> None:
    with primary.cursor() as cur:
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS sync_hoshealth_state (
              entity VARCHAR(32) NOT NULL,
              row_id INT NOT NULL,
              legacy_hash CHAR(64) NOT NULL,
              app_hash CHAR(64) NOT NULL,
              last_origin VARCHAR(16) NOT NULL,
              updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
                ON UPDATE CURRENT_TIMESTAMP,
              PRIMARY KEY (entity, row_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            """
        )
    primary.commit()


def _get_state(
    primary: pymysql.connections.Connection, entity: str, row_id: int
) -> Optional[Dict[str, Any]]:
    with primary.cursor() as cur:
        cur.execute(
            "SELECT legacy_hash, app_hash, last_origin FROM sync_hoshealth_state "
            "WHERE entity=%s AND row_id=%s",
            (entity, row_id),
        )
        return cur.fetchone()


def _set_state(
    primary: pymysql.connections.Connection,
    entity: str,
    row_id: int,
    legacy_hash: str,
    app_hash: str,
    origin: str,
) -> None:
    with primary.cursor() as cur:
        cur.execute(
            """
            INSERT INTO sync_hoshealth_state
              (entity, row_id, legacy_hash, app_hash, last_origin)
            VALUES (%s,%s,%s,%s,%s)
            ON DUPLICATE KEY UPDATE
              legacy_hash=VALUES(legacy_hash),
              app_hash=VALUES(app_hash),
              last_origin=VALUES(last_origin)
            """,
            (entity, row_id, legacy_hash, app_hash, origin),
        )


def _clear_state(
    primary: pymysql.connections.Connection, entity: str, row_id: int
) -> None:
    with primary.cursor() as cur:
        cur.execute(
            "DELETE FROM sync_hoshealth_state WHERE entity=%s AND row_id=%s",
            (entity, row_id),
        )


def _clear_states_for_ids(
    primary: pymysql.connections.Connection, entity: str, row_ids: Iterable[int]
) -> None:
    ids = list(row_ids)
    if not ids:
        return
    with primary.cursor() as cur:
        ph = ",".join(["%s"] * len(ids))
        cur.execute(
            f"DELETE FROM sync_hoshealth_state WHERE entity=%s AND row_id IN ({ph})",
            [entity, *ids],
        )


def _exec_ignore_missing(cur, sql: str, params=None) -> None:
    try:
        cur.execute(sql, params or ())
    except pymysql.err.ProgrammingError as exc:
        if getattr(exc, "args", [None])[0] in (1146, 1054):
            return
        raise


def _delete_patient_from_primary(
    primary: pymysql.connections.Connection, patient_id: int
) -> None:
    with primary.cursor() as cur:
        cur.execute("SELECT id FROM medical_acts WHERE patient_id=%s", (patient_id,))
        act_ids = [int(r["id"]) for r in cur.fetchall()]
        cur.execute("SELECT id FROM appointments WHERE patient_id=%s", (patient_id,))
        appt_ids = [int(r["id"]) for r in cur.fetchall()]

        if act_ids:
            ph = ",".join(["%s"] * len(act_ids))
            for sql in (
                f"DELETE FROM act_documents WHERE act_id IN ({ph})",
                f"DELETE FROM act_diagnoses WHERE act_id IN ({ph})",
                f"DELETE FROM act_treatments WHERE act_id IN ({ph})",
                f"DELETE FROM medical_act_staff WHERE medical_act_id IN ({ph})",
                f"DELETE FROM act_results WHERE act_id IN ({ph})",
                f"DELETE FROM act_forms WHERE act_id IN ({ph})",
                f"DELETE FROM dynamic_form_responses WHERE act_id IN ({ph})",
                f"DELETE FROM medical_acts WHERE id IN ({ph})",
            ):
                _exec_ignore_missing(cur, sql, act_ids)
            _clear_states_for_ids(primary, "act", act_ids)

        if appt_ids:
            ph = ",".join(["%s"] * len(appt_ids))
            cur.execute(f"DELETE FROM appointments WHERE id IN ({ph})", appt_ids)
            _clear_states_for_ids(primary, "appointment", appt_ids)

        cur.execute("SELECT id FROM chat_sessions WHERE patient_id=%s", (patient_id,))
        session_ids = [int(r["id"]) for r in cur.fetchall()]
        if session_ids:
            ph = ",".join(["%s"] * len(session_ids))
            _exec_ignore_missing(
                cur, f"DELETE FROM chat_messages WHERE session_id IN ({ph})", session_ids
            )
        _exec_ignore_missing(
            cur, "DELETE FROM chat_messages WHERE patient_id=%s", (patient_id,)
        )
        _exec_ignore_missing(
            cur, "DELETE FROM chat_sessions WHERE patient_id=%s", (patient_id,)
        )
        _exec_ignore_missing(
            cur, "DELETE FROM patient_allergies WHERE patient_id=%s", (patient_id,)
        )
        _exec_ignore_missing(
            cur, "DELETE FROM act_results WHERE patient_id=%s", (patient_id,)
        )
        _exec_ignore_missing(
            cur, "DELETE FROM rag_query_cache WHERE patient_id=%s", (patient_id,)
        )
        _exec_ignore_missing(
            cur, "DELETE FROM rag_chunks WHERE patient_id=%s", (patient_id,)
        )
        cur.execute("DELETE FROM patients WHERE id=%s", (patient_id,))
        _clear_state(primary, "patient", patient_id)


def _delete_person_from_legacy(
    legacy: pymysql.connections.Connection, person_id: int
) -> None:
    with legacy.cursor() as cur:
        cur.execute("SELECT IDcare FROM care WHERE IDperson=%s", (person_id,))
        care_ids = [int(r["IDcare"]) for r in cur.fetchall()]
        act_ids: List[int] = []
        if care_ids:
            ph = ",".join(["%s"] * len(care_ids))
            cur.execute(f"SELECT IDact FROM act WHERE IDcare IN ({ph})", care_ids)
            act_ids = [int(r["IDact"]) for r in cur.fetchall()]
        if act_ids:
            ph = ",".join(["%s"] * len(act_ids))
            for sql in (
                f"DELETE FROM actdg WHERE IDact IN ({ph})",
                f"DELETE FROM actfile WHERE IDact IN ({ph})",
                f"DELETE FROM actttt WHERE IDact IN ({ph})",
                f"DELETE FROM actresult WHERE IDact IN ({ph})",
                f"DELETE FROM act WHERE IDact IN ({ph})",
            ):
                _exec_ignore_missing(cur, sql, act_ids)
        if care_ids:
            ph = ",".join(["%s"] * len(care_ids))
            cur.execute(f"DELETE FROM care WHERE IDcare IN ({ph})", care_ids)
        cur.execute("DELETE FROM rdv WHERE IDperson=%s", (person_id,))
        cur.execute("DELETE FROM person WHERE IDperson=%s", (person_id,))


def _delete_appointment_from_primary(
    primary: pymysql.connections.Connection, appt_id: int
) -> None:
    with primary.cursor() as cur:
        cur.execute("DELETE FROM appointments WHERE id=%s", (appt_id,))
    _clear_state(primary, "appointment", appt_id)


def _delete_rdv_from_legacy(
    legacy: pymysql.connections.Connection, rdv_id: int
) -> None:
    with legacy.cursor() as cur:
        cur.execute("DELETE FROM rdv WHERE IDrdv=%s", (rdv_id,))


def _delete_act_from_primary(
    primary: pymysql.connections.Connection, act_id: int
) -> None:
    with primary.cursor() as cur:
        for sql in (
            "DELETE FROM act_documents WHERE act_id=%s",
            "DELETE FROM act_diagnoses WHERE act_id=%s",
            "DELETE FROM act_treatments WHERE act_id=%s",
            "DELETE FROM medical_act_staff WHERE medical_act_id=%s",
            "DELETE FROM act_results WHERE act_id=%s",
            "DELETE FROM act_forms WHERE act_id=%s",
            "DELETE FROM dynamic_form_responses WHERE act_id=%s",
            "DELETE FROM medical_acts WHERE id=%s",
        ):
            _exec_ignore_missing(cur, sql, (act_id,))
    _clear_state(primary, "act", act_id)


def _delete_act_from_legacy(
    legacy: pymysql.connections.Connection, act_id: int
) -> None:
    with legacy.cursor() as cur:
        for sql in (
            "DELETE FROM actdg WHERE IDact=%s",
            "DELETE FROM actfile WHERE IDact=%s",
            "DELETE FROM actttt WHERE IDact=%s",
            "DELETE FROM actresult WHERE IDact=%s",
            "DELETE FROM act WHERE IDact=%s",
        ):
            _exec_ignore_missing(cur, sql, (act_id,))


def _decide(
    *,
    legacy_hash: Optional[str],
    app_hash: Optional[str],
    state: Optional[Dict[str, Any]],
    legacy_ts: datetime,
    app_ts: datetime,
) -> str:
    """Return pull | push | skip | delete_app | delete_legacy."""
    if legacy_hash is None and app_hash is None:
        return "skip"

    origin = (state or {}).get("last_origin") if state else None

    # One side missing
    if legacy_hash is None and app_hash is not None:
        if state is None:
            return "push"
        # Still only on the app (or last write was an app push that may not have landed):
        # always re-push — never delete the local patient.
        if origin in ("app", None):
            return "push"
        # Confirmed on both sides earlier (synced/skip) or came from legacy → honor legacy delete
        return "delete_app"

    if app_hash is None and legacy_hash is not None:
        if state is None:
            return "pull"
        if origin in ("legacy", None):
            return "pull"
        return "delete_legacy"

    if state is None:
        # First sight / initial converge
        if legacy_hash is not None and app_hash is None:
            return "pull"
        if app_hash is not None and legacy_hash is None:
            return "push"
        if legacy_hash is not None and app_hash is not None:
            if legacy_hash == app_hash:
                return "skip"
            # Same id, different content before any sync state (often id collision):
            # use LWW instead of always overwriting the app patient.
            if app_ts > legacy_ts:
                return "push"
            return "pull"
        return "push"

    last_l = state["legacy_hash"]
    last_a = state["app_hash"]
    legacy_changed = legacy_hash != last_l
    app_changed = app_hash != last_a

    if legacy_changed and not app_changed:
        return "pull"
    if app_changed and not legacy_changed:
        return "push"
    if not legacy_changed and not app_changed:
        return "skip"

    # Both changed → last-write-wins
    if app_ts > legacy_ts:
        return "push"
    if legacy_ts > app_ts:
        return "pull"
    return "pull"  # tie → hoshealth


# ─── Patients / person ────────────────────────────────────────────────────────


def _person_payload(row: Dict[str, Any]) -> Dict[str, Any]:
    sex = (_clean(row.get("person_sex")) or "").lower()
    return {
        "id": int(row["IDperson"]),
        "ipp": f"P{int(row['IDperson']):06d}",
        "first_name": _clean(row.get("person_firstname"), 255) or "Inconnu",
        "last_name": _clean(row.get("person_lastname"), 255) or "Inconnu",
        "civility": _clean(row.get("person_civility"), 10),
        "gender": GENDER_TO_APP.get(sex),
        "date_of_birth": _to_date(row.get("person_birthdate")),
        "phone": _clean(row.get("person_tel"), 30),
        "email": _clean(row.get("person_email"), 255),
        "address": _clean(row.get("person_address")),
        "city": _clean(row.get("person_city"), 100),
        "marital_status": _clean(row.get("person_maritalstatus"), 50),
        "nationality": _clean(row.get("person_nationality"), 100),
        "profession": _clean(row.get("person_profession"), 100),
        "insurance": _clean(row.get("person_insurance"), 100),
        "insurance_number": _clean(row.get("person_insurance_id"), 50),
        "primary_diagnosis": _clean(row.get("person_diagnostic"), 255),
        "notes": _clean(row.get("person_note")),
        "status": STATUS_TO_APP.get(row.get("person_status"), "Actif"),
    }


def _patient_payload(row: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id": int(row["id"]),
        "ipp": _clean(row.get("ipp"), 50) or f"P{int(row['id']):06d}",
        "first_name": _clean(row.get("first_name"), 255) or "Inconnu",
        "last_name": _clean(row.get("last_name"), 255) or "Inconnu",
        "civility": _clean(row.get("civility"), 10),
        "gender": _clean(row.get("gender"), 10),
        "date_of_birth": _to_date(row.get("date_of_birth")),
        "phone": _clean(row.get("phone"), 30),
        "email": _clean(row.get("email"), 255),
        "address": _clean(row.get("address")),
        "city": _clean(row.get("city"), 100),
        "marital_status": _clean(row.get("marital_status"), 50),
        "nationality": _clean(row.get("nationality"), 100),
        "profession": _clean(row.get("profession"), 100),
        "insurance": _clean(row.get("insurance"), 100),
        "insurance_number": _clean(row.get("insurance_number"), 50),
        "primary_diagnosis": _clean(row.get("primary_diagnosis"), 255),
        "notes": _clean(row.get("notes")),
        "status": _clean(row.get("status"), 20) or "Actif",
    }


def _upsert_patient(primary: pymysql.connections.Connection, p: Dict[str, Any]) -> None:
    with primary.cursor() as cur:
        cur.execute(
            """
            INSERT INTO patients (
              id, ipp, first_name, last_name, civility, gender, date_of_birth,
              phone, email, address, city, marital_status, nationality, profession,
              insurance, insurance_number, primary_diagnosis, notes, status
            ) VALUES (
              %(id)s,%(ipp)s,%(first_name)s,%(last_name)s,%(civility)s,%(gender)s,
              %(date_of_birth)s,%(phone)s,%(email)s,%(address)s,%(city)s,
              %(marital_status)s,%(nationality)s,%(profession)s,%(insurance)s,
              %(insurance_number)s,%(primary_diagnosis)s,%(notes)s,%(status)s
            )
            ON DUPLICATE KEY UPDATE
              ipp=VALUES(ipp), first_name=VALUES(first_name), last_name=VALUES(last_name),
              civility=VALUES(civility), gender=VALUES(gender),
              date_of_birth=VALUES(date_of_birth), phone=VALUES(phone),
              email=VALUES(email), address=VALUES(address), city=VALUES(city),
              marital_status=VALUES(marital_status), nationality=VALUES(nationality),
              profession=VALUES(profession), insurance=VALUES(insurance),
              insurance_number=VALUES(insurance_number),
              primary_diagnosis=VALUES(primary_diagnosis), notes=VALUES(notes),
              status=VALUES(status)
            """,
            p,
        )


def _next_shared_patient_id(
    legacy: pymysql.connections.Connection,
    primary: pymysql.connections.Connection,
) -> int:
    with legacy.cursor() as cur:
        cur.execute("SELECT COALESCE(MAX(IDperson), 0) AS n FROM person")
        n1 = int(cur.fetchone()["n"])
    with primary.cursor() as cur:
        cur.execute("SELECT COALESCE(MAX(id), 0) AS n FROM patients")
        n2 = int(cur.fetchone()["n"])
    return max(n1, n2) + 1


def _person_exists(legacy: pymysql.connections.Connection, person_id: int) -> bool:
    with legacy.cursor() as cur:
        cur.execute("SELECT IDperson FROM person WHERE IDperson=%s LIMIT 1", (person_id,))
        return cur.fetchone() is not None


def _reassign_patient_id(
    primary: pymysql.connections.Connection, old_id: int, new_id: int
) -> None:
    """Move a patient PK when the id collides with an existing hoshealth person."""
    with primary.cursor() as cur:
        cur.execute("SET FOREIGN_KEY_CHECKS=0")
        try:
            cur.execute("SELECT * FROM patients WHERE id=%s", (old_id,))
            row = cur.fetchone()
            if not row:
                return
            cols = [k for k in row.keys() if k != "id"]
            cur.execute("SELECT id FROM patients WHERE id=%s", (new_id,))
            if cur.fetchone():
                raise RuntimeError(f"Target patient id {new_id} already exists")
            col_sql = ", ".join(["id"] + cols)
            placeholders = ", ".join(["%s"] * (1 + len(cols)))
            cur.execute(
                f"INSERT INTO patients ({col_sql}) VALUES ({placeholders})",
                [new_id] + [row[c] for c in cols],
            )
            for table, col in (
                ("appointments", "patient_id"),
                ("medical_acts", "patient_id"),
                ("patient_allergies", "patient_id"),
                ("chat_sessions", "patient_id"),
                ("chat_messages", "patient_id"),
                ("act_results", "patient_id"),
                ("rag_chunks", "patient_id"),
                ("rag_query_cache", "patient_id"),
            ):
                _exec_ignore_missing(
                    cur,
                    f"UPDATE `{table}` SET `{col}`=%s WHERE `{col}`=%s",
                    (new_id, old_id),
                )
            cur.execute("DELETE FROM patients WHERE id=%s", (old_id,))
            _clear_state(primary, "patient", old_id)
        finally:
            cur.execute("SET FOREIGN_KEY_CHECKS=1")


def _upsert_person(legacy: pymysql.connections.Connection, p: Dict[str, Any]) -> None:
    sex = GENDER_TO_LEGACY.get((_clean(p.get("gender")) or "").lower())
    status = STATUS_TO_LEGACY.get((_clean(p.get("status")) or "actif").lower(), 1)
    fulltext = f"{p.get('first_name') or ''} {p.get('last_name') or ''}".strip() or "Inconnu"
    _legacy_upsert(
        legacy,
        "person",
        "IDperson",
        p["id"],
        {
            "IDuser": DEFAULT_LEGACY_USER_ID,
            "person_firstname": p["first_name"],
            "person_lastname": p["last_name"],
            "person_name_fulltext": fulltext,
            "person_civility": p.get("civility"),
            "person_sex": sex,
            "person_birthdate": p.get("date_of_birth"),
            "person_tel": p.get("phone"),
            "person_email": p.get("email"),
            "person_address": p.get("address"),
            "person_city": p.get("city"),
            "person_maritalstatus": p.get("marital_status"),
            "person_nationality": p.get("nationality"),
            "person_profession": p.get("profession"),
            "person_insurance": p.get("insurance"),
            "person_insurance_id": p.get("insurance_number"),
            "person_diagnostic": p.get("primary_diagnosis"),
            "person_note": p.get("notes"),
            "person_status": status,
        },
    )


def sync_patients(
    legacy: pymysql.connections.Connection,
    primary: pymysql.connections.Connection,
) -> SyncReport:
    report = SyncReport("patients")
    with legacy.cursor() as cur:
        cur.execute("SELECT * FROM person")
        persons = {int(r["IDperson"]): r for r in cur.fetchall()}
    with primary.cursor() as cur:
        cur.execute("SELECT * FROM patients")
        patients = {int(r["id"]): r for r in cur.fetchall()}

    ids = set(persons) | set(patients)
    for row_id in ids:
        leg = persons.get(row_id)
        app = patients.get(row_id)
        leg_p = _person_payload(leg) if leg else None
        app_p = _patient_payload(app) if app else None
        leg_h = _hash_payload(leg_p) if leg_p else None
        app_h = _hash_payload(app_p) if app_p else None
        state = _get_state(primary, "patient", row_id)
        legacy_ts = _ts(leg.get("person_birthdate") if leg else None)
        # Prefer real audit timestamps on app when present
        app_ts = _ts((app or {}).get("updated_at") or (app or {}).get("created_at"))
        if leg and not app:
            legacy_ts = datetime.utcnow()
        decision = _decide(
            legacy_hash=leg_h,
            app_hash=app_h,
            state=state,
            legacy_ts=legacy_ts,
            app_ts=app_ts,
        )
        if decision == "delete_app" and app_p:
            _delete_patient_from_primary(primary, row_id)
            report.counters.deleted += 1
        elif decision == "delete_legacy" and leg_p:
            _delete_person_from_legacy(legacy, row_id)
            _clear_state(primary, "patient", row_id)
            report.counters.deleted += 1
        elif decision == "pull" and leg_p:
            _upsert_patient(primary, leg_p)
            _set_state(primary, "patient", row_id, leg_h, leg_h, "legacy")
            report.counters.pulled += 1
            if state and state["app_hash"] != state["legacy_hash"]:
                report.counters.conflicts_legacy += 1
        elif decision == "push" and app_p:
            push_id = row_id
            push_p = dict(app_p)
            # New app patient must not overwrite an existing hoshealth person (id collision)
            if state is None and leg_p is not None:
                push_id = _next_shared_patient_id(legacy, primary)
                _reassign_patient_id(primary, row_id, push_id)
                push_p["id"] = push_id
                push_p["ipp"] = f"P{push_id:06d}"
                with primary.cursor() as cur:
                    cur.execute(
                        "UPDATE patients SET ipp=%s WHERE id=%s",
                        (push_p["ipp"], push_id),
                    )
                app_h = _hash_payload(push_p)
            _upsert_person(legacy, push_p)
            _set_state(primary, "patient", push_id, app_h, app_h, "app")
            report.counters.pushed += 1
            if state and state["app_hash"] != state["legacy_hash"]:
                report.counters.conflicts_app += 1
        else:
            report.counters.skipped += 1
            if leg_h and app_h:
                # Both sides present and unchanged — mark as synced (not "skip"),
                # so a later missing legacy row is treated as a real delete, while
                # origin "app" still means "re-push if hoshealth row is missing".
                _set_state(primary, "patient", row_id, leg_h, app_h, "synced")
    return report


# ─── Appointments / rdv ───────────────────────────────────────────────────────


def _rdv_payload(row: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    dt = _to_datetime(row.get("rdv_date_real"))
    if dt is None or row.get("IDperson") is None:
        return None
    return {
        "id": int(row["IDrdv"]),
        "patient_id": int(row["IDperson"]),
        "datetime_scheduled": dt,
        "reason": _clean(row.get("rdv_note")),
        "status": RDV_TO_APP.get(row.get("rdv_status"), "scheduled"),
    }


def _appointment_payload(row: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    dt = _to_datetime(row.get("datetime_scheduled"))
    if dt is None or row.get("patient_id") is None:
        return None
    return {
        "id": int(row["id"]),
        "patient_id": int(row["patient_id"]),
        "datetime_scheduled": dt,
        "reason": _clean(row.get("reason")),
        "status": _clean(row.get("status"), 20) or "scheduled",
    }


def _upsert_appointment(primary: pymysql.connections.Connection, a: Dict[str, Any]) -> None:
    with primary.cursor() as cur:
        cur.execute(
            """
            INSERT INTO appointments (id, patient_id, datetime_scheduled, reason, status)
            VALUES (%(id)s,%(patient_id)s,%(datetime_scheduled)s,%(reason)s,%(status)s)
            ON DUPLICATE KEY UPDATE
              patient_id=VALUES(patient_id),
              datetime_scheduled=VALUES(datetime_scheduled),
              reason=VALUES(reason),
              status=VALUES(status)
            """,
            a,
        )


def _upsert_rdv(legacy: pymysql.connections.Connection, a: Dict[str, Any]) -> None:
    status = RDV_TO_LEGACY.get((_clean(a.get("status")) or "scheduled").lower(), 1)
    _legacy_upsert(
        legacy,
        "rdv",
        "IDrdv",
        a["id"],
        {
            "IDperson": a["patient_id"],
            "IDuser": DEFAULT_LEGACY_USER_ID,
            "rdv_date_real": a["datetime_scheduled"],
            "rdv_note": a.get("reason"),
            "rdv_status": status,
        },
    )


def sync_appointments(
    legacy: pymysql.connections.Connection,
    primary: pymysql.connections.Connection,
) -> SyncReport:
    report = SyncReport("appointments")
    with legacy.cursor() as cur:
        cur.execute("SELECT * FROM rdv")
        rdvs = {int(r["IDrdv"]): r for r in cur.fetchall()}
    with primary.cursor() as cur:
        cur.execute("SELECT * FROM appointments")
        appts = {int(r["id"]): r for r in cur.fetchall()}
    with primary.cursor() as cur:
        cur.execute("SELECT id FROM patients")
        patient_ids = {int(r["id"]) for r in cur.fetchall()}

    for row_id in set(rdvs) | set(appts):
        leg = rdvs.get(row_id)
        app = appts.get(row_id)
        leg_p = _rdv_payload(leg) if leg else None
        app_p = _appointment_payload(app) if app else None
        state = _get_state(primary, "appointment", row_id)
        # Presence (not payload) drives deletes — invalid payloads must not look like deletes.
        if leg is None and app is not None and state is not None:
            _delete_appointment_from_primary(primary, row_id)
            report.counters.deleted += 1
            continue
        if app is None and leg is not None and state is not None:
            _delete_rdv_from_legacy(legacy, row_id)
            _clear_state(primary, "appointment", row_id)
            report.counters.deleted += 1
            continue
        if leg_p and leg_p["patient_id"] not in patient_ids:
            report.counters.skipped += 1
            continue
        if app_p and app_p["patient_id"] not in patient_ids:
            report.counters.skipped += 1
            continue
        leg_h = _hash_payload(leg_p) if leg_p else None
        app_h = _hash_payload(app_p) if app_p else None
        if leg_h is None and app_h is None:
            report.counters.skipped += 1
            continue
        legacy_ts = _ts(leg_p["datetime_scheduled"] if leg_p else None)
        app_ts = _ts((app or {}).get("updated_at") or (app_p or {}).get("datetime_scheduled"))
        decision = _decide(
            legacy_hash=leg_h,
            app_hash=app_h,
            state=state,
            legacy_ts=legacy_ts,
            app_ts=app_ts,
        )
        if decision in ("delete_app", "delete_legacy"):
            report.counters.skipped += 1
            continue
        if decision == "pull" and leg_p:
            _upsert_appointment(primary, leg_p)
            _set_state(primary, "appointment", row_id, leg_h, leg_h, "legacy")
            report.counters.pulled += 1
        elif decision == "push" and app_p:
            _upsert_rdv(legacy, app_p)
            _set_state(primary, "appointment", row_id, app_h, app_h, "app")
            report.counters.pushed += 1
        else:
            report.counters.skipped += 1
            if leg_h and app_h:
                _set_state(primary, "appointment", row_id, leg_h, app_h, "skip")
    return report


# ─── Medical acts / act ───────────────────────────────────────────────────────


def _ensure_care(
    legacy: pymysql.connections.Connection, person_id: int
) -> int:
    with legacy.cursor() as cur:
        cur.execute(
            "SELECT IDcare FROM care WHERE IDperson=%s ORDER BY IDcare LIMIT 1",
            (person_id,),
        )
        row = cur.fetchone()
        if row:
            return int(row["IDcare"])
        cur.execute("SELECT IDcare FROM care WHERE IDcare=%s", (person_id,))
        if cur.fetchone() is None:
            care_id = person_id
        else:
            cur.execute("SELECT COALESCE(MAX(IDcare),0)+1 AS n FROM care")
            care_id = int(cur.fetchone()["n"])
    _legacy_upsert(
        legacy,
        "care",
        "IDcare",
        care_id,
        {
            "IDperson": person_id,
            "IDuser": DEFAULT_LEGACY_USER_ID,
        },
    )
    return care_id


def _default_ref_act(legacy: pymysql.connections.Connection) -> int:
    with legacy.cursor() as cur:
        cur.execute("SELECT IDref_act FROM ref_act ORDER BY IDref_act LIMIT 1")
        row = cur.fetchone()
        return int(row["IDref_act"]) if row else 1


def _act_payload_from_legacy(
    row: Dict[str, Any],
    care_to_person: Dict[int, int],
    ref_act: Dict[int, Dict[str, Any]],
    ref_care: Dict[int, str],
) -> Optional[Dict[str, Any]]:
    person_id = care_to_person.get(row.get("IDcare"))
    if person_id is None:
        return None
    act_date = _to_date(row.get("act_date_real"))
    if act_date is None:
        return None
    ra = ref_act.get(row.get("IDref_act")) or {}
    return {
        "id": int(row["IDact"]),
        "patient_id": int(person_id),
        "act_type": _clean(ra.get("act_label"), 50),
        "description": _clean(row.get("act_note")),
        "act_date": act_date,
        "status": ACT_TO_APP.get(row.get("act_status"), "completed"),
        "amount": _parse_amount(row.get("act_bill_price")),
        "category": _clean(ref_care.get(ra.get("IDref_care")), 50),
        "IDcare": int(row["IDcare"]) if row.get("IDcare") is not None else None,
        "IDref_act": row.get("IDref_act"),
    }


def _act_payload_from_app(row: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    act_date = _to_date(row.get("act_date"))
    if act_date is None or row.get("patient_id") is None:
        return None
    return {
        "id": int(row["id"]),
        "patient_id": int(row["patient_id"]),
        "act_type": _clean(row.get("act_type"), 50),
        "description": _clean(row.get("description")),
        "act_date": act_date,
        "status": _clean(row.get("status"), 20) or "completed",
        "amount": row.get("amount"),
        "category": _clean(row.get("category"), 50),
    }


def _canonical_act(p: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id": p["id"],
        "patient_id": p["patient_id"],
        "act_type": p.get("act_type"),
        "description": p.get("description"),
        "act_date": p.get("act_date"),
        "status": p.get("status"),
        "amount": str(p["amount"]) if p.get("amount") is not None else None,
        "category": p.get("category"),
    }


def _upsert_medical_act(primary: pymysql.connections.Connection, a: Dict[str, Any]) -> None:
    with primary.cursor() as cur:
        cur.execute(
            """
            INSERT INTO medical_acts
              (id, patient_id, act_type, description, act_date, status, amount, category)
            VALUES
              (%(id)s,%(patient_id)s,%(act_type)s,%(description)s,%(act_date)s,
               %(status)s,%(amount)s,%(category)s)
            ON DUPLICATE KEY UPDATE
              patient_id=VALUES(patient_id), act_type=VALUES(act_type),
              description=VALUES(description), act_date=VALUES(act_date),
              status=VALUES(status), amount=VALUES(amount), category=VALUES(category)
            """,
            a,
        )


def _upsert_act(
    legacy: pymysql.connections.Connection,
    a: Dict[str, Any],
    *,
    existing: Optional[Dict[str, Any]] = None,
) -> None:
    care_id = _ensure_care(legacy, a["patient_id"])
    ref_act = (existing or {}).get("IDref_act") or _default_ref_act(legacy)
    status = ACT_TO_LEGACY.get((_clean(a.get("status")) or "completed").lower(), 1)
    price = a.get("amount")
    _legacy_upsert(
        legacy,
        "act",
        "IDact",
        a["id"],
        {
            "IDcare": care_id,
            "IDref_act": ref_act,
            "IDuser": DEFAULT_LEGACY_USER_ID,
            "IDuser_creation": DEFAULT_LEGACY_USER_ID,
            "act_date_real": a["act_date"],
            "act_note": a.get("description"),
            "act_status": status,
            "act_bill_price": str(price) if price is not None else None,
        },
    )


def sync_acts(
    legacy: pymysql.connections.Connection,
    primary: pymysql.connections.Connection,
) -> SyncReport:
    report = SyncReport("medical_acts")
    with legacy.cursor() as cur:
        cur.execute("SELECT IDcare, IDperson FROM care")
        care_to_person = {int(c["IDcare"]): int(c["IDperson"]) for c in cur.fetchall()}
        cur.execute("SELECT IDref_act, act_label, IDref_care FROM ref_act")
        ref_act = {int(a["IDref_act"]): a for a in cur.fetchall()}
        cur.execute("SELECT IDref_care, care_label FROM ref_care")
        ref_care = {
            int(c["IDref_care"]): c["care_label"] for c in cur.fetchall() if c.get("IDref_care") is not None
        }
        cur.execute("SELECT * FROM act")
        acts = {int(r["IDact"]): r for r in cur.fetchall()}
    with primary.cursor() as cur:
        cur.execute("SELECT * FROM medical_acts")
        medical = {int(r["id"]): r for r in cur.fetchall()}
        cur.execute("SELECT id FROM patients")
        patient_ids = {int(r["id"]) for r in cur.fetchall()}

    for row_id in set(acts) | set(medical):
        leg = acts.get(row_id)
        app = medical.get(row_id)
        leg_p = (
            _act_payload_from_legacy(leg, care_to_person, ref_act, ref_care) if leg else None
        )
        app_p = _act_payload_from_app(app) if app else None
        state = _get_state(primary, "act", row_id)
        if leg is None and app is not None and state is not None:
            _delete_act_from_primary(primary, row_id)
            report.counters.deleted += 1
            continue
        if app is None and leg is not None and state is not None:
            _delete_act_from_legacy(legacy, row_id)
            _clear_state(primary, "act", row_id)
            report.counters.deleted += 1
            continue
        if leg_p and leg_p["patient_id"] not in patient_ids:
            report.counters.skipped += 1
            continue
        if app_p and app_p["patient_id"] not in patient_ids:
            report.counters.skipped += 1
            continue
        leg_h = _hash_payload(_canonical_act(leg_p)) if leg_p else None
        app_h = _hash_payload(_canonical_act(app_p)) if app_p else None
        if leg_h is None and app_h is None:
            report.counters.skipped += 1
            continue
        legacy_ts = _ts(leg_p["act_date"] if leg_p else None)
        app_ts = _ts((app or {}).get("updated_at") or (app_p or {}).get("act_date"))
        decision = _decide(
            legacy_hash=leg_h,
            app_hash=app_h,
            state=state,
            legacy_ts=legacy_ts,
            app_ts=app_ts,
        )
        if decision in ("delete_app", "delete_legacy"):
            report.counters.skipped += 1
            continue
        if decision == "pull" and leg_p:
            _upsert_medical_act(primary, leg_p)
            _set_state(primary, "act", row_id, leg_h, leg_h, "legacy")
            report.counters.pulled += 1
        elif decision == "push" and app_p:
            _upsert_act(legacy, app_p, existing=leg)
            _set_state(primary, "act", row_id, app_h, app_h, "app")
            report.counters.pushed += 1
        else:
            report.counters.skipped += 1
            if leg_h and app_h:
                _set_state(primary, "act", row_id, leg_h, app_h, "skip")
    return report


# ─── Diagnoses / actdg ────────────────────────────────────────────────────────


def _diag_from_legacy(
    row: Dict[str, Any], diag_by_id: Dict[int, str]
) -> Optional[Dict[str, Any]]:
    if row.get("IDact") is None:
        return None
    label = _clean(diag_by_id.get(row.get("IDdiag")), 255)
    if not label:
        note = _clean(row.get("dg_note"), 255)
        if note and note.lower() not in ("aucun", "none", "n/a"):
            label = note
    if not label:
        label = "Non précisé"
    return {
        "id": int(row["IDdg"]),
        "act_id": int(row["IDact"]),
        "diagnosis_label": label,
        "diagnosis_notes": _clean(row.get("dg_note")),
        "diagnosis_type": "principal" if _clean(row.get("dg_type")) == "1" else "secondary",
        "IDdiag": row.get("IDdiag"),
    }


def _diag_from_app(row: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id": int(row["id"]),
        "act_id": int(row["act_id"]),
        "diagnosis_label": _clean(row.get("diagnosis_label"), 255) or "Non précisé",
        "diagnosis_notes": _clean(row.get("diagnosis_notes")),
        "diagnosis_type": _clean(row.get("diagnosis_type"), 20) or "principal",
    }


def _canonical_diag(d: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id": d["id"],
        "act_id": d["act_id"],
        "diagnosis_label": d.get("diagnosis_label"),
        "diagnosis_notes": d.get("diagnosis_notes"),
        "diagnosis_type": d.get("diagnosis_type"),
    }


def sync_diagnoses(
    legacy: pymysql.connections.Connection,
    primary: pymysql.connections.Connection,
) -> SyncReport:
    report = SyncReport("act_diagnoses")
    with legacy.cursor() as cur:
        cur.execute("SELECT IDdiag, diag_name FROM w104_local_diag")
        diag_by_id = {
            int(d["IDdiag"]): d["diag_name"]
            for d in cur.fetchall()
            if d.get("IDdiag") is not None
        }
        cur.execute("SELECT * FROM actdg")
        legs = {int(r["IDdg"]): r for r in cur.fetchall()}
    with primary.cursor() as cur:
        cur.execute("SELECT * FROM act_diagnoses")
        apps = {int(r["id"]): r for r in cur.fetchall()}
        cur.execute("SELECT id FROM medical_acts")
        act_ids = {int(r["id"]) for r in cur.fetchall()}

    for row_id in set(legs) | set(apps):
        leg = legs.get(row_id)
        app = apps.get(row_id)
        leg_p = _diag_from_legacy(leg, diag_by_id) if leg else None
        app_p = _diag_from_app(app) if app else None
        state = _get_state(primary, "diagnosis", row_id)
        if leg is None and app is not None and state is not None:
            with primary.cursor() as cur:
                cur.execute("DELETE FROM act_diagnoses WHERE id=%s", (row_id,))
            _clear_state(primary, "diagnosis", row_id)
            report.counters.deleted += 1
            continue
        if app is None and leg is not None and state is not None:
            with legacy.cursor() as cur:
                cur.execute("DELETE FROM actdg WHERE IDdg=%s", (row_id,))
            _clear_state(primary, "diagnosis", row_id)
            report.counters.deleted += 1
            continue
        if leg_p and leg_p["act_id"] not in act_ids:
            report.counters.skipped += 1
            continue
        if app_p and app_p["act_id"] not in act_ids:
            report.counters.skipped += 1
            continue
        leg_h = _hash_payload(_canonical_diag(leg_p)) if leg_p else None
        app_h = _hash_payload(_canonical_diag(app_p)) if app_p else None
        if leg_h is None and app_h is None:
            report.counters.skipped += 1
            continue
        decision = _decide(
            legacy_hash=leg_h,
            app_hash=app_h,
            state=state,
            legacy_ts=datetime.utcnow() if leg_p and not app_p else _ts(None),
            app_ts=_ts((app or {}).get("created_at")),
        )
        if decision in ("delete_app", "delete_legacy"):
            report.counters.skipped += 1
            continue
        if decision == "pull" and leg_p:
            with primary.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO act_diagnoses
                      (id, act_id, diagnosis_label, diagnosis_notes, diagnosis_type)
                    VALUES (%s,%s,%s,%s,%s)
                    ON DUPLICATE KEY UPDATE
                      act_id=VALUES(act_id),
                      diagnosis_label=VALUES(diagnosis_label),
                      diagnosis_notes=VALUES(diagnosis_notes),
                      diagnosis_type=VALUES(diagnosis_type)
                    """,
                    (
                        leg_p["id"],
                        leg_p["act_id"],
                        leg_p["diagnosis_label"],
                        leg_p.get("diagnosis_notes"),
                        leg_p.get("diagnosis_type"),
                    ),
                )
            _set_state(primary, "diagnosis", row_id, leg_h, leg_h, "legacy")
            report.counters.pulled += 1
        elif decision == "push" and app_p:
            dg_type = "1" if (app_p.get("diagnosis_type") or "").startswith("prin") else "2"
            _legacy_upsert(
                legacy,
                "actdg",
                "IDdg",
                app_p["id"],
                {
                    "IDact": app_p["act_id"],
                    "IDdiag": (leg or {}).get("IDdiag") or 0,
                    "IDuser": DEFAULT_LEGACY_USER_ID,
                    "dg_note": app_p.get("diagnosis_notes") or app_p.get("diagnosis_label"),
                    "dg_type": dg_type,
                },
            )
            _set_state(primary, "diagnosis", row_id, app_h, app_h, "app")
            report.counters.pushed += 1
        else:
            report.counters.skipped += 1
            if leg_h and app_h:
                _set_state(primary, "diagnosis", row_id, leg_h, app_h, "skip")
    return report


# ─── Documents / actfile ──────────────────────────────────────────────────────


def sync_documents(
    legacy: pymysql.connections.Connection,
    primary: pymysql.connections.Connection,
) -> SyncReport:
    report = SyncReport("act_documents")
    with legacy.cursor() as cur:
        cur.execute("SELECT * FROM actfile")
        legs = {int(r["IDactfile"]): r for r in cur.fetchall()}
    with primary.cursor() as cur:
        cur.execute("SELECT * FROM act_documents")
        apps = {int(r["id"]): r for r in cur.fetchall()}
        cur.execute("SELECT id FROM medical_acts")
        act_ids = {int(r["id"]) for r in cur.fetchall()}

    for row_id in set(legs) | set(apps):
        leg = legs.get(row_id)
        app = apps.get(row_id)
        leg_p = None
        if leg and leg.get("IDact") is not None:
            leg_p = {
                "id": int(leg["IDactfile"]),
                "act_id": int(leg["IDact"]),
                "filename": _clean(leg.get("actfile_name"), 255),
                "file_path": _clean(leg.get("actfile_path"), 500),
            }
        app_p = None
        if app:
            app_p = {
                "id": int(app["id"]),
                "act_id": int(app["act_id"]),
                "filename": _clean(app.get("filename"), 255),
                "file_path": _clean(app.get("file_path"), 500),
            }
        state = _get_state(primary, "document", row_id)
        if leg is None and app is not None and state is not None:
            with primary.cursor() as cur:
                cur.execute("DELETE FROM act_documents WHERE id=%s", (row_id,))
            _clear_state(primary, "document", row_id)
            report.counters.deleted += 1
            continue
        if app is None and leg is not None and state is not None:
            with legacy.cursor() as cur:
                cur.execute("DELETE FROM actfile WHERE IDactfile=%s", (row_id,))
            _clear_state(primary, "document", row_id)
            report.counters.deleted += 1
            continue
        if leg_p and leg_p["act_id"] not in act_ids:
            report.counters.skipped += 1
            continue
        if app_p and app_p["act_id"] not in act_ids:
            report.counters.skipped += 1
            continue
        leg_h = _hash_payload(leg_p) if leg_p else None
        app_h = _hash_payload(app_p) if app_p else None
        if leg_h is None and app_h is None:
            report.counters.skipped += 1
            continue
        decision = _decide(
            legacy_hash=leg_h,
            app_hash=app_h,
            state=state,
            legacy_ts=datetime.utcnow() if leg_p and not app_p else _ts(None),
            app_ts=_ts((app or {}).get("created_at")),
        )
        if decision in ("delete_app", "delete_legacy"):
            report.counters.skipped += 1
            continue
        if decision == "pull" and leg_p:
            with primary.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO act_documents (id, act_id, filename, file_path)
                    VALUES (%s,%s,%s,%s)
                    ON DUPLICATE KEY UPDATE
                      act_id=VALUES(act_id),
                      filename=VALUES(filename),
                      file_path=VALUES(file_path)
                    """,
                    (leg_p["id"], leg_p["act_id"], leg_p.get("filename"), leg_p.get("file_path")),
                )
            _set_state(primary, "document", row_id, leg_h, leg_h, "legacy")
            report.counters.pulled += 1
        elif decision == "push" and app_p:
            _legacy_upsert(
                legacy,
                "actfile",
                "IDactfile",
                app_p["id"],
                {
                    "IDact": app_p["act_id"],
                    "IDuser": DEFAULT_LEGACY_USER_ID,
                    "actfile_name": app_p.get("filename"),
                    "actfile_path": app_p.get("file_path"),
                },
            )
            _set_state(primary, "document", row_id, app_h, app_h, "app")
            report.counters.pushed += 1
        else:
            report.counters.skipped += 1
            if leg_h and app_h:
                _set_state(primary, "document", row_id, leg_h, app_h, "skip")
    return report


def run_bidi_sync(*, commit: bool = False) -> List[SyncReport]:
    _LEGACY_COL_CACHE.clear()
    legacy = connect_legacy(raw_bytes=True)
    primary = connect_primary()
    reports: List[SyncReport] = []

    def _bump_ai(conn: pymysql.connections.Connection, table: str, id_col: str) -> None:
        with conn.cursor() as cur:
            cur.execute(f"SELECT COALESCE(MAX(`{id_col}`), 0) + 1 AS n FROM `{table}`")
            n = int(cur.fetchone()["n"])
            # AUTO_INCREMENT cannot be a bound parameter on all MySQL versions
            cur.execute(f"ALTER TABLE `{table}` AUTO_INCREMENT = {n}")

    phases = (
        ("patients", sync_patients),
        ("appointments", sync_appointments),
        ("medical_acts", sync_acts),
        ("act_diagnoses", sync_diagnoses),
        ("act_documents", sync_documents),
    )

    try:
        ensure_sync_state_table(primary)
        # Avoid new app rows reusing low IDs after bulk import (would UPDATE wrong hoshealth person).
        try:
            _bump_ai(primary, "patients", "id")
            _bump_ai(primary, "appointments", "id")
            _bump_ai(primary, "medical_acts", "id")
            if commit:
                primary.commit()
        except Exception as exc:  # noqa: BLE001
            primary.rollback()
            logger.warning("AUTO_INCREMENT bump skipped: %s", exc)

        for name, fn in phases:
            try:
                reports.append(fn(legacy, primary))
                if commit:
                    legacy.commit()
                    primary.commit()
                else:
                    legacy.rollback()
                    primary.rollback()
                    # dry-run: keep going with fresh txn state
                    ensure_sync_state_table(primary)
            except Exception as exc:  # noqa: BLE001
                legacy.rollback()
                primary.rollback()
                logger.exception("Phase %s failed", name)
                print(f"[ERROR] phase={name}: {type(exc).__name__}: {exc}")
                # Continue other phases so patient push is not blocked by act/doc failures
                continue
    finally:
        legacy.close()
        primary.close()
    return reports
