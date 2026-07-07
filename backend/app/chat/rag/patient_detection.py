"""
Strict patient auto-detection for RAG (IPP exact match, optional full-name unique match).
"""

import re
import logging
import unicodedata
from typing import List, Optional, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import or_

from app.core.config_rag import rag_config
from app.models.patient import Patient

logger = logging.getLogger(__name__)

IPP_PATTERN = re.compile(
    r"\b(?:ipp|score\s*ipp)\s*[:=]?\s*([A-Za-z0-9][A-Za-z0-9-]{0,19})\b",
    re.IGNORECASE,
)

NAME_STOPWORDS = {
    "what", "can", "you", "tell", "me", "about", "the", "patient", "patiente",
    "who", "is", "of", "a", "an", "in", "on", "for", "with", "happened", "to",
    "hey", "bonjour", "salut", "svp", "please", "que", "peux", "tu", "dire",
    "moi", "sur", "le", "la", "du", "de", "des", "un", "une", "et", "ou",
    "veuillez", "fournir", "dossier", "dossiers", "medical", "medicaux",
    "médical", "médicaux", "donnee", "donnees", "donnée", "données",
    "clinique", "cliniques", "pour", "puisse", "pouvoir", "decrire",
    "décrire", "cas", "synthese", "synthèse", "preuve", "preuves",
    "contexte", "associe", "associé", "requete", "requête", "joindre",
    "examens", "antecedents", "antécédents", "notes", "consultation",
    "info", "infos", "information", "informations",
    "je", "ne", "pas", "sans", "aucun", "aucune", "se", "son", "sa",
    "ses", "elle", "il", "lui", "leur", "leurs", "doit", "devrait",
    "resume", "résume", "resumer", "résumer", "resumez", "résumez",
    "montre", "montrer", "montrez", "affiche", "afficher", "affichez",
    "situation", "bilan",
    "presenter", "présenter", "parle", "parler", "donne", "donner",
}


def detect_patient_from_query(
    db: Session, query: str
) -> Tuple[Optional[int], List[str], Optional[str]]:
    """
    Resolve patient id from query text.

    Returns:
        (patient_id or None, warnings, display_name or None)
    """
    warnings: List[str] = []

    if not rag_config.AUTO_DETECT_ENABLED:
        return None, warnings, None

    ipp_match = IPP_PATTERN.search(query)
    if ipp_match:
        ipp_value = ipp_match.group(1).strip()
        patient = db.query(Patient).filter(Patient.ipp == ipp_value).first()
        if patient:
            return patient.id, warnings, _patient_display_name(patient)

        if rag_config.AUTO_DETECT_REQUIRE_EXACT_MATCH:
            warnings.append(f"Patient with IPP '{ipp_value}' not found.")
            return None, warnings, None

        normalized = _normalize_ipp(ipp_value)
        candidates = [
            p for p in db.query(Patient).filter(Patient.ipp.isnot(None)).all()
            if _normalize_ipp(p.ipp) == normalized
        ]
        if len(candidates) == 1:
            return candidates[0].id, warnings, _patient_display_name(candidates[0])
        if len(candidates) > 1:
            warnings.append("Multiple patients matched the provided IPP. Please clarify.")
        else:
            warnings.append(f"Patient with IPP '{ipp_value}' not found.")
        return None, warnings, None

    tokens = _extract_name_tokens(query)
    candidate_pairs = _extract_name_pairs(query)
    if candidate_pairs:
        matches_by_id = {}
        for first_t, last_t in candidate_pairs:
            for patient in _find_patients_by_name_pair(db, first_t, last_t):
                matches_by_id[patient.id] = patient

        # Compound surname mentioned alone ("... de El Amrani")
        if not matches_by_id:
            for index in range(len(tokens) - 1):
                combo = f"{tokens[index]} {tokens[index + 1]}"
                for patient in (
                    db.query(Patient)
                    .filter(
                        or_(
                            Patient.last_name.ilike(combo),
                            Patient.first_name.ilike(combo),
                        )
                    )
                    .limit(5)
                    .all()
                ):
                    matches_by_id[patient.id] = patient

        if len(matches_by_id) == 1:
            patient = next(iter(matches_by_id.values()))
            return patient.id, warnings, _patient_display_name(patient)
        if len(matches_by_id) > 1:
            warnings.append("Multiple patients matched the provided name. Please specify IPP.")
        return None, warnings, None

    # Lone name after "patient(e)" (e.g. "patiente Amrani") — accept only a unique match
    if len(tokens) == 1 and re.search(r"\bpatiente?\b", query, re.IGNORECASE):
        single_matches = _find_patients_by_single_token(db, tokens[0])
        if len(single_matches) == 1:
            patient = single_matches[0]
            return patient.id, warnings, _patient_display_name(patient)
        if len(single_matches) > 1:
            warnings.append("Multiple patients matched the provided name. Please specify IPP.")
        return None, warnings, None

    return None, warnings, None


def _patient_display_name(patient: Patient) -> str:
    parts = []
    for attr in ("first_name", "last_name"):
        value = getattr(patient, attr, None)
        if isinstance(value, str) and value.strip():
            parts.append(value.strip())
    if parts:
        return " ".join(parts)
    patient_id = getattr(patient, "id", None)
    return f"Patient #{patient_id}" if patient_id is not None else "Patient"


def _normalize_ipp(value: str) -> str:
    if not value:
        return ""
    cleaned = re.sub(r"[^A-Za-z0-9]", "", value).lower()
    if cleaned.startswith("ipp"):
        cleaned = cleaned[3:]
    if cleaned.isdigit():
        cleaned = cleaned.lstrip("0") or "0"
    return cleaned


def _strip_accents(value: str) -> str:
    normalized = unicodedata.normalize("NFD", value)
    return "".join(ch for ch in normalized if unicodedata.category(ch) != "Mn")


def _normalize_name_token(value: str) -> str:
    return _strip_accents(value).lower().strip()


def _find_patients_by_name_pair(db: Session, first_t: str, last_t: str) -> List[Patient]:
    """Exact ilike match, then accent-insensitive fallback on a narrowed candidate set."""
    direct = (
        db.query(Patient)
        .filter(
            or_(
                (
                    Patient.first_name.ilike(first_t)
                    & Patient.last_name.ilike(last_t)
                ),
                (
                    Patient.first_name.ilike(last_t)
                    & Patient.last_name.ilike(first_t)
                ),
            )
        )
        .all()
    )
    if direct:
        return direct

    nf, nl = _normalize_name_token(first_t), _normalize_name_token(last_t)
    if len(nf) < 2 or len(nl) < 2:
        return []

    prefix = nl[:3]
    candidates = (
        db.query(Patient)
        .filter(
            or_(
                Patient.last_name.ilike(f"%{prefix}%"),
                Patient.first_name.ilike(f"%{prefix}%"),
            )
        )
        .limit(100)
        .all()
    )
    matched = []
    for patient in candidates:
        pf = _normalize_name_token(patient.first_name or "")
        pl = _normalize_name_token(patient.last_name or "")
        if (pf == nf and pl == nl) or (pf == nl and pl == nf):
            matched.append(patient)
    return matched


def _extract_name_tokens(query: str) -> List[str]:
    raw = re.findall(r"[^\W\d_]+(?:[-'][^\W\d_]+)?", query, flags=re.UNICODE)
    lower = [t.lower() for t in raw]
    tokens = [t for t in lower if t not in NAME_STOPWORDS]

    if "patient" in lower:
        idx = lower.index("patient")
        tokens = lower[idx + 1 : idx + 4]
    elif "patiente" in lower:
        idx = lower.index("patiente")
        tokens = lower[idx + 1 : idx + 4]

    tokens = [t for t in tokens if t not in NAME_STOPWORDS]
    return tokens[:12]


def _extract_name_pairs(query: str) -> List[Tuple[str, str]]:
    tokens = _extract_name_tokens(query)
    pairs: List[Tuple[str, str]] = []

    def add_pair(first_t: str, last_t: str) -> None:
        if len(first_t) < 2 or len(last_t) < 2:
            return
        pair = (first_t, last_t)
        if pair not in pairs:
            pairs.append(pair)

    for index in range(len(tokens) - 1):
        add_pair(tokens[index], tokens[index + 1])

    # Compound names ("Fatima El Amrani" → first="fatima", last="el amrani")
    for index in range(len(tokens) - 2):
        a, b, c = tokens[index], tokens[index + 1], tokens[index + 2]
        add_pair(a, f"{b} {c}")
        add_pair(f"{a} {b}", c)

    # Skip middle particles ("Fatima El Amrani" stored as first="Fatima", last="Amrani")
    if len(tokens) >= 3:
        add_pair(tokens[0], tokens[-1])

    return pairs


def detect_patient_from_texts(
    db: Session, texts: List[str]
) -> Tuple[Optional[int], List[str], Optional[str]]:
    """Try to resolve a patient from one or more prior user messages."""
    warnings: List[str] = []
    matches_by_id = {}
    for text in texts:
        if not text or not text.strip():
            continue
        pid, text_warnings, name = detect_patient_from_query(db, text)
        warnings.extend(text_warnings)
        if pid:
            matches_by_id[pid] = name

    if len(matches_by_id) == 1:
        pid = next(iter(matches_by_id))
        return pid, warnings, matches_by_id[pid]
    if len(matches_by_id) > 1:
        warnings.append("Multiple patients matched the conversation history. Please specify IPP.")
    return None, warnings, None


def _find_patients_by_single_token(db: Session, token: str) -> List[Patient]:
    """Match a lone name token against first or last name (incl. compound last names)."""
    if len(token) < 3:
        return []
    matches = (
        db.query(Patient)
        .filter(
            or_(
                Patient.first_name.ilike(token),
                Patient.last_name.ilike(token),
                Patient.last_name.ilike(f"% {token}"),
                Patient.last_name.ilike(f"{token} %"),
            )
        )
        .limit(5)
        .all()
    )
    return matches
