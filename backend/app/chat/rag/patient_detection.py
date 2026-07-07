"""
Strict patient auto-detection for RAG (IPP exact match, unique full-name match).

Name resolution strategy (precision-first — never guess between multiple patients):
1. IPP exact match.
2. Sliding windows of 2..MAX_NAME_TOKENS consecutive name tokens, largest first.
   Each window is split at every position into (first_name, last_name) candidates,
   in both orders, so compound names of any length work:
   "Mohammed Ben Ali Alami" -> (mohammed | ben ali alami), (mohammed ben | ali alami), ...
   Matching is tiered per window: exact SQL -> accent/hyphen-insensitive -> particle-stripped
   (only when the query omits surname particles like El/Ben).
3. Surname-only fallback ("patiente El Amrani") when the query mentions patient(e).
4. Single-token fallback ("patiente Amrani") when the query mentions patient(e).
A unique match is required at every step; multiple candidates produce a warning.
"""

import re
import logging
import unicodedata
from typing import Dict, List, Optional, Tuple

from sqlalchemy.orm import Session
from sqlalchemy import or_

from app.core.config_rag import rag_config
from app.models.patient import Patient

logger = logging.getLogger(__name__)

IPP_PATTERN = re.compile(
    r"\b(?:ipp|score\s*ipp)\s*[:=]?\s*([A-Za-z0-9][A-Za-z0-9-]{0,19})\b",
    re.IGNORECASE,
)

# Tokens allowing internal hyphens/apostrophes: "jean-pierre", "n'diaye"
NAME_TOKEN_PATTERN = re.compile(r"[^\W\d_]+(?:[-'’][^\W\d_]+)*", re.UNICODE)

CAPITALIZED_NAME_WORD = re.compile(
    r"[A-ZÀ-ÖÙ-Ý][a-zà-öù-ÿ]*(?:[-'][A-ZÀ-ÖÙ-Ý][a-zà-öù-ÿ]+)*",
    re.UNICODE,
)

PATIENT_KEYWORDS = {"patient", "patiente", "patients", "patientes"}
PREPOSITIONS = {"de", "du", "des"}

MAX_NAME_TOKENS = 6

NAME_STOPWORDS = {
    "what", "can", "you", "tell", "me", "about", "the", "patient", "patiente",
    "patients", "patientes",
    "who", "is", "of", "a", "an", "in", "on", "for", "with", "happened", "to",
    "hey", "bonjour", "bonsoir", "salut", "svp", "please", "que", "peux", "tu",
    "dire", "moi", "sur", "le", "la", "du", "de", "des", "un", "une", "et", "ou",
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
    "presenter", "présenter", "parle", "parler", "donne", "donner", "donnez",
    "monsieur", "madame", "mademoiselle", "mme", "mlle", "mr",
    "docteur", "dr", "professeur", "pr",
    "merci", "voir", "s'il", "sil", "plait", "plaît", "stp",
    "ce", "cet", "cette", "ces", "quel", "quelle", "quels", "quelles",
    "est", "sont", "avec", "chez", "nous", "vous", "votre", "vos",
    "notre", "nos", "mon", "ma", "mes", "concernant", "propos",
    "traitement", "traitements", "ordonnance", "ordonnances",
    "analyses", "resultats", "résultats", "rendez-vous",
    "aujourd'hui", "hier", "demain", "qui", "quoi", "comment",
    "historique", "liste", "dernier", "derniere", "dernière",
    "pourriez", "pourrions", "pourrait", "résumer", "resumer",
}

CAPITALIZED_SENTENCE_STARTERS = {
    "pourriez", "veuillez", "merci", "bonjour", "bonsoir", "salut",
}

NAME_PARTICLES = {
    "el", "al", "de", "du", "des", "ben", "bel", "ibn", "bin", "bint",
    "ait", "aiti", "oul", "ould", "la", "le", "van", "von",
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

    token_lists, has_keyword = _candidate_token_lists(query)

    for tokens in token_lists:
        if len(tokens) < 2:
            continue
        patient, ambiguous = _search_name_windows(db, tokens)
        if patient is not None:
            return patient.id, warnings, _patient_display_name(patient)
        if ambiguous:
            warnings.append(_ambiguous_name_warning(ambiguous))
            return None, warnings, None

    if has_keyword:
        for tokens in token_lists:
            if 2 <= len(tokens) <= 3:
                surname_matches = _find_patients_by_full_surname(db, tokens)
                if len(surname_matches) == 1:
                    patient = surname_matches[0]
                    return patient.id, warnings, _patient_display_name(patient)
                if len(surname_matches) > 1:
                    warnings.append(_ambiguous_name_warning(surname_matches))
                    return None, warnings, None

        for tokens in token_lists:
            if len(tokens) == 1:
                single_matches = _find_patients_by_single_token(db, tokens[0])
                if len(single_matches) == 1:
                    patient = single_matches[0]
                    return patient.id, warnings, _patient_display_name(patient)
                if len(single_matches) > 1:
                    warnings.append(_ambiguous_name_warning(single_matches))
                    return None, warnings, None

    return None, warnings, None


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


# ---------------------------------------------------------------------------
# Token extraction
# ---------------------------------------------------------------------------

def _candidate_token_lists(query: str) -> Tuple[List[List[str]], bool]:
    """
    Return prioritized token lists to search, plus whether patient(e) was mentioned.

    Priority:
    1. Tokens right after "patient(e)".
    2. Tokens after a preposition (de/du/des/d').
    3. Capitalized name sequences (handles "qui est Ahmed Ben Ali").
    4. All non-stopword tokens when the span looks name-like.
    """
    raw = NAME_TOKEN_PATTERN.findall(query)
    lower = [t.lower() for t in raw]

    keyword_index = next(
        (i for i, t in enumerate(lower) if t in PATIENT_KEYWORDS), None
    )
    has_keyword = keyword_index is not None

    lists: List[List[str]] = []

    def append_unique(span: List[str]) -> None:
        trimmed = span[:MAX_NAME_TOKENS]
        if len(trimmed) >= 2 and trimmed not in lists:
            lists.append(trimmed)

    if keyword_index is not None:
        after = [
            t
            for t in lower[keyword_index + 1 : keyword_index + 1 + MAX_NAME_TOKENS + 2]
            if t not in NAME_STOPWORDS
        ]
        append_unique(after)

    for span in _preposition_token_lists(lower):
        append_unique(span)

    for span in _capitalized_token_lists(query):
        append_unique(span)

    filtered_all = [t for t in lower if t not in NAME_STOPWORDS][:MAX_NAME_TOKENS + 4]
    if _looks_like_name_span(filtered_all) and filtered_all not in lists:
        lists.append(filtered_all[:MAX_NAME_TOKENS])

    return lists, has_keyword


def _take_name_tokens(lower: List[str], start: int, limit: int = MAX_NAME_TOKENS) -> List[str]:
    span: List[str] = []
    for token in lower[start : start + limit + 2]:
        if token in NAME_STOPWORDS or token in PATIENT_KEYWORDS:
            break
        span.append(token)
        if len(span) >= limit:
            break
    return span


def _preposition_token_lists(lower: List[str]) -> List[List[str]]:
    """Extract name spans after de/du/des or d'Ahmed-style tokens."""
    lists: List[List[str]] = []
    for index, token in enumerate(lower):
        if token in PREPOSITIONS:
            span = _take_name_tokens(lower, index + 1)
            if len(span) >= 2:
                lists.append(span)
        elif token.startswith("d'") and len(token) > 2:
            span = [token[2:]] + _take_name_tokens(lower, index + 1, limit=MAX_NAME_TOKENS - 1)
            if len(span) >= 2:
                lists.append(span[:MAX_NAME_TOKENS])
    return lists


def _capitalized_token_lists(query: str) -> List[List[str]]:
    """Extract sequences of capitalized words (typical proper names in French prose)."""
    words = CAPITALIZED_NAME_WORD.findall(query)
    if len(words) < 2:
        return []

    lower_words = [w.lower() for w in words]
    clean = [
        w for w in lower_words
        if w not in NAME_STOPWORDS
        and w not in PATIENT_KEYWORDS
        and w not in CAPITALIZED_SENTENCE_STARTERS
    ]
    if len(clean) >= 2:
        return [clean[:MAX_NAME_TOKENS]]
    return []


def _looks_like_name_span(tokens: List[str]) -> bool:
    """Heuristic: at least two tokens and one substantial name fragment."""
    if len(tokens) < 2:
        return False
    substantial = [t for t in tokens if len(re.split(r"[-'’]", t)[-1]) >= 3]
    return len(substantial) >= 2


# ---------------------------------------------------------------------------
# Window/split search
# ---------------------------------------------------------------------------

def _search_name_windows(
    db: Session, tokens: List[str]
) -> Tuple[Optional[Patient], Optional[List[Patient]]]:
    """
    Slide windows of consecutive tokens (largest first) and match each window
    against patient names. Returns (patient, ambiguous_matches).
    """
    max_size = min(len(tokens), MAX_NAME_TOKENS)
    for size in range(max_size, 1, -1):
        found: Dict[int, Patient] = {}
        for start in range(len(tokens) - size + 1):
            window = tokens[start : start + size]
            for patient in _find_patients_by_name_tokens(db, window):
                found[patient.id] = patient
        if len(found) == 1:
            return next(iter(found.values())), None
        if len(found) > 1:
            return None, list(found.values())
    return None, None


def _name_token_splits(tokens: List[str]) -> List[Tuple[str, str]]:
    """All (first_name, last_name) splits of a token window, e.g. 4 tokens -> 3 splits."""
    return [
        (" ".join(tokens[:index]), " ".join(tokens[index:]))
        for index in range(1, len(tokens))
    ]


def _sql_name_variants(name: str) -> List[str]:
    """Return SQL ILIKE variants (hyphen/apostrophe <-> space)."""
    variants = [name]
    spaced = re.sub(r"[-'’]", " ", name)
    spaced = re.sub(r"\s+", " ", spaced).strip()
    if spaced and spaced not in variants:
        variants.append(spaced)
    return variants


def _last_name_has_leading_particle(last_norm: str) -> bool:
    parts = last_norm.split()
    return bool(parts and parts[0] in NAME_PARTICLES)


def _rank_name_splits(tokens: List[str]) -> List[Tuple[str, str]]:
    """Prefer single-token first name + compound last name (most common DB layout)."""
    splits = _name_token_splits(tokens)

    def score(pair: Tuple[str, str]) -> int:
        first, last = pair
        first_words = len(first.split())
        last_words = len(last.split())
        particle_bonus = 15 if last_words >= 2 and last.split()[0] in NAME_PARTICLES else 0
        return (100 if first_words == 1 else 60 - first_words * 10) + last_words * 12 + len(last) + particle_bonus

    return sorted(splits, key=score, reverse=True)


def _sql_pair_match(db: Session, first_raw: str, last_raw: str) -> List[Patient]:
    """Exact first/last ILIKE match with hyphen/space variants (no swapped order)."""
    matched: Dict[int, Patient] = {}
    for first_v in _sql_name_variants(first_raw):
        for last_v in _sql_name_variants(last_raw):
            rows = (
                db.query(Patient)
                .filter(
                    Patient.first_name.ilike(first_v),
                    Patient.last_name.ilike(last_v),
                )
                .all()
            )
            for patient in rows:
                matched[patient.id] = patient
    return list(matched.values())


def _fuzzy_pair_match(
    db: Session,
    first_raw: str,
    last_raw: str,
    source_tokens: List[str],
    *,
    allow_particle_strip: bool,
) -> List[Patient]:
    """Normalized first/last match against a narrowed candidate set."""
    nf = _normalize_person_name(first_raw)
    nl = _normalize_person_name(last_raw)
    if len(nf) < 2 or len(nl) < 2:
        return []

    candidates = _fuzzy_candidates(db, source_tokens)
    matched: Dict[int, Patient] = {}

    for patient in candidates:
        pf = _normalize_person_name(patient.first_name or "")
        pl = _normalize_person_name(patient.last_name or "")
        if pf == nf and pl == nl:
            matched[patient.id] = patient
            continue
        if allow_particle_strip and not _last_name_has_leading_particle(nl):
            stripped_pl = _strip_name_particles(pl)
            stripped_nl = _strip_name_particles(nl)
            if stripped_nl and pf == nf and stripped_pl == stripped_nl:
                matched[patient.id] = patient

    return list(matched.values())


def _find_patients_by_name_tokens(db: Session, tokens: List[str]) -> List[Patient]:
    """
    Tiered matching per split (best split first — never merge weaker splits):
    1. Exact ILIKE (with hyphen/space variants).
    2. Accent/hyphen-insensitive equality.
    3. Particle-stripped surname — only when the query omits surname particles.
    """
    if len(tokens) < 2:
        return []

    for first_raw, last_raw in _rank_name_splits(tokens):
        matches = _sql_pair_match(db, first_raw, last_raw)
        if matches:
            return matches

    allow_particle_strip = not any(
        _last_name_has_leading_particle(_normalize_person_name(last))
        for _, last in _rank_name_splits(tokens)
    )

    for first_raw, last_raw in _rank_name_splits(tokens):
        matches = _fuzzy_pair_match(
            db,
            first_raw,
            last_raw,
            tokens,
            allow_particle_strip=allow_particle_strip,
        )
        if matches:
            return matches

    return []


def _fuzzy_candidates(db: Session, tokens: List[str]) -> List[Patient]:
    """Narrow candidate set for Python-side comparison."""
    last_segment = re.split(r"[-'’]", tokens[-1])[-1]
    first_segment = re.split(r"[-'’]", tokens[0])[-1]
    segment = last_segment if len(last_segment) >= 3 else first_segment
    if len(segment) < 3:
        return []

    query = db.query(Patient).filter(
        or_(
            Patient.last_name.ilike(f"%{segment}%"),
            Patient.first_name.ilike(f"%{segment}%"),
        )
    )
    if len(first_segment) >= 3:
        query = query.filter(
            or_(
                Patient.first_name.ilike(tokens[0]),
                Patient.first_name.ilike(f"%{first_segment}%"),
            )
        )
    return query.limit(500).all()


# ---------------------------------------------------------------------------
# Keyword-anchored fallbacks
# ---------------------------------------------------------------------------

def _find_patients_by_full_surname(db: Session, tokens: List[str]) -> List[Patient]:
    """Whole token sequence as a surname or first name ("patiente El Amrani")."""
    joined = " ".join(tokens)
    rows = (
        db.query(Patient)
        .filter(
            or_(
                Patient.last_name.ilike(joined),
                Patient.first_name.ilike(joined),
            )
        )
        .limit(5)
        .all()
    )
    if rows:
        return rows

    normalized = _normalize_person_name(joined)
    matched: Dict[int, Patient] = {}
    for patient in _fuzzy_candidates(db, tokens):
        pl = _normalize_person_name(patient.last_name or "")
        pf = _normalize_person_name(patient.first_name or "")
        if normalized in (pl, pf):
            matched[patient.id] = patient
    return list(matched.values())


def _find_patients_by_single_token(db: Session, token: str) -> List[Patient]:
    """Match a lone name token against first or last name (incl. compound last names)."""
    if len(token) < 3:
        return []
    variants = _sql_name_variants(token)
    filters = []
    for variant in variants:
        filters.extend([
            Patient.first_name.ilike(variant),
            Patient.last_name.ilike(variant),
            Patient.last_name.ilike(f"% {variant}"),
            Patient.last_name.ilike(f"{variant} %"),
        ])
    matches = db.query(Patient).filter(or_(*filters)).limit(5).all()
    return matches


# ---------------------------------------------------------------------------
# Normalization helpers
# ---------------------------------------------------------------------------

def _ambiguous_name_warning(matches: List[Patient]) -> str:
    """Build a warning that lists IPPs so the user can disambiguate."""
    ipp_labels = []
    for patient in matches[:5]:
        ipp = getattr(patient, "ipp", None)
        if isinstance(ipp, str) and ipp.strip():
            ipp_labels.append(f"IPP {ipp.strip()}")
        else:
            ipp_labels.append(f"#{patient.id}")
    suffix = ", ".join(ipp_labels) if ipp_labels else "plusieurs dossiers"
    return (
        f"Plusieurs patients correspondent à ce nom ({suffix}). "
        "Veuillez préciser l'IPP."
    )


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


def _normalize_person_name(value: str) -> str:
    """Lowercase, accent-free, hyphens/apostrophes treated as spaces."""
    lowered = _strip_accents(value).lower()
    lowered = re.sub(r"[-'’]", " ", lowered)
    return re.sub(r"\s+", " ", lowered).strip()


def _strip_name_particles(name: str) -> str:
    parts = name.split()
    while parts and parts[0] in NAME_PARTICLES:
        parts = parts[1:]
    return " ".join(parts)
