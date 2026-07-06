"""Role constants and helpers without auth router dependencies."""

from app.models.user import User

ROLE_NURSE = "infirmier"


def is_nurse(user: User) -> bool:
    if user.is_admin:
        return False
    role = (user.role or "").lower()
    specialty = (getattr(user, "specialty", None) or "").lower()
    return role == ROLE_NURSE or specialty == ROLE_NURSE
