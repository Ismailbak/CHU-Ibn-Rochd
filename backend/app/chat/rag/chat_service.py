"""
RAG-integrated Chat Service.
Extends the existing chat service with RAG orchestrator for grounded responses.
"""

import logging
import re
from datetime import datetime
from typing import Optional
from sqlalchemy.orm import Session

from app.chat.rag.orchestrator import RAGOrchestrator
from app.core.config import settings
from app.core.database import RAGSessionLocal
from app.core.schemas.rag_response import ChatRequest as RAGChatRequest, GroundedChatResponse
from app.models.llm import llm
from app.models.chat_message import ChatMessage
from app.models.user import User
from app.auth.user_display import assistant_address_instruction
from app.patients.service import PatientService

logger = logging.getLogger(__name__)


SOURCE_TAG_RE = r"(?:patient|appointment|medical_act|act_result|patient_note|act_note|pdf_extract|chat_summary)"


def clean_grounded_response_text(text: str) -> str:
    """Remove raw evidence markers or malformed manual source lists from LLM prose."""
    if not text:
        return ""

    cleaned = text.strip()

    # Evidence markers sometimes leak from the prompt.
    cleaned = re.sub(r"\[TYPE:[^\]]+\]", "", cleaned)

    # Remove manually generated source lists because the UI renders authoritative citations.
    cleaned = re.sub(
        rf"\s*\**Sources? (?:utilisées|used)\s*:\**\s*(?:\[{SOURCE_TAG_RE}\s*\|\s*(?:ID\s*:\s*)?\d*\]\s*,?\s*)+\.?",
        "",
        cleaned,
        flags=re.IGNORECASE,
    )

    # Remove inline citations such as [patient | ID: 22] or malformed [patient | ].
    cleaned = re.sub(
        rf"\s*\[{SOURCE_TAG_RE}\s*\|\s*(?:ID\s*:\s*)?\d*\]",
        "",
        cleaned,
        flags=re.IGNORECASE,
    )

    return re.sub(r"\s{2,}", " ", cleaned).strip()


async def get_grounded_chat_response(
    message: str,
    user_id: int,
    db: Session,
    patient_id: Optional[int] = None,
    session_id: Optional[int] = None,
    stored_message: Optional[str] = None,
    language: str = "fr",
    retrieval_mode: str = "auto"
) -> dict:
    """
    Generate a grounded AI response using RAG orchestrator.
    
    Flow:
    1. Classify intent with query classifier
    2. Retrieve relevant medical facts with authorization
    3. Build deterministic prompt with evidence
    4. Call LLM with grounded prompt
    5. Validate response against safety policies
    6. Return response with sources and metadata
    
    Args:
        message: User's chat message
        user_id: User ID (for authorization)
        db: Database session
        patient_id: Optional patient ID
        language: Language code (fr, en, ar)
        retrieval_mode: "auto" | "structured_only" | "hybrid"
    
    Returns:
        dict with grounded response, sources, confidence, and metadata
    """
    try:
        from app.models.chat_session import ChatSession

        # Clinical reads for RAG go to secondary when configured.
        rag_db = RAGSessionLocal() if settings.use_rag_secondary else None
        rag_session = rag_db if rag_db is not None else db
        try:
            patient_service = PatientService(db)
            orchestrator = RAGOrchestrator(rag_session, patient_service)

            # Resolve the open session BEFORE retrieval so follow-up questions
            # ("resumez son dossier") keep the conversation's patient scope.
            existing_session = None
            session_patient_id = None
            if session_id:
                existing_session = db.query(ChatSession).filter(
                    ChatSession.id == session_id,
                    ChatSession.created_by == user_id,
                ).first()
                if existing_session:
                    session_patient_id = existing_session.patient_id

            # Recent turns from this session give the LLM conversational context.
            conversation_history = []
            if existing_session:
                recent_messages = (
                    db.query(ChatMessage)
                    .filter(
                        ChatMessage.session_id == existing_session.id,
                        ChatMessage.user_id == user_id,
                    )
                    .order_by(ChatMessage.created_at.desc())
                    .limit(4)
                    .all()
                )
                conversation_history = [
                    (m.message or "", m.response or "") for m in reversed(recent_messages)
                ]

            # Patient scope is tied to the open session only — never bleed across new chats.
            rag_request = RAGChatRequest(
                query=message,
                patient_id=patient_id,
                include_sources=True,
                retrieval_mode=retrieval_mode,
                language=language
            )

            (
                grounded_prompt,
                rag_response,
                warnings,
                detected_patient_id,
                detected_patient_name,
            ) = await orchestrator.process_chat_request(
                rag_request,
                user_id=user_id,
                session_patient_id=session_patient_id,
                conversation_history=conversation_history,
            )

            final_patient_id = patient_id or detected_patient_id
            final_patient_name = detected_patient_name

            logger.info(
                f"RAG orchestration complete: {len(rag_response.sources)} sources, "
                f"confidence={rag_response.metadata.confidence}, "
                f"warnings={len(warnings)}"
            )

            system_messages = {
                "fr": (
                "Tu es un assistant médical (rhumatologie / médecine générale). "
                "Réponds en français, de façon claire et naturelle, comme un collègue clinicien. "
                "Structure les réponses longues avec des paragraphes courts, des listes numérotées (1. 2. 3.) "
                "ou des puces (- item), sans empiler les astérisques Markdown. "
                "Utilise **gras** avec parcimonie pour les titres de section. "
                "Si un dossier patient est fourni dans le prompt: fais une synthèse directe "
                "(identité, diagnostic, actes, résultats, suivi) sans demander de joindre des documents. "
                "Ne invente aucune donnée. Pas de liste « Sources utilisées » dans le texte."
                ),
                "en": (
                    "You are a medical assistant (rheumatology / general medicine). "
                    "Answer clearly and naturally, like a clinician briefing a colleague. "
                    "When patient chart data is in the prompt, summarize directly — never ask to upload records. "
                    "Do not invent facts. No manual 'Sources used' list in the text."
                ),
                "ar": (
                    "أنت مساعد طبي. أجب بوضوح وبشكل طبيعي. "
                    "عند توفر بيانات المريض، لخّص مباشرة دون طلب إرفاق ملفات. لا تخترع معلومات."
                ),
            }

            system_msg = system_messages.get(language, system_messages["fr"])

            user = db.query(User).filter(User.id == user_id).first()
            if user:
                system_msg += assistant_address_instruction(user, language)

            if final_patient_id and rag_response.metadata.confidence == "low":
                name = final_patient_name or f"patient #{final_patient_id}"
                if language == "fr":
                    system_msg += (
                        f"\n\nLe patient {name} est identifié mais les preuves sont limitées. "
                        "Indiquez ce qui manque dans le dossier sans demander de fichiers."
                    )
                else:
                    system_msg += (
                        f"\n\nPatient {name} is in scope but evidence is limited. "
                        "State what is missing without asking for uploads."
                    )
            elif rag_response.metadata.confidence == "low":
                system_msg += "\n\nLimited evidence — state uncertainty clearly."

            llm_result = llm.generate(
                prompt=grounded_prompt,
                system=system_msg,
                language=language,
                temperature=0.3,
            )

            response_text = clean_grounded_response_text(llm_result.get("response", ""))
            rag_response.response = response_text
            rag_response.metadata.model = llm_result.get("model", "biomistral")
            rag_response.metadata.tokens_used = llm_result.get("tokens", 0)

            policy_violations = await orchestrator.validate_response_policy(rag_response)
            if policy_violations:
                logger.warning(f"Policy violations detected: {policy_violations}")
                rag_response.warnings.extend(policy_violations)

            message_id = None
            resolved_session_id = session_id
            try:
                from app.chat.service import create_chat_session

                if existing_session:
                    resolved_session_id = existing_session.id
                    final_patient_id = final_patient_id or existing_session.patient_id

                if final_patient_id:
                    if not existing_session:
                        existing_session = db.query(ChatSession).filter(
                            ChatSession.patient_id == final_patient_id,
                            ChatSession.created_by == user_id
                        ).order_by(ChatSession.updated_at.desc()).first()

                    if existing_session:
                        resolved_session_id = existing_session.id
                        existing_session.updated_at = datetime.utcnow()
                    else:
                        new_session = create_chat_session(
                            db=db,
                            patient_id=final_patient_id,
                            user_id=user_id,
                            title=f"Chat session for patient {final_patient_id}"
                        )
                        db.commit()
                        resolved_session_id = new_session.id

                chat_msg = ChatMessage(
                    session_id=resolved_session_id,
                    user_id=user_id,
                    patient_id=final_patient_id,
                    message=stored_message or message,
                    response=rag_response.response,
                    language=language,
                    model_name=rag_response.metadata.model,
                    tokens_used=rag_response.metadata.tokens_used
                )
                db.add(chat_msg)
                db.commit()
                db.refresh(chat_msg)
                message_id = chat_msg.id
                logger.info(f"Chat message {chat_msg.id} stored for user {user_id}")

            except Exception as e:
                logger.error(f"Error storing chat message: {e}")
                db.rollback()

            return {
                "response": rag_response.response,
                "sources": [s.model_dump() for s in rag_response.sources],
                "confidence": rag_response.metadata.confidence,
                "warnings": rag_response.warnings,
                "tokens": rag_response.metadata.tokens_used,
                "model": rag_response.metadata.model,
                "language": language,
                "retrieval_type": rag_response.metadata.retrieval_type,
                "patient_id": final_patient_id,
                "patient_name": final_patient_name,
                "session_id": resolved_session_id,
                "message_id": message_id,
            }
        finally:
            if rag_db is not None:
                rag_db.close()
    
    except Exception as e:
        logger.error(f"Error in get_grounded_chat_response: {e}")
        raise
