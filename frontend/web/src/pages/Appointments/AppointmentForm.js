import React, { useState, useEffect } from 'react';
import {
  FiUser, FiCalendar, FiClock, FiFileText,
  FiChevronRight, FiChevronLeft, FiCheck, FiX,
  FiAlertCircle, FiPlus, FiSearch
} from 'react-icons/fi';
import { createAppointment, getPatients, getPatient, updateAppointment } from '../../api/api';
import './AppointmentForm.css';

const TIME_SLOTS = [
  '08:00', '08:30', '09:00', '09:30', '10:00', '10:30',
  '11:00', '11:30', '14:00', '14:30', '15:00', '15:30',
  '16:00', '16:30', '17:00'
];

const CONSULT_TYPES = [
  { value: 'Première consultation', icon: '🩺' },
  { value: 'Consultation de suivi', icon: '🔄' },
  { value: 'Consultation urgente', icon: '🚨' },
  { value: 'Contrôle', icon: '✅' },
];

const DURATIONS = [
  { value: '30', label: '30 min' },
  { value: '45', label: '45 min' },
  { value: '60', label: '1 heure' },
  { value: '90', label: '1h 30' },
];

const STEPS = [
  { id: 1, label: 'Patient', icon: FiUser },
  { id: 2, label: 'Horaire', icon: FiCalendar },
  { id: 3, label: 'Consultation', icon: FiFileText },
];

const initialForm = {
  patientId: '',
  datetime_scheduled: '',
  type: '',
  duration: '60',
  notes: '',
};

const buildDateTimeValue = (date, time) => {
  if (!date || !time) return '';
  return `${date}T${time}`;
};

function AppointmentForm({ 
  onSuccess, 
  onClose, 
  defaultDate, 
  defaultTime,
  defaultPatientId,
  defaultNotes,
  isEditing,
  appointmentId,
  lockDate,
  initialStep = 1,
}) {
  const initialDate = defaultDate || '';
  const initialTime = defaultTime || '';
  const initialDateTime = buildDateTimeValue(initialDate, initialTime);

  const [form, setForm] = useState({ 
    ...initialForm, 
    date: initialDate,
    time: initialTime,
    datetime_scheduled: initialDateTime,
    patientId: defaultPatientId || '',
    notes: defaultNotes || ''
  });
  const [step, setStep] = useState(() =>
    initialStep >= 1 && initialStep <= STEPS.length ? initialStep : 1
  );
  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [patients, setPatients] = useState([]);
  const [patSearch, setPatSearch] = useState('');
  const [loadingPats, setLoadingPats] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      setLoadingPats(true);
      try {
        const params = { limit: 20 };
        const q = patSearch.trim();
        if (q) params.q = q;
        const res = await getPatients(params);
        if (cancelled) return;
        let list = res.data || [];
        if (defaultPatientId && !list.some((p) => p.id === defaultPatientId)) {
          try {
            const one = await getPatient(defaultPatientId);
            if (!cancelled && one.data) list = [one.data, ...list];
          } catch {
            /* selected patient may have been removed */
          }
        }
        if (!cancelled) setPatients(list);
      } catch {
        if (!cancelled) setPatients([]);
      } finally {
        if (!cancelled) setLoadingPats(false);
      }
    }, patSearch.trim() ? 300 : 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [patSearch, defaultPatientId]);

  const filteredPatients = patients;

  const selectedPatient = patients.find(p => p.id == form.patientId);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors(prev => ({ ...prev, [name]: '' }));
  };

  const handleTimeChange = (e) => {
    const { value } = e.target;
    setForm(prev => {
      const dateValue = lockDate ? (defaultDate || prev.date) : prev.date;
      return {
        ...prev,
        time: value,
        datetime_scheduled: buildDateTimeValue(dateValue, value)
      };
    });
    if (errors.datetime_scheduled) setErrors(prev => ({ ...prev, datetime_scheduled: '' }));
  };

  const validateStep = (s) => {
    const errs = {};
    if (s === 1 && !form.patientId) errs.patientId = 'Veuillez sélectionner un patient';
    if (s === 2) {
      if (!form.datetime_scheduled) {
        errs.datetime_scheduled = lockDate ? 'L\'heure est requise' : 'La date et l\'heure sont requises';
      }
    }
    if (s === 3 && !form.type) errs.type = 'Veuillez choisir un type de consultation';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleNext = () => { if (validateStep(step)) setStep(s => s + 1); };
  const handleBack = () => setStep(s => s - 1);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateStep(3)) return;
    setIsSubmitting(true);
    try {
      const appointmentData = {
        patient_id: parseInt(form.patientId, 10),
        datetime_scheduled: form.datetime_scheduled,
        reason: [form.type, form.notes].filter(Boolean).join(' – ') || null,
        status: isEditing ? 'confirmed' : 'scheduled',
      };

      if (isEditing && appointmentId) {
        // Update existing appointment
        await updateAppointment(appointmentId, appointmentData);
      } else {
        // Create new appointment
        await createAppointment(appointmentData);
      }
      
      setSubmitted(true);
      setTimeout(() => {
        setForm({
          ...initialForm,
          date: defaultDate || '',
          time: defaultTime || '',
          datetime_scheduled: buildDateTimeValue(defaultDate || '', defaultTime || '')
        });
        setStep(initialStep >= 1 && initialStep <= STEPS.length ? initialStep : 1);
        setSubmitted(false);
        if (onSuccess) onSuccess();
        if (onClose) onClose();
      }, 1400);
    } catch {
      setErrors({ submit: `Erreur lors de la ${isEditing ? 'modification' : 'création'} du rendez-vous. Veuillez réessayer.` });
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Success screen ────────────────────────
  if (submitted) {
    return (
      <div className="af-success">
        <div className="af-success-icon"><FiCheck /></div>
        <h3>Rendez-vous créé !</h3>
        <p>
          {selectedPatient && <><strong>{selectedPatient.first_name} {selectedPatient.last_name}</strong> — </>}
          {form.datetime_scheduled && new Date(form.datetime_scheduled).toLocaleString('fr-FR')}
        </p>
      </div>
    );
  }

  return (
    <div className="af-wrapper">
      {/* Header */}
      <div className="af-header">
        <div className="af-header-left">
          <div className="af-header-icon">{isEditing ? <FiClock /> : <FiPlus />}</div>
          <div>
            <h2 className="af-title">{isEditing ? 'Modifier Rendez-vous' : 'Nouveau Rendez-vous'}</h2>
            <p className="af-subtitle">{isEditing ? 'Mettez à jour les détails' : 'Planifiez une consultation'}</p>
          </div>
        </div>
        {onClose && (
          <button className="af-close-btn" onClick={onClose} type="button" aria-label="Fermer">
            <FiX />
          </button>
        )}
      </div>

      {/* Step indicator */}
      <div className="af-steps">
        {STEPS.map((s, i) => {
          const Icon = s.icon;
          const done = step > s.id;
          const active = step === s.id;
          return (
            <React.Fragment key={s.id}>
              <div className={`af-step ${active ? 'active' : ''} ${done ? 'completed' : ''}`}>
                <div className="af-step-circle">
                  {done ? <FiCheck /> : <Icon />}
                </div>
                <span className="af-step-label">{s.label}</span>
              </div>
              {i < STEPS.length - 1 && (
                <div className={`af-step-line ${done ? 'completed' : ''}`} />
              )}
            </React.Fragment>
          );
        })}
      </div>

      {/* Form */}
      <form className="af-form" onSubmit={handleSubmit} noValidate>

        {/* ── Step 1: Patient ── */}
        {step === 1 && (
          <div className="af-section">
            <div className="af-section-title">
              <FiUser className="af-section-icon" />
              <span>Sélectionner le patient</span>
            </div>

            <div className="af-search-box">
              <FiSearch className="af-search-icon" />
              <input
                className="af-search-input"
                type="text"
                placeholder="Rechercher un patient..."
                value={patSearch}
                onChange={e => setPatSearch(e.target.value)}
              />
            </div>

            <div className="af-patient-list">
              {loadingPats ? (
                <div className="af-loading">Chargement des patients...</div>
              ) : filteredPatients.length === 0 ? (
                <div className="af-empty">Aucun patient trouvé</div>
              ) : (
                filteredPatients.map(p => (
                  <label
                    key={p.id}
                    className={`af-patient-card ${form.patientId == p.id ? 'selected' : ''}`}
                  >
                    <input
                      type="radio"
                      name="patientId"
                      value={p.id}
                      checked={form.patientId == p.id}
                      onChange={handleChange}
                      hidden
                    />
                    <div className="af-patient-avatar">
                      {p.gender?.toLowerCase() === 'femme' ? '👩' : '👨'}
                    </div>
                    <div className="af-patient-info">
                      <span className="af-patient-name">{p.first_name} {p.last_name}</span>
                      <span className="af-patient-meta">{p.age} ans • {p.primary_diagnosis || '-'}</span>
                    </div>
                    {form.patientId == p.id && (
                      <div className="af-patient-check"><FiCheck /></div>
                    )}
                  </label>
                ))
              )}
            </div>
            {errors.patientId && (
              <span className="af-error-msg"><FiAlertCircle />{errors.patientId}</span>
            )}
          </div>
        )}

        {/* ── Step 2: Date & Time ── */}
        {step === 2 && (
          <div className="af-section">
            <div className="af-section-title">
              <FiCalendar className="af-section-icon" />
              <span>Date & Heure</span>
            </div>

            {selectedPatient && (
              <div className="af-selected-patient-banner">
                <span className="af-banner-avatar">
                  {selectedPatient.gender?.toLowerCase() === 'femme' ? '👩' : '👨'}
                </span>
                <span className="af-banner-name">{selectedPatient.first_name} {selectedPatient.last_name}</span>
              </div>
            )}

            <div className="af-field">
              <label className="af-label">Date & Heure <span className="af-required">*</span></label>
              {lockDate ? (
                <>
                  <div className="af-summary-pill">
                    <FiCalendar /> {defaultDate ? new Date(defaultDate).toLocaleDateString('fr-FR') : '-'}
                  </div>
                  <div className="af-input-icon-wrapper">
                    <FiClock className="af-input-icon" />
                    <input
                      className={`af-input af-input-with-icon ${errors.datetime_scheduled ? 'af-input-error' : ''}`}
                      type="time"
                      name="time"
                      value={form.time}
                      onChange={handleTimeChange}
                    />
                  </div>
                </>
              ) : (
                <div className="af-input-icon-wrapper">
                  <FiCalendar className="af-input-icon" />
                  <input
                    className={`af-input af-input-with-icon ${errors.datetime_scheduled ? 'af-input-error' : ''}`}
                    type="datetime-local"
                    name="datetime_scheduled"
                    value={form.datetime_scheduled}
                    onChange={handleChange}
                    min={new Date().toISOString().slice(0, 16)}
                  />
                </div>
              )}
              {errors.datetime_scheduled && <span className="af-error-msg"><FiAlertCircle />{errors.datetime_scheduled}</span>}
            </div>
          </div>
        )}

        {/* ── Step 3: Consultation details ── */}
        {step === 3 && (
          <div className="af-section">
            <div className="af-section-title">
              <FiFileText className="af-section-icon" />
              <span>Type de consultation</span>
            </div>

            {/* Summary pill */}
            {form.datetime_scheduled && (
              <div className="af-summary-pill">
                <FiCalendar /> {new Date(form.datetime_scheduled).toLocaleString('fr-FR')}
              </div>
            )}

            <div className="af-field">
              <label className="af-label">Type <span className="af-required">*</span></label>
              <div className="af-type-grid">
                {CONSULT_TYPES.map(ct => (
                  <button
                    key={ct.value}
                    type="button"
                    className={`af-type-card ${form.type === ct.value ? 'selected' : ''}`}
                    onClick={() => { setForm(f => ({ ...f, type: ct.value })); setErrors(e => ({ ...e, type: '' })); }}
                  >
                    <span className="af-type-icon">{ct.icon}</span>
                    <span className="af-type-label">{ct.value}</span>
                  </button>
                ))}
              </div>
              {errors.type && <span className="af-error-msg"><FiAlertCircle />{errors.type}</span>}
            </div>

            <div className="af-field">
              <label className="af-label">Durée estimée</label>
              <div className="af-duration-group">
                {DURATIONS.map(d => (
                  <label key={d.value} className={`af-dur-chip ${form.duration === d.value ? 'selected' : ''}`}>
                    <input
                      type="radio"
                      name="duration"
                      value={d.value}
                      checked={form.duration === d.value}
                      onChange={handleChange}
                      hidden
                    />
                    {d.label}
                  </label>
                ))}
              </div>
            </div>

            <div className="af-field">
              <label className="af-label">Motif / Notes <span className="af-optional">(optionnel)</span></label>
              <textarea
                className="af-textarea"
                name="notes"
                value={form.notes}
                onChange={handleChange}
                placeholder="Décrivez le motif de la consultation..."
                rows={3}
              />
            </div>

            {errors.submit && (
              <div className="af-error-banner">
                <FiAlertCircle /><span>{errors.submit}</span>
              </div>
            )}
          </div>
        )}

        {/* Navigation */}
        <div className="af-nav">
          {step > 1
            ? <button type="button" className="af-btn-back" onClick={handleBack}><FiChevronLeft /> Précédent</button>
            : <div />
          }
          <div className="af-nav-right">
            {onClose && (
              <button type="button" className="af-btn-cancel" onClick={onClose}>Annuler</button>
            )}
            {step < 3
              ? <button type="button" className="af-btn-next" onClick={handleNext}>Suivant <FiChevronRight /></button>
              : (
                <button type="submit" className="af-btn-submit" disabled={isSubmitting}>
                  {isSubmitting
                    ? <span className="af-spinner" />
                    : <><FiCheck /> Créer le rendez-vous</>
                  }
                </button>
              )
            }
          </div>
        </div>
      </form>
    </div>
  );
}

export default AppointmentForm;
