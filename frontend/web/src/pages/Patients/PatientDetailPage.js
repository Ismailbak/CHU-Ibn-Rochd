import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getPatient, getPatientAppointments, getPatientMedicalActs, exportPatientDossier, getPatientResults } from '../../api/api';
import { 
  FiArrowLeft, FiEdit2, FiPhone, FiMail, FiMapPin, FiCalendar, 
  FiFileText, FiActivity, FiHeart, FiAlertCircle, FiClock,
  FiUser, FiClipboard, FiPlusCircle, FiDownload
} from 'react-icons/fi';
import Layout from '../../components/layout/Layout';
import { LoadingSpinner, Breadcrumb } from '../../components/common';
import PatientForm from './PatientForm';
import LabResultForm from './LabResultForm';
import PatientTreatmentForm from './PatientTreatmentForm';
import './PatientDetailPage.css';

function formatTreatmentDetails(treatment) {
  return [
    treatment.dosage,
    treatment.frequency,
    treatment.duration,
  ].filter(Boolean).join(' • ');
}

function calculateAge(dateOfBirth) {
  if (!dateOfBirth) return null;
  const today = new Date();
  const birth = new Date(dateOfBirth);
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age > 0 ? age : null;
}

function PatientDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [patient, setPatient] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  const [showEditModal, setShowEditModal] = useState(false);
  const [showLabResultModal, setShowLabResultModal] = useState(false);
  const [showTreatmentModal, setShowTreatmentModal] = useState(false);

  const fetchPatient = async () => {
    setIsLoading(true);
    try {
      const res = await getPatient(id);
      const patientData = res.data;

      // Fetch appointments, acts, and lab results with individual error handling
      let appointmentsData = [];
      let actsData = [];
      let resultsData = [];

      try {
        const appointmentsRes = await getPatientAppointments(id);
        appointmentsData = appointmentsRes.data || [];
      } catch (error) {
        console.warn('Erreur lors du chargement des rendez-vous:', error);
      }

      try {
        const actsRes = await getPatientMedicalActs(id);
        actsData = actsRes.data || [];
      } catch (error) {
        console.warn('Erreur lors du chargement des actes:', error);
      }

      try {
        const resultsRes = await getPatientResults(id);
        resultsData = resultsRes.data || [];
      } catch (error) {
        console.warn('Erreur lors du chargement des résultats:', error);
      }

      patientData.appointments = appointmentsData;
      patientData.acts = actsData;
      patientData.labResults = resultsData;

      // Build medical history from acts
      patientData.medicalHistory = patientData.acts.map(act => ({
        date: act.date || act.act_date,
        event: `${act.act_type}${act.forms?.length > 0 ? ' (Données cliniques)' : ''}: ${
          act.diagnoses?.length > 0 
            ? act.diagnoses
                .filter(d => d && d.diagnosis_label && d.diagnosis_label.trim())
                .map(d => d.diagnosis_label)
                .join(', ') || (act.description || 'Consultation')
            : (act.description || 'Consultation')
        }${act.amount ? ` - ${act.amount} DH` : ''}`,
        doctor: act.doctor_name || 'Dr.',
      }));

      // Build current treatments from acts that have treatment
      patientData.currentTreatments = patientData.acts
        .flatMap(act =>
          act.treatments
            ?.filter(t => t && t.drug_name && t.drug_name.trim())
            .map(treatment => ({
              name: treatment.drug_name || 'Médicament',
              dosage: treatment.dosage || '',
              frequency: treatment.frequency || '',
              duration: treatment.duration || '',
              startDate: act.date || act.act_date,
            })) || []
        );

      // Parse allergies from comma-separated string to array
      if (patientData.allergies && typeof patientData.allergies === 'string') {
        patientData.allergiesArray = patientData.allergies.split(',').map(a => a.trim()).filter(Boolean);
      } else {
        patientData.allergiesArray = [];
      }

      // Map emergency contact fields
      patientData.emergencyContact = {
        name: patientData.emergency_contact_name || '',
        relation: patientData.emergency_contact_relation || '',
        phone: patientData.emergency_contact_phone || '',
      };

      setPatient(patientData);
    } catch (error) {
      setPatient(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchPatient();
  }, [id]);

  const handleExportDossier = async () => {
    if (!patient) {
      alert('Impossible d\'exporter : dossier non chargé');
      return;
    }
    try {
      const response = await exportPatientDossier(id);
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      const filename = `Dossier_${patient.first_name}_${patient.last_name}.pdf`;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (error) {
      console.error('Erreur lors de l\'export du dossier:', error);
      alert('Une erreur est survenue lors de la génération du PDF.');
    }
  };

  const handleEditSuccess = () => {
    setShowEditModal(false);
    fetchPatient();
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'Date inconnue';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return 'Date invalide';
    return date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
  };

  if (isLoading) {
    return (
      <Layout>
        <div className="patient-detail-loading">
          <LoadingSpinner size="large" text="Chargement du dossier patient..." />
        </div>
      </Layout>
    );
  }

  if (!patient) {
    return (
      <Layout>
        <div className="patient-detail-page">
          <Breadcrumb 
            items={[
              { label: 'Patients', path: '/patients' }
            ]} 
          />
          <div className="detail-header">
            <button className="back-btn" onClick={() => navigate('/patients')}>
              <FiArrowLeft /> Retour aux patients
            </button>
          </div>
          <div style={{ padding: '40px', textAlign: 'center', color: '#666' }}>
            <p style={{ fontSize: '18px', marginBottom: '20px' }}>
              Erreur lors du chargement du dossier patient.
            </p>
            <button 
              onClick={() => fetchPatient()}
              style={{
                padding: '10px 20px',
                backgroundColor: '#007bff',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '14px'
              }}
            >
              Réessayer
            </button>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="patient-detail-page">
        {/* Breadcrumb Navigation */}
        <Breadcrumb 
          items={[
            { label: 'Patients', path: '/patients' },
            { label: `${patient.first_name} ${patient.last_name}` }
          ]} 
        />

        {/* Header */}
        <div className="detail-header">
          <button className="back-btn" onClick={() => navigate('/patients')}>
            <FiArrowLeft /> Retour aux patients
          </button>
          <div className="header-actions">
            <button className="export-btn" onClick={handleExportDossier}>
              <FiDownload /> Exporter dossier
            </button>
            <button className="edit-btn" onClick={() => setShowEditModal(true)}>
              <FiEdit2 /> Modifier
            </button>
          </div>
        </div>

        {/* Patient Info Card */}
        <div className="patient-info-card">
          <div className="patient-main-info">
            <div className="patient-avatar-large">{patient.first_name?.charAt(0)?.toUpperCase() || '?'}</div>
            <div className="patient-identity">
              <h1>{patient.first_name} {patient.last_name}</h1>
              <p className="patient-meta-info">
                {calculateAge(patient.date_of_birth)} ans • {patient.gender} • Né(e) le {formatDate(patient.date_of_birth)}
              </p>
              <span className={`status-badge ${patient.status === 'Actif' ? 'active' : 'pending'}`}>
                {patient.status}
              </span>
            </div>
          </div>
          
          <div className="patient-quick-info">
            <div className="quick-info-item">
              <FiPhone />
              <a href={`tel:${(patient.phone || '').replace(/\s/g, '')}`} className="clickable-phone" title="Appeler">{patient.phone}</a>
            </div>
            <div className="quick-info-item">
              <FiMail />
              <a href={`mailto:${patient.email}`} className="clickable-email">{patient.email}</a>
            </div>
            <div className="quick-info-item">
              <FiMapPin />
              <span>{patient.address || '-'}{patient.city && !(patient.address || '').includes(patient.city) ? ` • Ville: ${patient.city}` : ''}</span>
            </div>
          </div>

          <div className="patient-diagnosis-banner">
            <FiActivity />
            <span><strong>Diagnostic:</strong> {patient.primary_diagnosis || 'Aucun diagnostic'}</span>
          </div>
        </div>

        {/* Tabs */}
        <div className="detail-tabs">
          <button 
            className={`tab-btn ${activeTab === 'overview' ? 'active' : ''}`}
            onClick={() => setActiveTab('overview')}
          >
            <FiUser /> Vue d'ensemble
          </button>
          <button 
            className={`tab-btn ${activeTab === 'history' ? 'active' : ''}`}
            onClick={() => setActiveTab('history')}
          >
            <FiClock /> Historique
          </button>
          <button 
            className={`tab-btn ${activeTab === 'treatments' ? 'active' : ''}`}
            onClick={() => setActiveTab('treatments')}
          >
            <FiHeart /> Traitements
          </button>
          <button 
            className={`tab-btn ${activeTab === 'appointments' ? 'active' : ''}`}
            onClick={() => setActiveTab('appointments')}
          >
            <FiCalendar /> Rendez-vous
          </button>
          <button 
            className={`tab-btn ${activeTab === 'labs' ? 'active' : ''}`}
            onClick={() => setActiveTab('labs')}
          >
            <FiClipboard /> Résultats
          </button>
          <button 
            className={`tab-btn ${activeTab === 'acts' ? 'active' : ''}`}
            onClick={() => setActiveTab('acts')}
          >
            <FiFileText /> Actes
          </button>
        </div>

        {/* Tab Content */}
        <div className="tab-content">
          {activeTab === 'overview' && (
            <div className="overview-grid">
              {/* Personal Info */}
              <div className="info-card">
                <h3><FiUser /> Informations personnelles</h3>
                <div className="info-grid">
                  <div className="info-row">
                    <span className="info-label">Groupe sanguin</span>
                    <span className="info-value">{patient.blood_type || '-'}</span>
                  </div>
                  <div className="info-row">
                    <span className="info-label">Assurance</span>
                    <span className="info-value">{patient.insurance || 'Sans assurance'}</span>
                  </div>
                  <div className="info-row">
                    <span className="info-label">Allergies</span>
                    <span className="info-value allergies">
                      {(patient.allergiesArray && patient.allergiesArray.length > 0)
                        ? patient.allergiesArray.map((a, i) => (
                            <span key={i} className="allergy-tag">{a}</span>
                          ))
                        : 'Aucune allergie connue'
                      }
                    </span>
                  </div>
                </div>
              </div>

              {/* Emergency Contact */}
              <div className="info-card">
                <h3><FiAlertCircle /> Contact d'urgence</h3>
                <div className="info-grid">
                  <div className="info-row">
                    <span className="info-label">Nom</span>
                    <span className="info-value">{patient.emergencyContact && patient.emergencyContact.name}</span>
                  </div>
                  <div className="info-row">
                    <span className="info-label">Relation</span>
                    <span className="info-value">{patient.emergencyContact && patient.emergencyContact.relation}</span>
                  </div>
                  <div className="info-row">
                    <span className="info-label">Téléphone</span>
                    <span className="info-value">{patient.emergencyContact && patient.emergencyContact.phone}</span>
                  </div>
                </div>
              </div>

              {/* Notes */}
              <div className="info-card full-width">
                <h3><FiFileText /> Notes médicales</h3>
                <p className="notes-content">{patient.notes || 'Aucune note'}</p>
              </div>
              {patient.notes_admin && (
                <div className="info-card full-width notes-admin">
                  <h3><FiFileText /> Notes administratives</h3>
                  <p className="notes-content">{patient.notes_admin}</p>
                </div>
              )}

              {/* Current Treatments */}
              <div className="info-card full-width">
                <h3><FiHeart /> Traitement en cours</h3>
                <div className="treatments-container">
                  {(patient.currentTreatments && Array.isArray(patient.currentTreatments) && patient.currentTreatments.length > 0)
                    ? patient.currentTreatments.map((treatment, index) => (
                        <div key={index} className="treatment-badge">
                          <div className="treatment-badge-name">{treatment.name}</div>
                          {formatTreatmentDetails(treatment) && (
                            <div className="treatment-badge-dosage">{formatTreatmentDetails(treatment)}</div>
                          )}
                          {treatment.startDate && (
                            <div className="treatment-badge-date">Depuis {formatDate(treatment.startDate)}</div>
                          )}
                        </div>
                      ))
                    : <p className="empty-state">Aucun traitement en cours</p>
                  }
                </div>
              </div>
            </div>
          )}

          {activeTab === 'history' && (
            <div className="history-section">
              <div className="section-header">
                <h3>Historique médical</h3>
              </div>
              <div className="timeline">
                {(patient.medicalHistory && Array.isArray(patient.medicalHistory) && patient.medicalHistory.length > 0)
                  ? patient.medicalHistory.map((event, index) => (
                      <div key={index} className="timeline-item">
                        <div className="timeline-dot"></div>
                        <div className="timeline-content">
                          <span className="timeline-date">{formatDate(event.date)}</span>
                          <p className="timeline-event">{event.event}</p>
                          <span className="timeline-doctor">{event.doctor}</span>
                        </div>
                      </div>
                    ))
                  : <p className="empty-state">Aucun historique enregistré</p>
                }
              </div>
            </div>
          )}

          {activeTab === 'treatments' && (
            <div className="treatments-section">
              <div className="section-header">
                <h3>Traitements en cours</h3>
                <button className="add-btn" onClick={() => setShowTreatmentModal(true)}>
                  <FiPlusCircle /> Ajouter
                </button>
              </div>
              <div className="treatments-list">
                {(patient.currentTreatments && Array.isArray(patient.currentTreatments) && patient.currentTreatments.length > 0)
                  ? patient.currentTreatments.map((treatment, index) => (
                      <div key={index} className="treatment-card">
                        <div className="treatment-icon">💊</div>
                        <div className="treatment-info">
                          <h4>{treatment.name}</h4>
                          {formatTreatmentDetails(treatment) && (
                            <p className="treatment-dosage">{formatTreatmentDetails(treatment)}</p>
                          )}
                          <span className="treatment-date">Depuis {formatDate(treatment.startDate)}</span>
                        </div>
                      </div>
                    ))
                  : <p className="empty-state">Aucun traitement en cours</p>
                }
              </div>
            </div>
          )}

          {activeTab === 'appointments' && (
            <div className="appointments-section">
              <div className="section-header">
                <h3>Rendez-vous</h3>
                <button className="add-btn"><FiPlusCircle /> Nouveau RDV</button>
              </div>
              <div className="appointments-list">
                {(patient.appointments && Array.isArray(patient.appointments) && patient.appointments.length > 0)
                  ? patient.appointments.map((apt, index) => {
                      const dateTime = apt.datetime_scheduled ? new Date(apt.datetime_scheduled) : new Date(apt.date);
                      return (
                        <div key={index} className="appointment-card">
                          <div className="appointment-date">
                            <span className="day">{dateTime.getDate()}</span>
                            <span className="month">{dateTime.toLocaleDateString('fr-FR', { month: 'short' })}</span>
                          </div>
                          <div className="appointment-info">
                            <h4>{apt.type}</h4>
                            <p>{dateTime.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</p>
                          </div>
                          <span className={`appointment-status ${apt.status === 'Confirmé' ? 'confirmed' : 'planned'}`}>
                            {apt.status}
                          </span>
                        </div>
                      );
                    })
                  : <p className="empty-state">Aucun rendez-vous planifié</p>
                }
              </div>
            </div>
          )}

          {activeTab === 'labs' && (
            <div className="labs-section">
              <div className="section-header">
                <h3>Résultats de laboratoire</h3>
                <button className="add-btn" onClick={() => setShowLabResultModal(true)}>
                  <FiPlusCircle /> Ajouter un résultat
                </button>
              </div>
              <table className="labs-table">
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
                  {(patient.labResults && Array.isArray(patient.labResults) && patient.labResults.length > 0)
                    ? patient.labResults.map((result, index) => (
                        <tr key={index}>
                          <td>{formatDate(result.result_date)}</td>
                          <td>{result.result_name}</td>
                          <td>{result.result_value}</td>
                          <td>{result.result_unit || '-'}</td>
                          <td>
                            <span className={`lab-status ${result.is_abnormal ? 'abnormal' : 'normal'}`}>
                              {result.is_abnormal ? 'Anormal' : 'Normal'}
                            </span>
                          </td>
                        </tr>
                      ))
                    : null
                  }
                </tbody>
              </table>
              {(!patient.labResults || patient.labResults.length === 0) && (
                <p className="empty-state">Aucun résultat disponible</p>
              )}
            </div>
          )}

          {activeTab === 'acts' && (
            <div className="acts-section">
              <div className="section-header">
                <h3>Actes médicaux / Consultations</h3>
                <button className="add-btn" onClick={() => navigate(`/medical-acts?patientId=${patient.id}&new=1`)}>
                  <FiPlusCircle /> Nouvel acte
                </button>
              </div>
              <div className="acts-list">
                {(patient.acts && Array.isArray(patient.acts) && patient.acts.length > 0)
                  ? patient.acts.map((act) => (
                      <div key={act.id} className="act-card">
                        <div className="act-date">
                          <span className="day">{new Date(act.date).getDate()}</span>
                          <span className="month">{new Date(act.date).toLocaleDateString('fr-FR', { month: 'short' })}</span>
                        </div>
                        <div className="act-info">
                          <h4>
                            {act.type} 
                            {act.forms?.length > 0 && <span className="clinical-badge" title="Données cliniques enregistrées">📋 Clinique</span>}
                          </h4>
                          <p className="act-report">{act.report}</p>
                          <div className="act-footer">
                            <span className="act-doctor">{act.doctor}</span>
                            {act.amount > 0 && <span className="patient-act-price-tag">{act.amount} DH</span>}
                          </div>
                        </div>
                        <span className={`act-status ${act.status === 'completed' ? 'completed' : 'pending'}`}>
                          {act.status === 'completed' ? 'Terminé' : 'En attente'}
                        </span>
                      </div>
                    ))
                  : <p className="empty-state">Aucun acte enregistré. <button type="button" className="link-btn" onClick={() => navigate(`/medical-acts?patientId=${patient.id}&new=1`)}>Ajouter un acte</button></p>
                }
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Edit Modal */}
      {showEditModal && (
        <div className="modal-overlay" onClick={() => setShowEditModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <PatientForm 
              initialData={patient} 
              isEdit={true} 
              onSuccess={handleEditSuccess}
              onClose={() => setShowEditModal(false)}
            />
          </div>
        </div>
      )}

      {/* Lab Result Modal */}
      {showLabResultModal && (
        <div className="modal-overlay" onClick={() => setShowLabResultModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <LabResultForm
              patientId={patient.id}
              onSuccess={() => {
                setShowLabResultModal(false);
                fetchPatient();
              }}
              onClose={() => setShowLabResultModal(false)}
            />
          </div>
        </div>
      )}

      {/* Treatment Modal */}
      {showTreatmentModal && (
        <div className="modal-overlay" onClick={() => setShowTreatmentModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <PatientTreatmentForm
              patientId={patient.id}
              onSuccess={() => {
                setShowTreatmentModal(false);
                fetchPatient();
              }}
              onClose={() => setShowTreatmentModal(false)}
            />
          </div>
        </div>
      )}
    </Layout>
  );
}

export default PatientDetailPage;
