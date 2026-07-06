"""Display names and titles for users across the app."""

from app.models.user import User

ROLE_NURSE = "infirmier"


def get_assistant_address_name(user: User) -> str:
    """How the AI assistant should address the user (Dr. / Inf. / Admin + name)."""
    if user.is_admin or (user.role or "").lower() == "admin":
        return "Admin"

    role = (user.role or "").lower()
    specialty = (user.specialty or "").lower()
    last_name = (user.last_name or "").strip()

    if role == ROLE_NURSE or specialty == ROLE_NURSE:
        if last_name:
            return f"Inf. {last_name}"
        return user.first_name or user.username or "Infirmier(ère)"

    if role in ("doctor", "medecin") or (user.specialty and specialty != ROLE_NURSE):
        if last_name:
            return f"Dr. {last_name}"
        return "Docteur"

    if specialty == "medecine-interne" and last_name:
        return f"Dr. {last_name}"

    full_name = " ".join(part for part in (user.first_name, user.last_name) if part).strip()
    return full_name or user.username or "Collègue"


def assistant_address_instruction(user: User, language: str = "fr") -> str:
    """System-prompt suffix so the LLM uses the correct title."""
    address = get_assistant_address_name(user)
    if language == "fr":
        return (
            f"\n\nL'utilisateur est {address}. "
            "Utilisez ce titre (Dr., Inf., Admin…) si vous vous adressez à lui ; "
            "ne dites pas « Docteur » à un infirmier ou à un administrateur."
        )
    if language == "en":
        return (
            f"\n\nThe user is {address}. "
            "Use that professional title when addressing them; do not call nurses or admins « Doctor »."
        )
    return f"\n\nالمستخدم: {address}."
