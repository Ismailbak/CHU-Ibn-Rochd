from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import BaseModel
from typing import List, Optional
from sqlalchemy.orm import Session
from datetime import datetime, date, time

from app.core.database import get_db
from app.models.appointment import Appointment as AppointmentModel
from app.models.patient import Patient as PatientModel
from app.auth.router import get_current_user_orm
from app.auth.permissions import require_clinical_delete
from app.models.user import User
from app.analytics.audit import log_action

router = APIRouter()


class AppointmentBase(BaseModel):
    patient_id: int
    datetime_scheduled: datetime
    reason: Optional[str] = None
    status: str = "scheduled"


class Appointment(AppointmentBase):
    id: int
    patient_name: Optional[str] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


def _appointment_with_patient_name(db: Session, row: AppointmentModel) -> dict:
    patient = db.query(PatientModel).filter(PatientModel.id == row.patient_id).first()
    return {
        "id": row.id,
        "patient_id": row.patient_id,
        "patient_name": f"{patient.first_name} {patient.last_name}" if patient else None,
        "datetime_scheduled": row.datetime_scheduled.isoformat() if row.datetime_scheduled else None,
        "reason": row.reason,
        "status": row.status,
        "created_at": row.created_at.isoformat() if row.created_at else None,
    }


def _appointments_to_dicts(db: Session, rows: List[AppointmentModel]) -> List[dict]:
    """Build appointment dicts with patient names using ONE batched query (avoids N+1)."""
    patient_ids = {r.patient_id for r in rows if r.patient_id is not None}
    name_by_id = {}
    if patient_ids:
        for p in db.query(PatientModel).filter(PatientModel.id.in_(patient_ids)).all():
            name_by_id[p.id] = f"{p.first_name} {p.last_name}"
    return [
        {
            "id": r.id,
            "patient_id": r.patient_id,
            "patient_name": name_by_id.get(r.patient_id),
            "datetime_scheduled": r.datetime_scheduled.isoformat() if r.datetime_scheduled else None,
            "reason": r.reason,
            "status": r.status,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in rows
    ]


def _parse_date_param(value: str) -> date:
    return date.fromisoformat(value[:10])


@router.get("/", response_model=List[Appointment])
def get_appointments(
    response: Response,
    db: Session = Depends(get_db),
    from_date: Optional[str] = Query(None, description="Inclusive start date (YYYY-MM-DD)"),
    to_date: Optional[str] = Query(None, description="Inclusive end date (YYYY-MM-DD)"),
    limit: Optional[int] = Query(None, ge=1, le=5000),
    offset: int = Query(0, ge=0),
):
    query = db.query(AppointmentModel)
    if from_date:
        start_dt = datetime.combine(_parse_date_param(from_date), time.min)
        query = query.filter(AppointmentModel.datetime_scheduled >= start_dt)
    if to_date:
        end_dt = datetime.combine(_parse_date_param(to_date), time.max)
        query = query.filter(AppointmentModel.datetime_scheduled <= end_dt)

    total = query.count()
    response.headers["X-Total-Count"] = str(total)

    query = query.order_by(AppointmentModel.datetime_scheduled.desc())
    if offset:
        query = query.offset(offset)
    if limit is not None:
        query = query.limit(limit)
    return _appointments_to_dicts(db, query.all())


@router.get("/today", response_model=List[Appointment])
def get_today_appointments(db: Session = Depends(get_db)):
    today = datetime.now().date()
    rows = db.query(AppointmentModel).filter(
        AppointmentModel.datetime_scheduled >= datetime.combine(today, time.min),
        AppointmentModel.datetime_scheduled <= datetime.combine(today, time.max),
    ).order_by(AppointmentModel.datetime_scheduled).all()
    return _appointments_to_dicts(db, rows)


@router.get("/patient/{patient_id}", response_model=List[Appointment])
def get_patient_appointments(patient_id: int, db: Session = Depends(get_db)):
    rows = db.query(AppointmentModel).filter(AppointmentModel.patient_id == patient_id).order_by(AppointmentModel.datetime_scheduled.desc()).all()
    return [_appointment_with_patient_name(db, r) for r in rows]


@router.get("/{appointment_id}", response_model=Appointment)
def get_appointment(appointment_id: int, db: Session = Depends(get_db)):
    row = db.query(AppointmentModel).filter(AppointmentModel.id == appointment_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Appointment not found")
    return _appointment_with_patient_name(db, row)


@router.post("/", response_model=Appointment)
def create_appointment(
    appointment: AppointmentBase,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_orm),
):
    db_app = AppointmentModel(**appointment.model_dump())
    db.add(db_app)
    db.commit()
    db.refresh(db_app)
    log_action(
        db,
        action="CREATE_APPOINTMENT",
        user_id=current_user.id,
        username=current_user.username,
        resource_type="appointment",
        resource_id=str(db_app.id),
        details=f"Created appointment for patient {appointment.patient_id}",
    )
    return _appointment_with_patient_name(db, db_app)


@router.put("/{appointment_id}", response_model=Appointment)
def update_appointment(
    appointment_id: int,
    appointment: AppointmentBase,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_orm),
):
    row = db.query(AppointmentModel).filter(AppointmentModel.id == appointment_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Appointment not found")
    for k, v in appointment.model_dump().items():
        setattr(row, k, v)
    db.commit()
    db.refresh(row)
    log_action(
        db,
        action="UPDATE_APPOINTMENT",
        user_id=current_user.id,
        username=current_user.username,
        resource_type="appointment",
        resource_id=str(appointment_id),
        details=f"Updated appointment for patient {appointment.patient_id}",
    )
    return _appointment_with_patient_name(db, row)


@router.delete("/{appointment_id}")
def delete_appointment(
    appointment_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_clinical_delete),
):
    row = db.query(AppointmentModel).filter(AppointmentModel.id == appointment_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Appointment not found")
    patient_id = row.patient_id
    db.delete(row)
    db.commit()
    log_action(
        db,
        action="DELETE_APPOINTMENT",
        user_id=current_user.id,
        username=current_user.username,
        resource_type="appointment",
        resource_id=str(appointment_id),
        details=f"Deleted appointment for patient {patient_id}",
    )
    return {"message": "Deleted"}
