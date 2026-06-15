import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiUsers, FiUserPlus, FiSearch, FiFilter, FiMoreVertical, FiEdit2, FiTrash2, FiEye, FiPhone, FiMail, FiCalendar, FiX, FiAlertTriangle } from 'react-icons/fi';
import Layout from '../../components/layout/Layout';
import StatCard from '../../components/cards/StatCard';
import { SkeletonCard, SkeletonTableRow, useToast } from '../../components/common';
import { getPatients, createPatient, updatePatient, deletePatient } from '../../api/api';
import { canDeleteClinicalRecords } from '../../utils/permissions';
import PatientForm from './PatientForm';
import './PatientsPage.css';

// Insurance / Mutuelle types for dropdown
const INSURANCE_OPTIONS = [
  { value: '', label: 'Sélectionner une assurance' },
  { value: 'CNSS', label: 'CNSS' },
  { value: 'CNOPS', label: 'CNOPS' },
  { value: 'RAMED', label: 'RAMED' },
  { value: 'FAR', label: 'FAR' },
  { value: 'Assurance privée', label: 'Assurance privée' },
  { value: 'Sans assurance', label: 'Sans assurance' },
  { value: 'Autre', label: 'Autre' },
];

function mapApiPatientToUi(p) {
  return {
    ...p,
    insuranceNumber: p.insurance_number,
    notesAdmin: p.notes_admin,
    lastVisit: p.last_visit ?? null,
    nextAppointment: p.next_appointment ?? null,
    avatar: (p.gender && p.gender.toLowerCase() === 'femme') ? '👩' : '👨',
  };
}

function PatientsPage() {
  const navigate = useNavigate();
  const canDeletePatient = canDeleteClinicalRecords();
  const [patients, setPatients] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedFilter, setSelectedFilter] = useState('Tous');
  const [currentPage, setCurrentPage] = useState(1);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [editFormData, setEditFormData] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [totalPatientCount, setTotalPatientCount] = useState(0);
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const toast = useToast();
  const itemsPerPage = 15;
  const totalPatients = totalPatientCount;
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const newThisMonth = Array.isArray(patients) ? patients.filter(p => {
    // Check created_at field from API
    if (!p.created_at) return false;
    const createdDate = new Date(p.created_at);
    return createdDate >= startOfMonth && createdDate <= now;
  }).length : 0;
  const todayStr = now.toISOString().slice(0, 10);
  const rdvToday = Array.isArray(patients) ? patients.filter(p => {
    if (!p.nextAppointment) return false;
    const appt = new Date(p.nextAppointment);
    return appt.toISOString().slice(0, 10) === todayStr;
  }).length : 0;
  const enAttente = Array.isArray(patients) ? patients.filter(p => p.status === 'En attente').length : 0;
  // Add patient form state
  const [addFormData, setAddFormData] = useState({
    ipp: '',
    name: '',
    birthDate: '',
    phone: '',
    email: '',
    city: '',
    gender: '',
    insurance: '',
    insuranceNumber: '',
    diagnosis: '',
    notes: '',
    notesAdmin: '',
    appointmentDate: '',
    appointmentTime: '',
    consultationType: '',
    duration: '60',
    appointmentReason: ''
  });

  const resetAddForm = () => {
    setAddFormData({
      ipp: '',
      name: '',
      birthDate: '',
      phone: '',
      email: '',
      city: '',
      gender: '',
      insurance: '',
      insuranceNumber: '',
      diagnosis: '',
      notes: '',
      notesAdmin: '',
      appointmentDate: '',
      appointmentTime: '',
      consultationType: '',
      duration: '60',
      appointmentReason: ''
    });
  };

  const loadPatients = async () => {
    try {
      setIsLoading(true);
      const patientsRes = await getPatients({
        limit: itemsPerPage,
        offset: (currentPage - 1) * itemsPerPage,
        q: debouncedSearch.trim() || undefined,
        status: selectedFilter === 'Tous' ? undefined : selectedFilter,
      });
      setTotalPatientCount(Number(patientsRes.headers['x-total-count'] || patientsRes.data?.length || 0));
      const rows = patientsRes.data || [];
      setPatients(rows.map((p) => mapApiPatientToUi(p)));
      setIsLoading(false);
    } catch {
      toast.error('Impossible de charger les patients');
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchTerm), 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearch, selectedFilter]);

  useEffect(() => {
    loadPatients();
  }, [currentPage, debouncedSearch, selectedFilter]);

  // Pagination logic
  const totalPages = Math.ceil(totalPatientCount / itemsPerPage);
  
  // Reset to page 1 if current page exceeds total pages
  useEffect(() => {
    if (currentPage > totalPages && totalPages > 0) {
      setCurrentPage(1);
    }
  }, [currentPage, totalPages]);

  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedPatients = patients;
  const getPaginationItems = () => {
    const visiblePages = new Set([1, totalPages]);
    const windowSize = 2;

    for (let page = currentPage - windowSize; page <= currentPage + windowSize; page += 1) {
      if (page >= 1 && page <= totalPages) {
        visiblePages.add(page);
      }
    }

    const pages = Array.from(visiblePages).sort((a, b) => a - b);
    return pages.reduce((items, page, index) => {
      if (index > 0 && page - pages[index - 1] > 1) {
        items.push(`ellipsis-${pages[index - 1]}-${page}`);
      }
      items.push(page);
      return items;
    }, []);
  };
  const paginationItems = getPaginationItems();

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  // Handle Edit
  const handleEditClick = (patient) => {
    setSelectedPatient(patient);
    setEditFormData({
      ipp: patient.ipp || '',
      name: patient.name,
      date_of_birth: patient.date_of_birth || '',
      gender: patient.gender,
      phone: patient.phone || '',
      email: patient.email || '',
      city: patient.city || '',
      insurance: patient.insurance || '',
      insuranceNumber: patient.insuranceNumber || '',
      diagnosis: patient.diagnosis,
      status: patient.status,
      notes: patient.notes || '',
      notesAdmin: patient.notesAdmin || '',
    });
    setShowEditModal(true);
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    try {
      await updatePatient(selectedPatient.id, {
        name: editFormData.name,
        date_of_birth: editFormData.date_of_birth || null,
        gender: editFormData.gender,
        phone: editFormData.phone || null,
        email: editFormData.email || null,
        city: editFormData.city || null,
        insurance: editFormData.insurance || null,
        insurance_number: editFormData.insuranceNumber || null,
        diagnosis: editFormData.diagnosis || null,
        status: editFormData.status || 'Actif',
        notes: editFormData.notes || null,
        notes_admin: editFormData.notesAdmin || null,
      });
      setPatients(patients.map(p => p.id === selectedPatient.id ? { ...p, ...editFormData } : p));
      setShowEditModal(false);
      setSelectedPatient(null);
      toast.success(`Patient ${editFormData.name} modifié avec succès`);
    } catch {
      toast.error('Erreur lors de la modification');
    }
  };

  // Handle Delete
  const handleDeleteClick = (patient) => {
    setSelectedPatient(patient);
    setShowDeleteModal(true);
  };

  const handleDeleteConfirm = async () => {
    const patientName = `${selectedPatient.first_name} ${selectedPatient.last_name}`;
    try {
      await deletePatient(selectedPatient.id);
      setPatients(patients.filter(p => p.id !== selectedPatient.id));
      setShowDeleteModal(false);
      setSelectedPatient(null);
      toast.success(`Patient ${patientName} supprimé avec succès`);
    } catch {
      toast.error('Erreur lors de la suppression');
    }
  };

  // Handle Add Patient
  const handleAddFormChange = (e) => {
    const { name, value } = e.target;
    setAddFormData(prev => ({ ...prev, [name]: value }));
  };

  const calculateAge = (birthDate) => {
    const today = new Date();
    const birth = new Date(birthDate);
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
      age--;
    }
    return age;
  };

  const handleAddSubmit = async (e) => {
    e.preventDefault();

    if (!addFormData.name || !addFormData.birthDate || !addFormData.gender || !addFormData.diagnosis) {
      toast.error('Veuillez remplir tous les champs obligatoires');
      return;
    }

    const genderLabel = addFormData.gender === 'homme' ? 'Homme' : 'Femme';
    try {
      const res = await createPatient({
        ipp: addFormData.ipp || null,
        name: addFormData.name,
        gender: genderLabel,
        date_of_birth: addFormData.birthDate || null,
        phone: addFormData.phone || null,
        email: addFormData.email || null,
        city: addFormData.city || null,
        insurance: addFormData.insurance || null,
        insurance_number: addFormData.insuranceNumber || null,
        diagnosis: addFormData.diagnosis,
        notes: addFormData.notes || null,
        notes_admin: addFormData.notesAdmin || null,
        status: 'Actif',
      });
      const created = mapApiPatientToUi(res.data);
      setPatients([created, ...patients]);
      setShowAddModal(false);
      resetAddForm();
      toast.success(`Patient ${addFormData.name} ajouté avec succès`);
    } catch {
      toast.error('Erreur lors de l\'ajout du patient');
    }
  };

  return (
    <Layout>
      <div className="patients-page">
        {/* Header Section */}
        <div className="page-header">
          <div className="header-content">
            <h1 className="page-title">Patients</h1>
            <p className="page-subtitle">Gérez vos patients et leurs dossiers médicaux</p>
          </div>
          <button className="add-patient-btn" onClick={() => setShowAddModal(true)}>
            <FiUserPlus />
            <span>Nouveau Patient</span>
          </button>
        </div>

        {/* Stats Cards */}
        <div className="patients-stats">
          {isLoading ? (
            <>
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
            </>
          ) : (
            <>
              <StatCard
                icon={<FiUsers />}
                label="Total Patients"
                percentage=""
                value={totalPatients}
                color="blue"
              />
              <StatCard
                icon={<FiUserPlus />}
                label="Nouveaux ce mois"
                percentage=""
                value={newThisMonth}
                color="green"
              />
              <StatCard
                icon={<FiCalendar />}
                label="RDV Aujourd'hui"
                percentage=""
                value={rdvToday}
                color="pink"
              />
              <StatCard
                icon={<FiUsers />}
                label="En attente"
                percentage=""
                value={enAttente}
                color="yellow"
              />
            </>
          )}
        </div>

        {/* Search and Filter Bar */}
        <div className="search-filter-bar">
          <div className="search-box">
            <FiSearch className="search-icon" />
            <input
              type="text"
              placeholder="Rechercher par IPP, nom, téléphone, diagnostic, ville..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="filter-buttons">
            {['Tous', 'Actif', 'En attente'].map(filter => (
              <button
                key={filter}
                className={`filter-btn ${selectedFilter === filter ? 'active' : ''}`}
                onClick={() => setSelectedFilter(filter)}
              >
                {filter}
              </button>
            ))}
          </div>
        </div>

        {/* Patients Table */}
        <div className="patients-table-card">
          <div className="table-header">
            <h3>Liste des Patients</h3>
            <span className="patient-count">{totalPatientCount} patients</span>
          </div>

          <div className="table-wrapper">
            <table className="patients-table">
              <thead>
                <tr>
                  <th>IPP</th>
                  <th>Patient</th>
                  <th>Contact</th>
                  <th>Ville</th>
                  <th>Diagnostic</th>
                  <th>Dernière visite</th>
                  <th>Prochain RDV</th>
                  <th>Statut</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <>
                    <SkeletonTableRow columns={9} />
                    <SkeletonTableRow columns={9} />
                    <SkeletonTableRow columns={9} />
                    <SkeletonTableRow columns={9} />
                    <SkeletonTableRow columns={9} />
                  </>
                ) : (
                  paginatedPatients.map(patient => (
                    <tr key={patient.id} className="patient-row" onClick={() => navigate(`/patients/${patient.id}`)}>
                      <td><span className="ipp-badge">{patient.ipp || '-'}</span></td>
                      <td>
                        <div className="patient-info">
                          <div className="patient-avatar">{patient.avatar}</div>
                          <div className="patient-details">
                            <span className="patient-name">{patient.first_name} {patient.last_name}</span>
                            <span className="patient-meta">{patient.date_of_birth ? calculateAge(patient.date_of_birth) : '-'} ans • {patient.gender}</span>
                          </div>
                        </div>
                      </td>
                      <td>
                        <div className="contact-info">
                          <span className="contact-item"><FiPhone /> {patient.phone}</span>
                          <span className="contact-item"><FiMail /> {patient.email}</span>
                        </div>
                      </td>
                      <td>{patient.display_city || '-'}</td>
                      <td>
                        {patient.display_diagnosis ? (
                          <span className="diagnosis-badge">{patient.display_diagnosis}</span>
                        ) : (
                          <span>-</span>
                        )}
                      </td>
                      <td>{formatDate(patient.lastVisit)}</td>
                      <td>
                        {patient.nextAppointment ? (
                          <span className="next-appointment">{formatDate(patient.nextAppointment)}</span>
                        ) : (
                          <span className="no-appointment">Non planifié</span>
                        )}
                      </td>
                      <td>
                        <span className={`status-badge ${patient.status === 'Actif' ? 'active' : 'pending'}`}>
                          {patient.status}
                        </span>
                      </td>
                      <td>
                        <div className="action-buttons" onClick={(e) => e.stopPropagation()}>
                          <button className="action-btn view" title="Voir le dossier" onClick={() => navigate(`/patients/${patient.id}`)}>
                            <FiEye />
                          </button>
                          <button className="action-btn edit" title="Modifier" onClick={() => handleEditClick(patient)}>
                            <FiEdit2 />
                          </button>
                          {canDeletePatient && (
                            <button className="action-btn delete" title="Supprimer" onClick={() => handleDeleteClick(patient)}>
                              <FiTrash2 />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="table-pagination">
              <span className="pagination-info">
                Affichage {totalPatientCount === 0 ? 0 : startIndex + 1}-{Math.min(endIndex, totalPatientCount)} sur {totalPatientCount}
              </span>
              <div className="pagination-buttons">
                <button 
                  className="pagination-btn" 
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage(currentPage - 1)}
                  title="Page précédente"
                >
                  ←
                </button>
                
                {paginationItems.map(item => (
                  typeof item === 'number' ? (
                    <button
                      key={item}
                      className={`pagination-btn ${currentPage === item ? 'active' : ''}`}
                      onClick={() => setCurrentPage(item)}
                    >
                      {item}
                    </button>
                  ) : (
                    <span key={item} className="pagination-ellipsis">...</span>
                  )
                ))}
                
                <button 
                  className="pagination-btn" 
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage(currentPage + 1)}
                  title="Page suivante"
                >
                  →
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Add Patient Modal */}
        {showAddModal && (
          <div className="modal-overlay">
            <div className="modal-content" onClick={e => e.stopPropagation()}>
              <PatientForm
                onSuccess={() => { loadPatients(); toast.success('Patient ajouté avec succès'); }}
                onClose={() => setShowAddModal(false)}
              />
            </div>
          </div>
        )}

        {/* Edit Patient Modal - Now using PatientForm with isEdit */}
        {showEditModal && selectedPatient && (
          <div className="modal-overlay">
            <div className="modal-content" onClick={e => e.stopPropagation()}>
              <PatientForm
                initialData={selectedPatient}
                isEdit={true}
                onSuccess={() => { loadPatients(); toast.success('Patient modifié avec succès'); }}
                onClose={() => setShowEditModal(false)}
              />
            </div>
          </div>
        )}

        {/* Delete Confirmation Modal */}
        {showDeleteModal && selectedPatient && (
          <div className="modal-overlay" onClick={() => setShowDeleteModal(false)}>
            <div className="modal-content delete-modal" onClick={e => e.stopPropagation()}>
              <div className="delete-icon">
                <FiAlertTriangle />
              </div>
              <h2>Supprimer le patient</h2>
              <p>Êtes-vous sûr de vouloir supprimer <strong>{selectedPatient.first_name} {selectedPatient.last_name}</strong> ?</p>
              <p className="delete-warning">Cette action est irréversible. Toutes les données du patient seront définitivement supprimées.</p>
              <div className="delete-actions">
                <button className="btn-cancel" onClick={() => setShowDeleteModal(false)}>
                  Annuler
                </button>
                <button className="btn-delete" onClick={handleDeleteConfirm}>
                  Supprimer
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}

export default PatientsPage;
