import React, { useState, useMemo, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import Layout from '../../components/layout/Layout';
import { FiSearch, FiUserPlus, FiEdit2, FiTrash2, FiKey, FiToggleLeft, FiToggleRight, FiUsers, FiX, FiEye } from 'react-icons/fi';
import { SkeletonTableRow } from '../../components/common';
import EmptyState from '../../components/common/EmptyState';
import { getAdminUsers, toggleUserStatus, createUser, updateUser, deleteUser, resetUserPassword } from '../../api/api';
import '../../components/common/ConfirmDialog.css';
import './AdminDashboard.css';

const emptyForm = {
  email: '', password: '', first_name: '', last_name: '',
  role: 'doctor', specialty: '', phone: '', department: '',
};

function AdminUsers() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [users, setUsers] = useState([]);

  // Add modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState('');
  const [formLoading, setFormLoading] = useState(false);

  // Edit modal
  const [showEditModal, setShowEditModal] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [editError, setEditError] = useState('');
  const [editLoading, setEditLoading] = useState(false);

  // Delete confirm
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  // Reset password
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetTarget, setResetTarget] = useState(null);
  const [resetPassword, setResetPassword] = useState('');
  const [resetError, setResetError] = useState('');
  const [resetLoading, setResetLoading] = useState(false);

  useEffect(() => {
    if (searchParams.get('action') === 'add') {
      setShowAddModal(true);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const fetchUsers = async () => {
    setIsLoading(true);
    try {
      const res = await getAdminUsers();
      setUsers(res.data);
    } catch (err) {
      console.error('Failed to fetch users:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { fetchUsers(); }, []);

  const handleToggle = async (userId) => {
    try {
      const res = await toggleUserStatus(userId);
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, is_active: res.data.is_active } : u))
      );
    } catch (err) {
      console.error('Failed to toggle user status:', err);
    }
  };

  // ─── Add user ───
  const handleAddUser = async (e) => {
    e.preventDefault();
    setFormError('');
    if (!form.email || !form.password) { setFormError('Email et mot de passe sont obligatoires.'); return; }
    setFormLoading(true);
    try {
      await createUser(form);
      setShowAddModal(false);
      setForm(emptyForm);
      await fetchUsers();
    } catch (err) {
      setFormError(err.response?.data?.detail || 'Erreur lors de la création.');
    } finally { setFormLoading(false); }
  };

  const openAddModal = () => { setForm(emptyForm); setFormError(''); setShowAddModal(true); };

  // ─── Edit user ───
  const openEditModal = (u) => {
    setEditForm({ id: u.id, first_name: u.first_name || '', last_name: u.last_name || '', email: u.email || '', role: u.role || 'doctor', specialty: u.specialty || '', phone: u.phone || '', department: u.department || '' });
    setEditError('');
    setShowEditModal(true);
  };

  const handleEditUser = async (e) => {
    e.preventDefault();
    setEditError('');
    setEditLoading(true);
    try {
      const { id, ...data } = editForm;
      await updateUser(id, data);
      setShowEditModal(false);
      await fetchUsers();
    } catch (err) {
      setEditError(err.response?.data?.detail || 'Erreur lors de la modification.');
    } finally { setEditLoading(false); }
  };

  // ─── Delete user ───
  const confirmDelete = (u) => {
    setDeleteTarget(u);
    setDeleteError('');
    setShowDeleteConfirm(true);
  };

  const handleDelete = async () => {
    setDeleteLoading(true);
    setDeleteError('');
    try {
      await deleteUser(deleteTarget.id);
      setShowDeleteConfirm(false);
      setDeleteTarget(null);
      await fetchUsers();
    } catch (err) {
      setDeleteError(err.response?.data?.detail || 'Impossible de supprimer cet utilisateur.');
    } finally { setDeleteLoading(false); }
  };

  // ─── Reset password ───
  const openResetModal = (u) => { setResetTarget(u); setResetPassword(''); setResetError(''); setShowResetModal(true); };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    if (!resetPassword || resetPassword.length < 6) { setResetError('Minimum 6 caractères.'); return; }
    setResetError('');
    setResetLoading(true);
    try {
      await resetUserPassword(resetTarget.id, resetPassword);
      setShowResetModal(false);
    } catch (err) {
      setResetError(err.response?.data?.detail || 'Erreur.');
    } finally { setResetLoading(false); }
  };

  const filteredUsers = useMemo(() => {
    if (!search.trim()) return users;
    const q = search.toLowerCase();
    return users.filter(
      (u) =>
        (u.username || '').toLowerCase().includes(q) ||
        (u.email || '').toLowerCase().includes(q) ||
        (u.role || '').toLowerCase().includes(q) ||
        (u.first_name || '').toLowerCase().includes(q) ||
        (u.last_name || '').toLowerCase().includes(q)
    );
  }, [search, users]);

  const getRoleBadgeClass = (role) => {
    if (role === 'admin') return 'admin-badge admin-badge--admin';
    if (role === 'doctor' || role === 'medecin') return 'admin-badge admin-badge--medecin';
    if (role === 'infirmier') return 'admin-badge admin-badge--infirmier';
    return 'admin-badge';
  };

  const getStatusBadgeClass = (isActive) =>
    isActive ? 'admin-badge admin-badge--actif' : 'admin-badge admin-badge--inactif';

  const displayName = (u) => {
    if (u.first_name || u.last_name) return `${u.first_name || ''} ${u.last_name || ''}`.trim();
    return u.username;
  };

  return (
    <Layout>
      <div className="admin-section-page">
        <div className="admin-page-header">
          <h1 className="admin-page-title">Gestion des utilisateurs</h1>
          <p className="admin-page-subtitle">Voir et gérer tous les utilisateurs de la plateforme</p>
        </div>

        <div className="admin-card-wrap">
          <div className="admin-toolbar">
            <div className="admin-search-wrap">
              <FiSearch className="admin-search-icon" />
              <input type="search" placeholder="Rechercher par nom, email ou rôle..." value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Rechercher utilisateurs" disabled={isLoading} />
            </div>
            <button type="button" className="admin-btn-primary" onClick={openAddModal}>
              <FiUserPlus /> Ajouter
            </button>
          </div>

          {isLoading ? (
            <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>ID</th><th>Nom</th><th>Email</th><th>Rôle</th><th>Statut</th><th>Actions</th></tr></thead><tbody>{[1,2,3,4,5].map(i => <SkeletonTableRow key={i} columns={6} />)}</tbody></table></div>
          ) : filteredUsers.length === 0 ? (
            <EmptyState icon={FiUsers} title="Aucun utilisateur trouvé" description="Modifiez votre recherche ou ajoutez un nouvel utilisateur à la plateforme." />
          ) : (
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead><tr><th>ID</th><th>Nom</th><th>Email</th><th>Rôle</th><th>Statut</th><th>Actions</th></tr></thead>
                <tbody>
                  {filteredUsers.map((user) => (
                    <tr key={user.id}>
                      <td>{user.id}</td>
                      <td className="admin-clickable-name" onClick={() => navigate(`/admin/users/${user.id}`)}>{displayName(user)}</td>
                      <td>{user.email}</td>
                      <td><span className={getRoleBadgeClass(user.role)}>{user.role}</span></td>
                      <td><span className={getStatusBadgeClass(user.is_active)}>{user.is_active ? 'Actif' : 'Inactif'}</span></td>
                      <td>
                        <div className="admin-table-actions">
                          <button type="button" className="admin-btn-secondary" title="Voir" onClick={() => navigate(`/admin/users/${user.id}`)}><FiEye /></button>
                          <button type="button" className="admin-btn-secondary" title="Modifier" onClick={() => openEditModal(user)}><FiEdit2 /></button>
                          <button type="button" className="admin-btn-secondary" title="Réinitialiser mot de passe" onClick={() => openResetModal(user)}><FiKey /></button>
                          <button type="button" className="admin-btn-secondary" title={user.is_active ? 'Désactiver' : 'Activer'} onClick={() => handleToggle(user.id)}>
                            {user.is_active ? <FiToggleRight /> : <FiToggleLeft />}
                          </button>
                          <button type="button" className="admin-btn-secondary admin-btn-danger" title="Supprimer" onClick={() => confirmDelete(user)}><FiTrash2 /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ─── Add Modal ─── */}
      {showAddModal && (
        <div className="confirm-dialog-backdrop" onClick={() => setShowAddModal(false)}>
          <div className="confirm-dialog-card" style={{ minWidth: 420, maxWidth: '90vw', alignItems: 'stretch' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
              <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700 }}>Nouvel utilisateur</h3>
              <button type="button" onClick={() => setShowAddModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}><FiX size={20} /></button>
            </div>
            {formError && <div style={{ color: '#EF4444', marginBottom: 12, fontSize: '0.9rem' }}>{formError}</div>}
            <form onSubmit={handleAddUser} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <input placeholder="Prénom" value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} className="admin-input" />
                <input placeholder="Nom" value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} className="admin-input" />
              </div>
              <input type="email" placeholder="Email *" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="admin-input" />
              <input type="password" placeholder="Mot de passe *" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="admin-input" autoComplete="new-password" />
              <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className="admin-input">
                <option value="doctor">Médecin</option><option value="infirmier">Infirmier</option><option value="admin">Admin</option>
              </select>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <input placeholder="Spécialité" value={form.specialty} onChange={(e) => setForm({ ...form, specialty: e.target.value })} className="admin-input" />
                <input placeholder="Téléphone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="admin-input" />
              </div>
              <input placeholder="Département" value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} className="admin-input" />
              <button type="submit" className="admin-btn-primary" disabled={formLoading} style={{ marginTop: 8 }}>
                <FiUserPlus /> {formLoading ? 'Création...' : 'Créer l\'utilisateur'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ─── Edit Modal ─── */}
      {showEditModal && (
        <div className="confirm-dialog-backdrop" onClick={() => setShowEditModal(false)}>
          <div className="confirm-dialog-card" style={{ minWidth: 420, maxWidth: '90vw', alignItems: 'stretch' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
              <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700 }}>Modifier l'utilisateur</h3>
              <button type="button" onClick={() => setShowEditModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}><FiX size={20} /></button>
            </div>
            {editError && <div style={{ color: '#EF4444', marginBottom: 12, fontSize: '0.9rem' }}>{editError}</div>}
            <form onSubmit={handleEditUser} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <input placeholder="Prénom" value={editForm.first_name} onChange={(e) => setEditForm({ ...editForm, first_name: e.target.value })} className="admin-input" />
                <input placeholder="Nom" value={editForm.last_name} onChange={(e) => setEditForm({ ...editForm, last_name: e.target.value })} className="admin-input" />
              </div>
              <input type="email" placeholder="Email" value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} className="admin-input" />
              <select value={editForm.role} onChange={(e) => setEditForm({ ...editForm, role: e.target.value })} className="admin-input">
                <option value="doctor">Médecin</option><option value="infirmier">Infirmier</option><option value="admin">Admin</option>
              </select>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <input placeholder="Spécialité" value={editForm.specialty} onChange={(e) => setEditForm({ ...editForm, specialty: e.target.value })} className="admin-input" />
                <input placeholder="Téléphone" value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} className="admin-input" />
              </div>
              <input placeholder="Département" value={editForm.department} onChange={(e) => setEditForm({ ...editForm, department: e.target.value })} className="admin-input" />
              <button type="submit" className="admin-btn-primary" disabled={editLoading} style={{ marginTop: 8 }}>
                <FiEdit2 /> {editLoading ? 'Enregistrement...' : 'Enregistrer'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ─── Delete Confirm ─── */}
      {showDeleteConfirm && deleteTarget && (
        <div className="confirm-dialog-backdrop" onClick={() => setShowDeleteConfirm(false)}>
          <div className="confirm-dialog-card" onClick={(e) => e.stopPropagation()}>
            <h3 className="confirm-dialog-title">Supprimer l'utilisateur</h3>
            <div className="confirm-dialog-message">
              Êtes-vous sûr de vouloir supprimer <strong>{displayName(deleteTarget)}</strong> ({deleteTarget.email}) ? Cette action est irréversible.
            </div>
            {deleteError && (
              <div style={{ color: '#EF4444', marginBottom: 12, fontSize: '0.9rem' }}>{deleteError}</div>
            )}
            <div className="confirm-dialog-actions">
              <button type="button" className="confirm-btn" onClick={() => setShowDeleteConfirm(false)}>Annuler</button>
              <button type="button" className="confirm-btn confirm" onClick={handleDelete} disabled={deleteLoading}>
                {deleteLoading ? 'Suppression...' : 'Supprimer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Reset Password Modal ─── */}
      {showResetModal && resetTarget && (
        <div className="confirm-dialog-backdrop" onClick={() => setShowResetModal(false)}>
          <div className="confirm-dialog-card" style={{ minWidth: 380, alignItems: 'stretch' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
              <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700 }}>Réinitialiser le mot de passe</h3>
              <button type="button" onClick={() => setShowResetModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}><FiX size={20} /></button>
            </div>
            <p style={{ color: '#6B7280', fontSize: '0.9rem', marginBottom: 12 }}>
              Pour <strong>{displayName(resetTarget)}</strong> ({resetTarget.email})
            </p>
            {resetError && <div style={{ color: '#EF4444', marginBottom: 12, fontSize: '0.9rem' }}>{resetError}</div>}
            <form onSubmit={handleResetPassword} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <input type="password" placeholder="Nouveau mot de passe (min 6 car.)" required value={resetPassword} onChange={(e) => setResetPassword(e.target.value)} className="admin-input" autoComplete="new-password" />
              <button type="submit" className="admin-btn-primary" disabled={resetLoading}>
                <FiKey /> {resetLoading ? 'Réinitialisation...' : 'Réinitialiser'}
              </button>
            </form>
          </div>
        </div>
      )}
    </Layout>
  );
}

export default AdminUsers;
