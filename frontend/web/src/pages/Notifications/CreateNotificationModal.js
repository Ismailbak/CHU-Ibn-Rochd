import React, { useState, useEffect, useRef } from 'react';
import { FiX, FiSend, FiUser, FiUsers, FiInfo } from 'react-icons/fi';
import { getDoctors, createNotification } from '../../api/api'; 
import './CreateNotificationModal.css';

const CreateNotificationModal = ({ isOpen, onClose, onCreated }) => {
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [recipientType, setRecipientType] = useState('all'); // 'all' or 'specific'
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
      // autofocus title when modal opens
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
      await createNotification({
        title,
        message,
        is_public: recipientType === 'all',
        recipient_id: recipientType === 'specific' ? parseInt(recipientId) : null,
        category
      });
      
      onCreated();
      onClose();
      // Reset form
      setTitle('');
      setMessage('');
      setRecipientId('');
      setCategory('message');
    } catch (err) {
      setError(err.response?.data?.detail || 'Une erreur est survenue lors de l\'envoi.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="notification-modal-overlay" onClick={onClose}>
      <div className="modal-content notification-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="header-title-group">
            <div className="header-icon">
              <FiSend />
            </div>
            <div>
              <h2 id="notif-modal-title">Nouvelle Notification</h2>
              <p>Diffusez rapidement une information au staff médical.</p>
            </div>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Fermer la fenêtre">
            <FiX />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="notification-form" aria-labelledby="notif-modal-title">
          {error && <div className="error-message">{error}</div>}

          <div className="form-section two-column">
            <div className="field">
              <label>Catégorie</label>
              <div className="toggle-group" role="tablist" aria-label="Catégorie">
                <button
                  type="button"
                  className={`toggle-btn ${category === 'patients' ? 'active' : ''}`}
                  onClick={() => setCategory('patients')}
                  aria-pressed={category === 'patients'}
                >
                  Patients
                </button>
                <button
                  type="button"
                  className={`toggle-btn ${category === 'results' ? 'active' : ''}`}
                  onClick={() => setCategory('results')}
                  aria-pressed={category === 'results'}
                >
                  Résultats
                </button>
                <button
                  type="button"
                  className={`toggle-btn ${category === 'message' ? 'active' : ''}`}
                  onClick={() => setCategory('message')}
                  aria-pressed={category === 'message'}
                >
                  Message
                </button>
              </div>
            </div>

            <div className="field">
              <label>Destinataire</label>
              <div className="toggle-group" role="tablist" aria-label="Destinataire">
                <button
                  type="button"
                  className={`toggle-btn ${recipientType === 'all' ? 'active' : ''}`}
                  onClick={() => setRecipientType('all')}
                  aria-pressed={recipientType === 'all'}
                >
                  <FiUsers /> <span className="toggle-text">Tous les médecins</span>
                </button>
                <button
                  type="button"
                  className={`toggle-btn ${recipientType === 'specific' ? 'active' : ''}`}
                  onClick={() => setRecipientType('specific')}
                  aria-pressed={recipientType === 'specific'}
                >
                  <FiUser /> <span className="toggle-text">Médecin spécifique</span>
                </button>
              </div>

              {recipientType === 'specific' && (
                <select
                  value={recipientId}
                  onChange={(e) => setRecipientId(e.target.value)}
                  className="form-select"
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
          </div>

          <div className="form-group">
            <label htmlFor="notif-title">Titre</label>
            <input 
              id="notif-title"
              ref={titleRef}
              type="text" 
              value={title} 
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex: Réunion de service, Patient urgent..."
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="notif-message">Message</label>
            <textarea 
              id="notif-message"
              value={message} 
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Saisissez votre message ici..."
              rows={5}
              maxLength={MAX_MESSAGE}
              required
            />
            <div className="char-counter">{message.length}/{MAX_MESSAGE}</div>
          </div>

          <div className="notif-info-box">
            <FiInfo />
            <span>Les notifications publiques seront visibles par l'ensemble du staff médical.</span>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn-secondary" onClick={onClose}>Annuler</button>
            <button type="submit" className="btn-primary" disabled={isSubmitting}>
              {isSubmitting ? 'Envoi...' : 'Envoyer la notification'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreateNotificationModal;
