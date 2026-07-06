import React, { useState } from 'react';
import { FiX, FiCheck, FiAlertCircle } from 'react-icons/fi';
import { createMedicalAct } from '../../api/api';
import TreatmentPrescriptionPanel from '../../components/Treatments/TreatmentPrescriptionPanel';
import './PatientTreatmentForm.css';

function PatientTreatmentForm({ patientId, onSuccess, onClose }) {
  const [treatments, setTreatments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (treatments.length === 0) {
      setError('Ajoutez au moins un médicament au traitement.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      await createMedicalAct({
        patient_id: patientId,
        act_type: 'Consultation',
        act_date: new Date().toISOString().split('T')[0],
        status: 'completed',
        description: 'Prescription — traitement en cours',
        treatment: treatments,
      });
      onSuccess();
    } catch (err) {
      console.error('Erreur lors de l\'enregistrement du traitement:', err);
      setError('Impossible d\'enregistrer le traitement. Réessayez.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="patient-treatment-form">
      <div className="patient-treatment-form-header">
        <h2>Ajouter un traitement</h2>
        <button type="button" className="close-btn" onClick={onClose} aria-label="Fermer">
          <FiX />
        </button>
      </div>

      <form onSubmit={handleSubmit}>
        <TreatmentPrescriptionPanel treatments={treatments} onChange={setTreatments} />

        {error && (
          <div className="patient-treatment-error">
            <FiAlertCircle /> {error}
          </div>
        )}

        <div className="patient-treatment-form-actions">
          <button type="button" className="btn-cancel" onClick={onClose} disabled={loading}>
            Annuler
          </button>
          <button type="submit" className="btn-submit" disabled={loading || treatments.length === 0}>
            <FiCheck /> {loading ? 'Enregistrement...' : 'Enregistrer le traitement'}
          </button>
        </div>
      </form>
    </div>
  );
}

export default PatientTreatmentForm;
