"""
Golden-path API checks for showcase readiness.
Run on app VM: cd backend && python -m pytest tests/test_golden_path.py -v
"""
from datetime import date
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest

from app.medical_acts.router import _parse_treatment_item, _persist_treatments


def test_parse_treatment_item_from_dict():
    item = {"drug_name": "Méthotrexate", "dosage": "15 mg"}
    parsed = _parse_treatment_item(item)
    assert parsed["drug_name"] == "Méthotrexate"
    assert parsed["dosage"] == "15 mg"


def test_parse_treatment_item_from_string():
    assert _parse_treatment_item("  Prednisone  ") == {"drug_name": "Prednisone"}


def test_persist_treatments_adds_models():
    db = MagicMock()
    _persist_treatments(
        db,
        act_id=99,
        treatment_text=[{"drug_name": "Méthotrexate", "dosage": "15 mg"}],
    )
    assert db.add.called


# --- Integration tests (require MySQL + real user rows for audit_logs FK) ---

try:
    from fastapi.testclient import TestClient
    from app.main import app
    from app.auth.router import get_current_user_orm

    def _user(role: str, user_id: int = 1):
        return SimpleNamespace(
            id=user_id,
            username=f"user{user_id}",
            role=role,
            last_name="Test",
            is_admin=role == "admin",
            is_active=True,
        )

    @pytest.fixture
    def client():
        app.dependency_overrides[get_current_user_orm] = lambda: _user("admin", 1)
        with TestClient(app) as c:
            yield c
        app.dependency_overrides.pop(get_current_user_orm, None)

    @pytest.mark.integration
    def test_health_ok(client):
        res = client.get("/health")
        assert res.status_code == 200
        assert res.json().get("status") == "ok"

    @pytest.mark.integration
    def test_act_types_include_consultation(client):
        res = client.get("/api/medical-acts/types")
        assert res.status_code == 200
        assert "Consultation" in res.json()

except ImportError:
    pass
