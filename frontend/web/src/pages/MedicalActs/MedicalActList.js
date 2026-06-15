import React, { useEffect, useState } from 'react';
import { getMedicalActs, deleteMedicalAct } from '../../api/api';
import { canDeleteClinicalRecords } from '../../utils/permissions';

function MedicalActList({ onSelect }) {
  const [acts, setActs] = useState([]);
  const canDelete = canDeleteClinicalRecords();

  useEffect(() => {
    loadActs();
  }, []);

  const loadActs = () => {
    getMedicalActs().then((res) => setActs(res.data)).catch(() => {});
  };

  const handleDelete = async (id) => {
    await deleteMedicalAct(id);
    loadActs();
  };

  return (
    <div>
      <h3>Medical Acts (Actes Médicaux)</h3>
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Type</th>
            <th>Patient</th>
            <th>Description</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {acts.map((act) => (
            <tr key={act.id}>
              <td>{act.act_date}</td>
              <td>{act.act_type}</td>
              <td>{act.patient_name || act.patient_id}</td>
              <td>{act.description}</td>
              <td>{act.status}</td>
              <td>
                <button onClick={() => onSelect && onSelect(act)}>View</button>
                {canDelete && <button onClick={() => handleDelete(act.id)}>Delete</button>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {acts.length === 0 && <p>No medical acts found</p>}
    </div>
  );
}

export default MedicalActList;
