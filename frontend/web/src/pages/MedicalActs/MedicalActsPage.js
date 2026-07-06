// ─── MedicalActsPage.jsx ──────────────────────────────────────────────────────
// Main page for managing medical acts (consultations, examinations, etc.)
// Provides: listing, filtering, creation, viewing details, and deletion.

import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  FiFileText, FiPlus, FiSearch, FiEye, FiEdit2, FiDownload, FiPrinter,
  FiClipboard, FiActivity, FiUser, FiPaperclip, FiTrash2, FiChevronRight,
  FiChevronLeft, FiCheck, FiX, FiAlertCircle, FiDollarSign, FiClock, FiTarget
} from 'react-icons/fi';

import { getMedicalActs, deleteMedicalAct, createMedicalAct, getDoctors, getPatientResults,
  getActForms, getFormCsRd, getFormCsRic, getFormCsOs, getFormCsEcho, 
  getFormCsGeste, getFormCsSeances, getFormCsDxa, getFormCsDouleur, getDynamicResponsesForAct 
} from '../../api/api';
import { canDeleteClinicalRecords } from '../../utils/permissions';
import Layout from '../../components/layout/Layout';
import { Breadcrumb, LoadingSpinner } from '../../components/common';
import { SkeletonCard } from '../../components/common/Skeleton';
import StatCard from '../../components/cards/StatCard';
import MedicalActForm from './MedicalActForm';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import './MedicalActsPage.css';

// ─── Constants ────────────────────────────────────────────────────────────────

// Available act type filters shown in the filter bar
const ACT_TYPES = ['Tous', 'Consultation', 'Examen', 'Infiltration', 'Bilan', 'Suivi'];

// Maps category names to CSS class suffixes for color-coding
const CATEGORY_COLOR_MAP = {
  Rhumatologie: 'rheumatology',
  Imagerie: 'imaging',
  Intervention: 'intervention',
  Laboratoire: 'laboratory',
};

// Default/empty state for the "add act" form
const EMPTY_FORM = {
  patientId: '',
  date: new Date().toISOString().split('T')[0],
  type: 'Consultation',
  category: 'Rhumatologie',
  report: '',
  notes: '',
  status: 'completed',
  amount: '',
  assignedStaffIds: [],
};

// ─── Service Layer ────────────────────────────────────────────────────────────
// Abstracts all API calls so the component stays clean.

const medicalActsService = {
  /** Updates a medical act, mapping camelCase form fields to backend snake_case. */
  async updateAct(data) {
    const mapped = {
      patient_id: data.patientId,
      act_type: data.type,
      description: data.notes || '',
      report: data.report || '',
      act_date: data.date,
      notes: data.notes || '',
      status: data.status,
      doctor_id: data.doctorId || null,
      amount: data.amount || '',
      category: data.category || '',
    };
    await import('../../api/api').then(api => api.updateMedicalAct(data.id, mapped));
  },
  /** Returns summary stats from the backend. */
  async getStats() {
    const { getMedicalActsStats } = await import('../../api/api');
    const response = await getMedicalActsStats();
    return response.data;
  },

  /** Fetches one page of medical acts and maps backend snake_case fields to camelCase. */
  async getActs(params = {}) {
    const response = await getMedicalActs(params);
    return {
      rows: response.data.map(act => ({
        id: act.id,
        patientName: act.patient_name || '',
        patientId: act.patient_id,
        type: act.act_type,
        category: act.category || '',
        date: act.act_date,
        description: act.description || '',
        status: act.status,
        amount: act.amount || '',
        doctor: act.doctor_id || '',
        // assigned_staff_ids is stored as a JSON string in older responses.
        assignedStaff: act.assigned_staff_ids ? JSON.parse(act.assigned_staff_ids) : [],
        notes: act.notes || '',
        report: act.report || '',
        documents: act.documents || [],
        diagnoses: act.diagnoses || [],
        treatments: act.treatments || [],
        forms: act.forms || [],
      })),
      total: Number(response.headers['x-total-count'] || response.data.length),
    };
  },

  /** Returns available staff for assignment. Extend when endpoint is ready. */
  async getStaff() {
    return [];
  },

  /** Creates a new medical act, mapping camelCase form fields to backend snake_case. */
  async createAct(data) {
    const mapped = {
      patient_id: data.patientId,
      act_type: data.type,
      description: data.notes || '',
      report: data.report || '',
      date: data.date,
      notes: data.notes || '',
      status: data.status,
      doctor_id: data.doctorId || null,
      assigned_staff_ids: JSON.stringify(data.assignedStaffIds || []),
      amount: data.amount || '',
      category: data.category || '',
      diagnosis: data.diagnosis || '',
      treatment: data.treatment || '',
    };
    const response = await createMedicalAct(mapped);
    return response.data;
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Formats an ISO date string into a readable French locale date. */
const formatDate = (dateString) =>
  new Date(dateString).toLocaleDateString('fr-FR', {
    day: '2-digit', month: 'short', year: 'numeric',
  });

/** Returns the CSS class suffix for a given category name. */
const getCategoryColor = (category) => CATEGORY_COLOR_MAP[category] ?? 'default';

/** Returns a human-readable label for act status. */
const statusLabel = (status) => (status === 'completed' ? 'Terminé' : 'En cours');

const getVisiblePages = (currentPage, totalPages) => {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
  const pages = [1];
  const start = Math.max(2, currentPage - 1);
  const end = Math.min(totalPages - 1, currentPage + 1);
  if (start > 2) pages.push('start-ellipsis');
  for (let page = start; page <= end; page += 1) pages.push(page);
  if (end < totalPages - 1) pages.push('end-ellipsis');
  pages.push(totalPages);
  return pages;
};

// ─── ActCard ──────────────────────────────────────────────────────────────────
// Displays a summary card for a single medical act.
// Props:
//   act      – the medical act object
//   onView   – callback to open the detail modal
//   onDelete – callback to delete the act

function ActCard({ act, onView, onDelete, onEdit, canDelete = true }) {
  return (
    <div className="act-card">
      <div className="act-card-header">
        <span className={`act-category ${getCategoryColor(act.category)}`}>{act.category}</span>
        <span className={`act-status ${act.status}`}>
          {act.status === 'completed' ? <FiCheck /> : <FiClock />}
          {statusLabel(act.status)}
        </span>
      </div>

      <div className="act-card-body">
        <h3 className="act-type">{act.type}</h3>
        <div className="act-patient">
          <FiUser />
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <span>{act.patientName}</span>
            <span className="patient-id">{act.patientIdDisplay ?? act.patientId}</span>
          </div>
        </div>
        {act.description && (
          <p className="act-diagnosis">
            <FiActivity size={14} /> {act.description}
          </p>
        )}
        {(act.diagnoses?.length > 0 || act.treatments?.length > 0 || act.forms?.length > 0) && (
          <p className="act-treatment">
            {act.diagnoses?.length > 0 && <span>{act.diagnoses.length} diag.</span>}
            {act.treatments?.length > 0 && <span>{act.treatments.length} trait.</span>}
            {act.forms?.length > 0 && <span className="clinical-tag">📋 Clinique</span>}
          </p>
        )}
      </div>

      <div className="act-card-footer">
        <div className="act-info">
          <span className="act-date">{formatDate(act.date)}</span>
          {act.amount && <span className="act-amount">{act.amount}</span>}
        </div>
        <div className="act-actions">
          <button className="action-btn view" title="Voir détails" onClick={() => onView(act)}>
            <FiEye />
          </button>
          <button className="action-btn edit" title="Modifier" onClick={() => onEdit(act)}>
            <FiEdit2 />
          </button>
          {canDelete && (
            <button
              className="action-btn delete"
              title="Supprimer"
              onClick={() => onDelete(act.id)}
              style={{ color: '#ef4444' }}
            >
              <FiTrash2 />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── DetailModal ──────────────────────────────────────────────────────────────
// Read-only detail view for a selected medical act.

function DetailModal({ act, doctors = [], onClose, onSuccess }) {
  const [showAttachModal, setShowAttachModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [labResults, setLabResults] = useState([]);
  const [labResultsLoading, setLabResultsLoading] = useState(false);
  const [formData, setFormData] = useState(null);
  const [formDataLoading, setFormDataLoading] = useState(false);
  const [dynamicResponses, setDynamicResponses] = useState([]);
  const [dynamicResponsesLoading, setDynamicResponsesLoading] = useState(false);

  // Fetch lab results and form data when modal opens or act changes
  useEffect(() => {
    if (!act?.id) return;
    
    const fetchLabResults = async () => {
      try {
        setLabResultsLoading(true);
        const response = await getPatientResults(act.patientId);
        // Filter results to only show results created for this specific act
        // Results are linked to acts via the result_date and act metadata
        // For now, show all results but in the future could add act_id filter
        setLabResults(response.data || []);
      } catch (err) {
        console.error('Erreur lors du chargement des résultats de labo:', err);
        setLabResults([]);
      } finally {
        setLabResultsLoading(false);
      }
    };

    const fetchFormData = async () => {
      try {
        setFormDataLoading(true);
        // Use forms from act object if already enriched by backend
        let actForms = act.forms || [];
        
        // Fallback to manual fetch if needed
        if (actForms.length === 0) {
          const actFormsResponse = await getActForms(act.id);
          actForms = actFormsResponse.data || [];
        }
        
        if (actForms.length > 0) {
          // In this system, we usually have one main clinical form per act
          const actForm = actForms[0];
          
          // Now we have form_name from the backend, so we can directly map it
          let data = null;
          let type = 'unknown';

          // Map form_name to the correct fetch function
          const formFetchers = {
            'form_cs_rd': getFormCsRd,
            'form_cs_ric': getFormCsRic,
            'form_cs_os': getFormCsOs,
            'form_cs_echo': getFormCsEcho,
            'form_cs_geste': getFormCsGeste,
            'form_cs_seances': getFormCsSeances,
            'form_cs_dxa': getFormCsDxa,
            'form_cs_douleur': getFormCsDouleur,
          };

          // Use the form_name from backend to get the correct fetcher
          if (actForm.form_name && formFetchers[actForm.form_name]) {
            try {
              const res = await formFetchers[actForm.form_name](actForm.form_table_id);
              if (res.data) {
                data = res.data;
                type = actForm.form_name.replace('form_cs_', '').toUpperCase();
              }
            } catch (e) {
              console.error(`Error fetching form ${actForm.form_name}:`, e);
            }
          } else {
            console.warn('No form_name in act form data or unknown form type:', actForm);
          }

          setFormData(data ? { ...data, _formType: type, _formLabel: actForm.form_label } : null);
        } else {
          setFormData(null);
        }
      } catch (err) {
        console.error('Erreur lors du chargement du formulaire:', err);
        setFormData(null);
      } finally {
        setFormDataLoading(false);
      }
    };

    const fetchDynamicResponses = async () => {
      try {
        setDynamicResponsesLoading(true);
        const response = await getDynamicResponsesForAct(act.id);
        setDynamicResponses(response.data || []);
      } catch (err) {
        console.error('Erreur lors du chargement des réponses personnalisées:', err);
        setDynamicResponses([]);
      } finally {
        setDynamicResponsesLoading(false);
      }
    };

    fetchLabResults();
    fetchFormData();
    fetchDynamicResponses();
  }, [act?.id, act?.patientId]);

  // Helper function to get doctor name from ID
  const getDoctorName = (doctorId) => {
    if (!doctorId) return 'Non assigné';
    const doctor = doctors.find(d => d.id === doctorId);
    return doctor ? `${doctor.first_name} ${doctor.last_name}` : `Médecin #${doctorId}`;
  };

  // Print handler - uses browser print to capture current clinical details
  const handlePrint = () => {
    window.print();
  };

  // PDF download handler
  const handleDownloadPDF = async () => {
    try {
      const { getMedicalActPdf } = await import('../../api/api');
      const response = await getMedicalActPdf(act.id);
      const blob = response.data instanceof Blob ? response.data : new Blob([response.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `acte_medical_${act.id}.pdf`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Download error:', err);
      alert('Erreur lors du téléchargement du PDF.');
    }
  };

  // Attach document handler
  const handleAttachDocument = async (file) => {
    if (!file) return;
    try {
      const formData = new FormData();
      formData.append('file', file);
      const { uploadMedicalActDocument } = await import('../../api/api');
      await uploadMedicalActDocument(act.id, formData);
      setShowAttachModal(false);
      if (onSuccess) onSuccess();
    } catch (err) {
      console.error(err);
      alert('Erreur lors de l’attachement du document.');
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Détails de l'Acte</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="act-detail">
          <div className="detail-header">
            <span className={`act-category ${getCategoryColor(act.category)}`}>{act.category}</span>
            <span className={`act-status ${act.status}`}>{statusLabel(act.status)}</span>
          </div>

          <div className="detail-section">
            <h4>Patient</h4>
            <p className="detail-value">
              {act.patientName}{' '}
              <span className="patient-id">{act.patientIdDisplay ?? act.patientId}</span>
            </p>
          </div>

          <div className="detail-row">
            <div className="detail-section">
              <h4>Type d'acte</h4>
              <p className="detail-value">{act.type}</p>
            </div>
            <div className="detail-section">
              <h4>Date</h4>
              <p className="detail-value">{formatDate(act.date)}</p>
            </div>
          </div>

          <div className="detail-section">
            <h4>Diagnostic</h4>
            <p className="detail-value">
              {act.diagnoses && act.diagnoses.length > 0
                ? act.diagnoses.map((d) => d.diagnosis_label).join(', ')
                : 'Aucun diagnostic'}
            </p>
          </div>

          {act.report && (
            <div className="detail-section">
              <h4>Rapport de consultation</h4>
              <p className="detail-value report">{act.report}</p>
            </div>
          )}

          <div className="detail-section">
            <h4>Traitement / Prescription</h4>
            <p className="detail-value">
              {act.treatments && act.treatments.length > 0
                ? act.treatments.map((t) => {
                    const details = [t.dosage, t.frequency, t.duration].filter(Boolean).join(' - ');
                    return details ? `${t.drug_name} (${details})` : t.drug_name;
                  }).join(', ')
                : 'Aucun traitement'}
            </p>
          </div>

          <div className="detail-row">
            <div className="detail-section">
              <h4>Médecin(s) / Équipe</h4>
              <p className="detail-value">
                {getDoctorName(act.doctor)}
                {act.assignedStaff?.length > 1 && ` + ${act.assignedStaff.length - 1} autre(s)`}
              </p>
            </div>
            <div className="detail-section">
              <h4>Montant</h4>
              <p className="detail-value amount">{act.amount} DH</p>
            </div>
          </div>

          {labResults && labResults.length > 0 && (
            <div className="detail-section lab-results-section">
              <h4><FiTarget /> Résultats de laboratoire</h4>
              <div className="lab-results-table">
                <table>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Analyse</th>
                      <th>Résultat</th>
                      <th>Unité</th>
                      <th>Statut</th>
                    </tr>
                  </thead>
                  <tbody>
                    {labResults.map((result) => (
                      <tr key={result.id} className={result.is_abnormal ? 'abnormal' : ''}>
                        <td>{formatDate(result.result_date)}</td>
                        <td>{result.result_name}</td>
                        <td className="result-value">{result.result_value}</td>
                        <td>{result.result_unit || '-'}</td>
                        <td className="status-cell">
                          <span className={`status-badge ${result.is_abnormal ? 'abnormal' : 'normal'}`}>
                            {result.is_abnormal ? 'Anormal' : 'Normal'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {formData && (
            <div className="detail-section form-data-section">
              <div className="detail-section-header">
                <h4><FiFileText /> {formData._formLabel || formData._formType}</h4>
              </div>
              <div className="form-data-grid">
                <div className="form-data-item">
                  {Object.entries(formData)
                    .filter(([key, value]) => 
                      !key.startsWith('_') && 
                      !['id', 'patient_id', 'act_id', 'created_at', 'updated_at', 'patientId', 'doctorId'].includes(key) &&
                      value !== null && value !== '' && value !== undefined
                    )
                    .map(([key, value]) => {
                      // Mapping for human-readable labels
                      const labels = {
                        form_date: 'Date',
                        clinical_notes: 'Observations',
                        // RIC
                        crp_value: 'CRP',
                        crp_date: 'Date CRP',
                        esr_value: 'VS',
                        esr_date: 'Date VS',
                        das28_score: 'Score DAS28',
                        morning_stiffness_duration: 'Raideur matinale (min)',
                        affected_joints: 'Articulations affectées',
                        fever_present: 'Fièvre',
                        fatigue_level: 'Niveau fatigue',
                        dmards_json: 'DMARDs',
                        biologics_json: 'Biothérapies',
                        dmardsJson: 'DMARDs',
                        biologicsJson: 'Biothérapies',
                        treatment_response: 'Réponse au traitement',
                        dmards: 'DMARDs',
                        biologics: 'Biothérapies',
                        observations: 'Observations',
                        tender_joint_count: 'Articulations douloureuses',
                        swollen_joint_count: 'Articulations gonflées',
                        joint_swelling_count: 'Articulations gonflées',
                        joint_tenderness_count: 'Articulations douloureuses',
                        morning_stiffness: 'Raideur matinale',
                        vas_pain: 'EVA Douleur',
                        vas_patient_global: 'EVA Globale Patient',
                        vas_physician_global: 'EVA Globale Médecin',
                        crp: 'CRP (mg/L)',
                        esr: 'VS (1ère heure)',
                        // RD (Rhumatisme Dégénératif)
                        current_treatment_none: 'Aucun traitement actuel',
                        current_treatment_json: 'Traitements actuels',
                        arthralgie_present: 'Arthralgies présentes',
                        arthralgie_horaire: 'Horaire des arthralgies',
                        arthralgie_duration: 'Durée des arthralgies',
                        arthralgie_locations: 'Localisation des arthralgies',
                        joint_swelling_present: 'Gonflement articulaire',
                        joint_swelling_locations: 'Localisation du gonflement',
                        rachialgie_present: 'Rachialgies présentes',
                        rachialgie_horaire: 'Horaire des rachialgies',
                        rachialgie_duration: 'Durée des rachialgies',
                        rachialgie_locations: 'Localisation rachialgies',
                        fessialgie_present: 'Fessalgies présentes',
                        fessialgie_horaire: 'Horaire des fessalgies',
                        fessialgie_duration: 'Durée des fessalgies',
                        fessialgie_locations: 'Localisation fessalgies',
                        enthesalgie_present: 'Enthésalgies présentes',
                        enthesalgie_locations: 'Localisation enthésalgies',
                        myalgie_present: 'Myalgies présentes',
                        other_signs_text: 'Autres signes',
                        articular_index: 'Index articulaire',
                        synovial_index: 'Index synovial',
                        clinical_examination_notes: 'Examen clinique',
                        imaging_xray: 'Radiographies effectuées',
                        imaging_xray_findings: 'Résultats radiographiques',
                        imaging_ultrasound: 'Échographie effectuée',
                        imaging_ultrasound_findings: 'Résultats échographiques',
                        imaging_mri: 'IRM effectuée',
                        imaging_mri_findings: 'Résultats IRM',
                        diagnosis_osteoarthritis_json: 'Diagnostic arthrose',
                        diagnosis_other_text: 'Autre diagnostic',
                        treatment_decision: 'Décision thérapeutique',
                        prescription: 'Prescription',
                        additional_notes: 'Notes additionnelles',
                        // OS / DXA
                        t_score_lumbar: 'T-Score Lombaire',
                        t_score_hip: 'T-Score Hanche',
                        frax_score: 'Score FRAX',
                        who_classification: 'Classification OMS',
                        t_score_femoral_neck: 'T-Score Col Fémoral',
                        t_score_total_hip: 'T-Score Hanche Totale',
                        previous_fracture: 'Antécédent de fracture',
                        fracture_type: 'Type de fracture',
                        fracture_date: 'Date de fracture',
                        bone_mineral_density: 'Densité minérale osseuse',
                        osteoporosis_risk: 'Risque d\'ostéoporose',
                        treatment_plan: 'Plan thérapeutique',
                        bisphosphonates: 'Bisphosphonates',
                        vitamin_d_status: 'Statut Vitamine D',
                        calcium_intake: 'Apport calcique',
                        // ECHO
                        joint_site: 'Articulation examinée',
                        synovitis_grade: 'Grade synovite',
                        doppler_signal: 'Signal Doppler',
                        effusion_present: 'Épanchement',
                        erosion_present: 'Érosion osseuse',
                        cartilage_thickness: 'Épaisseur du cartilage',
                        echo_findings: 'Résultats échographiques',
                        // GESTE (Infiltration/Injection)
                        procedure_type: 'Geste effectué',
                        product_used: 'Produit utilisé',
                        target_joint: 'Articulation cible',
                        volume_aspirated: 'Volume aspiré',
                        volume_injected: 'Volume injecté',
                        procedure_success: 'Succès du geste',
                        immediate_response: 'Réponse immédiate',
                        fluid_sample_sent: 'Prélèvement envoyé',
                        complication_present: 'Complication présente',
                        complication_description: 'Description complication',
                        // SEANCES (Physiothérapie)
                        session_number_in_series: 'N° de séance',
                        session_duration: 'Durée (min)',
                        therapist_name: 'Thérapeute',
                        session_type: 'Type de séance',
                        functional_improvement: 'Amélioration fonctionnelle',
                        pain_before_session: 'Douleur avant',
                        pain_after_session: 'Douleur après',
                        exercises_prescribed: 'Exercices prescrits',
                        patient_compliance: 'Adhérence du patient',
                        home_program_given: 'Programme domicile donné',
                        next_session_planned: 'Prochaine séance planifiée',
                        // DXA (Ostéodensitométrie)
                        dxa_date: 'Date DXA',
                        lumbar_spine_t_score: 'T-Score Lombaire',
                        total_hip_t_score: 'T-Score Hanche',
                        femoral_neck_t_score: 'T-Score Col Fémoral',
                        one_third_radius_t_score: 'T-Score 1/3 Distal Radius',
                        forearm_t_score: 'T-Score Avant-bras',
                        bmd_lumbar: 'DMO Lombaire',
                        bmd_hip: 'DMO Hanche',
                        z_score: 'Z-Score',
                        fracture_risk_assessment: 'Évaluation risque fracture',
                        // DOULEUR
                        pain_intensity_vas: 'EVA Douleur',
                        pain_duration: 'Durée de la douleur',
                        pain_character: 'Caractère de la douleur',
                        onset_type: 'Type de début',
                        initial_pain_date: 'Date de début',
                        previous_treatments_json: 'Traitements antérieurs',
                        pain_progression: 'Évolution de la douleur',
                        aggravating_factors: 'Facteurs aggravants',
                        relieving_factors: 'Facteurs soulageants',
                        time_of_day_pattern: 'Rythme nycthéméral',
                        functional_limitation_score: 'Score de limitation fonctionnelle',
                        sleep_disturbance_present: 'Troubles du sommeil',
                        sleep_quality: 'Qualité du sommeil',
                        work_impact: 'Impact sur le travail',
                        daily_activity_limitations: 'Limitations activités quotidiennes',
                        analgesics_json: 'Analgésiques',
                        nsaids_json: 'AINS',
                        other_medications_json: 'Autres médicaments',
                        tender_points_locations: 'Localisation points douloureux',
                        range_of_motion_findings: 'Examen de la mobilité',
                        neurological_exam_findings: 'Examen neurologique',
                        anxiety_level: 'Niveau d\'anxiété',
                        depression_screening: 'Dépistage dépression',
                        catastrophizing_score: 'Score de catastrophisme',
                        coping_mechanisms: 'Mécanismes de défense',
                        recommended_interventions: 'Interventions recommandées',
                        referrals_needed: 'Avis spécialisés nécessaires',
                        follow_up_plan: 'Plan de suivi',
                      };
                      
                      const label = labels[key] || key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
                      
                      let displayValue = value;
                      if (Array.isArray(value)) {
                        displayValue = value.map(item => 
                          typeof item === 'object' ? JSON.stringify(item) : String(item)
                        ).join(', ');
                      } else if (typeof value === 'boolean' || (typeof value === 'number' && (key.endsWith('_present') || key.endsWith('_done')))) {
                        displayValue = value ? 'Oui' : 'Non';
                      }
                      
                      return (
                        <div key={key} style={{ 
                          backgroundColor: '#f9fafb',
                          padding: '0.75rem 1rem',
                          borderRadius: '6px',
                          borderLeft: '3px solid #06b6d4',
                          marginBottom: '0.75rem'
                        }}>
                          <div style={{ fontSize: '0.75rem', color: '#6b7280', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '0.25rem' }}>
                            {label}
                          </div>
                          <div style={{ fontSize: '0.95rem', color: '#1f2937', fontWeight: '500' }}>
                            {displayValue}
                          </div>
                        </div>
                      );
                    })
                  }
                </div>
              </div>
            </div>
          )}

          {dynamicResponses && dynamicResponses.length > 0 && (
            <div className="detail-section form-data-section">
              {dynamicResponses.map((response) => {
                // Unified labels object (same as clinical forms)
                const labels = {
                  form_date: 'Date',
                  clinical_notes: 'Observations',
                  crp_value: 'CRP',
                  crp_date: 'Date CRP',
                  esr_value: 'VS',
                  esr_date: 'Date VS',
                  das28_score: 'Score DAS28',
                  morning_stiffness_duration: 'Raideur matinale (min)',
                  affected_joints: 'Articulations affectées',
                  fever_present: 'Fièvre',
                  fatigue_level: 'Niveau fatigue',
                  dmards_json: 'DMARDs',
                  biologics_json: 'Biothérapies',
                  dmardsJson: 'DMARDs',
                  biologicsJson: 'Biothérapies',
                  treatment_response: 'Réponse au traitement',
                  dmards: 'DMARDs',
                  biologics: 'Biothérapies',
                  observations: 'Observations',
                  tender_joint_count: 'Articulations douloureuses',
                  swollen_joint_count: 'Articulations gonflées',
                  pain_intensity_vas: 'EVA Douleur',
                  sleep_quality: 'Qualité du sommeil',
                  work_impact: 'Impact sur le travail',
                  daily_activity_limitations: 'Limitations activités quotidiennes',
                  anxiety_level: 'Niveau d\'anxiété',
                  depression_screening: 'Dépistage dépression',
                  catastrophizing_score: 'Score de catastrophisme',
                  follow_up_plan: 'Plan de suivi',
                };
                
                return (
                  <div key={response.id}>
                    <div className="detail-section-header">
                      <h4><FiFileText /> {response.template_name}</h4>
                    </div>
                    <div className="form-data-grid">
                      <div className="form-data-item">
                        {Object.entries(response.response_data || {}).map(([key, value]) => {
                          const label = labels[key] || key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
                          let displayValue = value;
                          
                          if (Array.isArray(value)) {
                            displayValue = value.map(item => 
                              typeof item === 'object' ? JSON.stringify(item) : String(item)
                            ).join(', ');
                          } else if (typeof value === 'boolean') {
                            displayValue = value ? 'Oui' : 'Non';
                          }
                          
                          return (
                            <div key={key} style={{ 
                              backgroundColor: '#f9fafb',
                              padding: '0.75rem 1rem',
                              borderRadius: '6px',
                              borderLeft: '3px solid #06b6d4',
                              marginBottom: '0.75rem'
                            }}>
                              <div style={{ fontSize: '0.75rem', color: '#6b7280', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '0.25rem' }}>
                                {label}
                              </div>
                              <div style={{ fontSize: '0.95rem', color: '#1f2937', fontWeight: '500' }}>
                                {displayValue}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="detail-section documents-section">
            <h4><FiPaperclip /> Documents attachés</h4>
            <ul className="documents-list">
              {(act.documents ?? []).length > 0
                ? act.documents.map((doc) => (
                  <li key={doc.id}>
                    <button type="button" className="link-btn doc-link" style={{ textAlign: 'left' }} onClick={async () => {
                      try {
                        const { downloadMedicalActDocument } = await import('../../api/api');
                        const response = await downloadMedicalActDocument(act.id, doc.id);
                        const url = window.URL.createObjectURL(new Blob([response.data]));
                        const link = document.createElement('a');
                        link.href = url;
                        link.setAttribute('download', doc.filename);
                        document.body.appendChild(link);
                        link.click();
                        document.body.removeChild(link);
                      } catch (err) {
                        alert('Erreur lors du téléchargement');
                      }
                    }}>{doc.filename}</button>
                    <span className="doc-date">{doc.date}</span>
                  </li>
                ))
                : (
                  <li className="no-docs">
                    Aucun document.{' '}
                    <button type="button" className="link-btn" onClick={() => setShowAttachModal(true)}>Attacher un document</button>
                  </li>
                )}
            </ul>
          </div>

          <div className="detail-actions">
            <button className="btn-secondary" onClick={handlePrint}><FiPrinter /> Imprimer</button>
            <button className="btn-secondary" onClick={handleDownloadPDF}><FiDownload /> Télécharger PDF</button>
          </div>
        </div>

        {showAttachModal && (
          <div className="modal-overlay" onClick={() => setShowAttachModal(false)}>
            <div className="modal-content" onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <h2>Attacher un document</h2>
                <button className="modal-close" onClick={() => setShowAttachModal(false)}>×</button>
              </div>
              <form onSubmit={e => { e.preventDefault(); handleAttachDocument(e.target.file.files[0]); }}>
                <input type="file" name="file" required />
                <div className="form-actions">
                  <button type="button" className="btn-cancel" onClick={() => setShowAttachModal(false)}>Annuler</button>
                  <button type="submit" className="btn-submit">Attacher</button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── MedicalActsPage ──────────────────────────────────────────────────────────

function MedicalActsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [newActPatientId, setNewActPatientId] = useState(null);
  const canDeleteMedicalAct = canDeleteClinicalRecords();
  const [stats, setStats] = useState(null);
  const [doctors, setDoctors] = useState([]);
  const [acts, setActs] = useState([]);
  const [totalActs, setTotalActs] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  const [selectedType, setSelectedType] = useState('Tous');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);

  useEffect(() => {
    const patientId = searchParams.get('patientId');
    if (searchParams.get('new') === '1' && patientId) {
      setNewActPatientId(patientId);
      setShowAddModal(true);
      const next = new URLSearchParams(searchParams);
      next.delete('patientId');
      next.delete('new');
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const [selectedAct, setSelectedAct] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editAct, setEditAct] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);

  const ITEMS_PER_PAGE = 6;

  const loadActs = useCallback(async () => {
    try {
      const params = {
        limit: ITEMS_PER_PAGE,
        offset: (currentPage - 1) * ITEMS_PER_PAGE,
      };
      if (selectedType !== 'Tous') params.act_type = selectedType;
      if (debouncedSearchTerm.trim()) params.q = debouncedSearchTerm.trim();
      const data = await medicalActsService.getActs(params);
      setActs(data.rows);
      setTotalActs(data.total);
    } catch (err) {
      setError(err.message ?? 'Erreur inconnue');
    }
  }, [currentPage, debouncedSearchTerm, selectedType]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearchTerm(searchTerm), 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  useEffect(() => {
    const init = async () => {
      setError(null);
      try {
        const [statsData, doctorsData] = await Promise.all([
          medicalActsService.getStats(),
          getDoctors(),
        ]);
        setStats(statsData);
        setDoctors(doctorsData.data || []);
      } catch (err) {
        setError(err.message ?? 'Erreur inconnue');
      }
    };
    init();
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setIsLoading(true);
      setError(null);
      try {
        await loadActs();
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [loadActs]);

  // Pagination calculations
  const totalPages = Math.ceil(totalActs / ITEMS_PER_PAGE);
  const paginatedActs = acts;
  const visiblePages = getVisiblePages(currentPage, totalPages);

  // Reset to page 1 when filters change
  React.useEffect(() => {
    setCurrentPage(1);
  }, [selectedType, debouncedSearchTerm]);

  const [deleteDialog, setDeleteDialog] = useState({ open: false, actId: null });

  const openDeleteDialog = (id) => {
    setDeleteDialog({ open: true, actId: id });
  };

  const confirmDeleteAct = async () => {
    const id = deleteDialog.actId;
    setDeleteDialog({ open: false, actId: null });
    try {
      await deleteMedicalAct(id);
      await loadActs();
    } catch (err) {
      setError(err.message ?? 'Erreur lors de la suppression');
    }
  };

  const cancelDeleteAct = () => {
    setDeleteDialog({ open: false, actId: null });
  };

  const handleEditAct = (act) => {
    // Ensure proper data structure for the form
    const formData = {
      ...act,
      // Ensure diagnosis field exists as a string
      diagnosis: act.diagnosis 
        ? String(act.diagnosis).trim()
        : (act.diagnoses && Array.isArray(act.diagnoses) && act.diagnoses.length > 0
          ? act.diagnoses.map(d => d.diagnosis_label || d.label || '').filter(d => d).join(', ')
          : ''),
      // Ensure treatment field exists as a string
      treatment: act.treatment
        ? String(act.treatment).trim()
        : (act.treatments && Array.isArray(act.treatments) && act.treatments.length > 0
          ? act.treatments.map(t => t.drug_name || t.name || '').filter(t => t).join(', ')
          : ''),
      // Ensure amount is set correctly
      amount: act.amount || '',
      // Map backend fields to form fields
      patientId: act.patientId,
      patientName: act.patientName,
      doctorId: act.doctor || '',
      date: act.date,
      actType: act.type || 'Consultation',
      category: act.category || 'rheumatology',
      report: act.report || '',
      status: act.status || 'pending',
      notes: act.notes || '',
    };
    
    setEditAct(formData);
    setShowEditModal(true);
  };

  return (
    <Layout>
      <div className="medical-acts-page">
        <div className="page-header">
          <div className="header-content">
            <h1 className="page-title">Actes Médicaux</h1>
            <p className="page-subtitle">Gérez les actes et prescriptions médicales</p>
          </div>
          <button className="add-act-btn" onClick={() => setShowAddModal(true)}>
            <FiPlus />
            <span>Nouvel Acte</span>
          </button>
        </div>

        <div className="medical-acts-stats">
          {isLoading || !stats ? (
            <><SkeletonCard /><SkeletonCard /><SkeletonCard /><SkeletonCard /></>
          ) : (
            <>
              <StatCard icon={<FiFileText />} label="Total Actes" percentage="Ce mois" value={stats.total} color="blue" />
              <StatCard icon={<FiClipboard />} label="Consultations" percentage="Ce mois" value={stats.consultations} color="green" />
              <StatCard icon={<FiActivity />} label="Interventions" percentage="Ce mois" value={stats.interventions} color="pink" />
              <StatCard icon={<FiUser />} label="Patients traités" percentage="Ce mois" value={stats.treatedPatients} color="yellow" />
            </>
          )}
        </div>

        <div className="search-filter-bar">
          <div className="search-box">
            <FiSearch className="search-icon" />
            <input
              type="text"
              placeholder="Rechercher par patient, ID ou diagnostic..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="filter-buttons">
            {ACT_TYPES.map((type) => (
              <button
                key={type}
                className={`filter-btn ${selectedType === type ? 'active' : ''}`}
                onClick={() => setSelectedType(type)}
              >
                {type}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div className="error-banner">
            Erreur lors du chargement des données : {error}
          </div>
        )}

        <div className="medical-acts-grid">
          {isLoading ? (
            [1, 2, 3, 4].map((n) => (
              <div key={n} className="act-card skeleton-act-card"><SkeletonCard /></div>
            ))
          ) : acts.length === 0 ? (
            <p className="empty-state">Aucun acte médical trouvé.</p>
          ) : (
            paginatedActs.map((act) => (
              <ActCard
                key={act.id}
                act={act}
                onView={setSelectedAct}
                onDelete={openDeleteDialog}
                onEdit={handleEditAct}
                canDelete={canDeleteMedicalAct}
              />
            ))
          )}
        </div>

        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div className="pagination-container">
            <button
              className="pagination-btn prev-btn"
              onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
              disabled={currentPage === 1}
            >
              ←
            </button>
            <div className="pagination-pages">
              {visiblePages.map((page) => (
                typeof page === 'number' ? (
                  <button
                    key={page}
                    className={`pagination-page ${currentPage === page ? 'active' : ''}`}
                    onClick={() => setCurrentPage(page)}
                  >
                    {page}
                  </button>
                ) : (
                  <span key={page} className="pagination-ellipsis">...</span>
                )
              ))}
            </div>
            <button
              className="pagination-btn next-btn"
              onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
              disabled={currentPage === totalPages}
            >
              →
            </button>
          </div>
        )}

        <ConfirmDialog
          open={deleteDialog.open}
          title="Supprimer l'acte médical ?"
          description="Cette action est irréversible. Toutes les données liées à cet acte seront supprimées."
          onConfirm={confirmDeleteAct}
          onCancel={cancelDeleteAct}
        />

        {selectedAct && (
          <DetailModal
            act={selectedAct}
            doctors={doctors}
            onClose={() => setSelectedAct(null)}
            onSuccess={async () => {
              await loadActs();
              setSelectedAct(null);
            }}
          />
        )}

        {showAddModal && (
          <div className="modal-overlay">
            <div className="modal-content" onClick={e => e.stopPropagation()}>
              <MedicalActForm
                defaultPatientId={newActPatientId || undefined}
                initialStep={newActPatientId ? 2 : 1}
                onSuccess={() => {
                  setShowAddModal(false);
                  setNewActPatientId(null);
                  loadActs();
                }}
                onClose={() => {
                  setShowAddModal(false);
                  setNewActPatientId(null);
                }}
              />
            </div>
          </div>
        )}

        {showEditModal && editAct && (
          <div className="modal-overlay">
            <div className="modal-content" onClick={e => e.stopPropagation()}>
              <MedicalActForm
                initialData={editAct}
                isEdit={true}
                onSuccess={() => {
                  setShowEditModal(false);
                  setEditAct(null);
                  loadActs();
                }}
                onClose={() => {
                  setShowEditModal(false);
                  setEditAct(null);
                }}
              />
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}

export default MedicalActsPage;