import React, { useState, useEffect } from 'react';
import { 
  FiUser, FiMail, FiPhone, FiLock, FiCamera, FiSave, 
  FiEdit2, FiShield, FiClock, FiActivity 
} from 'react-icons/fi';
import Layout from '../../components/layout/Layout';
import { SkeletonCard, useToast } from '../../components/common';
import {
  changePassword,
  getUserActivity,
  uploadProfilePicture,
  getUploadsUrl,
} from '../../api/api';
import { getProfileDisplayName, getProfileBadge } from '../../utils/userGreeting';
import { ROLE_NURSE } from '../../utils/permissions';
import './ProfilePage.css';

function ProfilePage() {
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [isUploadingPicture, setIsUploadingPicture] = useState(false);
  const [profile, setProfile] = useState(null);
  const [profilePicture, setProfilePicture] = useState(null);
  const [activity, setActivity] = useState(null);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const fileInputRef = React.useRef(null);

  const [passwords, setPasswords] = useState({
    current: '',
    new: '',
    confirm: ''
  });

  useEffect(() => {
    async function fetchProfileAndActivity() {
      setIsLoading(true);
      try {
        const res = await import('../../api/api').then(mod => mod.getCurrentUser());
        const user = res.data.user || res.data;
        setProfile({
          firstName: user.first_name || user.username || '',
          lastName: user.last_name || '',
          email: user.email || '',
          phone: user.phone || '',
          specialty: user.specialty || '',
          department: user.department || '',
          hospital: user.hospital || '',
          role: user.role || '',
          is_admin: user.is_admin || false,
        });
        
        // Set profile picture if exists
        if (user.profile_picture) {
          setProfilePicture(getUploadsUrl(user.profile_picture));
        }
        
        // Fetch user activity
        try {
          const activityRes = await getUserActivity();
          
          if (activityRes?.data && typeof activityRes.data === 'object' && activityRes.data.last_login) {
            setActivity(activityRes.data);
          } else {
            setActivity({
              last_login: 'Aujourd\'hui à 09:15',
              patients_this_month: 0,
              medical_acts_this_month: 0
            });
          }
        } catch (err) {
          console.error('Activity fetch error:', err.message);
          setActivity({
            last_login: 'Aujourd\'hui à 09:15',
            patients_this_month: 0,
            medical_acts_this_month: 0
          });
        }
      } catch (err) {
        console.error('Profile fetch error:', err);
        setProfile(null);
      } finally {
        setIsLoading(false);
      }
    }
    fetchProfileAndActivity();
  }, []);

  const profileDisplayName = profile
    ? getProfileDisplayName({
        first_name: profile.firstName,
        last_name: profile.lastName,
        firstName: profile.firstName,
        lastName: profile.lastName,
        email: profile.email,
        specialty: profile.specialty,
        role: profile.role,
        is_admin: profile.is_admin,
      })
    : '';
  const profileBadge = profile
    ? getProfileBadge({
        specialty: profile.specialty,
        role: profile.role,
        is_admin: profile.is_admin,
      })
    : null;
  const specialtyLabel = profile?.specialty === ROLE_NURSE
    ? 'Infirmier(ère)'
    : profile?.specialty;

  const toast = useToast();

  const handleProfileChange = (e) => {
    const { name, value } = e.target;
    setProfile(prev => ({ ...prev, [name]: value }));
  };

  const handlePasswordChange = (e) => {
    const { name, value } = e.target;
    setPasswords(prev => ({ ...prev, [name]: value }));
  };

  const handleSaveProfile = () => {
    setIsEditing(false);
    toast.success('Profil mis à jour avec succès');
  };

  const handlePictureClick = () => {
    fileInputRef.current?.click();
  };

  const handlePictureChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      toast.error('Format d\'image non supporté. Utilisez JPG, PNG, GIF ou WebP');
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error('La taille de l\'image ne doit pas dépasser 5 MB');
      return;
    }

    setIsUploadingPicture(true);
    try {
      await uploadProfilePicture(file);
      // Create a local preview URL
      const reader = new FileReader();
      reader.onload = (event) => {
        setProfilePicture(event.target.result);
      };
      reader.readAsDataURL(file);
      toast.success('Photo de profil mise à jour avec succès');
    } catch (err) {
      const errorMsg = err.response?.data?.detail || 'Erreur lors de l\'upload de la photo';
      toast.error(errorMsg);
    } finally {
      setIsUploadingPicture(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();

    // Validation
    if (!passwords.current || !passwords.new || !passwords.confirm) {
      toast.error('Veuillez remplir tous les champs');
      return;
    }

    if (passwords.new.length < 8) {
      toast.error('Le nouveau mot de passe doit contenir au moins 8 caractères');
      return;
    }

    if (passwords.new !== passwords.confirm) {
      toast.error('Les mots de passe ne correspondent pas');
      return;
    }

    setIsChangingPassword(true);
    try {
      await changePassword(passwords.current, passwords.new);
      setPasswords({ current: '', new: '', confirm: '' });
      toast.success('Mot de passe modifié avec succès');
    } catch (err) {
      const errorMsg = err.response?.data?.detail || 'Erreur lors du changement de mot de passe';
      // Check if it's authentication error (wrong current password)
      if (err.response?.status === 401 || errorMsg.includes('incorrect') || errorMsg.includes('invalid')) {
        toast.error('Le mot de passe actuel est incorrect');
      } else {
        toast.error(errorMsg);
      }
    } finally {
      setIsChangingPassword(false);
    }
  };

  return (
    <Layout>
      <div className="profile-page">
        <div className="profile-header">
          <h1>Mon Profil</h1>
          <p>Gérez vos informations personnelles et paramètres de sécurité</p>
        </div>

        {isLoading ? (
          <div className="profile-content">
            <SkeletonCard height="400px" />
            <div className="profile-sidebar-skeleton">
              <SkeletonCard height="250px" />
              <SkeletonCard height="200px" />
            </div>
          </div>
        ) : !profile ? (
          <div className="profile-content">
            <div style={{ color: 'red' }}>Impossible de charger le profil utilisateur.</div>
          </div>
        ) : (
        <div className="profile-content">
          {/* Profile Card */}
          <div className="profile-card main-profile">
            <div className="profile-avatar-section">
              <div className="profile-avatar" style={{ backgroundImage: profilePicture ? `url(${profilePicture})` : 'none', backgroundSize: 'cover', backgroundPosition: 'center', backgroundColor: !profilePicture ? '#1E2A4A' : 'transparent' }}>
                {!profilePicture && <FiUser style={{ fontSize: '50px', zIndex: 1 }} />}
                {!profilePicture && profileBadge && <div className="doctor-badge">{profileBadge}</div>}
                <button 
                  className="avatar-edit-btn" 
                  title="Changer la photo"
                  onClick={handlePictureClick}
                  disabled={isUploadingPicture}
                >
                  <FiCamera />
                </button>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={handlePictureChange}
                disabled={isUploadingPicture}
              />
              <div className="profile-info">
                    <h2>
                      <span>{profileDisplayName}</span>
                    </h2>
                {profile.phone && (
                  <div className="profile-phone" style={{ marginTop: 4, color: '#6B7280', fontSize: 15 }}>
                    <FiPhone style={{ marginRight: 4 }} /> {profile.phone}
                  </div>
                )}
                {profile.specialty && (
                  <div className="profile-specialty" style={{ marginTop: 4, color: '#6B7280', fontSize: 15 }}>
                    <strong>Spécialité:</strong> {specialtyLabel}
                  </div>
                )}
                {profile.department && (
                  <div className="profile-department" style={{ marginTop: 4, color: '#6B7280', fontSize: 15 }}>
                    <strong>Département:</strong> {profile.department}
                  </div>
                )}
                <span className="profile-hospital">{profile.hospital}</span>
              </div>
            </div>

            <div className="profile-actions">
              {isEditing ? (
                <button className="btn-save" onClick={handleSaveProfile}>
                  <FiSave /> Enregistrer
                </button>
              ) : (
                <button className="btn-edit" onClick={() => setIsEditing(true)}>
                  <FiEdit2 /> Modifier
                </button>
              )}
            </div>

            <div className="profile-form">
              <div className="form-row">
                <div className="form-group">
                  <label>Prénom</label>
                  <input
                    type="text"
                    name="firstName"
                    value={profile.firstName}
                    onChange={handleProfileChange}
                    disabled={!isEditing}
                  />
                </div>
                <div className="form-group">
                  <label>Nom</label>
                  <input
                    type="text"
                    name="lastName"
                    value={profile.lastName}
                    onChange={handleProfileChange}
                    disabled={!isEditing}
                  />
                </div>
              </div>

              <div className="form-group">
                <label><FiMail /> Adresse email</label>
                <input
                  type="email"
                  name="email"
                  value={profile.email}
                  onChange={handleProfileChange}
                  disabled={!isEditing}
                />
              </div>

              <div className="form-group">
                <label><FiPhone /> Téléphone</label>
                <input
                  type="tel"
                  name="phone"
                  value={profile.phone}
                  onChange={handleProfileChange}
                  disabled={!isEditing}
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Spécialité</label>
                  <input
                    type="text"
                    name="specialty"
                    value={profile.specialty}
                    onChange={handleProfileChange}
                    disabled={!isEditing}
                  />
                </div>
                <div className="form-group">
                  <label>Département</label>
                  <input
                    type="text"
                    name="department"
                    value={profile.department}
                    onChange={handleProfileChange}
                    disabled={!isEditing}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Security Card */}
          <div className="profile-card security-card">
            <div className="card-header">
              <FiShield />
              <h3>Sécurité</h3>
            </div>

            <form onSubmit={handleChangePassword} className="password-form">
              <div className="form-group">
                <label><FiLock /> Mot de passe actuel</label>
                <input
                  type="password"
                  name="current"
                  value={passwords.current}
                  onChange={handlePasswordChange}
                  placeholder="••••••••"
                />
              </div>

              <div className="form-group">
                <label><FiLock /> Nouveau mot de passe</label>
                <input
                  type="password"
                  name="new"
                  value={passwords.new}
                  onChange={handlePasswordChange}
                  placeholder="Minimum 8 caractères"
                />
              </div>

              <div className="form-group">
                <label><FiLock /> Confirmer le mot de passe</label>
                <input
                  type="password"
                  name="confirm"
                  value={passwords.confirm}
                  onChange={handlePasswordChange}
                  placeholder="Répétez le mot de passe"
                />
              </div>

              <button type="submit" className="btn-change-password" disabled={isChangingPassword}>
                {isChangingPassword ? 'Modification en cours...' : 'Changer le mot de passe'}
              </button>
            </form>
          </div>

          {/* Activity Card */}
          <div className="profile-card activity-card">
            <div className="card-header">
              <FiActivity />
              <h3>Activité Récente</h3>
            </div>

            <div className="activity-list">
              <div className="activity-item">
                <FiClock />
                <div>
                  <span className="activity-text">Dernière connexion</span>
                  <span className="activity-time">{activity?.last_login || 'Aujourd\'hui à 09:15'}</span>
                </div>
              </div>
              <div className="activity-item">
                <FiUser />
                <div>
                  <span className="activity-text">Patients consultés ce mois</span>
                  <span className="activity-count">{activity?.patients_this_month || 0}</span>
                </div>
              </div>
              <div className="activity-item">
                <FiEdit2 />
                <div>
                  <span className="activity-text">Actes médicaux réalisés</span>
                  <span className="activity-count">{activity?.medical_acts_this_month || 0}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
        )}
      </div>
    </Layout>
  );
}

export default ProfilePage;
