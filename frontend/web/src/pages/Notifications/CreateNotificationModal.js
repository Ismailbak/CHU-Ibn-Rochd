import React, { useState, useEffect, useRef, useMemo } from 'react';
import { FiX, FiSend, FiUser, FiUsers, FiInfo } from 'react-icons/fi';
import { getNotificationRecipients, createNotification, formatApiError } from '../../api/api';
import { ROLE_NURSE } from '../../utils/permissions';
import './CreateNotificationModal.css';

function isNurseRecipient(person) {
  return person.role === ROLE_NURSE || person.specialty === ROLE_NURSE;
}

function isDoctorRecipient(person) {
  return (person.role === 'doctor' || person.role === 'medecin') && !isNurseRecipient(person);
}

function formatRecipientLabel(person) {
  const lastName = person.last_name || person.username || 'Utilisateur';
  if (isNurseRecipient(person)) {
    return `${person.first_name || ''} ${lastName}`.trim() + ' (Inf.)';
  }
  if (person.role === 'doctor' || person.role === 'medecin') {
    return `Dr. ${lastName}${person.specialty ? ` (${person.specialty})` : ''}`;
  }
  if (person.role === 'admin') {
    return `${person.first_name || ''} ${lastName}`.trim() + ' (Admin)';
  }
  return `${person.first_name || ''} ${lastName}`.trim() || person.username;
}

const RECIPIENT_OPTIONS = [
  { id: 'doctors', label: 'Tous les médecins', icon: FiUsers },
  { id: 'nurses', label: 'Tous les infirmiers', icon: FiUsers },
  { id: 'specific', label: 'Destinataire précis', icon: FiUser },
];

const BROADCAST_HINTS = {
  doctors: 'Notification globale : sera envoyée à tous les médecins actifs.',
  nurses: 'Notification globale : sera envoyée à tous les infirmiers actifs.',
  specific: 'Envoi privé à une seule personne. Une copie apparaîtra dans votre fil « Envoyées ».',
};

const CreateNotificationModal = ({ isOpen, onClose, onCreated, onError }) => {
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [recipientType, setRecipientType] = useState('doctors');
  const [recipientId, setRecipientId] = useState('');
  const [category, setCategory] = useState('message');
  const [recipients, setRecipients] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const titleRef = useRef(null);
  const MAX_MESSAGE = 1000;

  const groupedRecipients = useMemo(() => ({
    doctors: recipients.filter(isDoctorRecipient),
    nurses: recipients.filter(isNurseRecipient),
    others: recipients.filter(
      (p) => !isNurseRecipient(p) && p.role !== 'doctor' && p.role !== 'medecin'
    ),
  }), [recipients]);

  useEffect(() => {
    if (!isOpen) return;
    setError('');
    getNotificationRecipients()
      .then((res) => {
        setRecipients(res.data || []);
      })
      .catch(() => {
        setRecipients([]);
        setError('Impossible de charger la liste des destinataires.');
      });
    setTimeout(() => titleRef.current?.focus(), 60);
  }, [isOpen]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim() || !message.trim()) {
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
        audience: recipientType,
        recipient_id: recipientType === 'specific' ? parseInt(recipientId, 10) : null,
        category,
      });

      if (!res.data?.length) {
        const msg = 'Aucun destinataire disponible pour cette notification.';
        setError(msg);
        onError?.(msg);
        return;
      }

      onCreated?.(res.data);
      onClose();
      setTitle('');
      setMessage('');
      setRecipientId('');
      setRecipientType('doctors');
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
    <div className="cnm-overlay">
      <div className="cnm-panel">
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
            <div className="cnm-segments cnm-segments-3" role="tablist" aria-label="Destinataire">
              {RECIPIENT_OPTIONS.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  className={`cnm-segment ${recipientType === id ? 'active' : ''}`}
                  onClick={() => {
                    setRecipientType(id);
                    if (id !== 'specific') setRecipientId('');
                  }}
                  aria-pressed={recipientType === id}
                >
                  <Icon aria-hidden="true" />
                  <span>{label}</span>
                </button>
              ))}
            </div>

            <p className="cnm-recipient-hint">{BROADCAST_HINTS[recipientType]}</p>

            {recipientType === 'specific' && (
              <select
                value={recipientId}
                onChange={(e) => setRecipientId(e.target.value)}
                className="cnm-select"
                required
              >
                <option value="">Sélectionner un destinataire...</option>
                {groupedRecipients.doctors.length > 0 && (
                  <optgroup label="Médecins">
                    {groupedRecipients.doctors.map((person) => (
                      <option key={person.id} value={person.id}>
                        {formatRecipientLabel(person)}
                      </option>
                    ))}
                  </optgroup>
                )}
                {groupedRecipients.nurses.length > 0 ? (
                  <optgroup label="Infirmiers">
                    {groupedRecipients.nurses.map((person) => (
                      <option key={person.id} value={person.id}>
                        {formatRecipientLabel(person)}
                      </option>
                    ))}
                  </optgroup>
                ) : (
                  <optgroup label="Infirmiers">
                    <option value="" disabled>Aucun infirmier disponible</option>
                  </optgroup>
                )}
                {groupedRecipients.others.length > 0 && (
                  <optgroup label="Administration">
                    {groupedRecipients.others.map((person) => (
                      <option key={person.id} value={person.id}>
                        {formatRecipientLabel(person)}
                      </option>
                    ))}
                  </optgroup>
                )}
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
            <span>
              Par défaut, l&apos;envoi est une notification globale au groupe choisi.
              Sélectionnez « Destinataire précis » pour envoyer à une seule personne.
            </span>
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
