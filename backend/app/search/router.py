"""Unified platform search across patients, appointments, and medical acts."""

from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.auth.router import get_current_user_orm
from app.core.database import get_db
from app.core.utils.patient_search import apply_patient_search, patient_search_clause
from app.models.appointment import Appointment as AppointmentModel
from app.models.medical_act import MedicalAct as MedicalActModel
from app.models.patient import Patient as PatientModel
from app.models.user import User

router = APIRouter()


@router.get("/")
def global_search(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_orm),
    q: str = Query(..., min_length=2, description="Search text"),
    limit: int = Query(5, ge=1, le=20),
):
    """Search patients, upcoming/recent appointments, and medical acts."""
    term = q.strip()
    if len(term) < 2:
        return {"patients": [], "appointments": [], "acts": []}

    patient_rows = (
        apply_patient_search(db.query(PatientModel), term)
        .order_by(PatientModel.last_name.asc(), PatientModel.first_name.asc())
        .limit(limit)
        .all()
    )
    patients = [
        {
            "id": p.id,
            "first_name": p.first_name,
            "last_name": p.last_name,
            "ipp": p.ipp,
            "primary_diagnosis": p.primary_diagnosis,
            "gender": p.gender,
            "date_of_birth": p.date_of_birth.isoformat() if p.date_of_birth else None,
        }
        for p in patient_rows
    ]

    patient_ids_subq = None
    clause = patient_search_clause(term)
    if clause is not None:
        patient_ids_subq = db.query(PatientModel.id).filter(clause).subquery()

    appt_query = db.query(AppointmentModel)
    if patient_ids_subq is not None:
        appt_query = appt_query.filter(
            or_(
                AppointmentModel.patient_id.in_(patient_ids_subq),
                AppointmentModel.reason.ilike(f"%{term}%"),
            )
        )
    else:
        appt_query = appt_query.filter(AppointmentModel.reason.ilike(f"%{term}%"))

    appt_rows = (
        appt_query.order_by(AppointmentModel.datetime_scheduled.desc())
        .limit(limit)
        .all()
    )
    appt_patient_ids = {a.patient_id for a in appt_rows if a.patient_id}
    appt_names = {}
    if appt_patient_ids:
        for p in db.query(PatientModel).filter(PatientModel.id.in_(appt_patient_ids)).all():
            appt_names[p.id] = f"{p.first_name} {p.last_name}".strip()

    appointments = [
        {
            "id": a.id,
            "patient_id": a.patient_id,
            "patient_name": appt_names.get(a.patient_id, "Patient"),
            "datetime_scheduled": a.datetime_scheduled.isoformat() if a.datetime_scheduled else None,
            "reason": a.reason,
            "status": a.status,
        }
        for a in appt_rows
    ]

    act_filters = [
        MedicalActModel.description.ilike(f"%{term}%"),
        MedicalActModel.report.ilike(f"%{term}%"),
        MedicalActModel.notes.ilike(f"%{term}%"),
        MedicalActModel.act_type.ilike(f"%{term}%"),
    ]
    if patient_ids_subq is not None:
        act_filters.append(MedicalActModel.patient_id.in_(patient_ids_subq))

    act_rows = (
        db.query(MedicalActModel)
        .filter(or_(*act_filters))
        .order_by(MedicalActModel.act_date.desc(), MedicalActModel.id.desc())
        .limit(limit)
        .all()
    )
    act_patient_ids = {a.patient_id for a in act_rows if a.patient_id}
    act_names = {}
    if act_patient_ids:
        for p in db.query(PatientModel).filter(PatientModel.id.in_(act_patient_ids)).all():
            act_names[p.id] = f"{p.first_name} {p.last_name}".strip()

    acts = [
        {
            "id": a.id,
            "patient_id": a.patient_id,
            "patient_name": act_names.get(a.patient_id, "Patient"),
            "act_type": a.act_type,
            "act_date": a.act_date.isoformat() if a.act_date else None,
            "description": a.description,
        }
        for a in act_rows
    ]

    return {
        "patients": patients,
        "appointments": appointments,
        "acts": acts,
        "searched_at": datetime.now().isoformat(),
    }
