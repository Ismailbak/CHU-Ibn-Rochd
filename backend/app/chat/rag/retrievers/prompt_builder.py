"""
Prompt Builder for RAG.
Deterministic prompt construction with grounded evidence sections.
Separates retrieval from generation for auditability.
"""

from typing import List, Optional, Tuple
from app.chat.rag.retrievers.structured_retriever import RetrievedFact

MAX_HISTORY_TURNS = 6
MAX_HISTORY_CHARS = 400


class PromptTemplate:
    """Template for grounded prompts with versioning."""

    VERSION = "0.2"

    SYSTEM_PROMPT = """You are a medical assistant for a healthcare management system.
Your role is to answer questions about patient care, medical acts, and clinical data.

CRITICAL RULES:
1. Only use the provided evidence to answer questions
2. Do NOT invent or assume facts not in the evidence
3. If the patient is identified but evidence is sparse, say clearly what is missing — never ask the user to "attach records" or "provide the medical file"
4. Write naturally and directly, like a clinician briefing a colleague (not like a compliance bot)
5. For case-summary questions: structure the answer as — identity/demographics, main diagnosis, key acts, notable results, follow-up/appointments
6. Flag abnormal results and care gaps when supported by evidence
7. Do not add a "Sources used" section in the prose (the UI shows citations separately)
8. When patient scope is set in CONTEXT, trust that scope — do not question whether the patient exists

Evidence format:
- [TYPE: source_type | ID: source_id] excerpt

Safety constraints:
- Never provide patient-specific diagnosis or treatment without evidence
- Decline to guess when data is incomplete
"""

    GENERAL_SYSTEM_PROMPT = """You are a medical assistant for a healthcare management system.
Your role is to answer general medical questions and provide patient-safe information.

CRITICAL RULES:
1. Provide general medical information when asked
2. Do NOT invent or assume patient-specific facts
3. If the question needs patient context, ask which patient (name or IPP) — briefly
4. Be concise, clear, and medically accurate
"""


class PromptBuilder:
    """
    Deterministic prompt assembly from query and evidence.
    Versioned for regression testing.
    """

    def __init__(self):
        self.template_version = PromptTemplate.VERSION

    def build_grounded_prompt(
        self,
        user_query: str,
        retrieved_facts: List[RetrievedFact],
        patient_id: Optional[int] = None,
        language: str = "en",
        detected_from_ipp: bool = False,
        patient_display_name: Optional[str] = None,
        conversation_history: Optional[List[Tuple[str, str]]] = None,
    ) -> str:
        sections = []

        if patient_id:
            system_prompt = PromptTemplate.SYSTEM_PROMPT
        else:
            system_prompt = PromptTemplate.GENERAL_SYSTEM_PROMPT
        sections.append(system_prompt)

        context_section = self._build_context_section(
            patient_id, language, detected_from_ipp, patient_display_name
        )
        sections.append(context_section)

        history_section = self._build_history_section(conversation_history, language)
        if history_section:
            sections.append(history_section)

        if retrieved_facts:
            evidence_section = self._build_evidence_section(retrieved_facts, detected_from_ipp)
            sections.append(evidence_section)
        else:
            sections.append(self._build_empty_evidence_section(patient_id, language, patient_display_name))

        query_section = f"\nUSER QUERY:\n{user_query}"
        sections.append(query_section)
        sections.append(self._build_response_instruction(language, patient_id, bool(retrieved_facts)))

        return "\n".join(sections)

    def _build_history_section(
        self,
        conversation_history: Optional[List[Tuple[str, str]]],
        language: str,
    ) -> Optional[str]:
        if not conversation_history:
            return None

        turns = conversation_history[-MAX_HISTORY_TURNS:]
        user_label, assistant_label = (
            ("Utilisateur", "Assistant") if language == "fr" else ("User", "Assistant")
        )
        header = (
            "\nCONVERSATION RÉCENTE (pour le contexte — les pronoms comme « son dossier » "
            "se réfèrent à cette conversation):"
            if language == "fr"
            else "\nRECENT CONVERSATION (for context — pronouns refer to this conversation):"
        )

        lines = [header]
        for user_msg, assistant_msg in turns:
            if user_msg:
                lines.append(f"{user_label}: {user_msg[:MAX_HISTORY_CHARS]}")
            if assistant_msg:
                lines.append(f"{assistant_label}: {assistant_msg[:MAX_HISTORY_CHARS]}")
        return "\n".join(lines)

    def _build_context_section(
        self,
        patient_id: Optional[int],
        language: str,
        detected_from_ipp: bool,
        patient_display_name: Optional[str],
    ) -> str:
        if not patient_id:
            if language == "fr":
                return "\nCONTEXTE:\nRequête générale (pas de patient spécifique)"
            return "\nCONTEXT:\nGeneral query (no specific patient)"

        label = patient_display_name or f"Patient #{patient_id}"
        if language == "fr":
            context = f"\nCONTEXTE:\nPatient: {label} (ID interne: {patient_id})"
            if detected_from_ipp:
                context += "\nPatient identifié automatiquement depuis la requête."
        else:
            context = f"\nCONTEXT:\nPatient: {label} (internal ID: {patient_id})"
            if detected_from_ipp:
                context += "\nPatient auto-detected from the query."

        return context

    def _build_empty_evidence_section(
        self,
        patient_id: Optional[int],
        language: str,
        patient_display_name: Optional[str],
    ) -> str:
        if not patient_id:
            if language == "fr":
                return "\nPREUVES:\nAucune donnée patient (requête générale)."
            return "\nEVIDENCE:\nNo patient records (general query)."

        name = patient_display_name or f"patient #{patient_id}"
        if language == "fr":
            return (
                f"\nPREUVES:\n"
                f"Le dossier de {name} est ouvert, mais aucune donnée clinique structurée "
                f"n'a été retrouvée pour cette question. "
                f"Répondez en le signalant clairement; ne demandez pas de joindre des documents."
            )
        return (
            f"\nEVIDENCE:\n"
            f"Patient {name} is in scope, but no structured clinical data was retrieved. "
            f"State this clearly; do not ask the user to upload records."
        )

    def _build_evidence_section(
        self, retrieved_facts: List[RetrievedFact], detected_from_ipp: bool = False
    ) -> str:
        if not retrieved_facts:
            return "\nEVIDENCE:\nNo evidence available"

        evidence_lines = ["\nPREUVES / EVIDENCE:"]
        for fact in retrieved_facts:
            line = f"- [TYPE: {fact.source_type} | ID: {fact.source_id}] {fact.snippet}"
            evidence_lines.append(line)

        return "\n".join(evidence_lines)

    def _build_response_instruction(
        self, language: str, patient_id: Optional[int], has_facts: bool
    ) -> str:
        if language == "fr":
            if patient_id and has_facts:
                return (
                    "\nRÉPONSE:\n"
                    "Synthèse clinique directe en français, ton naturel et professionnel. "
                    "Couvrez les éléments pertinents présents dans les preuves. "
                    "Si le message est seulement un nom de patient, faites une brève synthèse "
                    "du dossier (identité, diagnostic, actes récents, résultats, suivi) sans "
                    "demander de précision. "
                    "Pas de formule du type « Veuillez fournir le dossier »."
                )
            if patient_id and not has_facts:
                return (
                    "\nRÉPONSE:\n"
                    "Indiquez que le patient est identifié mais que le dossier ne contient pas "
                    "encore assez de données pour répondre. Précisez ce qui manque (actes, résultats, notes). "
                    "Ne demandez pas de joindre des fichiers."
                )
            return (
                "\nRÉPONSE:\n"
                "Réponse générale ou demande brève de précision (nom patient ou IPP)."
            )

        if patient_id and has_facts:
            return (
                "\nRESPONSE:\n"
                "Direct clinical summary in natural professional tone. "
                "Do not ask the user to attach medical records."
            )
        if patient_id and not has_facts:
            return (
                "\nRESPONSE:\n"
                "Patient is identified but chart data is sparse — say what is missing. "
                "Do not ask for file uploads."
            )
        return "\nRESPONSE:\nAnswer generally or ask briefly for patient name/IPP."

    def extract_sources_from_facts(self, facts: List[RetrievedFact]) -> list:
        from app.core.schemas.rag_response import SourceReference

        sources = []
        for fact in facts:
            source = SourceReference(
                source_type=fact.source_type,
                source_id=fact.source_id,
                label=f"{fact.source_type}_{fact.source_id}",
                snippet=fact.snippet,
                score=fact.confidence,
            )
            sources.append(source)

        return sources
