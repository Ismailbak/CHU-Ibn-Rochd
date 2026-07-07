import React, { useState, useRef, useEffect } from 'react';
import { 
  FiAlertCircle, FiCheckCircle, FiChevronDown, FiPlus, FiTrash2, FiCheck,
  FiActivity, FiThermometer, FiDroplet, FiCalendar, FiTarget, FiBox, FiClock,
  FiFileText, FiSearch, FiLayers, FiShield, FiZap, FiEdit3, FiInfo, FiHash
} from 'react-icons/fi';
import useFormNavigation from '../../hooks/useFormNavigation';
import './AllForms.css';

export const CLINICAL_FORM_AUTOSAVE_EVENT = 'clinical-form-autosave';

function useClinicalFormAutoSave(formData, onSubmit, prepareData = data => data) {
  const latestRef = useRef({ formData, onSubmit, prepareData });

  latestRef.current = { formData, onSubmit, prepareData };

  useEffect(() => {
    const handleAutoSave = (event) => {
      const { formData: latestData, onSubmit: latestSubmit, prepareData: latestPrepare } = latestRef.current;
      const savePromise = Promise.resolve(latestSubmit(latestPrepare(latestData)));
      event.detail?.register?.(savePromise);
    };

    window.addEventListener(CLINICAL_FORM_AUTOSAVE_EVENT, handleAutoSave);
    return () => window.removeEventListener(CLINICAL_FORM_AUTOSAVE_EVENT, handleAutoSave);
  }, []);
}

function preparePainFormData(data) {
  const processedData = { ...data };
  ['pain_locations', 'pain_character', 'aggravating_factors', 'relieving_factors'].forEach(field => {
    if (typeof processedData[field] === 'string' && processedData[field].trim() !== '') {
      processedData[field] = processedData[field].split(',').map(s => s.trim()).filter(Boolean);
    } else if (typeof processedData[field] === 'string' || processedData[field] === null) {
      processedData[field] = [];
    }
  });
  return processedData;
}

/**
 * RD Form: Consultation Rhumatisme Dégénératif (Degenerative Rheumatism)
 */
export const FormCsRd = ({ onSubmit, initialData = {} }) => {
  const [formData, setFormData] = useState({
    form_date: initialData.form_date || new Date().toISOString().split('T')[0],
    current_treatment_none: initialData.current_treatment_none || 0,
    current_treatment_json: initialData.current_treatment_json || [],
    arthralgie_present: initialData.arthralgie_present || 0,
    arthralgie_horaire: initialData.arthralgie_horaire || '',
    arthralgie_duration: initialData.arthralgie_duration || '',
    arthralgie_locations: initialData.arthralgie_locations || [],
    joint_swelling_present: initialData.joint_swelling_present || 0,
    joint_swelling_locations: initialData.joint_swelling_locations || [],
    rachialgie_present: initialData.rachialgie_present || 0,
    rachialgie_horaire: initialData.rachialgie_horaire || '',
    rachialgie_duration: initialData.rachialgie_duration || '',
    rachialgie_locations: initialData.rachialgie_locations || [],
    other_signs_text: initialData.other_signs_text || '',
    articular_index: initialData.articular_index || null,
    synovial_index: initialData.synovial_index || null,
    clinical_examination_notes: initialData.clinical_examination_notes || '',
    imaging_xray: initialData.imaging_xray || 0,
    imaging_xray_findings: initialData.imaging_xray_findings || '',
    imaging_ultrasound: initialData.imaging_ultrasound || 0,
    imaging_ultrasound_findings: initialData.imaging_ultrasound_findings || '',
    imaging_mri: initialData.imaging_mri || 0,
    imaging_mri_findings: initialData.imaging_mri_findings || '',
    diagnosis_osteoarthritis_json: initialData.diagnosis_osteoarthritis_json || [],
    diagnosis_other_text: initialData.diagnosis_other_text || '',
    treatment_decision: initialData.treatment_decision || '',
    prescription: initialData.prescription || '',
    additional_notes: initialData.additional_notes || '',
  });

  const [expandedSections, setExpandedSections] = useState({
    treatment: true,
    signs: true,
    exam: true,
    labs: true,
    imaging: true,
    diagnosis: true,
    plan: true
  });

  // Form navigation ref
  const formRef = useRef(null);

  // Setup keyboard navigation between fields
  useFormNavigation(formRef);

  const toggleSection = () => {
    setExpandedSections(prev => prev);
  };

  const handleInputChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleCheckboxChange = (field, checked) => {
    setFormData(prev => ({ ...prev, [field]: checked ? 1 : 0 }));
  };

  const handleArrayChange = (field, index, value) => {
    setFormData(prev => {
      const updated = [...(prev[field] || [])];
      updated[index] = value;
      return { ...prev, [field]: updated };
    });
  };

  const handleAddArrayItem = (field, defaultValue = '') => {
    setFormData(prev => ({
      ...prev,
      [field]: [...(prev[field] || []), defaultValue]
    }));
  };

  const handleRemoveArrayItem = (field, index) => {
    setFormData(prev => ({
      ...prev,
      [field]: (prev[field] || []).filter((_, i) => i !== index)
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    e.stopPropagation();
    onSubmit(formData);
  };

  useClinicalFormAutoSave(formData, onSubmit);

  return (
    <div className="medical-form" ref={formRef} onKeyDown={(e) => {
      if (e.key === 'Enter' && e.ctrlKey) handleSubmit(e);
    }}>
      <div className="form-header">
        <h2>Consultation Rhumatisme Dégénératif</h2>
        <div className="form-row" style={{ marginTop: '1rem', marginBottom: 0 }}>
          <div className="form-group">
            <label>Date de la consultation</label>
            <input
              type="date"
              name="form_date"
              value={formData.form_date}
              onChange={(e) => handleInputChange('form_date', e.target.value)}
              className="form-input"
              style={{ maxWidth: '200px' }}
            />
          </div>
        </div>
      </div>

      {/* SECTION 1: CURRENT TREATMENT */}
      <div className="form-section">
        <button type="button" className="section-header" onClick={() => toggleSection('treatment')}>
          <FiChevronDown style={{ transform: expandedSections.treatment ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.3s' }} />
          <span>Traitement en cours</span>
        </button>
        {expandedSections.treatment && (
          <div className="section-content">
            <div className="form-group">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={formData.current_treatment_none === 1}
                  onChange={(e) => handleCheckboxChange('current_treatment_none', e.target.checked)}
                />
                <span>Aucun traitement en cours</span>
              </label>
            </div>
            
            {formData.current_treatment_none === 0 && (
              <div style={{ marginTop: '1.5rem' }}>
                <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#6b7280', marginBottom: '0.75rem', display: 'block' }}>
                  Médicaments actuels
                </label>
                {(formData.current_treatment_json || []).map((med, idx) => (
                  <div key={idx} className="array-item-row">
                    <div className="form-group">
                      <input
                        type="text"
                        placeholder="Nom du médicament"
                        value={med.type || ''}
                        onChange={(e) => handleArrayChange('current_treatment_json', idx, { ...med, type: e.target.value })}
                        className="form-input"
                      />
                    </div>
                    <div className="form-group">
                      <input
                        type="date"
                        value={med.start_date || ''}
                        onChange={(e) => handleArrayChange('current_treatment_json', idx, { ...med, start_date: e.target.value })}
                        className="form-input"
                      />
                    </div>
                    <button
                      type="button"
                      className="btn-remove-row"
                      onClick={() => handleRemoveArrayItem('current_treatment_json', idx)}
                      aria-label="Supprimer"
                    >
                      <FiTrash2 />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className="btn-add btn-add-inline"
                  onClick={() => handleAddArrayItem('current_treatment_json', { type: '', start_date: '' })}
                >
                  <FiPlus /> Ajouter un médicament
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* SECTION 2: FUNCTIONAL SIGNS */}
      <div className="form-section">
        <button type="button" className="section-header" onClick={() => toggleSection('signs')}>
          <FiChevronDown style={{ transform: expandedSections.signs ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.3s' }} />
          <span>Signes fonctionnels</span>
        </button>
        {expandedSections.signs && (
          <div className="section-content">
            {/* Arthralgie */}
            <div className="form-group" style={{ marginBottom: '1.5rem' }}>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={formData.arthralgie_present === 1}
                  onChange={(e) => handleCheckboxChange('arthralgie_present', e.target.checked)}
                />
                <span style={{ fontWeight: 600 }}>Arthralgie (Douleur articulaire)</span>
              </label>
              {formData.arthralgie_present === 1 && (
                <div className="info-box" style={{ flexDirection: 'column', gap: '1rem', background: '#f8fafc' }}>
                  <div className="form-row" style={{ marginBottom: 0 }}>
                    <div className="form-group">
                      <label>Horaire</label>
                      <select
                        value={formData.arthralgie_horaire}
                        onChange={(e) => handleInputChange('arthralgie_horaire', e.target.value)}
                        className="form-input"
                      >
                        <option value="">Sélectionner</option>
                        <option value="Mecanique">Mécanique</option>
                        <option value="Inflammatoire">Inflammatoire</option>
                        <option value="Mixte">Mixte</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label>Durée</label>
                      <input
                        type="text"
                        placeholder="ex: 3 mois"
                        value={formData.arthralgie_duration}
                        onChange={(e) => handleInputChange('arthralgie_duration', e.target.value)}
                        className="form-input"
                      />
                    </div>
                  </div>
                  <div className="form-group">
                    <label>Siège(s) (séparés par des virgules)</label>
                    <input
                      type="text"
                      placeholder="ex: Genoux, Hanches"
                      value={(formData.arthralgie_locations || []).join(', ')}
                      onChange={(e) => handleInputChange('arthralgie_locations', e.target.value.split(',').map(s => s.trim()))}
                      className="form-input"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Joint Swelling */}
            <div className="form-group" style={{ marginBottom: '1.5rem' }}>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={formData.joint_swelling_present === 1}
                  onChange={(e) => handleCheckboxChange('joint_swelling_present', e.target.checked)}
                />
                <span style={{ fontWeight: 600 }}>Gonflement articulaire</span>
              </label>
              {formData.joint_swelling_present === 1 && (
                <div className="info-box" style={{ background: '#f8fafc' }}>
                  <div className="form-group">
                    <label>Siège(s)</label>
                    <input
                      type="text"
                      placeholder="Localisation du gonflement..."
                      value={(formData.joint_swelling_locations || []).join(', ')}
                      onChange={(e) => handleInputChange('joint_swelling_locations', e.target.value.split(',').map(s => s.trim()))}
                      className="form-input"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Rachialgie */}
            <div className="form-group">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={formData.rachialgie_present === 1}
                  onChange={(e) => handleCheckboxChange('rachialgie_present', e.target.checked)}
                />
                <span style={{ fontWeight: 600 }}>Rachialgie (Douleur du rachis)</span>
              </label>
              {formData.rachialgie_present === 1 && (
                <div className="info-box" style={{ flexDirection: 'column', gap: '1rem', background: '#f8fafc' }}>
                  <div className="form-row" style={{ marginBottom: 0 }}>
                    <div className="form-group">
                      <label>Horaire</label>
                      <select
                        value={formData.rachialgie_horaire}
                        onChange={(e) => handleInputChange('rachialgie_horaire', e.target.value)}
                        className="form-input"
                      >
                        <option value="">Sélectionner</option>
                        <option value="Mecanique">Mécanique</option>
                        <option value="Inflammatoire">Inflammatoire</option>
                        <option value="Mixte">Mixte</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label>Siège</label>
                      <input
                        type="text"
                        placeholder="Cervical, Dorsal, Lombaire"
                        value={(formData.rachialgie_locations || []).join(', ')}
                        onChange={(e) => handleInputChange('rachialgie_locations', e.target.value.split(',').map(s => s.trim()))}
                        className="form-input"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="form-group" style={{ marginTop: '1.5rem' }}>
              <label>Autres signes et observations</label>
              <textarea
                placeholder="Notes additionnelles sur les symptômes..."
                value={formData.other_signs_text}
                onChange={(e) => handleInputChange('other_signs_text', e.target.value)}
                className="form-textarea"
                rows={3}
              />
            </div>
          </div>
        )}
      </div>

      {/* SECTION 3: PHYSICAL EXAMINATION */}
      <div className="form-section">
        <button type="button" className="section-header" onClick={() => toggleSection('exam')}>
          <FiChevronDown style={{ transform: expandedSections.exam ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.3s' }} />
          <span>Examen clinique</span>
        </button>
        {expandedSections.exam && (
          <div className="section-content">
            <div className="form-row">
              <div className="form-group">
                <label>Indice articulaire</label>
                <input
                  type="number"
                  placeholder="0"
                  value={formData.articular_index}
                  onChange={(e) => handleInputChange('articular_index', e.target.value === '' ? null : Number(e.target.value))}
                  className="form-input"
                />
              </div>
              <div className="form-group">
                <label>Indice synovial</label>
                <input
                  type="number"
                  placeholder="0"
                  value={formData.synovial_index}
                  onChange={(e) => handleInputChange('synovial_index', e.target.value === '' ? null : Number(e.target.value))}
                  className="form-input"
                />
              </div>
            </div>
            <div className="form-group">
              <label>Observations de l'examen physique</label>
              <textarea
                placeholder="Détails de l'examen clinique..."
                value={formData.clinical_examination_notes}
                onChange={(e) => handleInputChange('clinical_examination_notes', e.target.value)}
                className="form-textarea"
                rows={4}
              />
            </div>
          </div>
        )}
      </div>

      {/* SECTION 4: IMAGING */}
      <div className="form-section">
        <button type="button" className="section-header" onClick={() => toggleSection('imaging')}>
          <FiChevronDown style={{ transform: expandedSections.imaging ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.3s' }} />
          <span>Imagerie</span>
        </button>
        {expandedSections.imaging && (
          <div className="section-content">
            {/* Radiologie */}
            <div className="form-group" style={{ marginBottom: '1.5rem' }}>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={formData.imaging_xray === 1}
                  onChange={(e) => handleCheckboxChange('imaging_xray', e.target.checked)}
                />
                <span style={{ fontWeight: 600 }}>Radiologie standard</span>
              </label>
              {formData.imaging_xray === 1 && (
                <textarea
                  placeholder="Résultats radiologiques..."
                  value={formData.imaging_xray_findings}
                  onChange={(e) => handleInputChange('imaging_xray_findings', e.target.value)}
                  className="form-textarea"
                  style={{ marginTop: '0.5rem' }}
                  rows={2}
                />
              )}
            </div>

            {/* Ultrasound */}
            <div className="form-group" style={{ marginBottom: '1.5rem' }}>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={formData.imaging_ultrasound === 1}
                  onChange={(e) => handleCheckboxChange('imaging_ultrasound', e.target.checked)}
                />
                <span style={{ fontWeight: 600 }}>Échographie</span>
              </label>
              {formData.imaging_ultrasound === 1 && (
                <textarea
                  placeholder="Résultats échographiques..."
                  value={formData.imaging_ultrasound_findings}
                  onChange={(e) => handleInputChange('imaging_ultrasound_findings', e.target.value)}
                  className="form-textarea"
                  style={{ marginTop: '0.5rem' }}
                  rows={2}
                />
              )}
            </div>

            {/* MRI */}
            <div className="form-group">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={formData.imaging_mri === 1}
                  onChange={(e) => handleCheckboxChange('imaging_mri', e.target.checked)}
                />
                <span style={{ fontWeight: 600 }}>IRM / Scanner</span>
              </label>
              {formData.imaging_mri === 1 && (
                <textarea
                  placeholder="Résultats IRM ou Scanner..."
                  value={formData.imaging_mri_findings}
                  onChange={(e) => handleInputChange('imaging_mri_findings', e.target.value)}
                  className="form-textarea"
                  style={{ marginTop: '0.5rem' }}
                  rows={2}
                />
              )}
            </div>
          </div>
        )}
      </div>

      {/* SECTION 5: DIAGNOSIS */}
      <div className="form-section">
        <button type="button" className="section-header" onClick={() => toggleSection('diagnosis')}>
          <FiChevronDown style={{ transform: expandedSections.diagnosis ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.3s' }} />
          <span>Diagnostic</span>
        </button>
        {expandedSections.diagnosis && (
          <div className="section-content">
            <div className="form-group">
              <label>Arthrose - Détails et Localisations</label>
              {(formData.diagnosis_osteoarthritis_json || []).map((dx, idx) => (
                <div key={idx} className="array-item-row">
                  <div className="form-group">
                    <input
                      type="text"
                      placeholder="Articulation (ex: Genou droit)"
                      value={dx.joint || ''}
                      onChange={(e) => handleArrayChange('diagnosis_osteoarthritis_json', idx, { ...dx, joint: e.target.value })}
                      className="form-input"
                    />
                  </div>
                  <div className="form-group">
                    <select 
                      value={dx.grade || ''} 
                      onChange={(e) => handleArrayChange('diagnosis_osteoarthritis_json', idx, { ...dx, grade: e.target.value })}
                      className="form-input form-select"
                    >
                      <option value="">Grade K&L</option>
                      <option value="1">I</option>
                      <option value="2">II</option>
                      <option value="3">III</option>
                      <option value="4">IV</option>
                    </select>
                  </div>
                  <button
                    type="button"
                    className="btn-remove-row"
                    onClick={() => handleRemoveArrayItem('diagnosis_osteoarthritis_json', idx)}
                    aria-label="Supprimer"
                  >
                    <FiTrash2 />
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="btn-add btn-add-inline"
                onClick={() => handleAddArrayItem('diagnosis_osteoarthritis_json', { joint: '', grade: '' })}
              >
                <FiPlus /> Ajouter un diagnostic d'arthrose
              </button>
            </div>

            <div className="form-group" style={{ marginTop: '2rem' }}>
              <label>Autres diagnostics et impressions</label>
              <textarea
                placeholder="Autres diagnostics..."
                value={formData.diagnosis_other_text}
                onChange={(e) => handleInputChange('diagnosis_other_text', e.target.value)}
                className="form-textarea"
                rows={4}
              />
            </div>
          </div>
        )}
      </div>

      {/* SECTION 6: TREATMENT PLAN */}
      <div className="form-section">
        <button type="button" className="section-header" onClick={() => toggleSection('plan')}>
          <FiChevronDown style={{ transform: expandedSections.plan ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.3s' }} />
          <span>Conduite à tenir</span>
        </button>
        {expandedSections.plan && (
          <div className="section-content">
            <div className="form-row">
              <div className="form-group">
                <label>Décision thérapeutique</label>
                <select
                  value={formData.treatment_decision}
                  onChange={(e) => handleInputChange('treatment_decision', e.target.value)}
                  className="form-input"
                >
                  <option value="">-- Sélectionner --</option>
                  <option value="starting">Démarrage d'un traitement</option>
                  <option value="maintain">Maintien du traitement</option>
                  <option value="stop">Arrêt du traitement</option>
                </select>
              </div>
            </div>

            <div className="form-group" style={{ marginTop: '1rem' }}>
              <label>Prescription</label>
              <textarea
                placeholder="Détails de la prescription (médicaments, doses, durée)..."
                value={formData.prescription}
                onChange={(e) => handleInputChange('prescription', e.target.value)}
                className="form-textarea"
                rows={4}
              />
            </div>

            <div className="form-group" style={{ marginTop: '1rem' }}>
              <label>Conseils et suivi</label>
              <textarea
                placeholder="Notes additionnelles et conseils donnés au patient..."
                value={formData.additional_notes}
                onChange={(e) => handleInputChange('additional_notes', e.target.value)}
                className="form-textarea"
                rows={3}
              />
            </div>
          </div>
        )}
      </div>

      {/* SUBMIT */}
      <div className="form-actions">
        <button type="button" className="btn-submit" onClick={handleSubmit}>
          <FiCheckCircle /> Enregistrer le formulaire
        </button>
      </div>
    </div>
  );
};

/**
 * RIC Form: Rhumatismes Inflammatoires Chroniques (Inflammatory Arthritis)
 */
export const FormCsRic = ({ onSubmit, initialData = {} }) => {
  const [formData, setFormData] = useState({
    crp_value: initialData.crp_value || null,
    crp_date: initialData.crp_date || null,
    esr_value: initialData.esr_value || null,
    esr_date: initialData.esr_date || null,
    das28_score: initialData.das28_score || null,
    tender_joint_count: initialData.tender_joint_count || null,
    swollen_joint_count: initialData.swollen_joint_count || null,
    morning_stiffness_duration: initialData.morning_stiffness_duration || null,
    affected_joints: initialData.affected_joints || [],
    fever_present: initialData.fever_present || false,
    fatigue_level: initialData.fatigue_level || 5,
    dmards_json: initialData.dmards_json || [],
    biologics_json: initialData.biologics_json || [],
    treatment_response: initialData.treatment_response || 'Partial',
    clinical_notes: initialData.clinical_notes || '',
  });

  const [expandedSections, setExpandedSections] = useState({
    markers: true,
    activity: true,
    joints: true,
    symptoms: true,
    medications: true,
  });

  const toggleSection = () => {
    setExpandedSections(prev => prev);
  };

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : (type === 'number' ? (value === '' ? null : Number(value)) : value)
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(formData);
  };

  useClinicalFormAutoSave(formData, onSubmit);

  // Form navigation ref
  const formRef = useRef(null);

  // Setup keyboard navigation between fields
  useFormNavigation(formRef);

  return (
    <div className="medical-form" ref={formRef} onKeyDown={(e) => {
      if (e.key === 'Enter' && e.ctrlKey) handleSubmit(e);
    }}>
      <div className="form-header">
        <h2>Consultation RIC</h2>
        <p>Rhumatismes Inflammatoires Chroniques - Évaluation de l'activité</p>
      </div>

      {/* SECTION 1: INFLAMMATORY MARKERS */}
      <div className="form-section">
        <button 
          type="button"
          className="section-header"
          onClick={() => toggleSection('markers')}
        >
          <div className="section-header-left">
            <FiChevronDown style={{ transform: expandedSections.markers ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.3s' }} />
            <FiDroplet className="section-icon" />
            <span>Marqueurs Inflammatoires</span>
          </div>
        </button>
        
        {expandedSections.markers && (
          <div className="section-content">
            <div className="form-row">
              <div className="form-group">
                <label>CRP (C-Reactive Protein)</label>
                <div className="input-with-unit">
                  <input 
                    type="number" 
                    step="0.1"
                    name="crp_value" 
                    value={formData.crp_value}
                    onChange={handleInputChange}
                    placeholder="0.0"
                    className="form-input"
                  />
                  <span className="input-unit">mg/L</span>
                </div>
              </div>
              <div className="form-group">
                <label>Date du dosage CRP</label>
                <input 
                  type="date" 
                  name="crp_date" 
                  value={formData.crp_date}
                  onChange={handleInputChange}
                  className="form-input"
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>VSH (Sedimentation Rate)</label>
                <div className="input-with-unit">
                  <input 
                    type="number" 
                    step="0.1"
                    name="esr_value" 
                    value={formData.esr_value}
                    onChange={handleInputChange}
                    placeholder="0.0"
                    className="form-input"
                  />
                  <span className="input-unit">mm/h</span>
                </div>
              </div>
              <div className="form-group">
                <label>Date du dosage VSH</label>
                <input 
                  type="date" 
                  name="esr_date" 
                  value={formData.esr_date}
                  onChange={handleInputChange}
                  className="form-input"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* SECTION 2: DISEASE ACTIVITY */}
      <div className="form-section">
        <button 
          type="button"
          className="section-header"
          onClick={() => toggleSection('activity')}
        >
          <div className="section-header-left">
            <FiChevronDown style={{ transform: expandedSections.activity ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.3s' }} />
            <FiActivity className="section-icon" />
            <span>Activité de la Maladie</span>
          </div>
        </button>
        
        {expandedSections.activity && (
          <div className="section-content">
            <div className="form-row">
              <div className="form-group">
                <label>Score DAS28</label>
                <input 
                  type="number" 
                  step="0.01"
                  name="das28_score" 
                  value={formData.das28_score}
                  onChange={handleInputChange}
                  placeholder="0.00"
                  className="form-input"
                  min="0"
                  max="10"
                />
              </div>
              <div className="form-group">
                <label>Articulations sensibles</label>
                <input 
                  type="number" 
                  name="tender_joint_count" 
                  value={formData.tender_joint_count}
                  onChange={handleInputChange}
                  placeholder="0"
                  className="form-input"
                  min="0"
                />
              </div>
              <div className="form-group">
                <label>Articulations gonflées</label>
                <input 
                  type="number" 
                  name="swollen_joint_count" 
                  value={formData.swollen_joint_count}
                  onChange={handleInputChange}
                  placeholder="0"
                  className="form-input"
                  min="0"
                />
              </div>
            </div>

            <div className="form-group">
              <label>Raideur matinale (minutes)</label>
              <div className="input-with-icon">
                <FiClock className="field-icon" />
                <input 
                  type="number" 
                  name="morning_stiffness_duration" 
                  value={formData.morning_stiffness_duration}
                  onChange={handleInputChange}
                  placeholder="30"
                  className="form-input"
                  min="0"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* SECTION 3: SYSTEMIC SYMPTOMS */}
      <div className="form-section">
        <button 
          type="button"
          className="section-header"
          onClick={() => toggleSection('symptoms')}
        >
          <div className="section-header-left">
            <FiChevronDown style={{ transform: expandedSections.symptoms ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.3s' }} />
            <FiThermometer className="section-icon" />
            <span>Symptômes Systémiques</span>
          </div>
        </button>
        
        {expandedSections.symptoms && (
          <div className="section-content">
            <div className="form-group">
              <label className="checkbox-label">
                <input 
                  type="checkbox" 
                  name="fever_present" 
                  checked={formData.fever_present}
                  onChange={handleInputChange}
                />
                <span>Fièvre présente</span>
              </label>
            </div>

            <div className="form-group">
              <label>Niveau de fatigue (1-10)</label>
              <input 
                type="number" 
                name="fatigue_level" 
                value={formData.fatigue_level}
                onChange={handleInputChange}
                min="1"
                max="10"
                className="form-input"
                style={{ maxWidth: '120px' }}
              />
            </div>
          </div>
        )}
      </div>

      {/* SECTION 4: MEDICATIONS */}
      <div className="form-section">
        <button 
          type="button"
          className="section-header"
          onClick={() => toggleSection('medications')}
        >
          <div className="section-header-left">
            <FiChevronDown style={{ transform: expandedSections.medications ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.3s' }} />
            <FiBox className="section-icon" />
            <span>Traitements & Réponse</span>
          </div>
        </button>
        
        {expandedSections.medications && (
          <div className="section-content">
            <div className="form-group">
              <label>Réponse globale au traitement</label>
              <select 
                name="treatment_response" 
                value={formData.treatment_response}
                onChange={handleInputChange}
                className="form-input"
              >
                <option value="Excellent">Excellente</option>
                <option value="Good">Bonne</option>
                <option value="Partial">Partielle</option>
                <option value="None">Absence de réponse</option>
              </select>
            </div>
          </div>
        )}
      </div>

      {/* NOTES */}
      <div className="form-section">
        <div className="section-header-simple">
          <FiEdit3 className="section-icon" />
          <label>Notes Cliniques & Observations</label>
        </div>
        <textarea 
          name="clinical_notes" 
          value={formData.clinical_notes}
          onChange={handleInputChange}
          placeholder="Détails cliniques, évolution, modifications thérapeutiques..."
          className="form-textarea"
          rows="4"
        />
      </div>

      {/* SUBMIT */}
      <div className="form-actions">
        <button type="button" className="btn-submit" onClick={handleSubmit}>
          <FiCheckCircle /> Enregistrer le bilan RIC
        </button>
      </div>
    </div>
  );
};

/**
 * OS Form: Ostéopathies Fragilisantes (Fragility Bone Disease)
 */
export const FormCsOs = ({ onSubmit, initialData = {} }) => {
  const [formData, setFormData] = useState({
    dxa_date: initialData.dxa_date || null,
    spine_tscore: initialData.spine_tscore || null,
    hip_tscore: initialData.hip_tscore || null,
    femoral_neck_tscore: initialData.femoral_neck_tscore || null,
    fracture_history_present: initialData.fracture_history_present || false,
    vertebral_fracture_present: initialData.vertebral_fracture_present || false,
    frax_major_osteoporotic: initialData.frax_major_osteoporotic || null,
    frax_hip_fracture: initialData.frax_hip_fracture || null,
    fall_risk: initialData.fall_risk || 'Moderate',
    vitamin_d_level: initialData.vitamin_d_level || null,
    physical_activity: initialData.physical_activity || 'Moderate',
    back_pain_present: initialData.back_pain_present || false,
    back_pain_severity: initialData.back_pain_severity || 5,
    clinical_notes: initialData.clinical_notes || '',
  });

  const [expandedSections, setExpandedSections] = useState({
    dxa: true,
    fractures: true,
    risk: true,
    vitamin: true,
  });

  const toggleSection = () => {
    setExpandedSections(prev => prev);
  };

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : (type === 'number' ? (value === '' ? null : Number(value)) : value)
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    e.stopPropagation();
    onSubmit(formData);
  };

  useClinicalFormAutoSave(formData, onSubmit);

  // Form navigation ref
  const formRef = useRef(null);

  // Setup keyboard navigation between fields
  useFormNavigation(formRef);

  return (
    <div className="medical-form" ref={formRef} onKeyDown={(e) => {
      if (e.key === 'Enter' && e.ctrlKey) handleSubmit(e);
    }}>
      <div className="form-header">
        <h2>Consultation Ostéopathies</h2>
        <p>Santé osseuse et évaluation du risque fracturaire (FRAX)</p>
      </div>

      {/* SECTION 1: DXA RESULTS */}
      <div className="form-section">
        <button 
          type="button"
          className="section-header"
          onClick={() => toggleSection('dxa')}
        >
          <div className="section-header-left">
            <FiChevronDown style={{ transform: expandedSections.dxa ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.3s' }} />
            <FiTarget className="section-icon" />
            <span>Résultats DXA</span>
          </div>
        </button>
        
        {expandedSections.dxa && (
          <div className="section-content">
            <div className="form-group">
              <label>Date de l'examen DXA</label>
              <input 
                type="date" 
                name="dxa_date" 
                value={formData.dxa_date}
                onChange={handleInputChange}
                className="form-input"
              />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>T-score Lombaire</label>
                <input 
                  type="number" 
                  step="0.01"
                  name="spine_tscore" 
                  value={formData.spine_tscore}
                  onChange={handleInputChange}
                  placeholder="-1.5"
                  className="form-input"
                />
              </div>
              <div className="form-group">
                <label>T-score Hanche</label>
                <input 
                  type="number" 
                  step="0.01"
                  name="hip_tscore" 
                  value={formData.hip_tscore}
                  onChange={handleInputChange}
                  placeholder="-1.5"
                  className="form-input"
                />
              </div>
              <div className="form-group">
                <label>T-score Col fémoral</label>
                <input 
                  type="number" 
                  step="0.01"
                  name="femoral_neck_tscore" 
                  value={formData.femoral_neck_tscore}
                  onChange={handleInputChange}
                  placeholder="-1.5"
                  className="form-input"
                />
              </div>
            </div>
            <div className="info-box" style={{ marginTop: '1rem' }}>
              <FiInfo />
              <span>Normal: &gt; -1 | Ostéopénie: -1 à -2.5 | Ostéoporose: &lt; -2.5</span>
            </div>
          </div>
        )}
      </div>

      {/* SECTION 2: FRACTURE HISTORY */}
      <div className="form-section">
        <button 
          type="button"
          className="section-header"
          onClick={() => toggleSection('fractures')}
        >
          <div className="section-header-left">
            <FiChevronDown style={{ transform: expandedSections.fractures ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.3s' }} />
            <FiHash className="section-icon" />
            <span>Historique de Fractures</span>
          </div>
        </button>
        
        {expandedSections.fractures && (
          <div className="section-content">
            <div className="form-row">
              <div className="form-group">
                <label className="checkbox-label">
                  <input 
                    type="checkbox" 
                    name="fracture_history_present" 
                    checked={formData.fracture_history_present}
                    onChange={handleInputChange}
                  />
                  <span>Antécédent de fracture</span>
                </label>
              </div>

              <div className="form-group">
                <label className="checkbox-label">
                  <input 
                    type="checkbox" 
                    name="vertebral_fracture_present" 
                    checked={formData.vertebral_fracture_present}
                    onChange={handleInputChange}
                  />
                  <span>Fracture vertébrale</span>
                </label>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* SECTION 3: FRAX & RISK */}
      <div className="form-section">
        <button 
          type="button"
          className="section-header"
          onClick={() => toggleSection('risk')}
        >
          <div className="section-header-left">
            <FiChevronDown style={{ transform: expandedSections.risk ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.3s' }} />
            <FiActivity className="section-icon" />
            <span>Score FRAX & Risque</span>
          </div>
        </button>
        
        {expandedSections.risk && (
          <div className="section-content">
            <div className="form-row">
              <div className="form-group">
                <label>FRAX Fracture Majeure</label>
                <div className="input-with-unit">
                  <input 
                    type="number" 
                    step="0.1"
                    name="frax_major_osteoporotic" 
                    value={formData.frax_major_osteoporotic}
                    onChange={handleInputChange}
                    placeholder="0.0"
                    className="form-input"
                  />
                  <span className="input-unit">%</span>
                </div>
              </div>
              <div className="form-group">
                <label>FRAX Hanche</label>
                <div className="input-with-unit">
                  <input 
                    type="number" 
                    step="0.1"
                    name="frax_hip_fracture" 
                    value={formData.frax_hip_fracture}
                    onChange={handleInputChange}
                    placeholder="0.0"
                    className="form-input"
                  />
                  <span className="input-unit">%</span>
                </div>
              </div>
            </div>

            <div className="form-group">
              <label>Risque de chute</label>
              <select 
                name="fall_risk" 
                value={formData.fall_risk}
                onChange={handleInputChange}
                className="form-input"
              >
                <option value="Low">Faible</option>
                <option value="Moderate">Modéré</option>
                <option value="High">Élevé</option>
              </select>
            </div>
          </div>
        )}
      </div>

      {/* SECTION 4: VITAMIN D & LIFESTYLE */}
      <div className="form-section">
        <button 
          type="button"
          className="section-header"
          onClick={() => toggleSection('vitamin')}
        >
          <div className="section-header-left">
            <FiChevronDown style={{ transform: expandedSections.vitamin ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.3s' }} />
            <FiZap className="section-icon" />
            <span>Biologie & Hygiène</span>
          </div>
        </button>
        
        {expandedSections.vitamin && (
          <div className="section-content">
            <div className="form-row">
              <div className="form-group">
                <label>Vitamine D</label>
                <div className="input-with-unit">
                  <input 
                    type="number" 
                    step="0.1"
                    name="vitamin_d_level" 
                    value={formData.vitamin_d_level}
                    onChange={handleInputChange}
                    placeholder="0.0"
                    className="form-input"
                  />
                  <span className="input-unit">ng/mL</span>
                </div>
              </div>

              <div className="form-group">
                <label>Activité physique</label>
                <select 
                  name="physical_activity" 
                  value={formData.physical_activity}
                  onChange={handleInputChange}
                  className="form-input"
                >
                  <option value="Sedentary">Sédentaire</option>
                  <option value="Light">Légère</option>
                  <option value="Moderate">Modérée</option>
                  <option value="Vigorous">Vigoureuse</option>
                </select>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* PAIN ASSESSMENT */}
      <div className="form-section">
        <div className="section-header-simple">
          <FiThermometer className="section-icon" />
          <label className="checkbox-label" style={{ fontWeight: 600 }}>
            <input 
              type="checkbox" 
              name="back_pain_present" 
              checked={formData.back_pain_present}
              onChange={handleInputChange}
            />
            <span>Douleur dorsale associée</span>
          </label>
        </div>

        {formData.back_pain_present && (
          <div style={{ marginTop: '1rem', padding: '0 1rem 1rem' }}>
            <div className="form-group">
              <label>Intensité de la douleur (1-10)</label>
              <input 
                type="number" 
                name="back_pain_severity" 
                value={formData.back_pain_severity}
                onChange={handleInputChange}
                min="1"
                max="10"
                className="form-input"
                style={{ maxWidth: '120px' }}
              />
            </div>
          </div>
        )}
      </div>

      {/* NOTES */}
      <div className="form-section">
        <div className="section-header-simple">
          <FiEdit3 className="section-icon" />
          <label>Notes Cliniques</label>
        </div>
        <textarea 
          name="clinical_notes" 
          value={formData.clinical_notes}
          onChange={handleInputChange}
          placeholder="Observations, antécédents familiaux, traitements en cours..."
          className="form-textarea"
          rows="4"
        />
      </div>

      {/* SUBMIT */}
      <div className="form-actions">
        <button type="button" className="btn-submit" onClick={handleSubmit}>
          <FiCheckCircle /> Enregistrer le bilan osseux
        </button>
      </div>
    </div>
  );
};

/**
 * ECHO Form: Consultation Échographie (Ultrasound)
 */
export const FormCsEcho = ({ onSubmit, initialData = {} }) => {
  const [formData, setFormData] = useState({
    echo_date: initialData.echo_date || null,
    anatomical_region: initialData.anatomical_region || 'Shoulder',
    indication: initialData.indication || '',
    side_examined: initialData.side_examined || 'Right',
    synovitis_present: initialData.synovitis_present || false,
    synovitis_grade: initialData.synovitis_grade || '0',
    effusion_present: initialData.effusion_present || false,
    effusion_volume: initialData.effusion_volume || 'None',
    bone_erosions_present: initialData.bone_erosions_present || false,
    doppler_performed: initialData.doppler_performed || false,
    doppler_hyperemia_present: initialData.doppler_hyperemia_present || false,
    impression: initialData.impression || '',
    recommendations: initialData.recommendations || '',
  });

  const [expandedSections, setExpandedSections] = useState({
    general: true,
    findings: true,
    doppler: true,
    impression: true,
  });

  const toggleSection = () => {
    setExpandedSections(prev => prev);
  };

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : (type === 'number' ? (value === '' ? null : Number(value)) : value)
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    e.stopPropagation();
    onSubmit(formData);
  };

  useClinicalFormAutoSave(formData, onSubmit);

  // Form navigation ref
  const formRef = useRef(null);

  // Setup keyboard navigation between fields
  useFormNavigation(formRef);

  return (
    <div className="medical-form" ref={formRef} onKeyDown={(e) => {
      if (e.key === 'Enter' && e.ctrlKey) handleSubmit(e);
    }}>
      <div className="form-header">
        <h2>Consultation Échographie</h2>
        <p>Bilan d'imagerie ostéo-articulaire et musculaire</p>
      </div>

      {/* SECTION 1: GENERAL */}
      <div className="form-section">
        <button 
          type="button"
          className="section-header"
          onClick={() => toggleSection('general')}
        >
          <div className="section-header-left">
            <FiChevronDown style={{ transform: expandedSections.general ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.3s' }} />
            <FiCalendar className="section-icon" />
            <span>Informations Générales</span>
          </div>
        </button>
        
        {expandedSections.general && (
          <div className="section-content">
            <div className="form-row">
              <div className="form-group">
                <label>Date de l'examen</label>
                <input 
                  type="date" 
                  name="echo_date" 
                  value={formData.echo_date}
                  onChange={handleInputChange}
                  required
                  className="form-input"
                />
              </div>
              <div className="form-group">
                <label>Région anatomique</label>
                <select 
                  name="anatomical_region" 
                  value={formData.anatomical_region}
                  onChange={handleInputChange}
                  className="form-input"
                >
                  <option value="Shoulder">Épaule</option>
                  <option value="Knee">Genou</option>
                  <option value="Hip">Hanche</option>
                  <option value="Ankle">Cheville</option>
                  <option value="Wrist">Poignet</option>
                  <option value="Elbow">Coude</option>
                  <option value="Foot">Pied</option>
                  <option value="Other">Autre</option>
                </select>
              </div>
              <div className="form-group">
                <label>Côté examiné</label>
                <select 
                  name="side_examined" 
                  value={formData.side_examined}
                  onChange={handleInputChange}
                  className="form-input"
                >
                  <option value="Right">Droit</option>
                  <option value="Left">Gauche</option>
                  <option value="Bilateral">Bilatéral</option>
                </select>
              </div>
            </div>

            <div className="form-group">
              <label>Indication clinique</label>
              <textarea 
                name="indication" 
                value={formData.indication}
                onChange={handleInputChange}
                placeholder="Raison de l'examen et contexte clinique..."
                className="form-textarea"
                rows="2"
              />
            </div>
          </div>
        )}
      </div>

      {/* SECTION 2: FINDINGS */}
      <div className="form-section">
        <button 
          type="button"
          className="section-header"
          onClick={() => toggleSection('findings')}
        >
          <div className="section-header-left">
            <FiChevronDown style={{ transform: expandedSections.findings ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.3s' }} />
            <FiSearch className="section-icon" />
            <span>Résultats & Constatations</span>
          </div>
        </button>
        
        {expandedSections.findings && (
          <div className="section-content">
            <div className="form-row">
              <div className="form-group">
                <label className="checkbox-label">
                  <input 
                    type="checkbox" 
                    name="synovitis_present" 
                    checked={formData.synovitis_present}
                    onChange={handleInputChange}
                  />
                  <span>Synovite présente</span>
                </label>
                {formData.synovitis_present && (
                  <select 
                    name="synovitis_grade" 
                    value={formData.synovitis_grade}
                    onChange={handleInputChange}
                    className="form-input"
                    style={{ marginTop: '0.75rem' }}
                  >
                    <option value="0">Grade 0 - Absent</option>
                    <option value="1">Grade 1 - Faible</option>
                    <option value="2">Grade 2 - Modéré</option>
                    <option value="3">Grade 3 - Sévère</option>
                  </select>
                )}
              </div>

              <div className="form-group">
                <label className="checkbox-label">
                  <input 
                    type="checkbox" 
                    name="effusion_present" 
                    checked={formData.effusion_present}
                    onChange={handleInputChange}
                  />
                  <span>Épanchement présent</span>
                </label>
                {formData.effusion_present && (
                  <select 
                    name="effusion_volume" 
                    value={formData.effusion_volume}
                    onChange={handleInputChange}
                    className="form-input"
                    style={{ marginTop: '0.75rem' }}
                  >
                    <option value="Small">Petit</option>
                    <option value="Moderate">Modéré</option>
                    <option value="Large">Important</option>
                  </select>
                )}
              </div>
            </div>

            <div className="form-group" style={{ marginTop: '1rem' }}>
              <label className="checkbox-label">
                <input 
                  type="checkbox" 
                  name="bone_erosions_present" 
                  checked={formData.bone_erosions_present}
                  onChange={handleInputChange}
                />
                <span>Érosions osseuses présentes</span>
              </label>
            </div>
          </div>
        )}
      </div>

      {/* SECTION 3: DOPPLER */}
      <div className="form-section">
        <button 
          type="button"
          className="section-header"
          onClick={() => toggleSection('doppler')}
        >
          <div className="section-header-left">
            <FiChevronDown style={{ transform: expandedSections.doppler ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.3s' }} />
            <FiZap className="section-icon" />
            <span>Doppler Énergie</span>
          </div>
        </button>
        
        {expandedSections.doppler && (
          <div className="section-content">
            <div className="form-row">
              <div className="form-group">
                <label className="checkbox-label">
                  <input 
                    type="checkbox" 
                    name="doppler_performed" 
                    checked={formData.doppler_performed}
                    onChange={handleInputChange}
                  />
                  <span>Examen Doppler effectué</span>
                </label>
              </div>

              {formData.doppler_performed && (
                <div className="form-group">
                  <label className="checkbox-label">
                    <input 
                      type="checkbox" 
                      name="doppler_hyperemia_present" 
                      checked={formData.doppler_hyperemia_present}
                      onChange={handleInputChange}
                    />
                    <span>Hyperhémie (Signal Doppler)</span>
                  </label>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* SECTION 4: IMPRESSION */}
      <div className="form-section">
        <button 
          type="button"
          className="section-header"
          onClick={() => toggleSection('impression')}
        >
          <div className="section-header-left">
            <FiChevronDown style={{ transform: expandedSections.impression ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.3s' }} />
            <FiFileText className="section-icon" />
            <span>Conclusion & Compte-rendu</span>
          </div>
        </button>
        
        {expandedSections.impression && (
          <div className="section-content">
            <div className="form-group">
              <label>Conclusion de l'examen *</label>
              <textarea 
                name="impression" 
                value={formData.impression}
                onChange={handleInputChange}
                placeholder="Synthèse des anomalies détectées et conclusion diagnostique..."
                className="form-textarea"
                required
                rows="4"
              />
            </div>

            <div className="form-group">
              <label>Recommandations de suivi</label>
              <textarea 
                name="recommendations" 
                value={formData.recommendations}
                onChange={handleInputChange}
                placeholder="Proposition de surveillance ou geste complémentaire..."
                className="form-textarea"
                rows="3"
              />
            </div>
          </div>
        )}
      </div>

      {/* SUBMIT */}
      <div className="form-actions">
        <button type="button" className="btn-submit" onClick={handleSubmit}>
          <FiCheckCircle /> Enregistrer le compte-rendu Echo
        </button>
      </div>
    </div>
  );
};

/**
 * GESTE Form: Consultation Gestes Techniques (Procedures)
 */
export const FormCsGeste = ({ onSubmit, initialData = {} }) => {
  const [formData, setFormData] = useState({
    procedure_date: initialData.procedure_date || null,
    procedure_type: initialData.procedure_type || 'Injection',
    anatomical_site: initialData.anatomical_site || '',
    side: initialData.side || 'Right',
    clinical_indication: initialData.clinical_indication || '',
    guidance_method: initialData.guidance_method || 'Palpation',
    anesthesia_used: initialData.anesthesia_used || false,
    product_injected: initialData.product_injected || '',
    fluid_aspirated_volume: initialData.fluid_aspirated_volume || null,
    patient_tolerance: initialData.patient_tolerance || 'Good',
    pain_during_procedure: initialData.pain_during_procedure || 5,
    complications_present: initialData.complications_present || false,
    follow_up_recommended: initialData.follow_up_recommended || false,
    clinical_notes: initialData.clinical_notes || '',
  });

  const [expandedSections, setExpandedSections] = useState({
    procedure: true,
    technique: true,
    findings: true,
    complications: true,
  });

  const toggleSection = () => {
    setExpandedSections(prev => prev);
  };

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : (type === 'number' ? (value === '' ? null : Number(value)) : value)
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(formData);
  };

  useClinicalFormAutoSave(formData, onSubmit);

  // Form navigation ref
  const formRef = useRef(null);

  // Setup keyboard navigation between fields
  useFormNavigation(formRef);

  return (
    <div className="medical-form" ref={formRef} onKeyDown={(e) => {
      if (e.key === 'Enter' && e.ctrlKey) handleSubmit(e);
    }}>
      <div className="form-header">
        <h2>Consultation Gestes Techniques</h2>
        <p>Documentation des procédures interventionnelles ostéo-articulaires</p>
      </div>

      {/* SECTION 1: PROCEDURE */}
      <div className="form-section">
        <button 
          type="button"
          className="section-header"
          onClick={() => toggleSection('procedure')}
        >
          <div className="section-header-left">
            <FiChevronDown style={{ transform: expandedSections.procedure ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.3s' }} />
            <FiCalendar className="section-icon" />
            <span>Détails de la Procédure</span>
          </div>
        </button>
        
        {expandedSections.procedure && (
          <div className="section-content">
            <div className="form-row">
              <div className="form-group">
                <label>Date et heure</label>
                <input 
                  type="datetime-local" 
                  name="procedure_date" 
                  value={formData.procedure_date}
                  onChange={handleInputChange}
                  required
                  className="form-input"
                />
              </div>
              <div className="form-group">
                <label>Type de procédure</label>
                <select 
                  name="procedure_type" 
                  value={formData.procedure_type}
                  onChange={handleInputChange}
                  className="form-input"
                >
                  <option value="Injection">Injection intra-articulaire</option>
                  <option value="Aspiration">Ponction évacuatrice</option>
                  <option value="Biopsy">Biopsie synoviale</option>
                  <option value="Infiltration">Infiltration péri-tendineuse</option>
                </select>
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Site anatomique *</label>
                <input 
                  type="text" 
                  name="anatomical_site" 
                  value={formData.anatomical_site}
                  onChange={handleInputChange}
                  placeholder="ex: Genou, Épaule, Poignet..."
                  required
                  className="form-input"
                />
              </div>
              <div className="form-group">
                <label>Côté</label>
                <select 
                  name="side" 
                  value={formData.side}
                  onChange={handleInputChange}
                  className="form-input"
                >
                  <option value="Right">Droit</option>
                  <option value="Left">Gauche</option>
                  <option value="Bilateral">Bilatéral</option>
                </select>
              </div>
            </div>

            <div className="form-group">
              <label>Indication clinique *</label>
              <textarea 
                name="clinical_indication" 
                value={formData.clinical_indication}
                onChange={handleInputChange}
                placeholder="Motif de l'intervention..."
                className="form-textarea"
                required
                rows="2"
              />
            </div>
          </div>
        )}
      </div>

      {/* SECTION 2: TECHNIQUE */}
      <div className="form-section">
        <button 
          type="button"
          className="section-header"
          onClick={() => toggleSection('technique')}
        >
          <div className="section-header-left">
            <FiChevronDown style={{ transform: expandedSections.technique ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.3s' }} />
            <FiLayers className="section-icon" />
            <span>Technique & Produits</span>
          </div>
        </button>
        
        {expandedSections.technique && (
          <div className="section-content">
            <div className="form-row">
              <div className="form-group">
                <label>Méthode de guidage</label>
                <select 
                  name="guidance_method" 
                  value={formData.guidance_method}
                  onChange={handleInputChange}
                  className="form-input"
                >
                  <option value="Palpation">Palpation (Repères anatomiques)</option>
                  <option value="Ultrasound">Écho-guidage</option>
                  <option value="Fluoroscopy">Radioscopie</option>
                </select>
              </div>

              <div className="form-group">
                <label className="checkbox-label" style={{ marginTop: '2.2rem' }}>
                  <input 
                    type="checkbox" 
                    name="anesthesia_used" 
                    checked={formData.anesthesia_used}
                    onChange={handleInputChange}
                  />
                  <span>Anesthésie locale</span>
                </label>
              </div>
            </div>

            <div className="form-group">
              <label>Produit injecté / Matériel</label>
              <div className="input-with-icon">
                <FiBox className="field-icon" />
                <input 
                  type="text" 
                  name="product_injected" 
                  value={formData.product_injected}
                  onChange={handleInputChange}
                  placeholder="ex: Diprostène, Altim, AH..."
                  className="form-input"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* SECTION 3: FINDINGS */}
      <div className="form-section">
        <button 
          type="button"
          className="section-header"
          onClick={() => toggleSection('findings')}
        >
          <div className="section-header-left">
            <FiChevronDown style={{ transform: expandedSections.findings ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.3s' }} />
            <FiDroplet className="section-icon" />
            <span>Résultats de la Ponction</span>
          </div>
        </button>
        
        {expandedSections.findings && (
          <div className="section-content">
            <div className="form-group">
              <label>Volume de liquide aspiré</label>
              <div className="input-with-unit">
                <input 
                  type="number" 
                  step="0.5"
                  name="fluid_aspirated_volume" 
                  value={formData.fluid_aspirated_volume}
                  onChange={handleInputChange}
                  placeholder="0.0"
                  className="form-input"
                />
                <span className="input-unit">mL</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* SECTION 4: COMPLICATIONS & TOLERANCE */}
      <div className="form-section">
        <button 
          type="button"
          className="section-header"
          onClick={() => toggleSection('complications')}
        >
          <div className="section-header-left">
            <FiChevronDown style={{ transform: expandedSections.complications ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.3s' }} />
            <FiShield className="section-icon" />
            <span>Tolérance & Suivi</span>
          </div>
        </button>
        
        {expandedSections.complications && (
          <div className="section-content">
            <div className="form-row">
              <div className="form-group">
                <label>Tolérance globale</label>
                <select 
                  name="patient_tolerance" 
                  value={formData.patient_tolerance}
                  onChange={handleInputChange}
                  className="form-input"
                >
                  <option value="Excellent">Excellente</option>
                  <option value="Good">Bonne</option>
                  <option value="Fair">Passable</option>
                  <option value="Poor">Mauvaise</option>
                </select>
              </div>

              <div className="form-group">
                <label>Douleur Procédure (1-10)</label>
                <input 
                  type="number" 
                  name="pain_during_procedure" 
                  value={formData.pain_during_procedure}
                  onChange={handleInputChange}
                  min="1"
                  max="10"
                  className="form-input"
                  style={{ maxWidth: '120px' }}
                />
              </div>
            </div>

            <div className="form-row" style={{ marginTop: '1rem' }}>
              <div className="form-group">
                <label className="checkbox-label">
                  <input 
                    type="checkbox" 
                    name="complications_present" 
                    checked={formData.complications_present}
                    onChange={handleInputChange}
                  />
                  <span>Complication immédiate</span>
                </label>
              </div>

              <div className="form-group">
                <label className="checkbox-label">
                  <input 
                    type="checkbox" 
                    name="follow_up_recommended" 
                    checked={formData.follow_up_recommended}
                    onChange={handleInputChange}
                  />
                  <span>Suivi spécifique requis</span>
                </label>
              </div>
            </div>

            <div className="form-group" style={{ marginTop: '1rem' }}>
              <label>Observations post-geste</label>
              <textarea 
                name="clinical_notes" 
                value={formData.clinical_notes}
                onChange={handleInputChange}
                placeholder="Détails sur l'aspect du liquide, réaction du patient..."
                className="form-textarea"
                rows="3"
              />
            </div>
          </div>
        )}
      </div>

      {/* SUBMIT */}
      <div className="form-actions">
        <button type="button" className="btn-submit" onClick={handleSubmit}>
          <FiCheckCircle /> Valider le geste technique
        </button>
      </div>
    </div>
  );
};

/**
 * SEANCES Form: Consultation Séances Thérapeutiques (Therapeutic Sessions)
 */

/**
 * SEANCES Form: Consultation Séances Thérapeutiques
 */
export const FormCsSeances = ({ onSubmit, initialData = {} }) => {
  const [formData, setFormData] = useState({
    session_date: initialData.session_date || null,
    session_duration: initialData.session_duration || '30',
    therapist_name: initialData.therapist_name || '',
    session_type: initialData.session_type || 'TENS',
    anatomical_regions: initialData.anatomical_regions || '',
    pain_before_session: initialData.pain_before_session || 5,
    pain_after_session: initialData.pain_after_session || 3,
    functional_improvement: initialData.functional_improvement || 'None',
    patient_comfort_level: initialData.patient_comfort_level || 'Good',
    patient_compliance: initialData.patient_compliance || 'Good',
    session_number_in_series: initialData.session_number_in_series || null,
    progress_notes: initialData.progress_notes || '',
  });

  const [expandedSections, setExpandedSections] = useState({
    session: true,
    parameters: true,
    assessment: true,
    progress: true,
  });

  const toggleSection = () => {
    setExpandedSections(prev => prev);
  };

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : (type === 'number' ? (value === '' ? null : Number(value)) : value)
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    e.stopPropagation();
    onSubmit(formData);
  };

  useClinicalFormAutoSave(formData, onSubmit);

  // Form navigation ref
  const formRef = useRef(null);

  // Setup keyboard navigation between fields
  useFormNavigation(formRef);

  return (
    <div className="medical-form" ref={formRef} onKeyDown={(e) => {
      if (e.key === 'Enter' && e.ctrlKey) handleSubmit(e);
    }}>
      <div className="form-header">
        <h2>Séances Thérapeutiques</h2>
        <p>Suivi de rééducation, physiothérapie et appareillage</p>
      </div>

      {/* SECTION 1: SESSION DETAILS */}
      <div className="form-section">
        <button 
          type="button"
          className="section-header"
          onClick={() => toggleSection('session')}
        >
          <div className="section-header-left">
            <FiChevronDown style={{ transform: expandedSections.session ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.3s' }} />
            <FiCalendar className="section-icon" />
            <span>Détails de la Séance</span>
          </div>
        </button>
        
        {expandedSections.session && (
          <div className="section-content">
            <div className="form-row">
              <div className="form-group">
                <label>Date</label>
                <input 
                  type="date" 
                  name="session_date" 
                  value={formData.session_date}
                  onChange={handleInputChange}
                  required
                  className="form-input"
                />
              </div>
              <div className="form-group">
                <label>Durée (min)</label>
                <div className="input-with-icon">
                  <FiClock className="field-icon" />
                  <input 
                    type="number" 
                    name="session_duration" 
                    value={formData.session_duration}
                    onChange={handleInputChange}
                    className="form-input"
                    min="0"
                  />
                </div>
              </div>
              <div className="form-group">
                <label>N° Séance</label>
                <input 
                  type="number" 
                  name="session_number_in_series" 
                  value={formData.session_number_in_series}
                  onChange={handleInputChange}
                  className="form-input"
                  min="1"
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Thérapeute / Intervenant</label>
                <input 
                  type="text" 
                  name="therapist_name" 
                  value={formData.therapist_name}
                  onChange={handleInputChange}
                  placeholder="Nom du praticien..."
                  className="form-input"
                />
              </div>
              <div className="form-group">
                <label>Type de séance</label>
                <select 
                  name="session_type" 
                  value={formData.session_type}
                  onChange={handleInputChange}
                  className="form-input"
                >
                  <option value="TENS">TENS / Électrostimulation</option>
                  <option value="Cryotherapy">Cryothérapie</option>
                  <option value="Heat">Thermothérapie</option>
                  <option value="Massage">Massage / Thérapie manuelle</option>
                  <option value="Stretching">Étirements / Gain de mobilité</option>
                  <option value="Strengthening">Renforcement musculaire</option>
                  <option value="Occupational">Ergothérapie</option>
                </select>
              </div>
            </div>

            <div className="form-group">
              <label>Régions anatomiques ciblées</label>
              <input 
                type="text" 
                name="anatomical_regions" 
                value={formData.anatomical_regions}
                onChange={handleInputChange}
                placeholder="ex: Rachis cervical, Genou bilatéral..."
                className="form-input"
              />
            </div>
          </div>
        )}
      </div>

      {/* SECTION 2: CLINICAL ASSESSMENT */}
      <div className="form-section">
        <button 
          type="button"
          className="section-header"
          onClick={() => toggleSection('assessment')}
        >
          <div className="section-header-left">
            <FiChevronDown style={{ transform: expandedSections.assessment ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.3s' }} />
            <FiActivity className="section-icon" />
            <span>Évaluation & Efficacité</span>
          </div>
        </button>
        
        {expandedSections.assessment && (
          <div className="section-content">
            <div className="form-row">
              <div className="form-group">
                <label>Douleur Avant (1-10)</label>
                <input 
                  type="number" 
                  name="pain_before_session" 
                  value={formData.pain_before_session}
                  onChange={handleInputChange}
                  min="1"
                  max="10"
                  className="form-input"
                  style={{ maxWidth: '120px' }}
                />
              </div>

              <div className="form-group">
                <label>Douleur Après (1-10)</label>
                <input 
                  type="number" 
                  name="pain_after_session" 
                  value={formData.pain_after_session}
                  onChange={handleInputChange}
                  min="1"
                  max="10"
                  className="form-input"
                  style={{ maxWidth: '120px' }}
                />
              </div>
            </div>

            <div className="form-row" style={{ marginTop: '1rem' }}>
              <div className="form-group">
                <label>Gain fonctionnel</label>
                <select 
                  name="functional_improvement" 
                  value={formData.functional_improvement}
                  onChange={handleInputChange}
                  className="form-input"
                >
                  <option value="None">Aucun</option>
                  <option value="Slight">Léger</option>
                  <option value="Moderate">Modéré</option>
                  <option value="Significant">Significatif</option>
                </select>
              </div>

              <div className="form-group">
                <label>Confort du patient</label>
                <select 
                  name="patient_comfort_level" 
                  value={formData.patient_comfort_level}
                  onChange={handleInputChange}
                  className="form-input"
                >
                  <option value="Poor">Mauvais</option>
                  <option value="Fair">Passable</option>
                  <option value="Good">Bon</option>
                  <option value="Excellent">Excellent</option>
                </select>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* SECTION 3: PROGRESS */}
      <div className="form-section">
        <button 
          type="button"
          className="section-header"
          onClick={() => toggleSection('progress')}
        >
          <div className="section-header-left">
            <FiChevronDown style={{ transform: expandedSections.progress ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.3s' }} />
            <FiEdit3 className="section-icon" />
            <span>Notes de Progression</span>
          </div>
        </button>
        
        {expandedSections.progress && (
          <div className="section-content">
            <div className="form-group">
              <label>Observations cliniques</label>
              <textarea 
                name="progress_notes" 
                value={formData.progress_notes}
                onChange={handleInputChange}
                placeholder="Évolution des amplitudes, force musculaire, adhérence au protocole..."
                className="form-textarea"
                rows="4"
              />
            </div>
          </div>
        )}
      </div>

      {/* SUBMIT */}
      <div className="form-actions">
        <button type="button" className="btn-submit" onClick={handleSubmit}>
          <FiCheckCircle /> Enregistrer la séance
        </button>
      </div>
    </div>
  );
};

/**
 * DXA Form: Consultation Ostéodensitométrie
 */
export const FormCsDxa = ({ onSubmit, initialData = {} }) => {
  const [formData, setFormData] = useState({
    scan_date: initialData.scan_date || null,
    scan_quality: initialData.scan_quality || 'Good',
    spine_tscore: initialData.spine_tscore || null,
    hip_tscore: initialData.hip_tscore || null,
    femoral_neck_tscore: initialData.femoral_neck_tscore || null,
    who_diagnosis_spine: initialData.who_diagnosis_spine || 'Normal',
    frax_major_fracture_probability: initialData.frax_major_fracture_probability || null,
    frax_hip_fracture_probability: initialData.frax_hip_fracture_probability || null,
    vfa_performed: initialData.vfa_performed || false,
    vertebral_deformities_present: initialData.vertebral_deformities_present || false,
    impression: initialData.impression || '',
    recommendations: initialData.recommendations || '',
  });

  const [expandedSections, setExpandedSections] = useState({
    general: true,
    scores: true,
    frax: true,
    impression: true,
  });

  const toggleSection = () => {
    setExpandedSections(prev => prev);
  };

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : (type === 'number' ? (value === '' ? null : Number(value)) : value)
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(formData);
  };

  useClinicalFormAutoSave(formData, onSubmit);

  // Form navigation ref
  const formRef = useRef(null);

  // Setup keyboard navigation between fields
  useFormNavigation(formRef);

  return (
    <div className="medical-form" ref={formRef} onKeyDown={(e) => {
      if (e.key === 'Enter' && e.ctrlKey) handleSubmit(e);
    }}>
      <div className="form-header">
        <h2>Bilan Ostéodensitométrie (DXA)</h2>
        <p>Analyse de la densité minérale osseuse et classification WHO</p>
      </div>

      {/* SECTION 1: GENERAL */}
      <div className="form-section">
        <button 
          type="button"
          className="section-header"
          onClick={() => toggleSection('general')}
        >
          <div className="section-header-left">
            <FiChevronDown style={{ transform: expandedSections.general ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.3s' }} />
            <FiCalendar className="section-icon" />
            <span>Informations de l'Examen</span>
          </div>
        </button>
        
        {expandedSections.general && (
          <div className="section-content">
            <div className="form-row">
              <div className="form-group">
                <label>Date du scan</label>
                <input 
                  type="date" 
                  name="scan_date" 
                  value={formData.scan_date}
                  onChange={handleInputChange}
                  required
                  className="form-input"
                />
              </div>
              <div className="form-group">
                <label>Qualité technique</label>
                <select 
                  name="scan_quality" 
                  value={formData.scan_quality}
                  onChange={handleInputChange}
                  className="form-input"
                >
                  <option value="Excellent">Optimale</option>
                  <option value="Good">Bonne</option>
                  <option value="Fair">Limitation technique</option>
                  <option value="Poor">Ininterprétable</option>
                </select>
              </div>
            </div>

            <div className="form-row" style={{ marginTop: '1rem' }}>
              <div className="form-group">
                <label className="checkbox-label">
                  <input 
                    type="checkbox" 
                    name="vfa_performed" 
                    checked={formData.vfa_performed}
                    onChange={handleInputChange}
                  />
                  <span>VFA effectué</span>
                </label>
              </div>

              {formData.vfa_performed && (
                <div className="form-group">
                  <label className="checkbox-label">
                    <input 
                      type="checkbox" 
                      name="vertebral_deformities_present" 
                      checked={formData.vertebral_deformities_present}
                      onChange={handleInputChange}
                    />
                    <span>Déformités détectées</span>
                  </label>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* SECTION 2: SCORES */}
      <div className="form-section">
        <button 
          type="button"
          className="section-header"
          onClick={() => toggleSection('scores')}
        >
          <div className="section-header-left">
            <FiChevronDown style={{ transform: expandedSections.scores ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.3s' }} />
            <FiTarget className="section-icon" />
            <span>Densité & Classification</span>
          </div>
        </button>
        
        {expandedSections.scores && (
          <div className="section-content">
            <div className="form-row">
              <div className="form-group">
                <label>T-score L1-L4</label>
                <input 
                  type="number" 
                  step="0.01"
                  name="spine_tscore" 
                  value={formData.spine_tscore}
                  onChange={handleInputChange}
                  placeholder="-1.5"
                  className="form-input"
                />
              </div>
              <div className="form-group">
                <label>Diagnostic (WHO)</label>
                <select 
                  name="who_diagnosis_spine" 
                  value={formData.who_diagnosis_spine}
                  onChange={handleInputChange}
                  className="form-input"
                >
                  <option value="Normal">Normal (T &gt; -1.0)</option>
                  <option value="Osteopenia">Ostéopénie (-1.0 à -2.5)</option>
                  <option value="Osteoporosis">Ostéoporose (T &lt; -2.5)</option>
                </select>
              </div>
            </div>

            <div className="form-row" style={{ marginTop: '1rem' }}>
              <div className="form-group">
                <label>T-score Hanche</label>
                <input 
                  type="number" 
                  step="0.01"
                  name="hip_tscore" 
                  value={formData.hip_tscore}
                  onChange={handleInputChange}
                  placeholder="-1.5"
                  className="form-input"
                />
              </div>
              <div className="form-group">
                <label>T-score Col fémoral</label>
                <input 
                  type="number" 
                  step="0.01"
                  name="femoral_neck_tscore" 
                  value={formData.femoral_neck_tscore}
                  onChange={handleInputChange}
                  placeholder="-1.5"
                  className="form-input"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* SECTION 3: FRAX */}
      <div className="form-section">
        <button 
          type="button"
          className="section-header"
          onClick={() => toggleSection('frax')}
        >
          <div className="section-header-left">
            <FiChevronDown style={{ transform: expandedSections.frax ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.3s' }} />
            <FiActivity className="section-icon" />
            <span>Risque FRAX (10 ans)</span>
          </div>
        </button>
        
        {expandedSections.frax && (
          <div className="section-content">
            <div className="form-row">
              <div className="form-group">
                <label>Fracture majeure</label>
                <div className="input-with-unit">
                  <input 
                    type="number" 
                    step="0.1"
                    name="frax_major_fracture_probability" 
                    value={formData.frax_major_fracture_probability}
                    onChange={handleInputChange}
                    placeholder="0.0"
                    className="form-input"
                  />
                  <span className="input-unit">%</span>
                </div>
              </div>
              <div className="form-group">
                <label>Fracture de hanche</label>
                <div className="input-with-unit">
                  <input 
                    type="number" 
                    step="0.1"
                    name="frax_hip_fracture_probability" 
                    value={formData.frax_hip_fracture_probability}
                    onChange={handleInputChange}
                    placeholder="0.0"
                    className="form-input"
                  />
                  <span className="input-unit">%</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* SECTION 4: IMPRESSION */}
      <div className="form-section">
        <button 
          type="button"
          className="section-header"
          onClick={() => toggleSection('impression')}
        >
          <div className="section-header-left">
            <FiChevronDown style={{ transform: expandedSections.impression ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.3s' }} />
            <FiFileText className="section-icon" />
            <span>Conclusion & Plan thérapeutique</span>
          </div>
        </button>
        
        {expandedSections.impression && (
          <div className="section-content">
            <div className="form-group">
              <label>Conclusion clinique *</label>
              <textarea 
                name="impression" 
                value={formData.impression}
                onChange={handleInputChange}
                placeholder="Synthèse des résultats et orientation diagnostique..."
                className="form-textarea"
                required
                rows="3"
              />
            </div>

            <div className="form-group">
              <label>Recommandations</label>
              <textarea 
                name="recommendations" 
                value={formData.recommendations}
                onChange={handleInputChange}
                placeholder="Plan de gestion, supplémentation, traitement anti-ostéoporotique..."
                className="form-textarea"
                rows="3"
              />
            </div>
          </div>
        )}
      </div>

      {/* SUBMIT */}
      <div className="form-actions">
        <button type="button" className="btn-submit" onClick={handleSubmit}>
          <FiCheckCircle /> Valider le bilan DXA
        </button>
      </div>
    </div>
  );
};

/**
 * Douleur Form: Unité de la Douleur (Pain Management)
 */
/**
 * Douleur Form: Unité de la Douleur (Pain Management)
 */
export const FormCsDouleur = ({ onSubmit, initialData = {} }) => {
  const [formData, setFormData] = useState({
    pain_locations: Array.isArray(initialData.pain_locations) ? initialData.pain_locations.join(', ') : (initialData.pain_locations || ''),
    pain_intensity_vas: initialData.pain_intensity_vas || 5,
    pain_duration: initialData.pain_duration || null,
    pain_character: initialData.pain_character || '',
    onset_type: initialData.onset_type || 'Progressive',
    initial_pain_date: initialData.initial_pain_date || null,
    pain_progression: initialData.pain_progression || 'Stable',
    aggravating_factors: initialData.aggravating_factors || '',
    relieving_factors: initialData.relieving_factors || '',
    time_of_day_pattern: initialData.time_of_day_pattern || 'Mechanical',
    functional_limitation_score: initialData.functional_limitation_score || null,
    sleep_disturbance_present: initialData.sleep_disturbance_present || false,
    sleep_quality: initialData.sleep_quality || 'Good',
    work_impact: initialData.work_impact || 'None',
    daily_activity_limitations: initialData.daily_activity_limitations || '',
    anxiety_level: initialData.anxiety_level || 5,
    depression_screening: initialData.depression_screening || 'negative',
    catastrophizing_score: initialData.catastrophizing_score || 5,
    follow_up_plan: initialData.follow_up_plan || '',
    clinical_notes: initialData.clinical_notes || ''
  });

  const [expandedSections, setExpandedSections] = useState({
    profile: true,
    impact: true,
    psychological: true,
    plan: true,
  });

  const toggleSection = () => {
    setExpandedSections(prev => prev);
  };

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : (type === 'number' ? (value === '' ? null : Number(value)) : value)
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(preparePainFormData(formData));
  };

  useClinicalFormAutoSave(formData, onSubmit, preparePainFormData);

  // Form navigation ref
  const formRef = useRef(null);

  // Setup keyboard navigation between fields
  useFormNavigation(formRef);

  return (
    <div className="medical-form" ref={formRef} onKeyDown={(e) => {
      if (e.key === 'Enter' && e.ctrlKey) handleSubmit(e);
    }}>
      <div className="form-header">
        <h2>Évaluation de la Douleur</h2>
        <p>Bilan multidimensionnel et impact sur la qualité de vie</p>
      </div>

      {/* SECTION 1: PAIN PROFILE */}
      <div className="form-section">
        <button 
          type="button" 
          className="section-header" 
          onClick={() => toggleSection('profile')}
        >
          <div className="section-header-left">
            <FiChevronDown style={{ transform: expandedSections.profile ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.3s' }} />
            <FiThermometer className="section-icon" />
            <span>Profil de la Douleur</span>
          </div>
        </button>
        
        {expandedSections.profile && (
          <div className="section-content">
            <div className="form-group">
              <label>Intensité (EVA 0-10)</label>
              <input 
                type="number" 
                name="pain_intensity_vas" 
                value={formData.pain_intensity_vas}
                onChange={handleInputChange}
                min="0"
                max="10"
                className="form-input"
                style={{ maxWidth: '120px' }}
              />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Date de début</label>
                <input 
                  type="date" 
                  name="initial_pain_date" 
                  value={formData.initial_pain_date}
                  onChange={handleInputChange}
                  className="form-input"
                />
              </div>
              <div className="form-group">
                <label>Rythme</label>
                <select 
                  name="time_of_day_pattern" 
                  value={formData.time_of_day_pattern}
                  onChange={handleInputChange}
                  className="form-input"
                >
                  <option value="Mechanical">Mécanique</option>
                  <option value="Inflammatory">Inflammatoire</option>
                  <option value="Neuropathic">Neuropathique</option>
                  <option value="Mixed">Mixte</option>
                </select>
              </div>
            </div>

            <div className="form-group">
              <label>Caractère de la douleur</label>
              <input 
                type="text" 
                name="pain_character" 
                value={formData.pain_character}
                onChange={handleInputChange}
                placeholder="ex: Brûlure, Décharge électrique, Étau..."
                className="form-input"
              />
            </div>
          </div>
        )}
      </div>

      {/* SECTION 2: FUNCTIONAL IMPACT */}
      <div className="form-section">
        <button 
          type="button" 
          className="section-header" 
          onClick={() => toggleSection('impact')}
        >
          <div className="section-header-left">
            <FiChevronDown style={{ transform: expandedSections.impact ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.3s' }} />
            <FiActivity className="section-icon" />
            <span>Impact Fonctionnel</span>
          </div>
        </button>
        
        {expandedSections.impact && (
          <div className="section-content">
            <div className="form-row">
              <div className="form-group">
                <label className="checkbox-label" style={{ marginTop: '0.5rem' }}>
                  <input 
                    type="checkbox" 
                    name="sleep_disturbance_present" 
                    checked={formData.sleep_disturbance_present}
                    onChange={handleInputChange}
                  />
                  <span>Troubles du sommeil</span>
                </label>
              </div>
              <div className="form-group">
                <label>Qualité du sommeil</label>
                <select 
                  name="sleep_quality" 
                  value={formData.sleep_quality}
                  onChange={handleInputChange}
                  className="form-input"
                >
                  <option value="Good">Reposant</option>
                  <option value="Fair">Passable</option>
                  <option value="Poor">Fragmenté / Non reposant</option>
                </select>
              </div>
            </div>

            <div className="form-group">
              <label>Impact professionnel</label>
              <select 
                name="work_impact" 
                value={formData.work_impact}
                onChange={handleInputChange}
                className="form-input"
              >
                <option value="None">Aucun</option>
                <option value="Partial">Adaptation nécessaire</option>
                <option value="Total">Arrêt de travail</option>
              </select>
            </div>
          </div>
        )}
      </div>

      {/* SECTION 3: PSYCHOLOGICAL IMPACT */}
      <div className="form-section">
        <button 
          type="button" 
          className="section-header" 
          onClick={() => toggleSection('psychological')}
        >
          <div className="section-header-left">
            <FiChevronDown style={{ transform: expandedSections.psychological ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.3s' }} />
            <FiZap className="section-icon" />
            <span>Retentissement Psychologique</span>
          </div>
        </button>
        
        {expandedSections.psychological && (
          <div className="section-content">
            <div className="form-group">
              <label>Niveau d'Anxiété (0-10)</label>
              <input 
                type="number" 
                name="anxiety_level" 
                value={formData.anxiety_level}
                onChange={handleInputChange}
                min="0"
                max="10"
                className="form-input"
                style={{ maxWidth: '120px' }}
              />
            </div>

            <div className="form-group">
              <label>Score de Catastrophisme (0-10)</label>
              <input 
                type="number" 
                name="catastrophizing_score" 
                value={formData.catastrophizing_score}
                onChange={handleInputChange}
                min="0"
                max="10"
                className="form-input"
                style={{ maxWidth: '120px' }}
              />
            </div>
          </div>
        )}
      </div>

      {/* SECTION 4: PLAN */}
      <div className="form-section">
        <button 
          type="button" 
          className="section-header" 
          onClick={() => toggleSection('plan')}
        >
          <div className="section-header-left">
            <FiChevronDown style={{ transform: expandedSections.plan ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.3s' }} />
            <FiShield className="section-icon" />
            <span>Stratégie Thérapeutique</span>
          </div>
        </button>
        
        {expandedSections.plan && (
          <div className="section-content">
            <div className="form-group">
              <label>Plan de suivi & Objectifs</label>
              <textarea 
                name="follow_up_plan" 
                value={formData.follow_up_plan}
                onChange={handleInputChange}
                placeholder="Réajustement thérapeutique, orientations spécialisées..."
                className="form-textarea"
                rows="4"
              />
            </div>
          </div>
        )}
      </div>

      {/* SUBMIT */}
      <div className="form-actions">
        <button type="button" className="btn-submit" onClick={handleSubmit}>
          <FiCheckCircle /> Enregistrer le bilan Douleur
        </button>
      </div>
    </div>
  );
};

export default { FormCsRic, FormCsOs, FormCsEcho, FormCsGeste, FormCsSeances, FormCsDxa, FormCsDouleur };
