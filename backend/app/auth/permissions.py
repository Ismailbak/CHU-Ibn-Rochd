"""Role-based access control helpers for RhumatoAI."""

from fastapi import Depends, HTTPException, status

from app.auth.router import get_current_user_orm
from app.auth.roles import ROLE_NURSE, is_nurse
from app.models.user import User

ROLES_CAN_DELETE_CLINICAL = frozenset({"admin", "doctor", "department_head"})
ROLES_DASHBOARD = frozenset({"admin", "doctor", "department_head", ROLE_NURSE})
ROLES_CAN_SEND_NOTIFICATIONS = frozenset({"admin", "doctor", "department_head", ROLE_NURSE})


def can_delete_clinical_records(user: User) -> bool:
    """Doctors, department heads, and admins may hard-delete patients and medical acts."""
    if user.is_admin:
        return True
    return user.role in ROLES_CAN_DELETE_CLINICAL


def can_send_notifications(user: User) -> bool:
    if user.is_admin:
        return True
    return user.role in ROLES_CAN_SEND_NOTIFICATIONS


def require_clinical_delete(user: User = Depends(get_current_user_orm)) -> User:
    if not can_delete_clinical_records(user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Vous n'avez pas la permission de supprimer cette ressource.",
        )
    return user
