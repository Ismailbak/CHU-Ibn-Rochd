# ─── routers/medical_acts.py ─────────────────────────────────────────────────
# FastAPI router for all /medical-acts endpoints.
# Handles CRUD for medical acts, per-patient queries, documents, and stats.

from fastapi import APIRouter, Depends, HTTPException, Query, Response, UploadFile, File
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel, field_validator
from typing import List, Optional, Union
from datetime import datetime, date
from decimal import Decimal
import os
import shutil
import uuid
from sqlalchemy import String, cast, or_
from sqlalchemy.orm import Session, joinedload  # joinedload used to avoid N+1 queries

from app.core.schemas.mojibake_safe import MojibakeSafeBase
from app.core.database import get_db
from app.models.medical_act import MedicalAct as MedicalActModel, ActDocument as ActDocumentModel, MedicalActStaff as MedicalActStaffModel, ActDiagnosis as ActDiagnosisModel, ActTreatment as ActTreatmentModel
from app.models.patient import Patient as PatientModel
from app.auth.router import get_current_user_orm
from app.auth.permissions import require_clinical_delete
from app.models.user import User
from app.analytics.audit import log_action
from app.core.utils.patient_search import apply_patient_search, patient_search_clause

# Ensure upload directory exists
UPLOAD_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", "data", "uploads"))
os.makedirs(UPLOAD_DIR, exist_ok=True)

router = APIRouter()


# ─── Pydantic Schemas ─────────────────────────────────────────────────────────

class ActDocumentOut(BaseModel):
    id: int
    act_id: int
    filename: Optional[str] = None
    file_path: Optional[str] = None
    mime_type: Optional[str] = None

class ActFormOut(BaseModel):
    id: int
    act_id: int
    ref_form_type_id: int
    form_table_id: int
    form_name: Optional[str] = None
    form_label: Optional[str] = None
    
    class Config:
        from_attributes = True


class MedicalActStaffOut(BaseModel):
    id: int
    medical_act_id: int
    staff_id: int
    role: Optional[str] = None

    class Config:
        from_attributes = True


class MedicalActStaffCreate(BaseModel):
    staff_id: int
    role: Optional[str] = None


class ActDiagnosisOut(MojibakeSafeBase):
    id: int
    act_id: int
    diagnosis_label: str
    diagnosis_notes: Optional[str] = None
    diagnosis_type: str  # e.g., "principal", "secondary"
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class ActDiagnosisCreate(BaseModel):
    diagnosis_label: str
    diagnosis_notes: Optional[str] = None
    diagnosis_type: str = "principal"


class ActTreatmentOut(MojibakeSafeBase):
    id: int
    act_id: int
    drug_name: Optional[str] = None  # Allow None for legacy/invalid data
    dosage: Optional[str] = None
    frequency: Optional[str] = None
    duration: Optional[str] = None
    notes: Optional[str] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class ActTreatmentCreate(BaseModel):
    drug_name: str
    dosage: Optional[str] = None
    frequency: Optional[str] = None
    duration: Optional[str] = None
    notes: Optional[str] = None

class TreatmentInput(BaseModel):
    drug_name: str
    dosage: Optional[str] = None
    frequency: Optional[str] = None
    duration: Optional[str] = None
    notes: Optional[str] = None


class MedicalActBase(MojibakeSafeBase):
    patient_id: int
    act_type: str
    description: Optional[str] = None
    report: Optional[str] = None
    act_date: date  # Date of the medical act
    notes: Optional[str] = None
    status: str = "completed"
    doctor_id: Optional[int] = None
    amount: Optional[Union[float, Decimal]] = None
    category: Optional[str] = None
    # diagnosis and treatment moved to separate tables (act_diagnoses, act_treatments)
    
    @field_validator('amount', mode='before')
    def convert_amount(cls, v):
        if v is None:
            return None
        if isinstance(v, Decimal):
            return float(v)
        return v


class MedicalActCreate(MedicalActBase):
    """Schema used for POST / (creation only)."""
    diagnosis: Optional[str] = None  # Accept diagnosis from form
    treatment: Optional[Union[str, List[Union[str, TreatmentInput]]]] = None  # Accept treatment from form as string or list


class MedicalActOut(MedicalActBase):
    """Schema used for all responses — extends base with read-only fields."""
    id: int
    patient_name: Optional[str] = None
    created_at: Optional[datetime] = None
    documents: List[ActDocumentOut] = []
    assigned_staff: List[MedicalActStaffOut] = []
    diagnoses: List[ActDiagnosisOut] = []
    treatments: List[ActTreatmentOut] = []
    forms: List[ActFormOut] = []

    class Config:
        from_attributes = True


# ─── Internal Helper ──────────────────────────────────────────────────────────

def _parse_treatment_item(item) -> Optional[dict]:
    """Normalize a treatment payload item (Pydantic v2 may deliver dicts, not TreatmentInput)."""
    if isinstance(item, str):
        name = item.strip()
        return {"drug_name": name} if name else None
    if isinstance(item, TreatmentInput):
        return item.model_dump()
    if isinstance(item, dict):
        return item
    return None


def _persist_treatments(db: Session, act_id: int, treatment_text) -> None:
    """Save one or more treatments on an act from API payload (str, dict, or list)."""
    if not treatment_text:
        return
    items = treatment_text if isinstance(treatment_text, list) else [treatment_text]
    for raw in items:
        data = _parse_treatment_item(raw)
        if not data:
            continue
        drug_name = (data.get("drug_name") or "").strip()
        if not drug_name:
            continue
        db.add(
            ActTreatmentModel(
                act_id=act_id,
                drug_name=drug_name,
                dosage=data.get("dosage"),
                frequency=data.get("frequency"),
                duration=data.get("duration"),
                notes=data.get("notes"),
            )
        )


def _act_to_dict(act: MedicalActModel, patient_name: Optional[str], documents: List[ActDocumentModel] = None, assigned_staff: List[MedicalActStaffModel] = None, diagnoses=None, treatments=None, forms=None) -> dict:
    """
    Converts a MedicalActModel ORM row to a plain dict, injecting patient_name, diagnoses, treatments.
    Used by every endpoint that returns a MedicalActOut.
    """
    doc_dicts = []
    if documents:
        doc_dicts = [{"id": d.id, "act_id": d.act_id, "filename": d.filename, "file_path": d.file_path, "mime_type": d.mime_type} for d in documents]
    
    staff_dicts = []
    if assigned_staff:
        staff_dicts = [{"id": s.id, "medical_act_id": s.medical_act_id, "staff_id": s.staff_id, "role": s.role} for s in assigned_staff]
    
    diag_dicts = []
    if diagnoses:
        diag_dicts = [{"id": d.id, "act_id": d.act_id, "diagnosis_label": d.diagnosis_label, "diagnosis_notes": d.diagnosis_notes, "diagnosis_type": d.diagnosis_type, "created_at": d.created_at.isoformat() if d.created_at else None} for d in diagnoses]
    
    treat_dicts = []
    if treatments:
        treat_dicts = [{"id": t.id, "act_id": t.act_id, "drug_name": t.drug_name, "dosage": t.dosage, "frequency": t.frequency, "duration": t.duration, "notes": t.notes, "created_at": t.created_at.isoformat() if t.created_at else None} for t in treatments]
        
    return {
        "id": act.id,
        "patient_id": act.patient_id,
        "patient_name": patient_name,
        "act_type": act.act_type,
        "description": act.description,
        "report": act.report,
        "act_date": act.act_date.isoformat() if isinstance(act.act_date, date) else act.act_date,
        "notes": act.notes,
        "status": act.status,
        "doctor_id": act.doctor_id,
        "amount": act.amount,
        "category": act.category,
        "documents": doc_dicts,
        "assigned_staff": staff_dicts,
        "diagnoses": diag_dicts,
        "treatments": treat_dicts,
        "forms": forms or [],
        "created_at": act.created_at.isoformat() if act.created_at else None,
    }


def _enrich_acts(db: Session, rows: List[MedicalActModel]) -> List[dict]:
    """
    Enriches a list of acts with patient names, documents, diagnoses, and treatments in batch queries (avoids N+1).
    Instead of querying the DB once per act, we collect all unique act/patient IDs,
    fetch them in single queries, then do dictionary lookups per act.
    """
    if not rows:
        return []

    # Collect unique patient IDs and act IDs from this batch of acts
    patient_ids = {row.patient_id for row in rows}
    act_ids = {row.id for row in rows}

    # One DB query for all relevant patients
    patients = (
        db.query(PatientModel)
        .filter(PatientModel.id.in_(patient_ids))
        .all()
    )
    patient_map = {p.id: f"{p.first_name} {p.last_name}" for p in patients}
    
    # One DB query for all relevant documents
    documents = (
        db.query(ActDocumentModel).filter(ActDocumentModel.act_id.in_(act_ids)).all()
    )
    doc_map = {}
    for doc in documents:
        doc_map.setdefault(doc.act_id, []).append(doc)
    
    # One DB query for all relevant diagnoses
    diagnoses = (
        db.query(ActDiagnosisModel).filter(ActDiagnosisModel.act_id.in_(act_ids)).all()
    )
    diag_map = {}
    for diag in diagnoses:
        # Filter out empty diagnosis_label values
        if diag.diagnosis_label and isinstance(diag.diagnosis_label, str) and diag.diagnosis_label.strip():
            diag_map.setdefault(diag.act_id, []).append(diag)
    
    # One DB query for all relevant treatments
    treatments = (
        db.query(ActTreatmentModel).filter(ActTreatmentModel.act_id.in_(act_ids)).all()
    )
    treat_map = {}
    for treat in treatments:
        # Filter out treatments with NULL or empty drug_name (invalid records)
        if treat.drug_name and isinstance(treat.drug_name, str) and treat.drug_name.strip():
            treat_map.setdefault(treat.act_id, []).append(treat)
            
    # One DB query for all relevant forms (JOIN with ref_form_types to get form_name and form_label)
    forms = (
        db.query(ActForm, RefFormType.form_name, RefFormType.form_label)
        .join(RefFormType, ActForm.ref_form_type_id == RefFormType.id)
        .filter(ActForm.act_id.in_(act_ids))
        .all()
    )
    form_map = {}
    for f, form_name, form_label in forms:
        form_map.setdefault(f.act_id, []).append({
            "id": f.id,
            "act_id": f.act_id,
            "ref_form_type_id": f.ref_form_type_id,
            "form_table_id": f.form_table_id,
            "form_name": form_name,
            "form_label": form_label
        })

    return [_act_to_dict(
        row, 
        patient_map.get(row.patient_id), 
        doc_map.get(row.id, []), 
        None, 
        diag_map.get(row.id, []), 
        treat_map.get(row.id, []),
        form_map.get(row.id, [])
    ) for row in rows]


# ─── Stats ────────────────────────────────────────────────────────────────────

@router.get("/stats")
def get_medical_acts_stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_orm),
):
    """Returns aggregate counts used by the dashboard stat cards."""
    total = db.query(MedicalActModel).count()
    consultations = db.query(MedicalActModel).filter(MedicalActModel.act_type == "Consultation").count()
    interventions = db.query(MedicalActModel).filter(MedicalActModel.act_type == "Intervention").count()
    treated_patients = db.query(MedicalActModel.patient_id).distinct().count()
    return {
        "total": total,
        "consultations": consultations,
        "interventions": interventions,
        "treatedPatients": treated_patients,
    }


# ─── Act Types ────────────────────────────────────────────────────────────────

# FIX: This route MUST be defined before /{act_id} — otherwise FastAPI will try
# to match "types" as an integer act_id and return a 422 Unprocessable Entity.
@router.get("/types", response_model=List[str])
def get_act_types(current_user: User = Depends(get_current_user_orm)):
    """Returns the list of valid act type values."""
    # FIX: These values now match the French labels used in the frontend.
    # Previously the backend returned English strings that didn't match the frontend constants.
    return ["Consultation", "Examen", "Infiltration", "Bilan", "Suivi"]


# ─── List & Create ────────────────────────────────────────────────────────────

@router.get("/", response_model=List[MedicalActOut])
def get_medical_acts(
    response: Response,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_orm),
    patient_id: Optional[int] = Query(None),
    act_type: Optional[str] = Query(None),
    q: Optional[str] = Query(None, description="Search patient, IPP, ID, description, report, notes"),
    limit: Optional[int] = Query(None, ge=1, le=5000),
    offset: int = Query(0, ge=0),
):
    """
    Returns all medical acts, optionally filtered by patient_id and/or act_type.
    Results are ordered by date descending (most recent first).
    """
    query = db.query(MedicalActModel)
    if patient_id is not None:
        query = query.filter(MedicalActModel.patient_id == patient_id)
    if act_type:
        query = query.filter(MedicalActModel.act_type == act_type)
    if q:
        term = q.strip()
        like_term = f"%{term}%"
        patient_clause = patient_search_clause(term)
        identity_match = (
            db.query(PatientModel.id)
            .filter(patient_clause)
            .subquery()
            if patient_clause is not None
            else None
        )
        filters = [
            cast(MedicalActModel.id, String).like(like_term),
            MedicalActModel.description.like(like_term),
            MedicalActModel.report.like(like_term),
            MedicalActModel.notes.like(like_term),
            MedicalActModel.act_type.like(like_term),
        ]
        if identity_match is not None:
            filters.append(MedicalActModel.patient_id.in_(identity_match))
        query = query.filter(or_(*filters))

    total = query.count()
    response.headers["X-Total-Count"] = str(total)

    query = query.order_by(MedicalActModel.act_date.desc(), MedicalActModel.id.desc())
    if offset:
        query = query.offset(offset)
    if limit is not None:
        query = query.limit(limit)
    rows = query.all()
    # FIX: use batch enrichment instead of one DB query per act
    return _enrich_acts(db, rows)


@router.post("/", response_model=MedicalActOut, status_code=201)  # FIX: return 201 Created
def create_medical_act(
    act: MedicalActCreate, 
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_orm),
):
    """Creates a new medical act and returns the saved record with patient_name."""
    # Extract diagnosis and treatment before creating the act
    diagnosis_text = act.diagnosis
    treatment_text = act.treatment
    
    # Create a dict with only the base fields (excluding diagnosis and treatment)
    act_data = act.model_dump(exclude={'diagnosis', 'treatment'})
    db_act = MedicalActModel(**act_data)
    db.add(db_act)
    db.commit()
    db.refresh(db_act)
    
    # Create ActDiagnosis if diagnosis is provided
    if diagnosis_text and diagnosis_text.strip():
        db_diagnosis = ActDiagnosisModel(
            act_id=db_act.id,
            diagnosis_label=diagnosis_text.strip(),
            diagnosis_type="principal"
        )
        db.add(db_diagnosis)
    
    # Create ActTreatment if treatment is provided
    if treatment_text:
        _persist_treatments(db, db_act.id, treatment_text)
    
    db.commit()
    
    log_action(
        db,
        action="CREATE_MEDICAL_ACT",
        user_id=current_user.id,
        username=current_user.username,
        resource_type="medical_act",
        resource_id=str(db_act.id),
        details=f"Created medical act: {db_act.act_type}",
    )

    # Look up patient name and related data for the response
    patient = db.query(PatientModel).filter(PatientModel.id == db_act.patient_id).first()
    documents = db.query(ActDocumentModel).filter(ActDocumentModel.act_id == db_act.id).all()
    diagnoses = db.query(ActDiagnosisModel).filter(ActDiagnosisModel.act_id == db_act.id).all()
    treatments = db.query(ActTreatmentModel).filter(ActTreatmentModel.act_id == db_act.id).all()
    assigned_staff = db.query(MedicalActStaffModel).filter(MedicalActStaffModel.medical_act_id == db_act.id).all()
    patient_name = f"{patient.first_name} {patient.last_name}" if patient else None
    return _act_to_dict(db_act, patient_name, documents, assigned_staff, diagnoses, treatments)


# ─── Per-Patient ──────────────────────────────────────────────────────────────

@router.get("/patient/{patient_id}", response_model=List[MedicalActOut])
def get_patient_medical_acts(
    patient_id: int, 
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_orm),
):
    """Returns all acts for a specific patient, ordered by date descending."""
    rows = (
        db.query(MedicalActModel)
        .filter(MedicalActModel.patient_id == patient_id)
        .order_by(MedicalActModel.act_date.desc())
        .all()
    )
    return _enrich_acts(db, rows)


# ─── Single Act ───────────────────────────────────────────────────────────────

@router.get("/{act_id}", response_model=MedicalActOut)
def get_medical_act(
    act_id: int, 
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_orm),
):
    """Returns a single act by ID. Raises 404 if not found."""
    row = db.query(MedicalActModel).filter(MedicalActModel.id == act_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Medical act not found")
    patient = db.query(PatientModel).filter(PatientModel.id == row.patient_id).first()
    patient_name = f"{patient.first_name} {patient.last_name}" if patient else None
    return _act_to_dict(row, patient_name)


@router.put("/{act_id}", response_model=MedicalActOut)
def update_medical_act(
    act_id: int, 
    act: MedicalActCreate,  # Use MedicalActCreate to allow diagnosis/treatment
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_orm),
):
    """Updates all fields of an existing act. Raises 404 if not found."""
    row = db.query(MedicalActModel).filter(MedicalActModel.id == act_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Medical act not found")
    
    # Extract diagnosis and treatment before updating
    diagnosis_text = getattr(act, 'diagnosis', None)
    treatment_text = getattr(act, 'treatment', None)
    
    # Update base fields (excluding diagnosis and treatment)
    for k, v in act.model_dump(exclude={'diagnosis', 'treatment'}).items():
        # Don't update patient_id on existing records
        if k != 'patient_id':
            setattr(row, k, v)
    db.commit()
    
    # Handle diagnosis: Delete old diagnosis for this act and create new one if provided
    if diagnosis_text is not None:  # Only update if diagnosis was provided in request
        db.query(ActDiagnosisModel).filter(ActDiagnosisModel.act_id == act_id).delete()
        if isinstance(diagnosis_text, str) and diagnosis_text.strip():
            db_diagnosis = ActDiagnosisModel(
                act_id=act_id,
                diagnosis_label=diagnosis_text.strip(),
                diagnosis_type="principal"
            )
            db.add(db_diagnosis)
    
    # Handle treatment: Delete old treatment for this act and create new one if provided
    if treatment_text is not None:  # Only update if treatment was provided in request
        db.query(ActTreatmentModel).filter(ActTreatmentModel.act_id == act_id).delete()
        _persist_treatments(db, act_id, treatment_text)
    
    db.commit()
    db.refresh(row)
    
    log_action(
        db,
        action="UPDATE_MEDICAL_ACT",
        user_id=current_user.id,
        username=current_user.username,
        resource_type="medical_act",
        resource_id=str(act_id),
        details=f"Updated medical act: {row.act_type}",
    )
    
    # Get all related data for response
    patient = db.query(PatientModel).filter(PatientModel.id == row.patient_id).first()
    documents = db.query(ActDocumentModel).filter(ActDocumentModel.act_id == act_id).all()
    diagnoses = db.query(ActDiagnosisModel).filter(ActDiagnosisModel.act_id == act_id).all()
    treatments = db.query(ActTreatmentModel).filter(ActTreatmentModel.act_id == act_id).all()
    assigned_staff = db.query(MedicalActStaffModel).filter(MedicalActStaffModel.medical_act_id == act_id).all()
    
    # Filter out empty diagnoses and treatments
    diagnoses = [d for d in diagnoses if d.diagnosis_label and isinstance(d.diagnosis_label, str) and d.diagnosis_label.strip()]
    treatments = [t for t in treatments if t.drug_name and isinstance(t.drug_name, str) and t.drug_name.strip()]
    
    patient_name = f"{patient.first_name} {patient.last_name}" if patient else None
    return _act_to_dict(row, patient_name, documents, assigned_staff, diagnoses, treatments)


@router.delete("/{act_id}", status_code=204)  # FIX: 204 No Content is the correct status for DELETE
def delete_medical_act(
    act_id: int, 
    db: Session = Depends(get_db),
    current_user: User = Depends(require_clinical_delete),
):
    """Deletes an act by ID and all related records (diagnoses, treatments, documents, staff). Raises 404 if not found."""
    row = db.query(MedicalActModel).filter(MedicalActModel.id == act_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Medical act not found")
    
    act_type = row.act_type
    
    # Delete related records first to avoid foreign key constraint violations
    db.query(DynamicFormResponse).filter(DynamicFormResponse.act_id == act_id).delete()
    db.query(ActDiagnosisModel).filter(ActDiagnosisModel.act_id == act_id).delete()
    db.query(ActTreatmentModel).filter(ActTreatmentModel.act_id == act_id).delete()
    db.query(ActDocumentModel).filter(ActDocumentModel.act_id == act_id).delete()
    db.query(MedicalActStaffModel).filter(MedicalActStaffModel.medical_act_id == act_id).delete()
    
    # Now delete the medical act itself
    db.delete(row)
    db.commit()
    
    log_action(
        db,
        action="DELETE_MEDICAL_ACT",
        user_id=current_user.id,
        username=current_user.username,
        resource_type="medical_act",
        resource_id=str(act_id),
        details=f"Deleted medical act: {act_type}",
    )
    # FIX: No response body for 204; returning {"message": "Deleted"} with 204 is invalid HTTP


# ─── Documents ────────────────────────────────────────────────────────────────

class ActDocumentCreate(BaseModel):
    filename: str
    file_path: str
    mime_type: Optional[str] = None


@router.get("/{act_id}/documents", response_model=List[ActDocumentOut])
def get_act_documents(
    act_id: int, 
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_orm),
):
    """Returns all documents attached to a specific act."""
    # FIX: raise 404 if the act itself doesn't exist
    act = db.query(MedicalActModel).filter(MedicalActModel.id == act_id).first()
    if not act:
        raise HTTPException(status_code=404, detail="Medical act not found")
    return db.query(ActDocumentModel).filter(ActDocumentModel.act_id == act_id).all()


@router.post("/{act_id}/documents", response_model=ActDocumentOut, status_code=201)
def add_act_document(
    act_id: int, 
    doc: ActDocumentCreate, 
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_orm),
):
    """Attaches a document record to an existing act (Metadata only)."""
    act = db.query(MedicalActModel).filter(MedicalActModel.id == act_id).first()
    if not act:
        raise HTTPException(status_code=404, detail="Medical act not found")
    db_doc = ActDocumentModel(
        act_id=act_id,
        filename=doc.filename,
        file_path=doc.file_path,
        mime_type=doc.mime_type,
    )
    db.add(db_doc)
    db.commit()
    db.refresh(db_doc)
    return db_doc


@router.post("/{act_id}/upload", response_model=ActDocumentOut, status_code=201)
def upload_act_document(
    act_id: int, 
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_orm),
):
    """Uploads a file and attaches it to an existing medical act."""
    act = db.query(MedicalActModel).filter(MedicalActModel.id == act_id).first()
    if not act:
        raise HTTPException(status_code=404, detail="Medical act not found")
    
    # Generate unique filename
    ext = os.path.splitext(file.filename)[1] if file.filename else ""
    unique_filename = f"{uuid.uuid4()}{ext}"
    file_path = os.path.join(UPLOAD_DIR, unique_filename)
    
    # Save file to disk
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    db_doc = ActDocumentModel(
        act_id=act_id,
        filename=file.filename,
        file_path=file_path,
        mime_type=file.content_type,
    )
    db.add(db_doc)
    db.commit()
    db.refresh(db_doc)
    
    log_action(
        db,
        action="UPLOAD_MEDICAL_ACT_DOCUMENT",
        user_id=current_user.id,
        username=current_user.username,
        resource_type="act_document",
        resource_id=str(db_doc.id),
        details=f"Uploaded document {file.filename} for act {act_id}",
    )
    return db_doc


@router.get("/{act_id}/documents/{doc_id}/download")
def download_act_document(
    act_id: int,
    doc_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_orm),
):
    """Downloads an attached document for a specific medical act."""
    doc = db.query(ActDocumentModel).filter(ActDocumentModel.id == doc_id, ActDocumentModel.act_id == act_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    
    if not os.path.exists(doc.file_path):
        raise HTTPException(status_code=404, detail="File not found on server")
        
    return FileResponse(
        path=doc.file_path, 
        filename=doc.filename, 
        media_type=doc.mime_type or "application/octet-stream"
    )


@router.get("/{act_id}/pdf")
def get_act_pdf(
    act_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_orm),
):
    """Generates and returns a professional PDF for the medical act with ALL information."""
    row = db.query(MedicalActModel).filter(MedicalActModel.id == act_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Medical act not found")
        
    patient = db.query(PatientModel).filter(PatientModel.id == row.patient_id).first()
    
    # Fetch diagnoses
    diagnoses = db.query(ActDiagnosisModel).filter(ActDiagnosisModel.act_id == act_id).all()
    diagnoses_list = [
        {
            "label": d.diagnosis_label,
            "notes": d.diagnosis_notes,
            "type": d.diagnosis_type
        } for d in diagnoses
    ]
    
    # Fetch treatments
    treatments = db.query(ActTreatmentModel).filter(ActTreatmentModel.act_id == act_id).all()
    treatments_list = [
        {
            "drug_name": t.drug_name,
            "dosage": t.dosage,
            "frequency": t.frequency,
            "duration": t.duration,
            "notes": t.notes
        } for t in treatments
    ]
    
    # Fetch lab results for the patient
    from app.models.act_result import ActResult as ActResultModel
    lab_results = db.query(ActResultModel).filter(ActResultModel.patient_id == row.patient_id).all()
    lab_results_list = [
        {
            "result_name": lr.result_name,
            "result_value": lr.result_value,
            "result_unit": lr.result_unit,
            "result_date": lr.result_date,
            "is_abnormal": lr.is_abnormal
        } for lr in lab_results
    ]
    
    # Prepare complete data for the PDF service
    act_data = {
        "id": row.id,
        "patient_id": row.patient_id,
        "patient_name": f"{patient.first_name} {patient.last_name}" if patient else "Inconnu",
        "patient_age": patient.date_of_birth if patient else None,
        "act_type": row.act_type,
        "act_date": row.act_date,
        "category": row.category or "Non spécifié",
        "status": row.status or "En cours",
        "report": row.report,
        "notes": row.notes,
        "description": row.description,
        "amount": row.amount,
        "doctor_id": row.doctor_id,
        "diagnoses": diagnoses_list,
        "treatments": treatments_list,
        "lab_results": lab_results_list,
    }
    
    from app.pdf.service import generate_medical_act_pdf
    pdf_buffer = generate_medical_act_pdf(act_data)
    
    filename = f"acte_{act_id}_{datetime.now().strftime('%Y%m%d')}.pdf"
    
    return StreamingResponse(
        pdf_buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


# ─── Diagnoses ───────────────────────────────────────────────────────────────

@router.get("/{act_id}/diagnoses", response_model=List[ActDiagnosisOut])
def get_act_diagnoses(
    act_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_orm),
):
    """Returns all diagnoses for a specific medical act."""
    act = db.query(MedicalActModel).filter(MedicalActModel.id == act_id).first()
    if not act:
        raise HTTPException(status_code=404, detail="Medical act not found")
    return db.query(ActDiagnosisModel).filter(ActDiagnosisModel.act_id == act_id).all()


@router.post("/{act_id}/diagnoses", response_model=ActDiagnosisOut, status_code=201)
def add_act_diagnosis(
    act_id: int,
    diagnosis: ActDiagnosisCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_orm),
):
    """Adds a diagnosis to a medical act."""
    act = db.query(MedicalActModel).filter(MedicalActModel.id == act_id).first()
    if not act:
        raise HTTPException(status_code=404, detail="Medical act not found")
    
    db_diagnosis = ActDiagnosisModel(
        act_id=act_id,
        diagnosis_label=diagnosis.diagnosis_label,
        diagnosis_notes=diagnosis.diagnosis_notes,
        diagnosis_type=diagnosis.diagnosis_type,
    )
    db.add(db_diagnosis)
    db.commit()
    db.refresh(db_diagnosis)
    
    log_action(
        db,
        action="CREATE_ACT_DIAGNOSIS",
        user_id=current_user.id,
        username=current_user.username,
        resource_type="act_diagnosis",
        resource_id=str(db_diagnosis.id),
        details=f"Added diagnosis: {diagnosis.diagnosis_label} to act {act_id}",
    )
    return db_diagnosis


@router.put("/{act_id}/diagnoses/{diagnosis_id}", response_model=ActDiagnosisOut)
def update_act_diagnosis(
    act_id: int,
    diagnosis_id: int,
    diagnosis: ActDiagnosisCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_orm),
):
    """Updates a specific diagnosis."""
    db_diagnosis = db.query(ActDiagnosisModel).filter(
        ActDiagnosisModel.id == diagnosis_id,
        ActDiagnosisModel.act_id == act_id
    ).first()
    if not db_diagnosis:
        raise HTTPException(status_code=404, detail="Diagnosis not found")
    
    db_diagnosis.diagnosis_label = diagnosis.diagnosis_label
    db_diagnosis.diagnosis_notes = diagnosis.diagnosis_notes
    db_diagnosis.diagnosis_type = diagnosis.diagnosis_type
    db.commit()
    db.refresh(db_diagnosis)
    
    log_action(
        db,
        action="UPDATE_ACT_DIAGNOSIS",
        user_id=current_user.id,
        username=current_user.username,
        resource_type="act_diagnosis",
        resource_id=str(diagnosis_id),
        details=f"Updated diagnosis: {diagnosis.diagnosis_label}",
    )
    return db_diagnosis


@router.delete("/{act_id}/diagnoses/{diagnosis_id}", status_code=204)
def delete_act_diagnosis(
    act_id: int,
    diagnosis_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_orm),
):
    """Deletes a specific diagnosis."""
    db_diagnosis = db.query(ActDiagnosisModel).filter(
        ActDiagnosisModel.id == diagnosis_id,
        ActDiagnosisModel.act_id == act_id
    ).first()
    if not db_diagnosis:
        raise HTTPException(status_code=404, detail="Diagnosis not found")
    
    label = db_diagnosis.diagnosis_label
    db.delete(db_diagnosis)
    db.commit()
    
    log_action(
        db,
        action="DELETE_ACT_DIAGNOSIS",
        user_id=current_user.id,
        username=current_user.username,
        resource_type="act_diagnosis",
        resource_id=str(diagnosis_id),
        details=f"Deleted diagnosis: {label}",
    )


# ─── Treatments ──────────────────────────────────────────────────────────────

@router.get("/{act_id}/treatments", response_model=List[ActTreatmentOut])
def get_act_treatments(
    act_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_orm),
):
    """Returns all treatments/medications for a specific medical act."""
    act = db.query(MedicalActModel).filter(MedicalActModel.id == act_id).first()
    if not act:
        raise HTTPException(status_code=404, detail="Medical act not found")
    return db.query(ActTreatmentModel).filter(ActTreatmentModel.act_id == act_id).all()


@router.post("/{act_id}/treatments", response_model=ActTreatmentOut, status_code=201)
def add_act_treatment(
    act_id: int,
    treatment: ActTreatmentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_orm),
):
    """Adds a treatment/medication to a medical act."""
    act = db.query(MedicalActModel).filter(MedicalActModel.id == act_id).first()
    if not act:
        raise HTTPException(status_code=404, detail="Medical act not found")
    
    db_treatment = ActTreatmentModel(
        act_id=act_id,
        drug_name=treatment.drug_name,
        dosage=treatment.dosage,
        frequency=treatment.frequency,
        duration=treatment.duration,
        notes=treatment.notes,
    )
    db.add(db_treatment)
    db.commit()
    db.refresh(db_treatment)
    
    log_action(
        db,
        action="CREATE_ACT_TREATMENT",
        user_id=current_user.id,
        username=current_user.username,
        resource_type="act_treatment",
        resource_id=str(db_treatment.id),
        details=f"Added treatment: {treatment.drug_name} to act {act_id}",
    )
    return db_treatment


@router.put("/{act_id}/treatments/{treatment_id}", response_model=ActTreatmentOut)
def update_act_treatment(
    act_id: int,
    treatment_id: int,
    treatment: ActTreatmentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_orm),
):
    """Updates a specific treatment."""
    db_treatment = db.query(ActTreatmentModel).filter(
        ActTreatmentModel.id == treatment_id,
        ActTreatmentModel.act_id == act_id
    ).first()
    if not db_treatment:
        raise HTTPException(status_code=404, detail="Treatment not found")
    
    db_treatment.drug_name = treatment.drug_name
    db_treatment.dosage = treatment.dosage
    db_treatment.frequency = treatment.frequency
    db_treatment.duration = treatment.duration
    db_treatment.notes = treatment.notes
    db.commit()
    db.refresh(db_treatment)
    
    log_action(
        db,
        action="UPDATE_ACT_TREATMENT",
        user_id=current_user.id,
        username=current_user.username,
        resource_type="act_treatment",
        resource_id=str(treatment_id),
        details=f"Updated treatment: {treatment.drug_name}",
    )
    return db_treatment


@router.delete("/{act_id}/treatments/{treatment_id}", status_code=204)
def delete_act_treatment(
    act_id: int,
    treatment_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_orm),
):
    """Deletes a specific treatment."""
    db_treatment = db.query(ActTreatmentModel).filter(
        ActTreatmentModel.id == treatment_id,
        ActTreatmentModel.act_id == act_id
    ).first()
    if not db_treatment:
        raise HTTPException(status_code=404, detail="Treatment not found")
    
    drug_name = db_treatment.drug_name
    db.delete(db_treatment)
    db.commit()
    
    log_action(
        db,
        action="DELETE_ACT_TREATMENT",
        user_id=current_user.id,
        username=current_user.username,
        resource_type="act_treatment",
        resource_id=str(treatment_id),
        details=f"Deleted treatment: {drug_name}",
    )


# ─── Staff Assignments ────────────────────────────────────────────────────────

@router.get("/{act_id}/staff", response_model=List[MedicalActStaffOut])
def get_act_staff(
    act_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_orm),
):
    """Returns all staff members assigned to a specific medical act."""
    act = db.query(MedicalActModel).filter(MedicalActModel.id == act_id).first()
    if not act:
        raise HTTPException(status_code=404, detail="Medical act not found")
    return db.query(MedicalActStaffModel).filter(MedicalActStaffModel.medical_act_id == act_id).all()


@router.post("/{act_id}/staff", response_model=MedicalActStaffOut, status_code=201)
def assign_staff_to_act(
    act_id: int,
    assignment: MedicalActStaffCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_orm),
):
    """Assigns a staff member to a medical act."""
    act = db.query(MedicalActModel).filter(MedicalActModel.id == act_id).first()
    if not act:
        raise HTTPException(status_code=404, detail="Medical act not found")
    
    staff = db.query(User).filter(User.id == assignment.staff_id).first()
    if not staff:
        raise HTTPException(status_code=404, detail="Staff member not found")
    
    db_assignment = MedicalActStaffModel(
        medical_act_id=act_id,
        staff_id=assignment.staff_id,
        role=assignment.role,
    )
    db.add(db_assignment)
    db.commit()
    db.refresh(db_assignment)
    
    log_action(
        db,
        action="ASSIGN_STAFF_TO_ACT",
        user_id=current_user.id,
        username=current_user.username,
        resource_type="medical_act_staff",
        resource_id=str(db_assignment.id),
        details=f"Assigned {staff.username} ({assignment.role or 'no role'}) to act {act_id}",
    )
    return db_assignment


@router.delete("/{act_id}/staff/{staff_id}", status_code=204)
def unassign_staff_from_act(
    act_id: int,
    staff_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_orm),
):
    """Removes a staff member from a medical act."""
    db_assignment = db.query(MedicalActStaffModel).filter(
        MedicalActStaffModel.medical_act_id == act_id,
        MedicalActStaffModel.staff_id == staff_id
    ).first()
    if not db_assignment:
        raise HTTPException(status_code=404, detail="Staff assignment not found")
    
    staff = db.query(User).filter(User.id == staff_id).first()
    staff_name = staff.username if staff else str(staff_id)
    
    db.delete(db_assignment)
    db.commit()
    
    log_action(
        db,
        action="UNASSIGN_STAFF_FROM_ACT",
        user_id=current_user.id,
        username=current_user.username,
        resource_type="medical_act_staff",
        resource_id=str(db_assignment.id),
        details=f"Removed {staff_name} from act {act_id}",
    )