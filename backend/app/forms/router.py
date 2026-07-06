"""
FastAPI router for dynamic form system.
Handles reference data (care types, act types, form templates)
and CRUD for form data tables.
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field
from typing import List, Optional, Dict, Any
from datetime import date, datetime
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.schemas.mojibake_safe import MojibakeSafeBase
from app.models.form_system import (
    RefCareType, RefActType, RefFormType, ActForm, FormCsRd,
    DynamicFormTemplate, DynamicFormResponse
)
from app.models.additional_forms import (
    FormCsRic, FormCsOs, FormCsEcho, FormCsGeste, FormCsSeances, FormCsDxa, FormCsDouleur
)
from app.models.medical_act import MedicalAct as MedicalActModel
from app.auth.router import get_current_user_orm
from app.models.user import User
from app.analytics.audit import log_action

router = APIRouter()


# ───────────────────────────────────────────────────────────────────────
# Pydantic Schemas
# ───────────────────────────────────────────────────────────────────────

class RefCareTypeOut(MojibakeSafeBase):
    id: int
    code: str
    label: str
    description: Optional[str] = None
    is_active: int
    display_order: int

    class Config:
        from_attributes = True


class RefActTypeOut(MojibakeSafeBase):
    id: int
    ref_care_type_id: int
    code: str
    label: str
    description: Optional[str] = None
    is_active: int
    display_order: int

    class Config:
        from_attributes = True


class RefFormTypeOut(MojibakeSafeBase):
    id: int
    ref_act_type_id: int
    form_name: str
    form_label: str
    form_order: int
    is_active: int

    class Config:
        from_attributes = True


class FormCsRdCreate(BaseModel):
    """Schema for creating/updating form_cs_rd"""
    form_date: Optional[date] = None
    
    # Section 1: Current Treatment
    current_treatment_none: Optional[int] = 0
    current_treatment_json: Optional[List[Any]] = None
    
    # Section 2: Functional Signs
    arthralgie_present: Optional[int] = 0
    arthralgie_horaire: Optional[str] = None
    arthralgie_duration: Optional[str] = None
    arthralgie_locations: Optional[List[str]] = None
    
    joint_swelling_present: Optional[int] = 0
    joint_swelling_locations: Optional[List[str]] = None
    
    rachialgie_present: Optional[int] = 0
    rachialgie_horaire: Optional[str] = None
    rachialgie_duration: Optional[str] = None
    rachialgie_locations: Optional[List[str]] = None
    
    fessialgie_present: Optional[int] = 0
    fessialgie_horaire: Optional[str] = None
    fessialgie_duration: Optional[str] = None
    fessialgie_locations: Optional[List[str]] = None
    
    enthesalgie_present: Optional[int] = 0
    enthesalgie_locations: Optional[List[str]] = None
    
    myalgie_present: Optional[int] = 0
    myalgie_horaire: Optional[str] = None
    myalgie_duration: Optional[str] = None
    
    other_signs_text: Optional[str] = None
    
    # Section 3: Physical Examination
    articular_index: Optional[int] = None
    synovial_index: Optional[int] = None
    clinical_examination_notes: Optional[str] = None
    
    # Section 4: Lab Results
    lab_inflammatory_json: Optional[Dict[str, Any]] = None
    lab_renal_json: Optional[Dict[str, Any]] = None
    lab_hepatic_json: Optional[Dict[str, Any]] = None
    lab_metabolic_json: Optional[Dict[str, Any]] = None
    lab_electrolytes_json: Optional[Dict[str, Any]] = None
    lab_immunology_json: Optional[Dict[str, Any]] = None
    lab_infection_json: Optional[Dict[str, Any]] = None
    
    # Section 5: Imaging
    imaging_xray: Optional[int] = 0
    imaging_xray_findings: Optional[str] = None
    imaging_ultrasound: Optional[int] = 0
    imaging_ultrasound_findings: Optional[str] = None
    imaging_ct: Optional[int] = 0
    imaging_ct_findings: Optional[str] = None
    imaging_mri: Optional[int] = 0
    imaging_mri_findings: Optional[str] = None
    imaging_other: Optional[int] = 0
    imaging_other_findings: Optional[str] = None
    
    # Section 6: Diagnosis
    diagnosis_osteoarthritis_json: Optional[List[Dict[str, Any]]] = None
    diagnosis_spine_json: Optional[Dict[str, Any]] = None
    diagnosis_tendinopathy_json: Optional[List[Dict[str, Any]]] = None
    diagnosis_other_text: Optional[str] = None
    
    # Section 7: Treatment Plan
    treatment_decision: Optional[str] = None
    treatment_starting_json: Optional[Dict[str, Any]] = None
    treatment_maintain_reason: Optional[str] = None
    treatment_maintain_remarks: Optional[str] = None
    treatment_stop_reason: Optional[str] = None
    treatment_stop_remarks: Optional[str] = None
    other_therapeutic_decisions: Optional[str] = None
    prescription: Optional[str] = None
    additional_notes: Optional[str] = None

    class Config:
        from_attributes = True
        # Allow type coercion for common cases
        validate_assignment = True


class FormCsRdOut(FormCsRdCreate):
    """Schema for returning form_cs_rd"""
    id: int
    created_by: Optional[int] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# ───────────────────────────────────────────────────────────────────────
# Pydantic Schemas for Additional Forms (RIC, OS, ECHO, GESTE, SEANCES, DXA)
# ───────────────────────────────────────────────────────────────────────

class FormCsRicCreate(BaseModel):
    """Schema for form_cs_ric - Inflammatory Arthritis"""
    crp_value: Optional[float] = None
    crp_date: Optional[date] = None
    esr_value: Optional[float] = None
    esr_date: Optional[date] = None
    das28_score: Optional[float] = None
    tender_joint_count: Optional[int] = None
    swollen_joint_count: Optional[int] = None
    morning_stiffness_duration: Optional[int] = None
    affected_joints: Optional[List[str]] = None
    fever_present: Optional[int] = 0
    fatigue_level: Optional[int] = None
    dmards_json: Optional[List[Dict[str, Any]]] = None
    biologics_json: Optional[List[Dict[str, Any]]] = None
    treatment_response: Optional[str] = None
    clinical_notes: Optional[str] = None
    
    class Config:
        from_attributes = True


class FormCsRicOut(FormCsRicCreate):
    id: int
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class FormCsOsCreate(BaseModel):
    """Schema for form_cs_os - Fragility Bone Disease"""
    dxa_date: Optional[date] = None
    spine_tscore: Optional[float] = None
    hip_tscore: Optional[float] = None
    femoral_neck_tscore: Optional[float] = None
    fracture_history_present: Optional[int] = 0
    vertebral_fracture_present: Optional[int] = 0
    frax_major_osteoporotic: Optional[float] = None
    frax_hip_fracture: Optional[float] = None
    fall_risk: Optional[str] = None
    vitamin_d_level: Optional[float] = None
    physical_activity: Optional[str] = None
    back_pain_present: Optional[int] = 0
    back_pain_severity: Optional[int] = None
    clinical_notes: Optional[str] = None
    
    class Config:
        from_attributes = True


class FormCsOsOut(FormCsOsCreate):
    id: int
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class FormCsEchoCreate(BaseModel):
    """Schema for form_cs_echo - Ultrasound"""
    echo_date: date
    anatomical_region: str
    indication: Optional[str] = None
    side_examined: Optional[str] = None
    synovitis_present: Optional[int] = 0
    synovitis_grade: Optional[str] = None
    effusion_present: Optional[int] = 0
    effusion_volume: Optional[str] = None
    bone_erosions_present: Optional[int] = 0
    doppler_performed: Optional[int] = 0
    doppler_hyperemia_present: Optional[int] = 0
    impression: str
    recommendations: Optional[str] = None
    
    class Config:
        from_attributes = True


class FormCsEchoOut(FormCsEchoCreate):
    id: int
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class FormCsGesteCreate(BaseModel):
    """Schema for form_cs_geste - Procedures"""
    procedure_date: datetime
    procedure_type: str
    anatomical_site: str
    side: Optional[str] = None
    clinical_indication: str
    guidance_method: Optional[str] = None
    anesthesia_used: Optional[int] = 0
    product_injected: Optional[str] = None
    fluid_aspirated_volume: Optional[float] = None
    patient_tolerance: Optional[str] = None
    pain_during_procedure: Optional[int] = None
    complications_present: Optional[int] = 0
    follow_up_recommended: Optional[int] = 0
    clinical_notes: Optional[str] = None
    
    class Config:
        from_attributes = True


class FormCsGesteOut(FormCsGesteCreate):
    id: int
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class FormCsSeancesCreate(BaseModel):
    """Schema for form_cs_seances - Therapeutic Sessions"""
    session_date: date
    session_duration: Optional[int] = None
    therapist_name: Optional[str] = None
    session_type: str
    anatomical_regions: Optional[str] = None
    pain_before_session: Optional[int] = None
    pain_after_session: Optional[int] = None
    functional_improvement: Optional[str] = None
    patient_comfort_level: Optional[str] = None
    patient_compliance: Optional[str] = None
    session_number_in_series: Optional[int] = None
    progress_notes: Optional[str] = None
    
    class Config:
        from_attributes = True


class FormCsSeancesOut(FormCsSeancesCreate):
    id: int
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class FormCsDxaCreate(BaseModel):
    """Schema for form_cs_dxa - DXA/DEXA Scan"""
    scan_date: date
    scan_quality: Optional[str] = None
    spine_tscore: Optional[float] = None
    hip_tscore: Optional[float] = None
    femoral_neck_tscore: Optional[float] = None
    who_diagnosis_spine: Optional[str] = None
    frax_major_fracture_probability: Optional[float] = None
    frax_hip_fracture_probability: Optional[float] = None
    vfa_performed: Optional[int] = 0
    vertebral_deformities_present: Optional[int] = 0
    impression: str
    recommendations: Optional[str] = None
    
    class Config:
        from_attributes = True


class FormCsDxaOut(FormCsDxaCreate):
    id: int
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class FormCsDouleurCreate(BaseModel):
    """Schema for creating form_cs_douleur"""
    pain_locations: Optional[list] = None
    pain_intensity_vas: Optional[int] = None
    pain_duration: Optional[str] = None
    pain_character: Optional[list] = None
    onset_type: Optional[str] = None
    initial_pain_date: Optional[date] = None
    previous_treatments_json: Optional[dict] = None
    pain_progression: Optional[str] = None
    aggravating_factors: Optional[list] = None
    relieving_factors: Optional[list] = None
    time_of_day_pattern: Optional[str] = None
    functional_limitation_score: Optional[int] = None
    sleep_disturbance_present: Optional[int] = 0
    sleep_quality: Optional[str] = None
    work_impact: Optional[str] = None
    daily_activity_limitations: Optional[str] = None
    analgesics_json: Optional[list] = None
    nsaids_json: Optional[list] = None
    other_medications_json: Optional[list] = None
    tender_points_locations: Optional[list] = None
    range_of_motion_findings: Optional[str] = None
    neurological_exam_findings: Optional[str] = None
    anxiety_level: Optional[int] = None
    depression_screening: Optional[str] = None
    catastrophizing_score: Optional[int] = None
    coping_mechanisms: Optional[list] = None
    recommended_interventions: Optional[list] = None
    referrals_needed: Optional[list] = None
    follow_up_plan: Optional[str] = None
    clinical_notes: Optional[str] = None
    
    class Config:
        from_attributes = True


class FormCsDouleurOut(FormCsDouleurCreate):
    id: int
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class ActFormOut(BaseModel):
    """Schema for act_forms bridge"""
    id: int
    act_id: int
    ref_form_type_id: int
    form_table_id: int
    created_by: Optional[int] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# ───────────────────────────────────────────────────────────────────────
# Reference Data Endpoints (Catalog)
# ───────────────────────────────────────────────────────────────────────

@router.get("/ref/care-types", response_model=List[RefCareTypeOut])
def get_care_types(
    active_only: bool = Query(True),
    db: Session = Depends(get_db)
):
    """Get all care type categories (RIC, RD, OS, etc.)"""
    query = db.query(RefCareType)
    if active_only:
        query = query.filter(RefCareType.is_active == 1)
    return query.order_by(RefCareType.display_order).all()


@router.get("/ref/act-types", response_model=List[RefActTypeOut])
def get_act_types(
    care_type_id: int = Query(..., description="Filter by care type ID"),
    active_only: bool = Query(True),
    db: Session = Depends(get_db)
):
    """Get act types for a specific care type"""
    query = db.query(RefActType).filter(RefActType.ref_care_type_id == care_type_id)
    if active_only:
        query = query.filter(RefActType.is_active == 1)
    return query.order_by(RefActType.display_order).all()


@router.get("/ref/form-types", response_model=List[RefFormTypeOut])
def get_form_types(
    act_type_id: int = Query(..., description="Filter by act type ID"),
    active_only: bool = Query(True),
    db: Session = Depends(get_db)
):
    """Get form templates for a specific act type"""
    query = db.query(RefFormType).filter(RefFormType.ref_act_type_id == act_type_id)
    if active_only:
        query = query.filter(RefFormType.is_active == 1)
    return query.order_by(RefFormType.form_order).all()


# ───────────────────────────────────────────────────────────────────────
# Form Data CRUD Endpoints
# ───────────────────────────────────────────────────────────────────────

@router.post("/cs_rd", response_model=FormCsRdOut)
def create_form_cs_rd(
    data: FormCsRdCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_orm)
):
    """Create a new form_cs_rd record"""
    form = FormCsRd(**data.dict(), created_by=current_user.id)
    db.add(form)
    db.commit()
    db.refresh(form)
    
    log_action(db, action="form_created", user_id=current_user.id, details=f"Created form_cs_rd #{form.id}")
    
    return form


@router.get("/cs_rd/{form_id}", response_model=FormCsRdOut)
def get_form_cs_rd(
    form_id: int,
    db: Session = Depends(get_db)
):
    """Get a specific form_cs_rd record"""
    form = db.query(FormCsRd).filter(FormCsRd.id == form_id).first()
    if not form:
        raise HTTPException(status_code=404, detail="Form not found")
    return form


@router.put("/cs_rd/{form_id}", response_model=FormCsRdOut)
def update_form_cs_rd(
    form_id: int,
    data: FormCsRdCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_orm)
):
    """Update a form_cs_rd record"""
    form = db.query(FormCsRd).filter(FormCsRd.id == form_id).first()
    if not form:
        raise HTTPException(status_code=404, detail="Form not found")
    
    try:
        print(f"DEBUG: Received data for update: {data.dict(exclude_none=True)}")
        # Use exclude_unset to only update fields that were explicitly provided
        update_data = data.dict(exclude_unset=True, exclude_none=False)
        print(f"DEBUG: Update data after dict: {update_data}")
        for key, value in update_data.items():
            setattr(form, key, value)
        
        db.commit()
        db.refresh(form)
        
        log_action(db, action="form_updated", user_id=current_user.id, details=f"Updated form_cs_rd #{form.id}")
        
        return form
    except Exception as e:
        db.rollback()
        import traceback
        print(f"Error updating form: {str(e)}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Error updating form: {str(e)}")


@router.delete("/cs_rd/{form_id}")
def delete_form_cs_rd(
    form_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_orm)
):
    """Delete a form_cs_rd record"""
    form = db.query(FormCsRd).filter(FormCsRd.id == form_id).first()
    if not form:
        raise HTTPException(status_code=404, detail="Form not found")
    
    db.delete(form)
    db.commit()
    
    log_action(db, action="form_deleted", user_id=current_user.id, details=f"Deleted form_cs_rd #{form_id}")
    
    return {"message": "Form deleted"}


# ───────────────────────────────────────────────────────────────────────
# CRUD Endpoints for Additional Forms (RIC, OS, ECHO, GESTE, SEANCES, DXA)
# ───────────────────────────────────────────────────────────────────────

# ─── FormCsRic ───
@router.post("/cs-ric", response_model=FormCsRicOut)
def create_form_cs_ric(data: FormCsRicCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user_orm)):
    """Create a new form_cs_ric record"""
    form = FormCsRic(**data.dict())
    db.add(form)
    db.commit()
    db.refresh(form)
    log_action(db, action="form_created", user_id=current_user.id, details=f"Created form_cs_ric #{form.id}")
    return form

@router.get("/cs-ric/{form_id}", response_model=FormCsRicOut)
def get_form_cs_ric(form_id: int, db: Session = Depends(get_db)):
    """Get a specific form_cs_ric record"""
    form = db.query(FormCsRic).filter(FormCsRic.id == form_id).first()
    if not form:
        raise HTTPException(status_code=404, detail="Form not found")
    return form

@router.patch("/cs-ric/{form_id}", response_model=FormCsRicOut)
def update_form_cs_ric(form_id: int, data: FormCsRicCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user_orm)):
    """Update a form_cs_ric record"""
    form = db.query(FormCsRic).filter(FormCsRic.id == form_id).first()
    if not form:
        raise HTTPException(status_code=404, detail="Form not found")
    for key, value in data.dict(exclude_unset=True).items():
        setattr(form, key, value)
    db.commit()
    db.refresh(form)
    log_action(db, action="form_updated", user_id=current_user.id, details=f"Updated form_cs_ric #{form.id}")
    return form

@router.delete("/cs-ric/{form_id}")
def delete_form_cs_ric(form_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user_orm)):
    """Delete a form_cs_ric record"""
    form = db.query(FormCsRic).filter(FormCsRic.id == form_id).first()
    if not form:
        raise HTTPException(status_code=404, detail="Form not found")
    db.delete(form)
    db.commit()
    log_action(db, action="form_deleted", user_id=current_user.id, details=f"Deleted form_cs_ric #{form_id}")
    return {"message": "Form deleted"}

# ─── FormCsOs ───
@router.post("/cs-os", response_model=FormCsOsOut)
def create_form_cs_os(data: FormCsOsCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user_orm)):
    """Create a new form_cs_os record"""
    form = FormCsOs(**data.dict())
    db.add(form)
    db.commit()
    db.refresh(form)
    log_action(db, action="form_created", user_id=current_user.id, details=f"Created form_cs_os #{form.id}")
    return form

@router.get("/cs-os/{form_id}", response_model=FormCsOsOut)
def get_form_cs_os(form_id: int, db: Session = Depends(get_db)):
    """Get a specific form_cs_os record"""
    form = db.query(FormCsOs).filter(FormCsOs.id == form_id).first()
    if not form:
        raise HTTPException(status_code=404, detail="Form not found")
    return form

@router.patch("/cs-os/{form_id}", response_model=FormCsOsOut)
def update_form_cs_os(form_id: int, data: FormCsOsCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user_orm)):
    """Update a form_cs_os record"""
    form = db.query(FormCsOs).filter(FormCsOs.id == form_id).first()
    if not form:
        raise HTTPException(status_code=404, detail="Form not found")
    for key, value in data.dict(exclude_unset=True).items():
        setattr(form, key, value)
    db.commit()
    db.refresh(form)
    log_action(db, action="form_updated", user_id=current_user.id, details=f"Updated form_cs_os #{form.id}")
    return form

@router.delete("/cs-os/{form_id}")
def delete_form_cs_os(form_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user_orm)):
    """Delete a form_cs_os record"""
    form = db.query(FormCsOs).filter(FormCsOs.id == form_id).first()
    if not form:
        raise HTTPException(status_code=404, detail="Form not found")
    db.delete(form)
    db.commit()
    log_action(db, action="form_deleted", user_id=current_user.id, details=f"Deleted form_cs_os #{form_id}")
    return {"message": "Form deleted"}

# ─── FormCsEcho ───
@router.post("/cs-echo", response_model=FormCsEchoOut)
def create_form_cs_echo(data: FormCsEchoCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user_orm)):
    """Create a new form_cs_echo record"""
    form = FormCsEcho(**data.dict())
    db.add(form)
    db.commit()
    db.refresh(form)
    log_action(db, action="form_created", user_id=current_user.id, details=f"Created form_cs_echo #{form.id}")
    return form

@router.get("/cs-echo/{form_id}", response_model=FormCsEchoOut)
def get_form_cs_echo(form_id: int, db: Session = Depends(get_db)):
    """Get a specific form_cs_echo record"""
    form = db.query(FormCsEcho).filter(FormCsEcho.id == form_id).first()
    if not form:
        raise HTTPException(status_code=404, detail="Form not found")
    return form

@router.patch("/cs-echo/{form_id}", response_model=FormCsEchoOut)
def update_form_cs_echo(form_id: int, data: FormCsEchoCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user_orm)):
    """Update a form_cs_echo record"""
    form = db.query(FormCsEcho).filter(FormCsEcho.id == form_id).first()
    if not form:
        raise HTTPException(status_code=404, detail="Form not found")
    for key, value in data.dict(exclude_unset=True).items():
        setattr(form, key, value)
    db.commit()
    db.refresh(form)
    log_action(db, action="form_updated", user_id=current_user.id, details=f"Updated form_cs_echo #{form.id}")
    return form

@router.delete("/cs-echo/{form_id}")
def delete_form_cs_echo(form_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user_orm)):
    """Delete a form_cs_echo record"""
    form = db.query(FormCsEcho).filter(FormCsEcho.id == form_id).first()
    if not form:
        raise HTTPException(status_code=404, detail="Form not found")
    db.delete(form)
    db.commit()
    log_action(db, action="form_deleted", user_id=current_user.id, details=f"Deleted form_cs_echo #{form_id}")
    return {"message": "Form deleted"}

# ─── FormCsGeste ───
@router.post("/cs-geste", response_model=FormCsGesteOut)
def create_form_cs_geste(data: FormCsGesteCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user_orm)):
    """Create a new form_cs_geste record"""
    form = FormCsGeste(**data.dict())
    db.add(form)
    db.commit()
    db.refresh(form)
    log_action(db, action="form_created", user_id=current_user.id, details=f"Created form_cs_geste #{form.id}")
    return form

@router.get("/cs-geste/{form_id}", response_model=FormCsGesteOut)
def get_form_cs_geste(form_id: int, db: Session = Depends(get_db)):
    """Get a specific form_cs_geste record"""
    form = db.query(FormCsGeste).filter(FormCsGeste.id == form_id).first()
    if not form:
        raise HTTPException(status_code=404, detail="Form not found")
    return form

@router.patch("/cs-geste/{form_id}", response_model=FormCsGesteOut)
def update_form_cs_geste(form_id: int, data: FormCsGesteCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user_orm)):
    """Update a form_cs_geste record"""
    form = db.query(FormCsGeste).filter(FormCsGeste.id == form_id).first()
    if not form:
        raise HTTPException(status_code=404, detail="Form not found")
    for key, value in data.dict(exclude_unset=True).items():
        setattr(form, key, value)
    db.commit()
    db.refresh(form)
    log_action(db, action="form_updated", user_id=current_user.id, details=f"Updated form_cs_geste #{form.id}")
    return form

@router.delete("/cs-geste/{form_id}")
def delete_form_cs_geste(form_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user_orm)):
    """Delete a form_cs_geste record"""
    form = db.query(FormCsGeste).filter(FormCsGeste.id == form_id).first()
    if not form:
        raise HTTPException(status_code=404, detail="Form not found")
    db.delete(form)
    db.commit()
    log_action(db, action="form_deleted", user_id=current_user.id, details=f"Deleted form_cs_geste #{form_id}")
    return {"message": "Form deleted"}

# ─── FormCsSeances ───
@router.post("/cs-seances", response_model=FormCsSeancesOut)
def create_form_cs_seances(data: FormCsSeancesCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user_orm)):
    """Create a new form_cs_seances record"""
    form = FormCsSeances(**data.dict())
    db.add(form)
    db.commit()
    db.refresh(form)
    log_action(db, action="form_created", user_id=current_user.id, details=f"Created form_cs_seances #{form.id}")
    return form

@router.get("/cs-seances/{form_id}", response_model=FormCsSeancesOut)
def get_form_cs_seances(form_id: int, db: Session = Depends(get_db)):
    """Get a specific form_cs_seances record"""
    form = db.query(FormCsSeances).filter(FormCsSeances.id == form_id).first()
    if not form:
        raise HTTPException(status_code=404, detail="Form not found")
    return form

@router.patch("/cs-seances/{form_id}", response_model=FormCsSeancesOut)
def update_form_cs_seances(form_id: int, data: FormCsSeancesCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user_orm)):
    """Update a form_cs_seances record"""
    form = db.query(FormCsSeances).filter(FormCsSeances.id == form_id).first()
    if not form:
        raise HTTPException(status_code=404, detail="Form not found")
    for key, value in data.dict(exclude_unset=True).items():
        setattr(form, key, value)
    db.commit()
    db.refresh(form)
    log_action(db, action="form_updated", user_id=current_user.id, details=f"Updated form_cs_seances #{form.id}")
    return form

@router.delete("/cs-seances/{form_id}")
def delete_form_cs_seances(form_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user_orm)):
    """Delete a form_cs_seances record"""
    form = db.query(FormCsSeances).filter(FormCsSeances.id == form_id).first()
    if not form:
        raise HTTPException(status_code=404, detail="Form not found")
    db.delete(form)
    db.commit()
    log_action(db, action="form_deleted", user_id=current_user.id, details=f"Deleted form_cs_seances #{form_id}")
    return {"message": "Form deleted"}

# ─── FormCsDxa ───
@router.post("/cs-dxa", response_model=FormCsDxaOut)
def create_form_cs_dxa(data: FormCsDxaCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user_orm)):
    """Create a new form_cs_dxa record"""
    form = FormCsDxa(**data.dict())
    db.add(form)
    db.commit()
    db.refresh(form)
    log_action(db, action="form_created", user_id=current_user.id, details=f"Created form_cs_dxa #{form.id}")
    return form

@router.get("/cs-dxa/{form_id}", response_model=FormCsDxaOut)
def get_form_cs_dxa(form_id: int, db: Session = Depends(get_db)):
    """Get a specific form_cs_dxa record"""
    form = db.query(FormCsDxa).filter(FormCsDxa.id == form_id).first()
    if not form:
        raise HTTPException(status_code=404, detail="Form not found")
    return form

@router.patch("/cs-dxa/{form_id}", response_model=FormCsDxaOut)
def update_form_cs_dxa(form_id: int, data: FormCsDxaCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user_orm)):
    """Update a form_cs_dxa record"""
    form = db.query(FormCsDxa).filter(FormCsDxa.id == form_id).first()
    if not form:
        raise HTTPException(status_code=404, detail="Form not found")
    for key, value in data.dict(exclude_unset=True).items():
        setattr(form, key, value)
    db.commit()
    db.refresh(form)
    log_action(db, action="form_updated", user_id=current_user.id, details=f"Updated form_cs_dxa #{form.id}")
    return form

@router.delete("/cs-dxa/{form_id}")
def delete_form_cs_dxa(form_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user_orm)):
    """Delete a form_cs_dxa record"""
    form = db.query(FormCsDxa).filter(FormCsDxa.id == form_id).first()
    if not form:
        raise HTTPException(status_code=404, detail="Form not found")
    db.delete(form)
    db.commit()
    log_action(db, action="form_deleted", user_id=current_user.id, details=f"Deleted form_cs_dxa #{form_id}")
    return {"message": "Form deleted"}

# ─── FormCsDouleur ───
@router.post("/cs-douleur", response_model=FormCsDouleurOut)
def create_form_cs_douleur(data: FormCsDouleurCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user_orm)):
    """Create a new form_cs_douleur record"""
    form = FormCsDouleur(**data.dict())
    db.add(form)
    db.commit()
    db.refresh(form)
    log_action(db, action="form_created", user_id=current_user.id, details=f"Created form_cs_douleur #{form.id}")
    return form

@router.get("/cs-douleur/{form_id}", response_model=FormCsDouleurOut)
def get_form_cs_douleur(form_id: int, db: Session = Depends(get_db)):
    """Get a specific form_cs_douleur record"""
    form = db.query(FormCsDouleur).filter(FormCsDouleur.id == form_id).first()
    if not form:
        raise HTTPException(status_code=404, detail="Form not found")
    return form

@router.patch("/cs-douleur/{form_id}", response_model=FormCsDouleurOut)
def update_form_cs_douleur(form_id: int, data: FormCsDouleurCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user_orm)):
    """Update an existing form_cs_douleur record"""
    form = db.query(FormCsDouleur).filter(FormCsDouleur.id == form_id).first()
    if not form:
        raise HTTPException(status_code=404, detail="Form not found")
    for key, value in data.dict(exclude_unset=True).items():
        setattr(form, key, value)
    db.commit()
    db.refresh(form)
    log_action(db, action="form_updated", user_id=current_user.id, details=f"Updated form_cs_douleur #{form.id}")
    return form

@router.delete("/cs-douleur/{form_id}")
def delete_form_cs_douleur(form_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user_orm)):
    """Delete a form_cs_douleur record"""
    form = db.query(FormCsDouleur).filter(FormCsDouleur.id == form_id).first()
    if not form:
        raise HTTPException(status_code=404, detail="Form not found")
    db.delete(form)
    db.commit()
    log_action(db, action="form_deleted", user_id=current_user.id, details=f"Deleted form_cs_douleur #{form_id}")
    return {"message": "Form deleted"}


@router.post("/acts/{act_id}/forms", response_model=ActFormOut)
def create_act_form(
    act_id: int,
    ref_form_type_id: int = Query(...),
    form_table_id: int = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_orm)
):
    """Link a form to a medical act (bridge table)"""
    act = db.query(MedicalActModel).filter(MedicalActModel.id == act_id).first()
    if not act:
        raise HTTPException(status_code=404, detail="Medical act not found")
    
    # Check if form already linked
    existing = db.query(ActForm).filter(
        ActForm.act_id == act_id,
        ActForm.ref_form_type_id == ref_form_type_id
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Form already linked to this act")
    
    act_form = ActForm(
        act_id=act_id,
        ref_form_type_id=ref_form_type_id,
        form_table_id=form_table_id,
        created_by=current_user.id
    )
    db.add(act_form)
    db.commit()
    db.refresh(act_form)
    
    return act_form


@router.get("/acts/{act_id}/forms", response_model=List[ActFormOut])
def get_act_forms(
    act_id: int,
    db: Session = Depends(get_db)
):
    """Get all forms linked to a medical act"""
    return db.query(ActForm).filter(ActForm.act_id == act_id).all()


@router.get("/acts/{act_id}/forms/{ref_form_type_id}", response_model=ActFormOut)
def get_act_form(
    act_id: int,
    ref_form_type_id: int,
    db: Session = Depends(get_db)
):
    """Get specific form linked to a medical act"""
    act_form = db.query(ActForm).filter(
        ActForm.act_id == act_id,
        ActForm.ref_form_type_id == ref_form_type_id
    ).first()
    if not act_form:
        raise HTTPException(status_code=404, detail="Form link not found")
    return act_form


@router.delete("/acts/{act_id}/forms/{ref_form_type_id}")
def delete_act_form(
    act_id: int,
    ref_form_type_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_orm)
):
    """Unlink a form from a medical act"""
    act_form = db.query(ActForm).filter(
        ActForm.act_id == act_id,
        ActForm.ref_form_type_id == ref_form_type_id
    ).first()
    if not act_form:
        raise HTTPException(status_code=404, detail="Form link not found")
    
    db.delete(act_form)
    db.commit()
    
    return {"message": "Form unlinked"}


# ─── Dynamic Forms (Templates and Responses) ───

class FormTemplateCreate(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    title: str
    form_schema: List[Dict[str, Any]] = Field(
        ...,
        validation_alias="schema_json",
        serialization_alias="schema_json",
    )
    is_active: bool = True

class FormTemplateResponse(MojibakeSafeBase):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: int
    title: str
    form_schema: List[Dict[str, Any]] = Field(
        ...,
        validation_alias="schema_json",
        serialization_alias="schema_json",
    )
    is_active: bool
    created_at: datetime

class FormResponseCreate(BaseModel):
    act_id: int
    template_id: int
    response_data: Dict[str, Any]

class FormResponseResponse(MojibakeSafeBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    act_id: int
    template_id: int
    template_name: Optional[str] = None
    response_data: Dict[str, Any]
    created_at: datetime

@router.get("/templates", response_model=List[FormTemplateResponse])
def get_templates(
    active_only: bool = True,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_orm)
):
    """Get all dynamic form templates. Usually active ones only."""
    q = db.query(DynamicFormTemplate)
    if active_only:
        q = q.filter(DynamicFormTemplate.is_active == True)
    return q.all()

@router.get("/templates/{template_id}", response_model=FormTemplateResponse)
def get_template(
    template_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_orm)
):
    """Get a specific form template by ID."""
    template = db.query(DynamicFormTemplate).filter(DynamicFormTemplate.id == template_id).first()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    return template

@router.post("/templates", response_model=FormTemplateResponse)
def create_template(
    data: FormTemplateCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_orm)
):
    """Create a new dynamic form template."""
    existing = db.query(DynamicFormTemplate).filter(DynamicFormTemplate.title == data.title).first()
    if existing:
        raise HTTPException(status_code=400, detail="A template with this title already exists")

    template = DynamicFormTemplate(
        title=data.title,
        schema_json=data.form_schema,
        is_active=data.is_active
    )
    db.add(template)
    db.commit()
    db.refresh(template)
    return template

@router.put("/templates/{template_id}", response_model=FormTemplateResponse)
def update_template(
    template_id: int,
    data: FormTemplateCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_orm)
):
    """Update an existing dynamic form template."""
    template = db.query(DynamicFormTemplate).filter(DynamicFormTemplate.id == template_id).first()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
        
    existing = db.query(DynamicFormTemplate).filter(
        DynamicFormTemplate.title == data.title,
        DynamicFormTemplate.id != template_id
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="A template with this title already exists")

    template.title = data.title
    template.schema_json = data.form_schema
    template.is_active = data.is_active
    db.commit()
    db.refresh(template)
    return template

@router.post("/responses", response_model=FormResponseResponse)
def submit_response(
    data: FormResponseCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_orm)
):
    """Submit a response to a dynamic form, tied to a medical act."""
    response = DynamicFormResponse(
        act_id=data.act_id,
        template_id=data.template_id,
        response_data=data.response_data
    )
    db.add(response)
    db.commit()
    db.refresh(response)

    # Ensure the dynamic template is represented in the ref tables so it appears like other forms
    try:
        # Find or create a 'dynamic' care type to group dynamic templates
        dyn_care = db.query(RefCareType).filter(RefCareType.code == 'dynamic_templates').first()
        if not dyn_care:
            dyn_care = RefCareType(code='dynamic_templates', label='Formulaires personnalisés', description='Templates créés par les administrateurs', is_active=True)
            db.add(dyn_care)
            db.commit()
            db.refresh(dyn_care)

        # Find or create an act type under that care type
        dyn_act = db.query(RefActType).filter(RefActType.code == 'dynamic_template_act', RefActType.ref_care_type_id == dyn_care.id).first()
        if not dyn_act:
            dyn_act = RefActType(ref_care_type_id=dyn_care.id, code='dynamic_template_act', label='Formulaires personnalisés', description='Act types for dynamic templates', is_active=True)
            db.add(dyn_act)
            db.commit()
            db.refresh(dyn_act)

        # Ensure a RefFormType exists for this template
        form_name = f"dynamic_template_{data.template_id}"
        ref_form = db.query(RefFormType).filter(RefFormType.form_name == form_name).first()
        template_obj = db.query(DynamicFormTemplate).filter(DynamicFormTemplate.id == data.template_id).first()
        label = template_obj.title if template_obj else form_name
        if not ref_form:
            ref_form = RefFormType(ref_act_type_id=dyn_act.id, form_name=form_name, form_label=label, is_active=True)
            db.add(ref_form)
            db.commit()
            db.refresh(ref_form)

        # Create ActForm bridge entry linking the created dynamic response to the medical act
        try:
            # Avoid duplicate linking
            existing_link = db.query(ActForm).filter(ActForm.act_id == data.act_id, ActForm.ref_form_type_id == ref_form.id, ActForm.form_table_id == response.id).first()
            if not existing_link:
                act_form = ActForm(act_id=data.act_id, ref_form_type_id=ref_form.id, form_table_id=response.id, created_by=current_user.id)
                db.add(act_form)
                db.commit()
        except Exception:
            db.rollback()
    except Exception:
        # If catalog linking fails, don't block the response creation
        db.rollback()

    return response

@router.get("/responses/act/{act_id}", response_model=List[FormResponseResponse])
def get_responses_for_act(
    act_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_orm)
):
    """Get all dynamic form responses associated with a specific medical act."""
    responses = db.query(DynamicFormResponse).filter(DynamicFormResponse.act_id == act_id).all()
    
    # Manually add template_name to each response
    result = []
    for response in responses:
        template = db.query(DynamicFormTemplate).filter(DynamicFormTemplate.id == response.template_id).first()
        response_dict = {
            'id': response.id,
            'act_id': response.act_id,
            'template_id': response.template_id,
            'template_name': template.title if template else f'Template #{response.template_id}',
            'response_data': response.response_data,
            'created_at': response.created_at
        }
        result.append(response_dict)
    
    return result
