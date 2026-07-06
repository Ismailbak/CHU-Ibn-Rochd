"""Remove a user and rows that reference users.id."""

from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.models.act_result import ActResult
from app.models.audit import AuditLog
from app.models.chat_message import ChatMessage
from app.models.chat_session import ChatSession
from app.models.form_system import ActForm, FormCsRd
from app.models.medical_act import MedicalAct, MedicalActStaff
from app.models.notification import Notification
from app.models.user import User


def delete_user_cascade(db: Session, user_id: int) -> None:
    session_ids = [
        row[0]
        for row in db.query(ChatSession.id).filter(ChatSession.created_by == user_id).all()
    ]
    if session_ids:
        db.query(ChatMessage).filter(ChatMessage.session_id.in_(session_ids)).delete(
            synchronize_session=False
        )
    db.query(ChatMessage).filter(ChatMessage.user_id == user_id).delete(synchronize_session=False)
    db.query(ChatSession).filter(ChatSession.created_by == user_id).delete(synchronize_session=False)

    db.query(Notification).filter(
        or_(Notification.user_id == user_id, Notification.sender_id == user_id)
    ).delete(synchronize_session=False)

    db.query(MedicalActStaff).filter(MedicalActStaff.staff_id == user_id).delete(
        synchronize_session=False
    )
    db.query(MedicalAct).filter(MedicalAct.doctor_id == user_id).update(
        {MedicalAct.doctor_id: None}, synchronize_session=False
    )
    db.query(ActResult).filter(ActResult.created_by == user_id).update(
        {ActResult.created_by: None}, synchronize_session=False
    )
    db.query(ActForm).filter(ActForm.created_by == user_id).update(
        {ActForm.created_by: None}, synchronize_session=False
    )
    db.query(FormCsRd).filter(FormCsRd.created_by == user_id).update(
        {FormCsRd.created_by: None}, synchronize_session=False
    )
    db.query(AuditLog).filter(AuditLog.user_id == user_id).delete(synchronize_session=False)

    user = db.query(User).filter(User.id == user_id).first()
    if user:
        db.delete(user)
