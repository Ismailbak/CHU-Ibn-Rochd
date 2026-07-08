from fastapi import APIRouter, Depends, Query, HTTPException, Response, status
from fastapi.responses import StreamingResponse
from typing import Dict, List, Optional
from datetime import datetime, date
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import or_, func, exists
from sqlalchemy.exc import IntegrityError

from app.core.database import get_db
from app.models.patient import Patient as PatientModel
from app.models.patient_allergy import PatientAllergy as PatientAllergyModel
from app.auth.router import get_current_user_orm
from app.auth.permissions import require_clinical_delete
from app.models.user import User
from app.models.medical_act import MedicalAct, ActDiagnosis
from app.models.appointment import Appointment
from app.models.act_result import ActResult
from app.analytics.audit import log_action
from app.core.utils.text_encoding import repair_text
from app.core.utils.patient_search import apply_patient_search
from app.pdf import service as pdf_service
from app.patients.deletion import delete_patient_cascade

router = APIRouter()


def calculate_age(date_of_birth: Optional[date]) -> Optional[int]:
    """Calculate age from date of birth."""
    if not date_of_birth:
        return None
    today = datetime.now().date()
    age = today.year - date_of_birth.year - ((today.month, today.day) < (date_of_birth.month, date_of_birth.day))
    return age if age > 0 else None


class PatientBase(BaseModel):
    first_name: str
    last_name: str
    civility: Optional[str] = None  # M., Mme, Mlle, etc.
    gender: Optional[str] = None
    date_of_birth: Optional[date] = None  # Age calculated dynamically, never stored
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    marital_status: Optional[str] = None  # Célibataire, Marié, Divorcé, Veuf
    nationality: Optional[str] = None
    profession: Optional[str] = None
    insurance: Optional[str] = None
    insurance_number: Optional[str] = None
    blood_type: Optional[str] = None
    emergency_contact_name: Optional[str] = None
    emergency_contact_relation: Optional[str] = None
    emergency_contact_phone: Optional[str] = None
    primary_diagnosis: Optional[str] = None  # Renamed from diagnosis
    notes: Optional[str] = None
    notes_admin: Optional[str] = None
    status: Optional[str] = "Actif"


class PatientCreate(PatientBase):
    ipp: Optional[str] = None


class Patient(PatientBase):
    id: int
    ipp: Optional[str] = None
    created_at: Optional[datetime] = None
    age: Optional[int] = None  # Computed field - never stored
    display_diagnosis: Optional[str] = None  # primary_diagnosis or latest act diagnosis
    display_city: Optional[str] = None  # city or best-effort city extracted from address
    last_visit: Optional[str] = None  # latest past appointment (ISO datetime)
    next_appointment: Optional[str] = None  # nearest future appointment (ISO datetime)

    class Config:
        from_attributes = True


_SKIP_DIAGNOSIS_LABELS = {"non précisé", "non precise", "n/a", "-", ""}
_CITY_ALIASES = {
    "casa": "Casablanca",
    "casablanca": "Casablanca",
    "mohammedia": "Mohammedia",
    "rabat": "Rabat",
    "sale": "Salé",
    "salé": "Salé",
    "temara": "Témara",
    "témara": "Témara",
    "fes": "Fès",
    "fès": "Fès",
    "meknes": "Meknès",
    "meknès": "Meknès",
    "marrakech": "Marrakech",
    "agadir": "Agadir",
    "tanger": "Tanger",
    "tetouan": "Tétouan",
    "tétouan": "Tétouan",
    "kenitra": "Kénitra",
    "kénitra": "Kénitra",
    "el jadida": "El Jadida",
    "beni mellal": "Béni Mellal",
    "béni mellal": "Béni Mellal",
    "kasba tadla": "Kasba Tadla",
    "khouribga": "Khouribga",
    "settat": "Settat",
    "safi": "Safi",
    "oujda": "Oujda",
    "nador": "Nador",
    "taourirt": "Taourirt",
    "errachidia": "Errachidia",
    "laayoune": "Laayoune",
    "laâyoune": "Laayoune",
    "dakhla": "Dakhla",
    "el hajeb": "El Hajeb",
    "azrou": "Azrou",
    "ifrane": "Ifrane",
    "sidi kacem": "Sidi Kacem",
    "sidi slimane": "Sidi Slimane",
    "dar bouazza": "Dar Bouazza",
    "ain harrouda": "Ain Harrouda",
    "aïn harrouda": "Ain Harrouda",
}


def _normalize_diagnosis(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    cleaned = repair_text(str(value).strip())
    if not cleaned or cleaned.lower() in _SKIP_DIAGNOSIS_LABELS:
        return None
    return cleaned


def _resolve_display_diagnosis(
    primary_diagnosis: Optional[str],
    act_diagnosis: Optional[str] = None,
) -> Optional[str]:
    return _normalize_diagnosis(primary_diagnosis) or _normalize_diagnosis(act_diagnosis)


def _normalize_text(value: Optional[str]) -> str:
    if not value:
        return ""
    return " ".join(str(value).lower().replace("-", " ").split())


def _resolve_display_city(city: Optional[str], address: Optional[str]) -> Optional[str]:
    cleaned_city = repair_text((city or "").strip()) or ""
    if cleaned_city:
        return cleaned_city

    normalized_address = _normalize_text(repair_text(address))
    if not normalized_address:
        return None

    for alias, display in sorted(_CITY_ALIASES.items(), key=lambda item: len(item[0]), reverse=True):
        if alias in normalized_address:
            return display
    return None


def _latest_act_diagnoses_by_patient(db: Session, patient_ids: List[int]) -> Dict[int, str]:
    """Pick principal diagnosis from latest act when available, else latest act diagnosis."""
    if not patient_ids:
        return {}

    rows = (
        db.query(
            MedicalAct.patient_id,
            ActDiagnosis.diagnosis_label,
            ActDiagnosis.diagnosis_type,
            MedicalAct.act_date,
            ActDiagnosis.id,
        )
        .join(ActDiagnosis, ActDiagnosis.act_id == MedicalAct.id)
        .filter(MedicalAct.patient_id.in_(patient_ids))
        .filter(ActDiagnosis.diagnosis_label.isnot(None))
        .filter(func.trim(ActDiagnosis.diagnosis_label) != "")
        .all()
    )

    best: Dict[int, tuple] = {}
    for patient_id, label, diagnosis_type, act_date, diagnosis_id in rows:
        normalized = _normalize_diagnosis(label)
        if not normalized:
            continue
        rank = 0 if (diagnosis_type or "").lower() == "principal" else 1
        sort_key = (rank, act_date or date.min, diagnosis_id or 0)
        current = best.get(patient_id)
        if current is None or sort_key < current[0]:
            best[patient_id] = (sort_key, normalized)

    return {patient_id: value[1] for patient_id, value in best.items()}


def _appointment_bounds_by_patient(db: Session, patient_ids: List[int]) -> Dict[int, Dict[str, Optional[str]]]:
    """Latest past and nearest future appointment per patient."""
    if not patient_ids:
        return {}

    now = datetime.utcnow()
    bounds: Dict[int, Dict[str, Optional[str]]] = {pid: {} for pid in patient_ids}

    past_rows = (
        db.query(
            Appointment.patient_id,
            func.max(Appointment.datetime_scheduled).label("last_visit"),
        )
        .filter(Appointment.patient_id.in_(patient_ids))
        .filter(Appointment.datetime_scheduled < now)
        .group_by(Appointment.patient_id)
        .all()
    )
    for patient_id, last_visit in past_rows:
        bounds[patient_id]["last_visit"] = last_visit.isoformat() if last_visit else None

    future_rows = (
        db.query(
            Appointment.patient_id,
            func.min(Appointment.datetime_scheduled).label("next_appointment"),
        )
        .filter(Appointment.patient_id.in_(patient_ids))
        .filter(Appointment.datetime_scheduled >= now)
        .group_by(Appointment.patient_id)
        .all()
    )
    for patient_id, next_appointment in future_rows:
        bounds[patient_id]["next_appointment"] = (
            next_appointment.isoformat() if next_appointment else None
        )

    return bounds


class PatientAllergyBase(BaseModel):
    allergen: str
    reaction_type: Optional[str] = None
    severity: Optional[str] = None  # e.g., "mild", "moderate", "severe"
    notes: Optional[str] = None


class PatientAllergyCreate(PatientAllergyBase):
    patient_id: int


class PatientAllergyOut(PatientAllergyBase):
    id: int
    patient_id: int
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


def _patient_to_dict(
    patient: PatientModel,
    act_diagnosis_fallback: Optional[str] = None,
    appointment_bounds: Optional[Dict[str, Optional[str]]] = None,
) -> dict:
    """Convert PatientModel to dict with computed age and full name."""
    primary = _normalize_diagnosis(patient.primary_diagnosis)
    display = _resolve_display_diagnosis(primary, act_diagnosis_fallback)
    display_city = _resolve_display_city(patient.city, patient.address)
    patient_dict = {
        "id": patient.id,
        "first_name": repair_text(patient.first_name),
        "last_name": repair_text(patient.last_name),
        "civility": repair_text(patient.civility),
        "gender": patient.gender,
        "date_of_birth": patient.date_of_birth.isoformat() if isinstance(patient.date_of_birth, date) else patient.date_of_birth,
        "age": calculate_age(patient.date_of_birth),  # Computed, never stored
        "phone": patient.phone,
        "email": patient.email,
        "address": repair_text(patient.address),
        "city": repair_text(patient.city),
        "display_city": display_city,
        "marital_status": repair_text(patient.marital_status),
        "nationality": repair_text(patient.nationality),
        "profession": repair_text(patient.profession),
        "insurance": repair_text(patient.insurance),
        "insurance_number": patient.insurance_number,
        "blood_type": patient.blood_type,
        "emergency_contact_name": repair_text(patient.emergency_contact_name),
        "emergency_contact_relation": repair_text(patient.emergency_contact_relation),
        "emergency_contact_phone": patient.emergency_contact_phone,
        "primary_diagnosis": primary,
        "display_diagnosis": display,
        "notes": repair_text(patient.notes),
        "notes_admin": repair_text(patient.notes_admin),
        "status": patient.status,
        "ipp": patient.ipp,
        "created_at": patient.created_at.isoformat() if patient.created_at else None,
    }
    if appointment_bounds:
        patient_dict["last_visit"] = appointment_bounds.get("last_visit")
        patient_dict["next_appointment"] = appointment_bounds.get("next_appointment")
    return patient_dict


@router.get("/", response_model=List[Patient])
def get_patients(
    response: Response,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_orm),
    q: Optional[str] = Query(
        None,
        description="Search by name, IPP, phone, city, primary diagnosis, or act diagnosis",
    ),
    ipp: Optional[str] = Query(None),
    first_name: Optional[str] = Query(None),
    last_name: Optional[str] = Query(None),
    phone: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    limit: Optional[int] = Query(None, ge=1, le=1000, description="Max rows to return. Omit for all (legacy behavior)."),
    offset: int = Query(0, ge=0, description="Number of rows to skip (for pagination)."),
):
    query = db.query(PatientModel)
    if q:
        query = apply_patient_search(query, q)
    if ipp:
        query = query.filter(PatientModel.ipp.ilike(f"%{ipp}%"))
    if first_name:
        query = query.filter(PatientModel.first_name.ilike(f"%{first_name}%"))
    if last_name:
        query = query.filter(PatientModel.last_name.ilike(f"%{last_name}%"))
    if phone:
        query = query.filter(PatientModel.phone.ilike(f"%{phone}%"))
    if status:
        query = query.filter(PatientModel.status == status)

    total = query.count()
    response.headers["X-Total-Count"] = str(total)

    query = query.order_by(PatientModel.id.desc())
    if offset:
        query = query.offset(offset)
    if limit is not None:
        query = query.limit(limit)

    patients = query.all()
    patient_ids = [p.id for p in patients]
    diagnosis_fallback = _latest_act_diagnoses_by_patient(db, patient_ids)
    appointment_bounds = _appointment_bounds_by_patient(db, patient_ids)
    return [
        _patient_to_dict(
            p,
            diagnosis_fallback.get(p.id),
            appointment_bounds.get(p.id, {}),
        )
        for p in patients
    ]


@router.get("/{patient_id}", response_model=Patient)
def get_patient(
    patient_id: int, 
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_orm),
):
    patient = db.query(PatientModel).filter(PatientModel.id == patient_id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")
    diagnosis_fallback = _latest_act_diagnoses_by_patient(db, [patient.id])
    appointment_bounds = _appointment_bounds_by_patient(db, [patient.id])
    return _patient_to_dict(
        patient,
        diagnosis_fallback.get(patient.id),
        appointment_bounds.get(patient.id, {}),
    )


@router.post("/", response_model=Patient)
def create_patient(
    patient: PatientCreate, 
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_orm),
):
    db_patient = PatientModel(**patient.model_dump())
    db.add(db_patient)
    db.commit()
    db.refresh(db_patient)
    log_action(
        db,
        action="CREATE_PATIENT",
        user_id=current_user.id,
        username=current_user.username,
        resource_type="patient",
        resource_id=str(db_patient.id),
        details=f"Created patient: {db_patient.first_name} {db_patient.last_name}",
    )
    return _patient_to_dict(db_patient)


@router.put("/{patient_id}", response_model=Patient)
def update_patient(
    patient_id: int, 
    patient: PatientBase, 
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_orm),
):
    db_patient = db.query(PatientModel).filter(PatientModel.id == patient_id).first()
    if not db_patient:
        raise HTTPException(status_code=404, detail="Patient not found")
    for k, v in patient.model_dump().items():
        setattr(db_patient, k, v)
    db.commit()
    db.refresh(db_patient)
    log_action(
        db,
        action="UPDATE_PATIENT",
        user_id=current_user.id,
        username=current_user.username,
        resource_type="patient",
        resource_id=str(patient_id),
        details=f"Updated patient: {db_patient.first_name} {db_patient.last_name}",
    )
    return _patient_to_dict(db_patient)


@router.delete("/{patient_id}")
def delete_patient(
    patient_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_clinical_delete),
):
    db_patient = db.query(PatientModel).filter(PatientModel.id == patient_id).first()
    if not db_patient:
        raise HTTPException(status_code=404, detail="Patient not found")

    patient_name = f"{db_patient.first_name} {db_patient.last_name}"
    try:
        delete_patient_cascade(db, patient_id)
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "Impossible de supprimer ce patient : des données liées existent encore "
                "(rendez-vous, actes médicaux, etc.)."
            ),
        )

    log_action(
        db,
        action="DELETE_PATIENT",
        user_id=current_user.id,
        username=current_user.username,
        resource_type="patient",
        resource_id=str(patient_id),
        details=f"Deleted patient: {patient_name}",
    )
    return {"message": "Deleted"}


@router.get("/{patient_id}/dossier")
def get_patient_dossier(
    patient_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_orm),
):
    # 1. Get Patient
    patient = db.query(PatientModel).filter(PatientModel.id == patient_id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")
    
    # 2. Get Medical Acts
    medical_acts = db.query(MedicalAct).filter(MedicalAct.patient_id == patient_id).order_by(MedicalAct.act_date.desc()).all()
    
    # 3. Get Appointments
    appointments = db.query(Appointment).filter(Appointment.patient_id == patient_id).order_by(Appointment.datetime_scheduled.desc()).all()
    
    # 4. Get Lab Results
    lab_results = db.query(ActResult).filter(ActResult.patient_id == patient_id).order_by(ActResult.result_date.desc()).all()
    
    # 5. Get Allergies
    allergies = db.query(PatientAllergyModel).filter(PatientAllergyModel.patient_id == patient_id).all()
    
    # 6. Generate PDF
    pdf_buffer = pdf_service.generate_patient_dossier_pdf(patient, medical_acts, appointments, lab_results, allergies)
    
    filename = f"Dossier_{patient.first_name}_{patient.last_name}_{datetime.now().strftime('%Y%m%d')}.pdf"
    
    return StreamingResponse(
        pdf_buffer, 
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


# ── Allergy Management Endpoints ──
@router.get("/{patient_id}/allergies", response_model=List[PatientAllergyOut])
def get_patient_allergies(
    patient_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_orm),
):
    """Get all allergies for a patient."""
    patient = db.query(PatientModel).filter(PatientModel.id == patient_id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")
    
    allergies = db.query(PatientAllergyModel).filter(PatientAllergyModel.patient_id == patient_id).all()
    return allergies


@router.post("/{patient_id}/allergies", response_model=PatientAllergyOut)
def create_patient_allergy(
    patient_id: int,
    allergy: PatientAllergyCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_orm),
):
    """Create a new allergy for a patient."""
    patient = db.query(PatientModel).filter(PatientModel.id == patient_id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")
    
    new_allergy = PatientAllergyModel(
        patient_id=patient_id,
        allergen=allergy.allergen,
        reaction_type=allergy.reaction_type,
        severity=allergy.severity,
        notes=allergy.notes,
        created_at=datetime.now(),
        created_by=current_user.id,
    )
    db.add(new_allergy)
    db.commit()
    db.refresh(new_allergy)
    
    log_action(db, current_user.id, f"Create allergy: {allergy.allergen} for patient {patient_id}", "CREATE")
    
    return new_allergy


@router.put("/{patient_id}/allergies/{allergy_id}", response_model=PatientAllergyOut)
def update_patient_allergy(
    patient_id: int,
    allergy_id: int,
    allergy: PatientAllergyCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_orm),
):
    """Update an allergy for a patient."""
    patient = db.query(PatientModel).filter(PatientModel.id == patient_id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")
    
    db_allergy = db.query(PatientAllergyModel).filter(
        PatientAllergyModel.id == allergy_id,
        PatientAllergyModel.patient_id == patient_id
    ).first()
    if not db_allergy:
        raise HTTPException(status_code=404, detail="Allergy not found")
    
    db_allergy.allergen = allergy.allergen
    db_allergy.reaction_type = allergy.reaction_type
    db_allergy.severity = allergy.severity
    db_allergy.notes = allergy.notes
    db_allergy.updated_at = datetime.now()
    db_allergy.updated_by = current_user.id
    
    db.commit()
    db.refresh(db_allergy)
    
    log_action(db, current_user.id, f"Update allergy: {allergy.allergen} for patient {patient_id}", "UPDATE")
    
    return db_allergy


@router.delete("/{patient_id}/allergies/{allergy_id}")
def delete_patient_allergy(
    patient_id: int,
    allergy_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_orm),
):
    """Delete an allergy for a patient."""
    patient = db.query(PatientModel).filter(PatientModel.id == patient_id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")
    
    db_allergy = db.query(PatientAllergyModel).filter(
        PatientAllergyModel.id == allergy_id,
        PatientAllergyModel.patient_id == patient_id
    ).first()
    if not db_allergy:
        raise HTTPException(status_code=404, detail="Allergy not found")
    
    allergen_name = db_allergy.allergen
    db.delete(db_allergy)
    db.commit()
    
    log_action(db, current_user.id, f"Delete allergy: {allergen_name} for patient {patient_id}", "DELETE")
    
    return {"message": "Allergy deleted successfully"}
