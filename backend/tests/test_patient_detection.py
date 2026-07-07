"""Tests for patient auto-detection (IPP, compound names, messy sentences)."""

import pytest
from types import SimpleNamespace
from unittest.mock import Mock, patch

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.models.patient import Patient
from app.chat.rag.patient_detection import (
    detect_patient_from_query,
    detect_patient_from_texts,
    _candidate_token_lists,
    _name_token_splits,
    _normalize_person_name,
    _preposition_token_lists,
    _capitalized_token_lists,
    _looks_like_name_span,
)


def _patient(pid: int, first: str, last: str, ipp: str | None = None) -> Patient:
    row = Patient(first_name=first, last_name=last, ipp=ipp)
    row.id = pid
    return row


@pytest.fixture
def db():
    engine = create_engine("sqlite:///:memory:")
    Patient.__table__.create(bind=engine)
    session = sessionmaker(bind=engine)()
    yield session
    session.close()


@pytest.fixture
def enable_auto_detect():
    with patch("app.chat.rag.patient_detection.rag_config") as cfg:
        cfg.AUTO_DETECT_ENABLED = True
        cfg.AUTO_DETECT_REQUIRE_EXACT_MATCH = True
        yield cfg


def seed(session, *patients: Patient) -> None:
    session.add_all(patients)
    session.commit()


# ---------------------------------------------------------------------------
# Pure extraction / normalization
# ---------------------------------------------------------------------------

class TestTokenExtraction:
    def test_patient_keyword_anchor(self):
        lists, has_kw = _candidate_token_lists("patiente Fatima El Amrani")
        assert has_kw is True
        assert lists[0] == ["fatima", "el", "amrani"]

    def test_preposition_de(self):
        lists, has_kw = _candidate_token_lists(
            "Veuillez fournir les dossiers médicaux de Layla Laksiri pour décrire son cas."
        )
        assert has_kw is False
        assert ["layla", "laksiri"] in lists

    def test_capitalized_sequence(self):
        lists, _ = _candidate_token_lists("Qui est Ahmed Ben Ali aujourd'hui ?")
        assert ["ahmed", "ben", "ali"] in lists

    def test_d_apostrophe_name(self):
        spans = _preposition_token_lists(["dossier", "d'ahmed", "ben", "ali"])
        assert ["ahmed", "ben", "ali"] in spans

    def test_four_token_splits(self):
        splits = _name_token_splits(["mohammed", "ben", "ali", "alami"])
        assert ("mohammed", "ben ali alami") in splits
        assert ("mohammed ben", "ali alami") in splits
        assert ("mohammed ben ali", "alami") in splits

    def test_hyphen_normalized_to_space(self):
        assert _normalize_person_name("Jean-Pierre") == "jean pierre"
        assert _normalize_person_name("N'Diaye") == "n diaye"

    def test_looks_like_name_span_rejects_short_noise(self):
        assert _looks_like_name_span(["le", "du"]) is False
        assert _looks_like_name_span(["fatima", "amrani"]) is True


class TestCapitalizedExtraction:
    def test_messy_french_sentence(self):
        spans = _capitalized_token_lists(
            "Pourriez-vous résumer le dossier de Mohammed Ben Ali Alami svp ?"
        )
        assert spans == [["mohammed", "ben", "ali", "alami"]]


# ---------------------------------------------------------------------------
# SQLite-backed detection matrix
# ---------------------------------------------------------------------------

class TestPatientDetectionMatrix:
    def test_ipp_exact(self, db, enable_auto_detect):
        seed(db, _patient(1, "Fatima", "El Amrani", "2026-0042"))
        pid, warnings, name = detect_patient_from_query(db, "IPP 2026-0042")
        assert pid == 1
        assert warnings == []
        assert name == "Fatima El Amrani"

    def test_patiente_compound_surname_unique(self, db, enable_auto_detect):
        seed(
            db,
            _patient(18877, "Fatima", "El Amrani", "2026-0042"),
            _patient(99, "Fatima", "Amrani"),
            _patient(100, "Houria", "El Amrani"),
        )
        pid, warnings, name = detect_patient_from_query(db, "patiente Fatima El Amrani")
        assert pid == 18877
        assert warnings == []
        assert name == "Fatima El Amrani"

    def test_messy_sentence_de_name(self, db, enable_auto_detect):
        seed(db, _patient(2, "Layla", "Laksiri"))
        pid, warnings, _ = detect_patient_from_query(
            db,
            "Veuillez fournir les dossiers médicaux de Layla Laksiri pour décrire son cas.",
        )
        assert pid == 2
        assert warnings == []

    def test_four_token_compound_name(self, db, enable_auto_detect):
        seed(db, _patient(3, "Mohammed", "Ben Ali Alami"))
        pid, warnings, _ = detect_patient_from_query(
            db, "patiente Mohammed Ben Ali Alami"
        )
        assert pid == 3
        assert warnings == []

    def test_split_first_name_particle_storage(self, db, enable_auto_detect):
        """DB stores first='Mohammed Ben', last='Ali' — still resolves."""
        seed(db, _patient(4, "Mohammed Ben", "Ali"))
        pid, warnings, _ = detect_patient_from_query(db, "patient Mohammed Ben Ali")
        assert pid == 4
        assert warnings == []

    def test_hyphenated_first_name(self, db, enable_auto_detect):
        seed(db, _patient(5, "Jean-Pierre", "Dupont"))
        pid, warnings, _ = detect_patient_from_query(
            db, "dossier de Jean-Pierre Dupont"
        )
        assert pid == 5
        assert warnings == []

    def test_hyphen_db_space_query_hyphen(self, db, enable_auto_detect):
        seed(db, _patient(6, "Jean Pierre", "Martin"))
        pid, warnings, _ = detect_patient_from_query(db, "patiente Jean-Pierre Martin")
        assert pid == 6
        assert warnings == []

    def test_prefer_primary_split_over_alternate_storage(self, db, enable_auto_detect):
        """Same person stored as Fatima|El Amrani vs Fatima El|Amrani — primary split wins."""
        seed(
            db,
            _patient(18877, "Fatima", "El Amrani", "2026-0042"),
            _patient(99, "Fatima El", "Amrani"),
        )
        pid, warnings, _ = detect_patient_from_query(db, "patiente Fatima El Amrani")
        assert pid == 18877
        assert warnings == []

    def test_alternate_storage_when_primary_missing(self, db, enable_auto_detect):
        seed(db, _patient(99, "Fatima El", "Amrani"))
        pid, warnings, _ = detect_patient_from_query(db, "patiente Fatima El Amrani")
        assert pid == 99
        assert warnings == []

        seed(
            db,
            _patient(18877, "Fatima", "El Amrani"),
            _patient(10, "Fatima", "Amrani"),
            _patient(11, "Fatima", "Amrani"),
        )
        pid, warnings, _ = detect_patient_from_query(db, "patiente Fatima El Amrani")
        assert pid == 18877
        assert warnings == []

    def test_particleless_query_matches_db_compound(self, db, enable_auto_detect):
        seed(db, _patient(7, "Fatima", "El Amrani"))
        pid, warnings, _ = detect_patient_from_query(db, "patiente Fatima Amrani")
        assert pid == 7
        assert warnings == []

    def test_ambiguous_common_name(self, db, enable_auto_detect):
        seed(
            db,
            _patient(20, "Fatima", "El Amrani"),
            _patient(21, "Fatima", "El Amrani"),
        )
        pid, warnings, _ = detect_patient_from_query(db, "patiente Fatima El Amrani")
        assert pid is None
        assert any("Multiple patients" in w for w in warnings)

    def test_history_single_patient(self, db, enable_auto_detect):
        seed(db, _patient(18877, "Fatima", "El Amrani", "2026-0042"))
        pid, warnings, name = detect_patient_from_texts(
            db,
            ["patiente Fatima El Amrani", "resumez son dossier"],
        )
        assert pid == 18877
        assert name == "Fatima El Amrani"

    def test_ipp_not_found(self):
        db = Mock()
        db.query.return_value.filter.return_value.first.return_value = None
        with patch("app.chat.rag.patient_detection.rag_config") as cfg:
            cfg.AUTO_DETECT_ENABLED = True
            cfg.AUTO_DETECT_REQUIRE_EXACT_MATCH = True
            pid, warnings, _ = detect_patient_from_query(db, "IPP 99999")
        assert pid is None
        assert any("not found" in w.lower() for w in warnings)
