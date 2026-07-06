import React, { useState, useEffect, useRef } from 'react';
import { FiX, FiSend, FiUser, FiUsers, FiInfo } from 'react-icons/fi';
import { getDoctors, createNotification, formatApiError } from '../../api/api';
import './CreateNotificationModal.css';

const CreateNotificationModal = ({ isOpen, onClose, onCreated, onError }) => {
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [recipientType, setRecipientType] = useState('all');
  const [recipientId, setRecipientId] = useState('');
  const [category, setCategory] = useState('message');
  const [doctors, setDoctors] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const titleRef = useRef(null);
  const MAX_MESSAGE = 1000;

  useEffect(() => {
    if (isOpen) {
      getDoctors()
        .then(res => {
          setDoctors(res.data || []);
        })
        .catch(err => console.error('Error fetching doctors:', err));
      setTimeout(() => titleRef.current?.focus(), 60);
    }
  }, [isOpen]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title || !message) {
      setError('Veuillez remplir tous les champs obligatoires.');
      return;
    }
    if (recipientType === 'specific' && !recipientId) {
      setError('Veuillez sélectionner un destinataire.');
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      const res = await createNotification({
        title: title.trim(),
        message: message.trim(),
        is_public: recipientType === 'all',
        recipient_id: recipientType === 'specific' ? parseInt(recipientId, 10) : null,
        category,
      });

      if (!res.data?.length) {
        const msg = 'Aucune notification n\'a pu être créée.';
        setError(msg);
        onError?.(msg);
        return;
      }

      onCreated(res.data);
      onClose();
      setTitle('');
      setMessage('');
      setRecipientId('');
      setRecipientType('all');
      setCategory('message');
    } catch (err) {
      const msg = formatApiError(err, 'Une erreur est survenue lors de l\'envoi.');
      setError(msg);
      onError?.(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="cnm-overlay" onClick={onClose}>
      <div className="cnm-panel" onClick={(e) => e.stopPropagation()}>
        <div className="cnm-header">
          <div className="cnm-header-left">
            <div className="cnm-header-icon">
              <FiSend />
            </div>
            <div>
              <h2 id="notif-modal-title">Nouvelle Notification</h2>
              <p>Diffusez rapidement une information au staff médical.</p>
            </div>
          </div>
          <button type="button" className="cnm-close" onClick={onClose} aria-label="Fermer la fenêtre">
            <FiX />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="cnm-form" aria-labelledby="notif-modal-title">
          {error && <div className="cnm-error">{error}</div>}

          <div className="cnm-field">
            <label className="cnm-label">Catégorie</label>
            <div className="cnm-segments cnm-segments-3" role="tablist" aria-label="Catégorie">
              {[
                { id: 'patients', label: 'Patients' },
                { id: 'results', label: 'Résultats' },
                { id: 'message', label: 'Message' },
              ].map(({ id, label }) => (
                <button
                  key={id}
                  type="button"
                  className={`cnm-segment ${category === id ? 'active' : ''}`}
                  onClick={() => setCategory(id)}
                  aria-pressed={category === id}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="cnm-field">
            <label className="cnm-label">Destinataire</label>
            <div className="cnm-segments cnm-segments-2" role="tablist" aria-label="Destinataire">
              <button
                type="button"
                className={`cnm-segment ${recipientType === 'all' ? 'active' : ''}`}
                onClick={() => setRecipientType('all')}
                aria-pressed={recipientType === 'all'}
              >
                <FiUsers aria-hidden="true" />
                <span>Tous les médecins</span>
              </button>
              <button
                type="button"
                className={`cnm-segment ${recipientType === 'specific' ? 'active' : ''}`}
                onClick={() => setRecipientType('specific')}
                aria-pressed={recipientType === 'specific'}
              >
                <FiUser aria-hidden="true" />
                <span>Médecin spécifique</span>
              </button>
            </div>

            {recipientType === 'specific' && (
              <select
                value={recipientId}
                onChange={(e) => setRecipientId(e.target.value)}
                className="cnm-select"
                required
              >
                <option value="">Sélectionner un médecin...</option>
                {doctors.map(doc => (
                  <option key={doc.id} value={doc.id}>
                    Dr. {doc.last_name || doc.username} ({doc.specialty || 'Généraliste'})
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="cnm-field">
            <label className="cnm-label" htmlFor="notif-title">Titre</label>
            <input
              id="notif-title"
              ref={titleRef}
              type="text"
              className="cnm-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex: Réunion de service, Patient urgent..."
              required
            />
          </div>

          <div className="cnm-field">
            <label className="cnm-label" htmlFor="notif-message">Message</label>
            <textarea
              id="notif-message"
              className="cnm-textarea"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Saisissez votre message ici..."
              rows={5}
              maxLength={MAX_MESSAGE}
              required
            />
            <div className="cnm-char-count">{message.length}/{MAX_MESSAGE}</div>
          </div>

          <div className="cnm-info">
            <FiInfo />
            <span>Les notifications publiques seront visibles par l&apos;ensemble du staff médical.</span>
          </div>

          <div className="cnm-footer">
            <button type="button" className="cnm-btn-cancel" onClick={onClose}>
              Annuler
            </button>
            <button type="submit" className="cnm-btn-submit" disabled={isSubmitting}>
              {isSubmitting ? 'Envoi...' : 'Envoyer la notification'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreateNotificationModal;
