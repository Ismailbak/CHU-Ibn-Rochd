"""
Copy clinical tables from primary (rhumatoai) to secondary (rhumatoai_sec).

The app writes only to primary. RAG reads only from secondary after sync.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Iterable, List, Type

from sqlalchemy import inspect, text
from sqlalchemy.dialects.mysql import insert as mysql_insert
from sqlalchemy.orm import Session, sessionmaker

from app.models.user import User
from app.models.patient import Patient
from app.models.patient_allergy import PatientAllergy
from app.models.appointment import Appointment
from app.models.medical_act import MedicalAct, ActDiagnosis, ActTreatment
from app.models.act_result import ActResult
from app.sync.schema import init_secondary_schema

logger = logging.getLogger(__name__)

BATCH_SIZE = 500

# Order respects foreign keys on secondary.
SYNC_MODELS: List[Type] = [
    User,
    Patient,
    PatientAllergy,
    Appointment,
    MedicalAct,
    ActDiagnosis,
    ActTreatment,
    ActResult,
]


@dataclass
class SyncStats:
    table: str
    rows: int


def _row_to_dict(row) -> dict:
    return {col.key: getattr(row, col.key) for col in inspect(row.__class__).mapper.column_attrs}


def _upsert_batch(dest: Session, model: Type, rows: List[dict]) -> None:
    if not rows:
        return
    table = model.__table__
    stmt = mysql_insert(table).values(rows)
    update_cols = {
        col.name: stmt.inserted[col.name]
        for col in table.columns
        if col.name != "id"
    }
    dest.execute(stmt.on_duplicate_key_update(**update_cols))


def sync_table(source: Session, dest: Session, model: Type) -> SyncStats:
    table_name = model.__tablename__
    total = 0
    batch: List[dict] = []

    query = source.query(model).yield_per(BATCH_SIZE)
    for row in query:
        batch.append(_row_to_dict(row))
        if len(batch) >= BATCH_SIZE:
            _upsert_batch(dest, model, batch)
            total += len(batch)
            batch = []

    if batch:
        _upsert_batch(dest, model, batch)
        total += len(batch)

    dest.commit()
    logger.info("Synced %s rows into %s", total, table_name)
    return SyncStats(table=table_name, rows=total)


def sync_primary_to_secondary(
    source_factory: sessionmaker,
    dest_factory: sessionmaker,
    *,
    init_schema: bool = False,
) -> List[SyncStats]:
    source = source_factory()
    dest = dest_factory()
    stats: List[SyncStats] = []

    try:
        if init_schema:
            init_secondary_schema(dest.bind)

        dest.execute(text("SET FOREIGN_KEY_CHECKS=0"))
        try:
            for model in SYNC_MODELS:
                stats.append(sync_table(source, dest, model))
        finally:
            dest.execute(text("SET FOREIGN_KEY_CHECKS=1"))
            dest.commit()
    finally:
        source.close()
        dest.close()

    return stats
