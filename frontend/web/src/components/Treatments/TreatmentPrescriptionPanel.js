import React, { useState } from 'react';
import { FiPlus, FiX } from 'react-icons/fi';
import { RHEUMATOLOGY_TREATMENTS } from '../../constants/rheumatologyTreatments';
import '../../pages/MedicalActs/MedicalActForm.css';

function formatTreatmentDetails(treatment) {
  return [
    treatment.dosage ? `Dosage: ${treatment.dosage}` : '',
    treatment.frequency ? `Fréquence: ${treatment.frequency}` : '',
    treatment.duration ? `Durée: ${treatment.duration}` : '',
  ].filter(Boolean).join(' • ');
}

export default function TreatmentPrescriptionPanel({ treatments = [], onChange }) {
  const [selectedFamily, setSelectedFamily] = useState('');
  const [selectedDrug, setSelectedDrug] = useState('');
  const [treatmentDetails, setTreatmentDetails] = useState({
    duration: '',
    dosage: '',
    frequency: '',
  });

  const list = Array.isArray(treatments) ? treatments : [];
  const familyItems = selectedFamily
    ? RHEUMATOLOGY_TREATMENTS.find((g) => g.category === selectedFamily)?.items || []
    : [];

  const handleAdd = () => {
    if (!selectedDrug) return;
    onChange([...list, { drug_name: selectedDrug, ...treatmentDetails }]);
    setSelectedDrug('');
    setTreatmentDetails({ duration: '', dosage: '', frequency: '' });
  };

  const handleRemove = (index) => {
    onChange(list.filter((_, i) => i !== index));
  };

  return (
    <div className="maf-field">
      <label className="maf-label">Traitement / Ordonnance</label>

      <div
        className="maf-treatment-adder"
        style={{
          background: '#FAFAFA',
          padding: '16px',
          borderRadius: '10px',
          border: '1.5px solid #E5E7EB',
        }}
      >
        <div className="maf-grid-2" style={{ gap: '15px' }}>
          <div className="maf-field">
            <label className="maf-label">Famille de traitement</label>
            <select
              className="maf-input"
              value={selectedFamily}
              onChange={(e) => {
                setSelectedFamily(e.target.value);
                setSelectedDrug('');
              }}
            >
              <option value="">-- Sélectionner une famille --</option>
              {RHEUMATOLOGY_TREATMENTS.map((group) => (
                <option key={group.category} value={group.category}>
                  {group.category}
                </option>
              ))}
            </select>
          </div>
          <div className="maf-field">
            <label className="maf-label">Médicament</label>
            <select
              className="maf-input"
              value={selectedDrug}
              onChange={(e) => setSelectedDrug(e.target.value)}
              disabled={!selectedFamily}
            >
              <option value="">-- Sélectionner un médicament --</option>
              {familyItems.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>
        </div>

        {selectedDrug && (
          <div className="maf-grid-3" style={{ gap: '15px', marginTop: '15px' }}>
            <div className="maf-field">
              <label className="maf-label">Dosage</label>
              <input
                type="text"
                className="maf-input"
                placeholder="Ex: 1000mg"
                value={treatmentDetails.dosage}
                onChange={(e) =>
                  setTreatmentDetails((prev) => ({ ...prev, dosage: e.target.value }))
                }
              />
            </div>
            <div className="maf-field">
              <label className="maf-label">Fréquence</label>
              <input
                type="text"
                className="maf-input"
                placeholder="Ex: 3x/jour"
                value={treatmentDetails.frequency}
                onChange={(e) =>
                  setTreatmentDetails((prev) => ({ ...prev, frequency: e.target.value }))
                }
              />
            </div>
            <div className="maf-field">
              <label className="maf-label">Durée</label>
              <input
                type="text"
                className="maf-input"
                placeholder="Ex: 7 jours"
                value={treatmentDetails.duration}
                onChange={(e) =>
                  setTreatmentDetails((prev) => ({ ...prev, duration: e.target.value }))
                }
              />
            </div>
          </div>
        )}

        <button
          type="button"
          className="maf-btn-add-lab"
          style={{ marginTop: '15px' }}
          disabled={!selectedDrug}
          onClick={handleAdd}
        >
          <FiPlus /> Ajouter au traitement
        </button>
      </div>

      {list.length > 0 && (
        <div className="maf-active-treatments" style={{ marginTop: '20px' }}>
          <h4 className="maf-treatment-group-title" style={{ marginBottom: '10px' }}>
            Traitement prescrit
          </h4>
          <div className="maf-lab-results-list" style={{ marginBottom: 0 }}>
            {list.map((treatment, index) => (
              <div key={`${treatment.drug_name}-${index}`} className="maf-lab-result-item">
                <div className="maf-lab-result-content">
                  <div className="maf-lab-result-header">
                    <span className="maf-lab-result-name">{treatment.drug_name}</span>
                  </div>
                  {formatTreatmentDetails(treatment) && (
                    <span className="maf-lab-result-date">{formatTreatmentDetails(treatment)}</span>
                  )}
                </div>
                <button
                  type="button"
                  className="maf-lab-result-remove"
                  onClick={() => handleRemove(index)}
                >
                  <FiX />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
