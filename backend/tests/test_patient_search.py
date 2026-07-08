"""Tests for shared patient list / global search filtering."""

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.utils.patient_search import apply_patient_search, tokenize_patient_query
from app.models.medical_act import ActDiagnosis, MedicalAct
from app.models.patient import Patient


def _patient(first: str, last: str, **kwargs) -> Patient:
    return Patient(first_name=first, last_name=last, **kwargs)


@pytest.fixture
def db():
    engine = create_engine("sqlite:///:memory:")
    Patient.__table__.create(bind=engine)
    MedicalAct.__table__.create(bind=engine)
    ActDiagnosis.__table__.create(bind=engine)
    session = sessionmaker(bind=engine)()
    yield session
    session.close()


class TestTokenizePatientQuery:
    def test_splits_and_lowercases(self):
        assert tokenize_patient_query("Ismail SIDI") == ["ismail", "sidi"]

    def test_ignores_single_char_tokens(self):
        assert tokenize_patient_query("a ismail") == ["ismail"]

    def test_empty(self):
        assert tokenize_patient_query("") == []
        assert tokenize_patient_query("  ") == []


class TestApplyPatientSearch:
    def test_name_match(self, db):
        db.add_all(
            [
                _patient("Ismail", "SIDI BABA"),
                _patient("Widad", "FADIL"),
            ]
        )
        db.commit()

        rows = apply_patient_search(db.query(Patient), "ismail").all()
        names = {(p.first_name, p.last_name) for p in rows}
        assert ("Ismail", "SIDI BABA") in names
        assert ("Widad", "FADIL") not in names

    def test_does_not_match_address_street(self, db):
        db.add_all(
            [
                _patient("Widad", "FADIL", address="BD MOULAY ISMAIL, Casablanca"),
                _patient("Ismail", "SIDI BABA"),
            ]
        )
        db.commit()

        rows = apply_patient_search(db.query(Patient), "ismail").all()
        names = {(p.first_name, p.last_name) for p in rows}
        assert ("Ismail", "SIDI BABA") in names
        assert ("Widad", "FADIL") not in names

    def test_two_token_name_either_order(self, db):
        db.add_all(
            [
                _patient("Hassan", "MOUSTAKIM"),
                _patient("Fatima", "ALAMI"),
            ]
        )
        db.commit()

        forward = apply_patient_search(db.query(Patient), "hassan moustakim").all()
        reverse = apply_patient_search(db.query(Patient), "moustakim hassan").all()
        assert len(forward) == 1
        assert len(reverse) == 1
        assert forward[0].last_name == "MOUSTAKIM"
        assert reverse[0].last_name == "MOUSTAKIM"

    def test_partial_last_name(self, db):
        db.add(_patient("Nezha", "ALAOUI ISMAILI EP JAIDI"))
        db.commit()

        rows = apply_patient_search(db.query(Patient), "ismail").all()
        assert len(rows) == 1
        assert rows[0].last_name.startswith("ALAOUI ISMAILI")

    def test_ipp_search(self, db):
        db.add(_patient("Test", "Patient", ipp="P018427"))
        db.commit()

        rows = apply_patient_search(db.query(Patient), "P018").all()
        assert len(rows) == 1
        assert rows[0].ipp == "P018427"
