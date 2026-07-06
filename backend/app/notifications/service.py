from typing import List, Optional
from sqlalchemy.orm import Session
from app.models.notification import Notification as NotificationModel
from app.models.user import User as UserModel

def get_user_notifications(db: Session, user_id: int) -> List[NotificationModel]:
    """Return notifications owned by the user (inbox + sent outbox copies)."""
    return (
        db.query(NotificationModel)
        .filter(NotificationModel.user_id == user_id)
        .order_by(NotificationModel.id.desc())
        .all()
    )

def mark_notification_read(db: Session, notification_id: int, user_id: int) -> bool:
    notif = db.query(NotificationModel).filter(NotificationModel.id == notification_id, NotificationModel.user_id == user_id).first()
    if notif:
        notif.read = True
        db.commit()
        return True
    return False

def send_manual_notification(
    db: Session,
    sender_id: int,
    recipient_id: Optional[int],
    title: str,
    message: str,
    is_public: bool,
    category: str = "message",
) -> List[NotificationModel]:
    """
    Sends a notification to all doctors (public) or one recipient (private).
    Non-doctor senders (admin, department_head, nurse, …) get an inbox copy for public broadcasts.
    """
    created_notifications = []

    if is_public:
        doctors = db.query(UserModel).filter(UserModel.role == "doctor").all()
        recipient_ids = {doc.id for doc in doctors}

        for doc in doctors:
            notif = NotificationModel(
                user_id=doc.id,
                sender_id=sender_id,
                title=title,
                message=message,
                is_public=True,
                category=category,
            )
            db.add(notif)
            created_notifications.append(notif)

        # Non-doctor senders are not in the doctors list but should see what they sent
        if sender_id not in recipient_ids:
            notif = NotificationModel(
                user_id=sender_id,
                sender_id=sender_id,
                title=title,
                message=message,
                is_public=True,
                category=category,
            )
            db.add(notif)
            created_notifications.append(notif)
    elif recipient_id:
        notif = NotificationModel(
            user_id=recipient_id,
            sender_id=sender_id,
            title=title,
            message=message,
            is_public=False,
            category=category,
        )
        db.add(notif)
        created_notifications.append(notif)

        if sender_id != recipient_id:
            sender_copy = NotificationModel(
                user_id=sender_id,
                sender_id=sender_id,
                title=title,
                message=message,
                is_public=False,
                category=category,
                read=True,
            )
            db.add(sender_copy)
            created_notifications.append(sender_copy)
    else:
        raise ValueError("Destinataire requis pour une notification privée.")

    if not created_notifications:
        raise ValueError("Aucun destinataire trouvé pour cette notification.")

    db.commit()
    # Refresh to get IDs
    for n in created_notifications:
        db.refresh(n)
        
    return created_notifications


def notify_admins_password_reset(db: Session, user: UserModel) -> None:
    """Alert all active admins when a user requests a password reset."""
    admins = db.query(UserModel).filter(UserModel.is_admin == True, UserModel.is_active == True).all()
    if not admins:
        return

    display = f"{user.first_name or ''} {user.last_name or ''}".strip() or user.username
    title = "Demande de réinitialisation de mot de passe"
    message = (
        f"{display} ({user.email}) a demandé une réinitialisation de mot de passe. "
        f"Allez dans Admin → Utilisateurs pour réinitialiser le mot de passe."
    )

    for admin in admins:
        if admin.id == user.id:
            continue
        db.add(
            NotificationModel(
                user_id=admin.id,
                sender_id=user.id,
                title=title,
                message=message,
                is_public=False,
                category="security",
            )
        )
    db.commit()
