"""Tests for RAG hardening, ranking, and patient detection."""

import pytest
from unittest.mock import Mock, AsyncMock, patch
from datetime import datetime

from app.chat.rag.patient_detection import detect_patient_from_query, _extract_name_pairs
from app.chat.rag.fact_ranking import rank_and_cap_facts
from app.chat.rag.chat_service import clean_grounded_response_text
from app.chat.rag.retrievers.structured_retriever import RetrievedFact
from app.chat.rag.orchestrator import RAGOrchestrator
from app.core.schemas.rag_response import ChatRequest


class TestPatientDetection:
    def test_exact_ipp_match(self):
        db = Mock()
        patient = Mock()
        patient.id = 7
        patient.ipp = "FR123456"
        db.query.return_value.filter.return_value.first.return_value = patient

        pid, warnings, _ = detect_patient_from_query(db, "Patient IPP FR123456 status?")
        assert pid == 7
        assert not warnings

    def test_ipp_not_found_strict(self):
        db = Mock()
        db.query.return_value.filter.return_value.first.return_value = None
        db.query.return_value.filter.return_value.all.return_value = []

        with patch("app.chat.rag.patient_detection.rag_config") as cfg:
            cfg.AUTO_DETECT_ENABLED = True
            cfg.AUTO_DETECT_REQUIRE_EXACT_MATCH = True
            pid, warnings, _ = detect_patient_from_query(db, "IPP 99999")
        assert pid is None
        assert any("not found" in w.lower() for w in warnings)

    def test_extracts_name_pair_from_natural_language_request(self):
        pairs = _extract_name_pairs(
            "Veuillez fournir les dossiers médicaux de Layla Laksiri pour décrire son cas."
        )

        assert ("layla", "laksiri") in pairs


class TestFactRanking:
    def test_dedupe_and_cap(self):
        facts = [
            RetrievedFact(
                source_type="patient", source_id=1,
                fact_text="a", snippet="a", confidence=1.0,
                timestamp=datetime(2024, 1, 1),
            ),
            RetrievedFact(
                source_type="patient", source_id=1,
                fact_text="a", snippet="a", confidence=1.0,
                timestamp=datetime(2024, 1, 2),
            ),
            RetrievedFact(
                source_type="act_result", source_id=2,
                fact_text="b", snippet="b", confidence=0.9,
                timestamp=datetime(2025, 1, 1),
            ),
        ]
        with patch("app.chat.rag.fact_ranking.rag_config") as cfg:
            cfg.MAX_TOTAL_FACTS = 2
            ranked = rank_and_cap_facts(facts)
        assert len(ranked) == 2

    def test_appointment_query_boosts_appointments_over_demographics(self):
        facts = [
            RetrievedFact(
                source_type="patient", source_id=1,
                fact_text="Patient: X", snippet="X (IPP: 1)",
                metadata={"patient_field": "identity"},
            ),
            RetrievedFact(
                source_type="patient", source_id=1,
                fact_text="DOB", snippet="DOB 1990, 35 ans",
                metadata={"patient_field": "dob"},
            ),
            RetrievedFact(
                source_type="appointment", source_id=10,
                fact_text="2026-05-13", snippet="2026-05-13 — suivi",
                timestamp=datetime(2026, 5, 13),
            ),
        ]
        ranked = rank_and_cap_facts(
            facts,
            query="Historique des rendez-vous passes",
        )
        assert ranked[0].source_type == "appointment"


class TestResponseCleaning:
    def test_removes_malformed_manual_source_list(self):
        text = (
            "Le patient Adam Mira est un homme de 21 ans [patient | ]. "
            "**Sources utilisées :** [patient | ], [medical_act | ]."
        )

        cleaned = clean_grounded_response_text(text)

        assert "[patient | ]" not in cleaned
        assert "Sources utilisées" not in cleaned
        assert "Adam Mira" in cleaned

    def test_removes_inline_source_ids(self):
        text = (
            "Le patient Adam Mira présente un Lupus [patient | ID: 22]. "
            "Consultation récente [medical_act | ID: 40]."
        )

        cleaned = clean_grounded_response_text(text)

        assert "[patient | ID: 22]" not in cleaned
        assert "[medical_act | ID: 40]" not in cleaned
        assert "Lupus" in cleaned


class TestRetrievalMode:
    @pytest.mark.asyncio
    async def test_structured_only_skips_semantic(self):
        db_session = Mock()
        patient_service = AsyncMock()
        patient_service.user_can_access_patient = AsyncMock(return_value=True)

        orchestrator = RAGOrchestrator(db_session, patient_service)
        orchestrator.retriever.retrieve_with_authorization = AsyncMock(
            return_value=[
                RetrievedFact(
                    source_type="patient", source_id=1,
                    fact_text="x", snippet="x",
                )
            ]
        )

        with patch("app.chat.rag.orchestrator.semantic_retrieve", new_callable=AsyncMock) as sem:
            sem.return_value = []
            with patch("app.chat.rag.orchestrator.ingest_patient_records"):
                _, response, _, _, _ = await orchestrator.process_chat_request(
                    ChatRequest(
                        query="Allergies du patient?",
                        patient_id=1,
                        retrieval_mode="structured_only",
                    ),
                    user_id=1,
                )
            sem.assert_not_called()

        assert response.metadata.retrieval_type == "structured"

    @pytest.mark.asyncio
    async def test_access_denied_warning(self):
        db_session = Mock()
        patient_service = AsyncMock()
        patient_service.user_can_access_patient = AsyncMock(return_value=False)

        orchestrator = RAGOrchestrator(db_session, patient_service)
        orchestrator.retriever.retrieve_with_authorization = AsyncMock(return_value=[])

        _, response, warnings, _, _ = await orchestrator.process_chat_request(
            ChatRequest(query="Medications?", patient_id=42),
            user_id=1,
        )

        assert any("Access denied" in w and "42" in w for w in warnings)
        assert len(response.sources) == 0
