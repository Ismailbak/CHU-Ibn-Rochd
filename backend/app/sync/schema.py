"""Create RAG-related tables on the secondary database."""

from sqlalchemy.engine import Engine

from app.core.database import Base
from app.models.user import User
from app.models.patient import Patient
from app.models.patient_allergy import PatientAllergy
from app.models.appointment import Appointment
from app.models.medical_act import MedicalAct, ActDiagnosis, ActTreatment
from app.models.act_result import ActResult
from app.models.rag_chunk import RAGChunk

RAG_SECONDARY_TABLES = [
    User.__table__,
    Patient.__table__,
    PatientAllergy.__table__,
    Appointment.__table__,
    MedicalAct.__table__,
    ActDiagnosis.__table__,
    ActTreatment.__table__,
    ActResult.__table__,
    RAGChunk.__table__,
]


def init_secondary_schema(engine: Engine) -> None:
    Base.metadata.create_all(bind=engine, tables=RAG_SECONDARY_TABLES)
