from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.act_results.router import router as act_results_router
from app.analytics.router import router as analytics_router
from app.appointments.router import router as appointments_router
from app.auth.router import router as auth_router
from app.chat.router import router as chat_router
from app.core.config import settings
from app.core.database import Base, engine
from app.core.middleware.mojibake import MojibakeRepairMiddleware
from app.core.utils.rate_limiting import setup_rate_limiting
from app.forms.router import router as forms_router
from app.medical_acts.router import router as medical_acts_router
from app.models import (  # noqa: F401 - register models
    act_result,
    appointment,
    audit,
    medical_act,
    notification,
    patient,
    user,
)
from app.models.additional_forms import (  # noqa: F401
    FormCsDouleur,
    FormCsDxa,
    FormCsEcho,
    FormCsGeste,
    FormCsOs,
    FormCsRic,
    FormCsSeances,
)
from app.models.chat_message import ChatMessage  # noqa: F401
from app.models.chat_session import ChatSession  # noqa: F401
from app.models.form_system import ActForm, FormCsRd, RefActType, RefCareType, RefFormType  # noqa: F401
from app.models.llm import llm
from app.notifications.router import router as notifications_router
from app.patients.router import router as patients_router
from app.search.router import router as search_router

app = FastAPI(
    title="Medical AI Assistant",
    description="Local AI for Rheumatology EHR",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Total-Count"],
)

# Repair legacy UTF-8 mojibake in JSON responses (patients, diagnoses, cities, etc.)
app.add_middleware(MojibakeRepairMiddleware)

# Setup rate limiting
setup_rate_limiting(app)

app.include_router(auth_router, prefix="/api/auth", tags=["auth"])
app.include_router(patients_router, prefix="/api/patients", tags=["patients"])
app.include_router(appointments_router, prefix="/api/appointments", tags=["appointments"])
app.include_router(medical_acts_router, prefix="/api/medical-acts", tags=["medical-acts"])
app.include_router(act_results_router, prefix="/api/act-results", tags=["act-results"])
app.include_router(forms_router, prefix="/api/forms", tags=["forms"])
app.include_router(chat_router, prefix="/api/chat", tags=["chat"])
app.include_router(analytics_router, prefix="/api/analytics", tags=["analytics"])
app.include_router(notifications_router, prefix="/api/notifications", tags=["notifications"])
app.include_router(search_router, prefix="/api/search", tags=["search"])

# Serve static files (uploads)
uploads_dir = Path("data/uploads")
uploads_dir.mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=str(uploads_dir)), name="uploads")


@app.on_event("startup")
def on_startup():
    import logging
    import threading

    log = logging.getLogger("uvicorn.error")
    try:
        if settings.create_tables_on_startup:
            Base.metadata.create_all(bind=engine)
            log.info("Database tables created or already exist (create_all).")
        else:
            log.info(
                "Skipping create_all on startup (production). "
                "Run: alembic upgrade head"
            )

        def _check_llm():
            log.info("Checking AI Assistant (Ollama) in background...")
            if llm.load():
                log.info("AI Assistant ready: %s", llm.model_name)
            else:
                log.warning(
                    "Ollama not responding at startup (%s). "
                    "Chat will still attempt connections on demand.",
                    settings.OLLAMA_HOST,
                )

        threading.Thread(target=_check_llm, daemon=True).start()

    except Exception as e:
        log.error(
            "Startup error: %s. "
            "Check that MySQL is running and DATABASE_URL is correct.",
            e,
        )


@app.get("/")
def root():
    return {"message": "Medical AI Assistant API"}


@app.get("/health")
def health():
    return {
        "status": "ok",
        "environment": settings.APP_ENV,
        "ai_assistant": "ready" if llm.is_available else "unavailable",
    }
