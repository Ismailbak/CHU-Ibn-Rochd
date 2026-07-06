import React from 'react';
import { FiArrowLeft } from 'react-icons/fi';
import { useNavigate } from 'react-router-dom';
import TermsContent from './TermsContent';
import './LegalPage.css';

function TermsPage() {
  const navigate = useNavigate();

  return (
    <div className="legal-page">
      <div className="legal-container">
        <button type="button" className="back-btn" onClick={() => navigate(-1)}>
          <FiArrowLeft /> Retour
        </button>

        <h1>Conditions générales d&apos;utilisation</h1>
        <p className="last-updated">Dernière mise à jour : 6 juillet 2026</p>

        <TermsContent privacyLink />
      </div>
    </div>
  );
}

export default TermsPage;
