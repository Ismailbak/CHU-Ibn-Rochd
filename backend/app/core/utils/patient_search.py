"""Shared patient text search — name-first, avoids noisy address street matches."""

from __future__ import annotations

import re
from typing import List

from sqlalchemy import and_, exists, or_
from sqlalchemy.orm import Query
from sqlalchemy.sql.elements import ColumnElement

from app.models.medical_act import ActDiagnosis, MedicalAct
from app.models.patient import Patient

_TOKEN_RE = re.compile(r"[^\W\d_]+(?:[-''][^\W\d_]+)*", re.UNICODE)
_MIN_TOKEN_LEN = 2


def tokenize_patient_query(raw: str) -> List[str]:
    """Split a search string into lowercase tokens (min length 2)."""
    if not raw:
        return []
    tokens = [t.lower() for t in _TOKEN_RE.findall(raw.strip()) if len(t) >= _MIN_TOKEN_LEN]
    return tokens


def _like(value: str) -> str:
    return f"%{value}%"


def _full_name_expr():
    return Patient.first_name + " " + Patient.last_name


def _full_name_reversed_expr():
    return Patient.last_name + " " + Patient.first_name


def _token_name_match(token: str) -> ColumnElement:
    """Token matches first name, last name, or full name (both orders)."""
    pattern = _like(token)
    return or_(
        Patient.first_name.ilike(pattern),
        Patient.last_name.ilike(pattern),
        _full_name_expr().ilike(pattern),
        _full_name_reversed_expr().ilike(pattern),
    )


def _act_diagnosis_match(token: str) -> ColumnElement:
    pattern = _like(token)
    return (
        exists()
        .where(
            MedicalAct.patient_id == Patient.id,
            ActDiagnosis.act_id == MedicalAct.id,
            ActDiagnosis.diagnosis_label.ilike(pattern),
        )
    )


def _single_token_clause(token: str) -> ColumnElement:
    pattern = _like(token)
    return or_(
        _token_name_match(token),
        Patient.ipp.ilike(pattern),
        Patient.phone.ilike(pattern),
        Patient.email.ilike(pattern),
        Patient.city.ilike(pattern),
        Patient.primary_diagnosis.ilike(pattern),
        _act_diagnosis_match(token),
    )


def _two_token_name_orientations(first: str, second: str) -> ColumnElement:
    p0, p1 = _like(first), _like(second)
    return or_(
        and_(Patient.first_name.ilike(p0), Patient.last_name.ilike(p1)),
        and_(Patient.first_name.ilike(p1), Patient.last_name.ilike(p0)),
    )


def patient_search_clause(raw_query: str) -> ColumnElement | None:
    """
    Build a WHERE clause for patient identity search.

    - Ignores address (avoids false positives e.g. « BD MOULAY ISMAIL »).
    - Supports multi-token names in either order.
    - Matches IPP, phone, email, city, diagnosis as secondary fields.
    """
    query = (raw_query or "").strip()
    if not query:
        return None

    tokens = tokenize_patient_query(query)
    if not tokens:
        # Short query (1 char) — allow IPP prefix only
        if len(query.strip()) >= 1:
            return Patient.ipp.ilike(_like(query.strip()))
        return None

    clauses: List[ColumnElement] = []

    if len(tokens) == 1:
        clauses.append(_single_token_clause(tokens[0]))
    elif len(tokens) == 2:
        t0, t1 = tokens[0], tokens[1]
        clauses.append(_two_token_name_orientations(t0, t1))
        clauses.append(and_(_token_name_match(t0), _token_name_match(t1)))
        # Whole query as typed (helps «hassan moustakim» substring on compound last names)
        whole = _like(query.lower())
        clauses.append(_full_name_expr().ilike(whole))
        clauses.append(_full_name_reversed_expr().ilike(whole))
        clauses.append(Patient.ipp.ilike(whole))
    else:
        # 3+ tokens: every token must appear somewhere in the identity fields
        clauses.append(and_(*[_token_name_match(t) for t in tokens[:6]]))
        whole = _like(query.lower())
        clauses.append(_full_name_expr().ilike(whole))
        clauses.append(_full_name_reversed_expr().ilike(whole))

    return or_(*clauses)


def apply_patient_search(query: Query, raw_query: str | None) -> Query:
    """Filter a Patient query with the shared search clause."""
    clause = patient_search_clause(raw_query or "")
    if clause is not None:
        query = query.filter(clause)
    return query
