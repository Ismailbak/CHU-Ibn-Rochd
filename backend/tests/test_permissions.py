from types import SimpleNamespace

from app.auth.permissions import (
    ROLE_NURSE,
    can_delete_clinical_records,
    can_send_notifications,
    is_nurse,
    require_clinical_delete,
)
import pytest
from fastapi import HTTPException


def _user(role="doctor", is_admin=False):
    return SimpleNamespace(role=role, is_admin=is_admin)


def test_is_nurse():
    assert is_nurse(_user(ROLE_NURSE)) is True
    assert is_nurse(_user("doctor")) is False
    assert is_nurse(_user(ROLE_NURSE, is_admin=True)) is False


def test_can_delete_clinical_records():
    assert can_delete_clinical_records(_user("doctor")) is True
    assert can_delete_clinical_records(_user("department_head")) is True
    assert can_delete_clinical_records(_user(ROLE_NURSE)) is False
    assert can_delete_clinical_records(_user(ROLE_NURSE, is_admin=True)) is True


def test_require_clinical_delete_blocks_nurse():
    with pytest.raises(HTTPException) as exc:
        require_clinical_delete(_user(ROLE_NURSE))
    assert exc.value.status_code == 403


def test_require_clinical_delete_allows_doctor():
    assert require_clinical_delete(_user("doctor")).role == "doctor"


def test_can_send_notifications():
    assert can_send_notifications(_user("doctor")) is True
    assert can_send_notifications(_user(ROLE_NURSE)) is True
    assert can_send_notifications(_user("department_head")) is True
    assert can_send_notifications(_user("admin")) is True
    assert can_send_notifications(_user(ROLE_NURSE, is_admin=True)) is True
    assert can_send_notifications(_user("secretary")) is False
