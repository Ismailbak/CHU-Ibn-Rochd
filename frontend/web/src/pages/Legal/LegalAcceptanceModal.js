import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FiChevronDown, FiX } from 'react-icons/fi';
import TermsContent from './TermsContent';
import PrivacyContent from './PrivacyContent';
import './LegalAcceptanceModal.css';
import './LegalPage.css';

const LEGAL_META = {
  terms: {
    title: "Conditions générales d'utilisation",
    approveLabel: "J'ai lu et j'approuve les conditions d'utilisation",
  },
  privacy: {
    title: 'Politique de confidentialité',
    approveLabel: "J'ai lu et j'approuve la politique de confidentialité",
  },
};

function LegalAcceptanceModal({ isOpen, type, onApprove, onClose }) {
  const scrollRef = useRef(null);
  const [scrolledToEnd, setScrolledToEnd] = useState(false);

  const checkScrollPosition = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const remaining = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (remaining <= 32) {
      setScrolledToEnd(true);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return undefined;
    setScrolledToEnd(false);
    const timer = window.setTimeout(() => {
      checkScrollPosition();
      const el = scrollRef.current;
      if (el && el.scrollHeight <= el.clientHeight + 32) {
        setScrolledToEnd(true);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [isOpen, type, checkScrollPosition]);

  if (!isOpen || !type) return null;

  const meta = LEGAL_META[type];

  return (
    <div className="legal-modal-overlay" role="presentation">
      <div
        className="legal-modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="legal-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="legal-modal-header">
          <div>
            <h2 id="legal-modal-title">{meta.title}</h2>
            <p className="legal-modal-updated">Dernière mise à jour : 6 juillet 2026</p>
          </div>
          <button type="button" className="legal-modal-close" onClick={onClose} aria-label="Fermer">
            <FiX />
          </button>
        </div>

        <div
          ref={scrollRef}
          className="legal-modal-body legal-container legal-container--modal"
          onScroll={checkScrollPosition}
        >
          {type === 'terms' ? (
            <TermsContent privacyLink={false} />
          ) : (
            <PrivacyContent />
          )}
        </div>

        <div className="legal-modal-footer">
          {!scrolledToEnd && (
            <p className="legal-modal-scroll-hint">
              <FiChevronDown aria-hidden="true" />
              Faites défiler jusqu&apos;en bas pour lire l&apos;intégralité du document
            </p>
          )}
          <button
            type="button"
            className="legal-modal-approve-btn"
            disabled={!scrolledToEnd}
            onClick={onApprove}
          >
            {meta.approveLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export default LegalAcceptanceModal;
