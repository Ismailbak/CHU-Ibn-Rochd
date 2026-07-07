"""
RAG Orchestrator — intent, patient scope, structured + semantic retrieval, prompt build.
"""

import logging
from typing import List, Optional, Tuple

from app.core.schemas.rag_response import GroundedChatResponse, RAGMetadata, ChatRequest
from app.chat.rag.retrievers.query_classifier import QueryClassifier, QueryIntent
from app.chat.rag.retrievers.structured_retriever import StructuredRetrievalPipeline, RetrievedFact
from app.chat.rag.retrievers.prompt_builder import PromptBuilder
from app.chat.rag.retrievers.semantic_retriever import semantic_retrieve
from app.chat.rag.patient_detection import detect_patient_from_query, detect_patient_from_texts
from app.chat.rag.fact_ranking import rank_and_cap_facts
from app.chat.rag.ingestion import ingest_patient_records
from app.chat.rag.rag_db import count_embedded_chunks, rag_chunks_table_ready
from app.chat.rag.embedding_service import get_embedding_model
from app.core.config_rag import rag_config
from app.models.patient import Patient

logger = logging.getLogger(__name__)


class RAGOrchestrator:
    def __init__(self, db_session, patient_service, llm_service=None):
        self.db = db_session
        self.patient_service = patient_service
        self.llm_service = llm_service
        self.classifier = QueryClassifier()
        self.retriever = StructuredRetrievalPipeline(db_session, patient_service)
        self.prompt_builder = PromptBuilder()

    async def process_chat_request(
        self,
        request: ChatRequest,
        user_id: int,
        session_patient_id: Optional[int] = None,
        conversation_history: Optional[List[Tuple[str, str]]] = None,
    ) -> Tuple[str, GroundedChatResponse, list, Optional[int], Optional[str]]:
        warnings: List[str] = []
        patient_id = request.patient_id
        detected_patient_id = None
        patient_display_name: Optional[str] = None
        retrieval_mode = request.retrieval_mode or "auto"

        classification = self.classifier.classify(request.query)
        logger.debug(
            "RAG classify intent=%s patient_conf=%.2f",
            classification.intent,
            classification.patient_confidence,
        )

        # Auto-detect only when not explicitly provided
        detection_ambiguous = False
        if not patient_id and rag_config.AUTO_DETECT_ENABLED:
            detected_id, detect_warnings, detected_name = detect_patient_from_query(
                self.db, request.query
            )
            if detected_id:
                patient_id = detected_id
                detected_patient_id = detected_id
                patient_display_name = detected_name
            elif detect_warnings:
                # User named a patient we couldn't resolve — surface it and
                # do NOT silently fall back to the session's patient.
                detection_ambiguous = True
            warnings.extend(detect_warnings)

        # Sticky scope: keep the conversation's patient for follow-up questions
        # ("resumez son dossier", "ses traitements ?") when no other patient is named.
        if not patient_id and session_patient_id and not detection_ambiguous:
            patient_id = session_patient_id

        # Fallback: resolve patient from recent conversation turns when the current
        # message only uses pronouns ("son dossier") and no session exists yet.
        if not patient_id and conversation_history and not detection_ambiguous:
            history_user_texts = [turn[0] for turn in conversation_history if turn[0]]
            hist_id, hist_warnings, hist_name = detect_patient_from_texts(
                self.db, history_user_texts
            )
            warnings.extend(hist_warnings)
            if hist_id:
                patient_id = hist_id
                patient_display_name = hist_name

        # Authorization
        if patient_id:
            denied_id = patient_id
            authorized = await self.patient_service.user_can_access_patient(user_id, denied_id)
            if not authorized:
                logger.warning("User %s denied access to patient %s", user_id, denied_id)
                warnings.append(f"Access denied to patient {denied_id}.")
                patient_id = None
        elif classification.intent == QueryIntent.PATIENT_SPECIFIC and classification.patient_confidence > 0:
            warnings.append(
                "Requête liée à un patient, mais aucun patient n'a été identifié. "
                "Précisez le nom ou l'IPP, ou sélectionnez le patient dans le dossier."
            )

        if patient_id and not patient_display_name:
            patient_row = self.db.query(Patient).filter(Patient.id == patient_id).first()
            if patient_row:
                patient_display_name = (
                    f"{patient_row.first_name} {patient_row.last_name}".strip()
                )

        use_structured = retrieval_mode in ("auto", "structured_only")
        use_semantic = retrieval_mode in ("auto", "hybrid") and rag_config.SEMANTIC_ENABLED

        retrieval_type = "none"
        facts: List[RetrievedFact] = []
        structured_facts: List[RetrievedFact] = []
        semantic_facts: List[RetrievedFact] = []

        if not (classification.intent == QueryIntent.GENERAL_MEDICAL and not patient_id):
            if use_structured and patient_id:
                structured_facts = await self.retriever.retrieve_with_authorization(
                    query=request.query,
                    patient_id=patient_id,
                    user_id=user_id,
                    top_k_per_source=rag_config.RETRIEVAL_TOP_K,
                )
                facts.extend(structured_facts)

            if use_semantic and patient_id:
                if not rag_chunks_table_ready(self.db):
                    warnings.append(
                        "Recherche sémantique indisponible: exécutez "
                        "'alembic upgrade head' pour mettre à jour la table rag_chunks."
                    )
                elif get_embedding_model() is None:
                    warnings.append(
                        "Recherche sémantique indisponible: modèle d'embeddings non chargé "
                        "(torch / sentence-transformers). La réponse utilise les données structurées."
                    )
                else:
                    try:
                        if count_embedded_chunks(self.db, patient_id) == 0:
                            ingest_patient_records(self.db, patient_id)
                    except Exception as e:
                        logger.warning("Lazy ingestion skipped: %s", e)

                    semantic_facts = await semantic_retrieve(
                        request.query, patient_id=patient_id, top_k=rag_config.SEMANTIC_TOP_K
                    )
                    facts.extend(semantic_facts)

            if structured_facts and semantic_facts:
                retrieval_type = "hybrid"
            elif structured_facts or semantic_facts:
                retrieval_type = "structured" if structured_facts and not semantic_facts else (
                    "hybrid" if semantic_facts else "none"
                )
            else:
                retrieval_type = "structured" if patient_id else "none"

            facts = rank_and_cap_facts(facts, query=request.query)

            if not facts and patient_id:
                label = patient_display_name or f"patient #{patient_id}"
                warnings.append(
                    f"Dossier de {label} ouvert, mais peu de données structurées pour cette question."
                )
            elif not facts and rag_config.RETURN_INSUFFICIENT_DATA_WHEN_EMPTY:
                warnings.append("Aucune donnée médicale pertinente trouvée pour cette requête.")

        language = request.language or "fr"
        grounded_prompt = self.prompt_builder.build_grounded_prompt(
            user_query=request.query,
            retrieved_facts=facts,
            patient_id=patient_id,
            language=language,
            detected_from_ipp=detected_patient_id is not None,
            patient_display_name=patient_display_name,
            conversation_history=conversation_history,
        )

        if retrieval_type == "none":
            confidence = "low"
        else:
            confidence = self._assess_confidence(len(facts))

        sources = self.prompt_builder.extract_sources_from_facts(facts)
        if not request.include_sources:
            sources = []

        metadata = RAGMetadata(
            retrieval_type=retrieval_type,
            confidence=confidence,
            tokens_used=len(grounded_prompt.split()),
            language=language,
            model="pending",
        )

        response = GroundedChatResponse(
            response="[Answer pending LLM generation]",
            sources=sources,
            warnings=warnings,
            metadata=metadata,
        )

        return (
            grounded_prompt,
            response,
            warnings,
            detected_patient_id or patient_id,
            patient_display_name,
        )

    def _assess_confidence(self, fact_count: int) -> str:
        if fact_count >= 3:
            return "high"
        if fact_count >= 1:
            return "medium"
        return "low"

    async def validate_response_policy(self, response: GroundedChatResponse) -> list:
        violations = []
        if response.metadata.retrieval_type == "none":
            return violations
        if rag_config.REQUIRE_EVIDENCE_FOR_FACTS:
            if response.metadata.confidence == "low" and not response.sources:
                violations.append("Response low confidence but no sources provided")
        if rag_config.RETURN_INSUFFICIENT_DATA_WHEN_EMPTY:
            if not response.sources and response.metadata.confidence == "low":
                if "[Answer pending" not in response.response:
                    violations.append("Low confidence without explicit insufficient data statement")
        return violations
