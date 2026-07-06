"""
Chat service - AI Assistant with patient context awareness
Integrates BioMistral LLM via Ollama with patient medical history
"""

import logging
from typing import Optional
from sqlalchemy.orm import Session
from app.models.llm import llm
from app.models.chat_message import ChatMessage
from app.models.chat_session import ChatSession
from app.models.patient import Patient
from app.models.user import User
from app.auth.user_display import assistant_address_instruction

logger = logging.getLogger(__name__)


def build_patient_context(db: Session, patient_id: int) -> str:
    """
    Build medical context from patient data for the LLM prompt
    
    Args:
        db: Database session
        patient_id: Patient ID
        
    Returns:
        Formatted patient context string
    """
    try:
        patient = db.query(Patient).filter(Patient.id == patient_id).first()
        if not patient:
            return ""
        
        context = f"""
[Patient Medical Context]
- Name: {patient.first_name} {patient.last_name}
- Date of Birth: {patient.date_of_birth or 'Unknown'}
- Gender: {patient.gender}
- Blood Type: {patient.blood_type or 'Unknown'}
- Allergies: {patient.notes or 'None documented'}
- Diagnosis: {patient.primary_diagnosis or 'None documented'}
- Insurance: {patient.insurance}
- Medical Notes: {patient.notes or 'No notes'}
"""
        return context.strip()
    except Exception as e:
        logger.error(f"Error building patient context: {e}")
        return ""


def get_chat_response(
    message: str,
    user_id: int,
    db: Session,
    patient_id: Optional[int] = None,
    language: str = "fr"
) -> dict:
    """
    Generate an AI response for a medical chat message
    
    Args:
        message: User's chat message
        user_id: User ID (for audit)
        db: Database session
        patient_id: Optional patient ID for context
        language: Language code (fr, en, ar)
        
    Returns:
        dict with response, tokens used, and model info
    """
    
    # Build system message based on language
    system_messages = {
        "fr": "Tu es un assistant médical IA spécialisé en médecine générale et rhumatologie. Sois EXTRÊMEMENT CONCIS et direct. Limite tes réponses à 3 ou 4 phrases maximum. Ne donne pas de longues introductions ou conclusions.",
        "en": "You are a medical AI assistant specialized in general medicine and rheumatology. Be EXTREMELY CONCISE and direct. Limit your answers to 3 or 4 sentences maximum. Do not provide long introductions or conclusions.",
        "ar": "أنت مساعد ذكاء اصطناعي طبي متخصص في الطب العام وأمراض الروماتيزم. كن موجزاً ومباشراً جداً. اقتصر في إجاباتك على 3 أو 4 جمل كحد أقصى. لا تقدم مقدمات أو استنتاجات طويلة."
    }
    
    system_msg = system_messages.get(language, system_messages["fr"])

    user = db.query(User).filter(User.id == user_id).first()
    if user:
        system_msg += assistant_address_instruction(user, language)
    
    # Build context
    context = ""
    if patient_id:
        context = build_patient_context(db, patient_id)
    
    system_prompt = f"{system_msg}\n\n{context}".strip()
    
    # Generate response
    result = llm.generate(prompt=message, system=system_prompt, language=language)
    
    # Store in database
    try:
        chat_msg = ChatMessage(
            user_id=user_id,
            patient_id=patient_id,
            message=message,
            response=result.get("response", ""),
            language=language,
            model_name=result.get("model", "unknown"),
            tokens_used=result.get("tokens", 0)
        )
        db.add(chat_msg)
        db.commit()
        db.refresh(chat_msg)
        logger.info(f"Chat message {chat_msg.id} stored for user {user_id}")
    except Exception as e:
        logger.error(f"Error storing chat message: {e}")
        db.rollback()
    
    return {
        "response": result.get("response", "").strip(),
        "tokens": result.get("tokens", 0),
        "model": result.get("model", "biomistral"),
        "language": language
    }


def get_chat_history(
    db: Session,
    user_id: int,
    patient_id: Optional[int] = None,
    limit: int = 50,
    offset: int = 0
) -> list:
    """
    Retrieve chat history for a user/patient
    
    Args:
        db: Database session
        user_id: User ID
        patient_id: Optional patient ID filter
        limit: Max number of messages to return
        offset: Pagination offset
        
    Returns:
        List of chat messages
    """
    query = db.query(ChatMessage).filter(ChatMessage.user_id == user_id)
    
    if patient_id:
        query = query.filter(ChatMessage.patient_id == patient_id)
    
    return query.order_by(ChatMessage.created_at.desc()).offset(offset).limit(limit).all()


def delete_chat_history_item(db: Session, message_id: int, user_id: int) -> bool:
    """Delete one saved chat exchange owned by the current user."""
    message = db.query(ChatMessage).filter(
        ChatMessage.id == message_id,
        ChatMessage.user_id == user_id
    ).first()

    if not message:
        return False

    db.delete(message)
    db.commit()
    return True


# Chat Session Management Functions

def create_chat_session(
    db: Session,
    patient_id: int,
    user_id: int,
    title: Optional[str] = None
) -> ChatSession:
    """
    Create a new chat session for a patient
    
    Args:
        db: Database session
        patient_id: Patient ID
        user_id: User ID (who created the session)
        title: Optional session title
        
    Returns:
        New ChatSession object
    """
    # Verify patient exists
    patient = db.query(Patient).filter(Patient.id == patient_id).first()
    if not patient:
        raise ValueError(f"Patient with ID {patient_id} not found")
    
    # Create auto-title if not provided
    if not title:
        title = f"Consultation {patient.first_name} {patient.last_name}"
    
    session = ChatSession(
        patient_id=patient_id,
        title=title,
        created_by=user_id
    )
    
    db.add(session)
    db.commit()
    db.refresh(session)
    logger.info(f"Chat session {session.id} created for patient {patient_id}")
    
    return session


def get_chat_session(db: Session, session_id: int) -> Optional[ChatSession]:
    """
    Get a chat session by ID with all messages
    
    Args:
        db: Database session
        session_id: Session ID
        
    Returns:
        ChatSession object or None if not found
    """
    return db.query(ChatSession).filter(ChatSession.id == session_id).first()


def list_patient_chat_sessions(
    db: Session,
    patient_id: int,
    user_id: int,
    limit: int = 50,
    offset: int = 0
) -> list:
    """
    List all chat sessions for a patient
    
    Args:
        db: Database session
        patient_id: Patient ID
        user_id: User ID
        limit: Max number of sessions to return
        offset: Pagination offset
        
    Returns:
        List of ChatSession objects
    """
    return db.query(ChatSession).filter(
        ChatSession.patient_id == patient_id,
        ChatSession.created_by == user_id
    ).order_by(ChatSession.updated_at.desc()).offset(offset).limit(limit).all()


def update_chat_session(
    db: Session,
    session_id: int,
    title: Optional[str] = None
) -> Optional[ChatSession]:
    """
    Update a chat session
    
    Args:
        db: Database session
        session_id: Session ID
        title: New session title
        
    Returns:
        Updated ChatSession object or None if not found
    """
    session = db.query(ChatSession).filter(ChatSession.id == session_id).first()
    if not session:
        return None
    
    if title:
        session.title = title
    
    db.commit()
    db.refresh(session)
    logger.info(f"Chat session {session_id} updated")
    
    return session


def delete_chat_session(db: Session, session_id: int) -> bool:
    """
    Delete a chat session and all associated messages
    
    Args:
        db: Database session
        session_id: Session ID
        
    Returns:
        True if deleted, False if not found
    """
    session = db.query(ChatSession).filter(ChatSession.id == session_id).first()
    if not session:
        return False
    
    # Delete associated messages
    db.query(ChatMessage).filter(ChatMessage.session_id == session_id).delete()
    
    # Delete session
    db.delete(session)
    db.commit()
    logger.info(f"Chat session {session_id} and its messages deleted")
    
    return True


def add_message_to_session(
    db: Session,
    session_id: int,
    role: str,
    content: str
) -> ChatMessage:
    """
    Add a message to a chat session
    
    Args:
        db: Database session
        session_id: Session ID
        role: Message role ("user" or "assistant")
        content: Message content
        
    Returns:
        New ChatMessage object
    """
    # Verify session exists
    session = db.query(ChatSession).filter(ChatSession.id == session_id).first()
    if not session:
        raise ValueError(f"Chat session with ID {session_id} not found")
    
    message = ChatMessage(
        session_id=session_id,
        role=role,
        content=content
    )
    
    db.add(message)
    db.commit()
    db.refresh(message)
    logger.info(f"Message added to session {session_id}")
    
    return message


def get_session_messages(
    db: Session,
    session_id: int,
    limit: int = 100,
    offset: int = 0
) -> list:
    """
    Get messages from a chat session
    
    Args:
        db: Database session
        session_id: Session ID
        limit: Max number of messages
        offset: Pagination offset
        
    Returns:
        List of ChatMessage objects
    """
    return db.query(ChatMessage).filter(
        ChatMessage.session_id == session_id
    ).order_by(ChatMessage.created_at.asc()).offset(offset).limit(limit).all()
