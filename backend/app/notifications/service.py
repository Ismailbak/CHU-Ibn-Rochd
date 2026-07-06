from typing import List, Optional
from sqlalchemy.orm import Session
from app.models.notification import Notification as NotificationModel
from app.models.user import User as UserModel

def get_user_notifications(db: Session, user_id: int) -> List[NotificationModel]:
    return db.query(NotificationModel).filter(
        (NotificationModel.user_id == user_id) | 
        ((NotificationModel.sender_id == user_id) & (NotificationModel.is_public == False))
    ).order_by(NotificationModel.id.desc()).all()

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
    Non-doctor senders (admin, department_head) get an inbox copy for public broadcasts.
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

        # Admin / department_head are not in the doctors list but should see what they sent
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
    else:
        raise ValueError("Destinataire requis pour une notification privée.")

    if not created_notifications:
        raise ValueError("Aucun destinataire trouvé pour cette notification.")

    db.commit()
    # Refresh to get IDs
    for n in created_notifications:
        db.refresh(n)
        
    return created_notifications
