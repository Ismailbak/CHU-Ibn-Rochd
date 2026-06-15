"""Role-based access control helpers for RhumatoAI."""

from fastapi import Depends, HTTPException, status

from app.auth.router import get_current_user_orm
from app.models.user import User

ROLE_NURSE = "infirmier"
ROLES_CAN_DELETE_CLINICAL = frozenset({"admin", "doctor", "department_head"})


def is_nurse(user: User) -> bool:
    return (user.role or "").lower() == ROLE_NURSE and not user.is_admin


def can_delete_clinical_records(user: User) -> bool:
    """Doctors, department heads, and admins may hard-delete patients and medical acts."""
    if user.is_admin:
        return True
    return user.role in ROLES_CAN_DELETE_CLINICAL


def require_clinical_delete(user: User = Depends(get_current_user_orm)) -> User:
    if not can_delete_clinical_records(user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Vous n'avez pas la permission de supprimer cette ressource.",
        )
    return user
