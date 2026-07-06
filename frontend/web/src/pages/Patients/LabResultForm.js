import React, { useState, useEffect } from 'react';
import {
  FiX, FiCheck, FiAlertCircle, FiPlus, FiActivity,
  FiCalendar, FiClipboard
} from 'react-icons/fi';
import { createActResult, getPatientMedicalActs } from '../../api/api';
import '../Appointments/AppointmentForm.css';
import './LabResultForm.css';

const CATEGORIES = [
  'Hématologie',
  'Biochimie',
  'Immunologie',
  'Microbiologie',
  'Autre',
];

const EMPTY_FORM = {
  act_id: '',
  result_date: new Date().toISOString().split('T')[0],
  result_name: '',
  result_value: '',
  result_unit: '',
  result_category: '',
  is_abnormal: false,
  notes: '',
};

function LabResultForm({ patientId, onSuccess, onClose }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [medicalActs, setMedicalActs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    const fetchMedicalActs = async () => {
      try {
        const res = await getPatientMedicalActs(patientId);
        setMedicalActs(res.data || []);
      } catch (error) {
        console.error('Erreur lors du chargement des actes:', error);
      }
    };
    fetchMedicalActs();
  }, [patientId]);

  const validateForm = () => {
    const newErrors = {};
    if (!form.act_id) newErrors.act_id = 'Sélectionnez un acte médical';
    if (!form.result_name) newErrors.result_name = 'Le nom de l\'analyse est requis';
    if (!form.result_value) newErrors.result_value = 'La valeur du résultat est requise';
    if (!form.result_date) newErrors.result_date = 'La date est requise';
    return newErrors;
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }));
    }
  };

  const toggleAbnormal = () => {
    setForm(prev => ({ ...prev, is_abnormal: !prev.is_abnormal }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const newErrors = validateForm();
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setLoading(true);
    try {
      await createActResult({
        act_id: parseInt(form.act_id, 10),
        patient_id: patientId,
        result_date: form.result_date,
        result_name: form.result_name,
        result_value: form.result_value,
        result_unit: form.result_unit || null,
        result_category: form.result_category || null,
        is_abnormal: form.is_abnormal,
        notes: form.notes || null,
      });

      setSubmitted(true);
      setTimeout(() => {
        if (onSuccess) onSuccess();
        if (onClose) onClose();
      }, 1400);
    } catch (error) {
      console.error('Erreur lors de la création du résultat:', error);
      setErrors({ submit: error.message || 'Une erreur est survenue' });
    } finally {
      setLoading(false);
    }
  };

  const formatActDate = (act) => {
    const raw = act.act_date || act.date;
    if (!raw) return '';
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('fr-FR');
  };

  if (submitted) {
    return (
      <div className="af-wrapper lrf-wrapper">
        <div className="af-success">
          <div className="af-success-icon"><FiCheck /></div>
          <h3>Résultat enregistré !</h3>
          <p>
            <strong>{form.result_name}</strong>
            {form.result_value && <> — {form.result_value}{form.result_unit ? ` ${form.result_unit}` : ''}</>}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="af-wrapper lrf-wrapper">
      <div className="af-header">
        <div className="af-header-left">
          <div className="af-header-icon"><FiPlus /></div>
          <div>
            <h2 className="af-title">Nouveau résultat</h2>
            <p className="af-subtitle">Enregistrer un résultat de laboratoire</p>
          </div>
        </div>
        {onClose && (
          <button className="af-close-btn" onClick={onClose} type="button" aria-label="Fermer">
            <FiX />
          </button>
        )}
      </div>

      <form onSubmit={handleSubmit} className="af-form lrf-form" noValidate>
        <div className="af-section">
          <div className="af-section-title">
            <FiClipboard className="af-section-icon" />
            <span>Informations du résultat</span>
          </div>

          {errors.submit && (
            <div className="af-error-banner">
              <FiAlertCircle /> {errors.submit}
            </div>
          )}

          <div className="af-field">
            <label className="af-label" htmlFor="act_id">
              Acte médical <span className="af-required">*</span>
            </label>
            <select
              id="act_id"
              name="act_id"
              value={form.act_id}
              onChange={handleChange}
              className={`af-input ${errors.act_id ? 'af-input-error' : ''}`}
            >
              <option value="">— Sélectionnez un acte —</option>
              {medicalActs.map(act => (
                <option key={act.id} value={act.id}>
                  {act.act_type || act.type || 'Acte'} — {formatActDate(act)}
                </option>
              ))}
            </select>
            {errors.act_id && (
              <span className="af-error-msg"><FiAlertCircle />{errors.act_id}</span>
            )}
          </div>

          <div className="af-field">
            <label className="af-label" htmlFor="result_date">
              Date du résultat <span className="af-required">*</span>
            </label>
            <div className="af-input-icon-wrapper">
              <FiCalendar className="af-input-icon" />
              <input
                id="result_date"
                type="date"
                name="result_date"
                value={form.result_date}
                onChange={handleChange}
                className={`af-input af-input-with-icon ${errors.result_date ? 'af-input-error' : ''}`}
              />
            </div>
            {errors.result_date && (
              <span className="af-error-msg"><FiAlertCircle />{errors.result_date}</span>
            )}
          </div>

          <div className="af-field">
            <label className="af-label" htmlFor="result_name">
              Nom de l&apos;analyse <span className="af-required">*</span>
            </label>
            <input
              id="result_name"
              type="text"
              name="result_name"
              placeholder="Ex: Glycémie, Créatinine, etc."
              value={form.result_name}
              onChange={handleChange}
              className={`af-input ${errors.result_name ? 'af-input-error' : ''}`}
            />
            {errors.result_name && (
              <span className="af-error-msg"><FiAlertCircle />{errors.result_name}</span>
            )}
          </div>

          <div className="lrf-grid-2">
            <div className="af-field">
              <label className="af-label" htmlFor="result_value">
                Valeur du résultat <span className="af-required">*</span>
              </label>
              <input
                id="result_value"
                type="text"
                name="result_value"
                placeholder="Ex: 95, 1.2, etc."
                value={form.result_value}
                onChange={handleChange}
                className={`af-input ${errors.result_value ? 'af-input-error' : ''}`}
              />
              {errors.result_value && (
                <span className="af-error-msg"><FiAlertCircle />{errors.result_value}</span>
              )}
            </div>

            <div className="af-field">
              <label className="af-label" htmlFor="result_unit">
                Unité <span className="af-optional">(optionnel)</span>
              </label>
              <input
                id="result_unit"
                type="text"
                name="result_unit"
                placeholder="Ex: mg/dL, mmol/L"
                value={form.result_unit}
                onChange={handleChange}
                className="af-input"
              />
            </div>
          </div>

          <div className="lrf-grid-2">
            <div className="af-field">
              <label className="af-label" htmlFor="result_category">
                Catégorie <span className="af-optional">(optionnel)</span>
              </label>
              <select
                id="result_category"
                name="result_category"
                value={form.result_category}
                onChange={handleChange}
                className="af-input"
              >
                <option value="">— Sélectionnez une catégorie —</option>
                {CATEGORIES.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>

            <div className="af-field">
              <label className="af-label">Statut</label>
              <button
                type="button"
                className={`lrf-abnormal-chip ${form.is_abnormal ? 'selected' : ''}`}
                onClick={toggleAbnormal}
              >
                <FiActivity />
                {form.is_abnormal ? 'Résultat anormal' : 'Résultat normal'}
              </button>
            </div>
          </div>

          <div className="af-field">
            <label className="af-label" htmlFor="notes">
              Notes supplémentaires <span className="af-optional">(optionnel)</span>
            </label>
            <textarea
              id="notes"
              name="notes"
              placeholder="Ajoutez des notes si nécessaire..."
              value={form.notes}
              onChange={handleChange}
              rows={3}
              className="af-textarea"
            />
          </div>
        </div>

        <div className="af-nav">
          <div />
          <div className="af-nav-right">
            <button
              type="button"
              onClick={onClose}
              className="af-btn-cancel"
              disabled={loading}
            >
              Annuler
            </button>
            <button
              type="submit"
              className="af-btn-submit"
              disabled={loading}
            >
              {loading ? (
                <>
                  <span className="af-spinner" />
                  Ajout en cours...
                </>
              ) : (
                <>
                  <FiCheck />
                  Ajouter le résultat
                </>
              )}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

export default LabResultForm;
