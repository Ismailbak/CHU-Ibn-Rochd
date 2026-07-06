from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.user import User
from app.auth.router import get_current_user_orm, RoleChecker
from app.auth.permissions import can_send_notifications
from app.notifications import service as notification_service

router = APIRouter()


def _format_sender_name(sender: User) -> str:
    if sender.role == "doctor" and sender.last_name:
        return f"Dr. {sender.last_name}"
    full_name = " ".join(part for part in (sender.first_name, sender.last_name) if part).strip()
    return full_name or sender.username


def _serialize_notification(db: Session, row) -> dict:
    sender_name = "Système"
    if row.sender_id:
        sender = db.query(User).filter(User.id == row.sender_id).first()
        if sender:
            sender_name = _format_sender_name(sender)

    return {
        "id": row.id,
        "title": row.title,
        "message": row.message,
        "read": row.read,
        "is_public": row.is_public,
        "sender_id": row.sender_id,
        "sender_name": sender_name,
        "category": row.category,
        "created_at": row.created_at,
    }


class Notification(BaseModel):
    id: int
    title: str
    message: str
    read: bool = False
    is_public: bool = False
    sender_id: Optional[int] = None
    sender_name: Optional[str] = None
    category: str = "message"
    created_at: datetime

    class Config:
        from_attributes = True


class NotificationCreate(BaseModel):
    recipient_id: Optional[int] = None
    title: str
    message: str
    is_public: bool = False
    category: str = "message"


@router.get("/", response_model=List[Notification])
def get_notifications(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_orm),
):
    rows = notification_service.get_user_notifications(db, current_user.id)
    return [_serialize_notification(db, r) for r in rows]


@router.post("/", response_model=List[Notification])
def send_notification(
    data: NotificationCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_orm),
):
    # Medical staff (doctors, nurses, admins, department heads) may send notifications.
    if not can_send_notifications(current_user):
        raise HTTPException(
            status_code=403,
            detail="Vous n'avez pas la permission d'envoyer des notifications.",
        )
    try:
        new_notifs = notification_service.send_manual_notification(
            db,
            sender_id=current_user.id,
            recipient_id=data.recipient_id,
            title=data.title.strip(),
            message=data.message.strip(),
            is_public=data.is_public,
            category=data.category,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return [_serialize_notification(db, n) for n in new_notifs]


@router.post("/read/{notification_id}")
def mark_as_read(
    notification_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_orm),
):
    success = notification_service.mark_notification_read(db, notification_id, current_user.id)
    if not success:
        raise HTTPException(status_code=404, detail="Notification not found")
    return {"message": "Marked as read"}
