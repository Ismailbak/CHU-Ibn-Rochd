"""
Structured Retrievers for RAG — patients, appointments, medical acts, act results.
"""

import re
from abc import ABC, abstractmethod
from typing import List, Optional, Dict, Any
from pydantic import BaseModel
from datetime import datetime, date


class RetrievedFact(BaseModel):
    source_type: str
    source_id: int
    fact_text: str
    snippet: str
    timestamp: Optional[datetime] = None
    metadata: Dict[str, Any] = {}
    confidence: float = 1.0


class StructuredRetriever(ABC):
    @abstractmethod
    async def retrieve(self, query: str, patient_id: Optional[int] = None, top_k: int = 5) -> List[RetrievedFact]:
        pass


def _truncate(text: Optional[str], max_len: int = 280) -> str:
    if not text:
        return ""
    text = str(text).strip()
    if len(text) <= max_len:
        return text
    return text[: max_len - 3].rstrip() + "..."


def _query_hints(query: str) -> dict:
    q = query.lower()
    case_overview = any(
        k in q
        for k in (
            "resume", "résume", "resumer", "résumer", "synthese", "synthèse",
            "cas clinique", "dossier", "situation", "bilan", "overview", "summarize",
            "decrire le cas", "décrire le cas", "presenter le cas", "présenter le cas",
            "vue d'ensemble", "historique complet",
        )
    )
    return {
        "appointment": any(k in q for k in ("rdv", "rendez", "appointment", "visite", "suivi", "planifier")),
        "upcoming": any(k in q for k in ("prochain", "upcoming", "futur", "planif")),
        "past": any(k in q for k in ("dernier", "historique", "passé", "past", "previous")),
        "lab": any(k in q for k in ("resultat", "résultat", "analyse", "lab", "biolog", "crp", "vs", "test")),
        "abnormal": any(k in q for k in ("anormal", "abnormal", "élevé", "eleve", "bas")),
        "treatment": any(k in q for k in ("traitement", "medicament", "médicament", "prescri", "therap")),
        "diagnosis": any(k in q for k in ("diagnostic", "diagnos", "maladie", "patholog")),
        "act": any(k in q for k in ("acte", "consultation", "hospital", "rapport")),
        "gender": any(k in q for k in ("sexe", "gender", "genre")),
        "identity": any(k in q for k in ("qui est", "informations sur", "identite", "identité")),
        "case_overview": case_overview,
    }


def _patient_detail_mode(query: str) -> str:
    """
    How many demographic facts to emit from PatientRetriever.

    none      — skip patient facts (patient already scoped; clinical-only query)
    gender    — compact composite with gender
    full      — rich composite (case summaries, identity lookups)
    compact   — identity + primary diagnosis (diagnosis queries)
    """
    hints = _query_hints(query)
    if hints.get("case_overview") or hints.get("identity"):
        return "full"
    if hints.get("gender"):
        return "gender"
    if hints.get("diagnosis"):
        return "compact"
    if any(hints.get(k) for k in ("appointment", "lab", "treatment", "act")):
        return "none"
    return "full"


def _retrieval_targets(hints: dict) -> dict:
    """Which structured sources to query (focused routing improves precision)."""
    if hints.get("case_overview"):
        return {"patient": True, "appointment": True, "medical_act": True, "act_result": True}
    if hints.get("identity"):
        return {"patient": True, "appointment": False, "medical_act": False, "act_result": False}
    if hints.get("gender"):
        return {"patient": True, "appointment": False, "medical_act": False, "act_result": False}
    if hints.get("appointment"):
        return {"patient": False, "appointment": True, "medical_act": False, "act_result": False}
    if hints.get("lab"):
        return {"patient": False, "appointment": False, "medical_act": False, "act_result": True}
    if hints.get("treatment"):
        return {"patient": False, "appointment": False, "medical_act": True, "act_result": False}
    if hints.get("diagnosis"):
        return {"patient": True, "appointment": False, "medical_act": True, "act_result": False}
    if hints.get("act"):
        return {"patient": False, "appointment": False, "medical_act": True, "act_result": False}
    return {"patient": True, "appointment": True, "medical_act": True, "act_result": True}


def _stamp_patient_on_clinical_facts(
    facts: List[RetrievedFact],
    patient_id: Optional[int],
    db_session,
) -> List[RetrievedFact]:
    """Prefix patient name on clinical facts (context for LLM + keyword-aware precision)."""
    if not patient_id or not facts:
        return facts

    from app.models.patient import Patient

    patient = db_session.query(Patient).filter(Patient.id == patient_id).first()
    if not patient:
        return facts

    label = f"{patient.first_name} {patient.last_name}".strip()
    if patient.ipp:
        label = f"{label} ({patient.ipp})"

    stamped: List[RetrievedFact] = []
    for fact in facts:
        if fact.source_type == "patient" or label.lower() in (fact.snippet or "").lower():
            stamped.append(fact)
            continue
        copy = fact.model_copy(deep=True)
        copy.snippet = f"{label} | {fact.snippet}"
        copy.fact_text = f"{label} | {fact.fact_text}"
        stamped.append(copy)
    return stamped


class PatientRetriever(StructuredRetriever):
    def __init__(self, db_session):
        self.db = db_session

    def _composite_patient_fact(
        self,
        patient,
        detail_mode: str,
        allergies: Optional[List] = None,
    ) -> List[RetrievedFact]:
        """One rich patient fact (better precision + LLM context than fragmented rows)."""
        display = f"{patient.civility or ''} {patient.first_name} {patient.last_name}".strip()
        ipp = f" (IPP: {patient.ipp})" if patient.ipp else ""
        parts = [f"Patient: {display}{ipp}"]

        if detail_mode in ("full", "compact", "gender") and patient.date_of_birth:
            age = (date.today() - patient.date_of_birth).days // 365
            parts.append(f"Né(e) le {patient.date_of_birth}, {age} ans")

        if detail_mode in ("full", "compact", "gender") and patient.gender:
            parts.append(f"Sexe: {patient.gender}")

        if detail_mode == "full" and patient.blood_type:
            parts.append(f"Groupe sanguin: {patient.blood_type}")

        if detail_mode in ("full", "compact") and patient.primary_diagnosis:
            parts.append(f"Diagnostic principal: {_truncate(patient.primary_diagnosis)}")

        if detail_mode == "full" and patient.notes:
            parts.append(f"Notes: {_truncate(patient.notes, 200)}")

        snippet = " | ".join(parts)
        facts = [
            RetrievedFact(
                source_type="patient",
                source_id=patient.id,
                fact_text=snippet,
                snippet=snippet,
                confidence=1.0,
                metadata={"patient_field": "composite"},
            )
        ]

        if detail_mode == "full" and allergies:
            allergen_text = ", ".join(a.allergen for a in allergies if a.allergen)
            if allergen_text:
                facts.append(
                    RetrievedFact(
                        source_type="patient_note",
                        source_id=patient.id,
                        fact_text=f"Allergies: {allergen_text}",
                        snippet=f"Allergies: {allergen_text}",
                        confidence=1.0,
                        metadata={"patient_field": "allergy"},
                    )
                )
        return facts

    async def retrieve(self, query: str, patient_id: Optional[int] = None, top_k: int = 5) -> List[RetrievedFact]:
        if not patient_id:
            return []

        from app.models.patient import Patient
        from app.models.patient_allergy import PatientAllergy

        patient = self.db.query(Patient).filter(Patient.id == patient_id).first()
        if not patient:
            return []

        detail_mode = _patient_detail_mode(query)
        if detail_mode == "none":
            return []

        allergies = []
        if detail_mode == "full":
            allergies = (
                self.db.query(PatientAllergy)
                .filter(PatientAllergy.patient_id == patient_id)
                .limit(top_k)
                .all()
            )

        return self._composite_patient_fact(patient, detail_mode, allergies)


class AppointmentRetriever(StructuredRetriever):
    def __init__(self, db_session):
        self.db = db_session

    async def retrieve(self, query: str, patient_id: Optional[int] = None, top_k: int = 5) -> List[RetrievedFact]:
        if not patient_id:
            return []

        from app.models.appointment import Appointment

        hints = _query_hints(query)
        q = self.db.query(Appointment).filter(Appointment.patient_id == patient_id)
        now = datetime.utcnow()

        if hints.get("upcoming"):
            q = q.filter(Appointment.datetime_scheduled >= now)
        elif hints.get("past"):
            q = q.filter(Appointment.datetime_scheduled < now)

        rows = q.order_by(Appointment.datetime_scheduled.desc()).limit(top_k).all()
        facts = []
        for row in rows:
            reason = _truncate(row.reason) or "Motif non précisé"
            dt = row.datetime_scheduled.isoformat() if row.datetime_scheduled else ""
            snippet = f"{dt} — {reason} (statut: {row.status})"
            facts.append(RetrievedFact(
                source_type="appointment",
                source_id=row.id,
                fact_text=snippet,
                snippet=snippet,
                timestamp=row.datetime_scheduled,
                confidence=1.0,
            ))
        return facts


class MedicalActRetriever(StructuredRetriever):
    def __init__(self, db_session):
        self.db = db_session

    async def retrieve(self, query: str, patient_id: Optional[int] = None, top_k: int = 5) -> List[RetrievedFact]:
        if not patient_id:
            return []

        from app.models.medical_act import MedicalAct, ActDiagnosis, ActTreatment

        acts = (
            self.db.query(MedicalAct)
            .filter(MedicalAct.patient_id == patient_id)
            .order_by(MedicalAct.act_date.desc())
            .limit(top_k * 3)
            .all()
        )

        q_lower = query.lower()

        def act_relevance(act) -> int:
            text = " ".join(
                str(x or "") for x in (act.act_type, act.category, act.description, act.report)
            ).lower()
            score = 0
            for token in re.findall(r"[^\W\d_]+", q_lower, flags=re.UNICODE):
                if len(token) > 4 and token in text:
                    score += 1
            return score

        acts.sort(key=lambda a: (act_relevance(a), a.act_date or datetime.min), reverse=True)
        matching = [a for a in acts if act_relevance(a) > 0]
        if matching:
            acts = matching
        acts = acts[:top_k]

        facts = []
        for act in acts:
            diagnoses = (
                self.db.query(ActDiagnosis)
                .filter(ActDiagnosis.act_id == act.id)
                .limit(3)
                .all()
            )
            treatments = (
                self.db.query(ActTreatment)
                .filter(ActTreatment.act_id == act.id)
                .limit(3)
                .all()
            )
            diag_text = ", ".join(d.diagnosis_label for d in diagnoses if d.diagnosis_label) or ""
            treat_text = ", ".join(
                f"{t.drug_name} {t.dosage or ''}".strip() for t in treatments if t.drug_name
            ) or ""

            parts = [
                f"Acte: {act.act_type or 'N/A'}",
                f"Date: {act.act_date}",
            ]
            if act.category:
                parts.append(f"Catégorie: {act.category}")
            if act.status:
                parts.append(f"Statut: {act.status}")
            if act.description:
                parts.append(f"Description: {_truncate(act.description)}")
            if diag_text:
                parts.append(f"Diagnostics: {diag_text}")
            if treat_text:
                parts.append(f"Traitements: {treat_text}")
            if act.report:
                parts.append(f"Rapport: {_truncate(act.report)}")
            if act.notes:
                parts.append(f"Notes: {_truncate(act.notes)}")

            snippet = " | ".join(parts)
            facts.append(RetrievedFact(
                source_type="medical_act",
                source_id=act.id,
                fact_text=snippet,
                snippet=snippet,
                timestamp=act.act_date if isinstance(act.act_date, datetime) else None,
                confidence=1.0,
            ))
        return facts


class ActResultRetriever(StructuredRetriever):
    def __init__(self, db_session):
        self.db = db_session

    async def retrieve(self, query: str, patient_id: Optional[int] = None, top_k: int = 5) -> List[RetrievedFact]:
        if not patient_id:
            return []

        from app.models.act_result import ActResult

        hints = _query_hints(query)
        q = self.db.query(ActResult).filter(ActResult.patient_id == patient_id)
        if hints.get("abnormal"):
            q = q.filter(ActResult.is_abnormal == True)

        results = q.order_by(ActResult.result_date.desc()).limit(top_k).all()
        facts = []
        for res in results:
            value = res.result_value or ""
            unit = res.result_unit or ""
            abnormal = "anormal" if res.is_abnormal else "normal"
            date_str = res.result_date.isoformat() if res.result_date else ""
            name = res.result_name or "Résultat"
            cat = f", catégorie: {res.result_category}" if res.result_category else ""
            snippet = f"{date_str} — {name}: {value} {unit} ({abnormal}{cat})"
            if res.notes:
                snippet = f"{snippet} | {_truncate(res.notes)}"

            facts.append(RetrievedFact(
                source_type="act_result",
                source_id=res.id,
                fact_text=snippet,
                snippet=snippet,
                timestamp=res.result_date,
                metadata={"is_abnormal": bool(res.is_abnormal)},
                confidence=1.0,
            ))
        return facts


class StructuredRetrievalPipeline:
    def __init__(self, db_session, patient_service):
        self.db = db_session
        self.patient_service = patient_service
        self.patient_retriever = PatientRetriever(db_session)
        self.appointment_retriever = AppointmentRetriever(db_session)
        self.medical_act_retriever = MedicalActRetriever(db_session)
        self.act_result_retriever = ActResultRetriever(db_session)

    async def retrieve_with_authorization(
        self,
        query: str,
        patient_id: Optional[int] = None,
        user_id: Optional[int] = None,
        top_k_per_source: int = 5,
    ) -> List[RetrievedFact]:
        if patient_id and user_id:
            authorized = await self.patient_service.user_can_access_patient(user_id, patient_id)
            if not authorized:
                return []

        facts: List[RetrievedFact] = []
        hints = _query_hints(query)
        targets = _retrieval_targets(hints)
        top_k = top_k_per_source
        if hints.get("case_overview"):
            top_k = max(top_k_per_source, 8)

        if targets["patient"]:
            facts.extend(await self.patient_retriever.retrieve(query, patient_id, top_k))

        if targets["appointment"]:
            facts.extend(await self.appointment_retriever.retrieve(query, patient_id, top_k))

        if targets["medical_act"]:
            facts.extend(await self.medical_act_retriever.retrieve(query, patient_id, top_k))

        if targets["act_result"]:
            facts.extend(await self.act_result_retriever.retrieve(query, patient_id, top_k))

        facts = _stamp_patient_on_clinical_facts(facts, patient_id, self.db)
        return facts
