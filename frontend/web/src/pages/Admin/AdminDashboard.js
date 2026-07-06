import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

import Layout from '../../components/layout/Layout';
import StatCard from '../../components/cards/StatCard';
import { FiUsers, FiBarChart2, FiShield, FiSettings, FiLogIn, FiUserPlus, FiEdit2, FiTrash2, FiCalendar, FiFileText } from 'react-icons/fi';
import { getAdminStats, getAuditLogs } from '../../api/api';
import { getWelcomeDisplayName } from '../../utils/userGreeting';
import './AdminDashboard.css';

function AdminDashboard() {
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const adminName = getWelcomeDisplayName(user);

  const [stats, setStats] = useState(null);
  const [recentActivity, setRecentActivity] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const [statsRes, logsRes] = await Promise.all([
          getAdminStats(),
          getAuditLogs(10, 0),
        ]);
        setStats(statsRes.data);
        setRecentActivity(logsRes.data);
      } catch (err) {
        console.error('Failed to fetch admin data:', err);
      } finally {
        setIsLoading(false);
      }
    }
    fetchData();
  }, []);

  const formatAction = (action) => {
    const actions = {
      'LOGIN_SUCCESS': 'Connexion réussie',
      'LOGIN_FAILURE': 'Échec de connexion',
      'CREATE_PATIENT': 'Ajout patient',
      'UPDATE_PATIENT': 'Modification patient',
      'DELETE_PATIENT': 'Suppression patient',
      'CREATE_MEDICAL_ACT': 'Ajout acte médical',
      'UPDATE_MEDICAL_ACT': 'Modification acte',
      'DELETE_MEDICAL_ACT': 'Suppression acte',
      'CREATE_APPOINTMENT': 'Ajout rendez-vous',
      'UPDATE_APPOINTMENT': 'Modification rendez-vous',
      'DELETE_APPOINTMENT': 'Suppression rendez-vous',
      'PASSWORD_RESET_REQUEST': 'Demande mot de passe oublié',
      'RESET_PASSWORD': 'Réinitialisation mot de passe',
      'CHANGE_PASSWORD': 'Changement mot de passe',
    };
    return actions[action] || action;
  };

  const formatLogStatus = (status) => {
    if (status === 'success') return { label: 'Succès', tone: 'success' };
    if (status === 'pending') return { label: 'En attente', tone: 'pending' };
    return { label: 'Échec', tone: 'error' };
  };

  const getActionIcon = (action) => {
    if (action.includes('LOGIN')) return <FiLogIn />;
    if (action.includes('PATIENT')) return <FiUserPlus />;
    if (action.includes('MEDICAL')) return <FiFileText />;
    if (action.includes('APPOINTMENT')) return <FiCalendar />;
    return <FiEdit2 />;
  };

  const formatTime = (isoStr) => {
    if (!isoStr) return '';
    const d = new Date(isoStr);
    const now = new Date();
    const diffMs = now - d;
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return "À l'instant";
    if (diffMin < 60) return `Il y a ${diffMin} min`;
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24) return `Il y a ${diffH} h`;
    const diffD = Math.floor(diffH / 24);
    return `Il y a ${diffD} j`;
  };

  return (
    <Layout>
      <div className="dashboard admin-dashboard">
        {/* Welcome Section */}
        <div className="dashboard-grid">
          <div className="welcome-section">
            <p className="welcome-subtitle">Bonjour <strong>{adminName}</strong></p>
            <h1 className="welcome-title">Tableau de Bord Admin</h1>
            <p className="welcome-text">
              <span className="status-icon"> </span> Gestion de la plateforme et des utilisateurs
            </p>
          </div>
          <div className="admin-overview-card">
            <h3>Vue d'ensemble</h3>
            <div className="admin-overview-stats">
              <div className="admin-overview-item">
                <span className="admin-overview-value">{isLoading ? '...' : stats?.total_users ?? 0}</span>
                <span className="admin-overview-label">Utilisateurs</span>
              </div>
              <div className="admin-overview-item">
                <span className="admin-overview-value">{isLoading ? '...' : stats?.today_logins ?? 0}</span>
                <span className="admin-overview-label">Connexions aujourd'hui</span>
              </div>
              <div className="admin-overview-item">
                <span className="admin-overview-value">{isLoading ? '...' : stats?.monthly_actions ?? 0}</span>
                <span className="admin-overview-label">Actions ce mois</span>
              </div>
            </div>
          </div>
        </div>

        {/* Quick navigation cards */}
        <div className="stats-grid admin-stats-grid">
          <div className="admin-stat-wrapper" onClick={() => navigate('/admin/users')} role="button" tabIndex={0}>
            <StatCard
              icon={<FiUsers />}
              label="Gestion des utilisateurs"
              percentage="Voir, ajouter, modifier"
              value="Utilisateurs"
              color="blue"
            />
          </div>
          <div className="admin-stat-wrapper" onClick={() => navigate('/admin/analytics')} role="button" tabIndex={0}>
            <StatCard
              icon={<FiBarChart2 />}
              label="Analytique système"
              percentage="Statistiques d'utilisation"
              value="Plateforme"
              color="yellow"
            />
          </div>
          <div className="admin-stat-wrapper" onClick={() => navigate('/admin/security')} role="button" tabIndex={0}>
            <StatCard
              icon={<FiShield />}
              label="Logs & Sécurité"
              percentage="Logs et permissions"
              value="Sécurité"
              color="green"
            />
          </div>
          <div className="admin-stat-wrapper" onClick={() => navigate('/admin/settings')} role="button" tabIndex={0}>
            <StatCard
              icon={<FiSettings />}
              label="Paramètres"
              percentage="Configuration globale"
              value="Plateforme"
              color="pink"
            />
          </div>
        </div>

        {/* Recent activity */}
        <div className="admin-bottom-grid">
          <div className="admin-activity-card">
            <div className="admin-activity-header">
              <h3>Activité récente</h3>
              <button type="button" className="admin-link-btn" onClick={() => navigate('/admin/security')}>
                Voir tout
              </button>
            </div>
            {isLoading ? (
              <p style={{ padding: '1rem', color: '#9CA3AF' }}>Chargement...</p>
            ) : recentActivity.length === 0 ? (
              <p style={{ padding: '1rem', color: '#9CA3AF' }}>Aucune activité récente</p>
            ) : (
              <ul className="admin-activity-list">
                {recentActivity.map((item) => (
                  <li key={item.id} className="admin-activity-item">
                    <div className="admin-activity-icon">
                      {getActionIcon(item.action)}
                    </div>
                    <div className="admin-activity-info">
                      <span className="admin-activity-user">{item.username || 'Inconnu'}</span>
                      <span className="admin-activity-action">{formatAction(item.action)}</span>
                    </div>
                    <span className={`admin-activity-badge admin-activity-badge--${formatLogStatus(item.status).tone}`}>
                      {formatLogStatus(item.status).label}
                    </span>
                    <span className="admin-activity-time">{formatTime(item.timestamp)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="admin-quick-actions-card">
            <h3>Actions rapides</h3>
            <div className="admin-quick-actions">
              <button type="button" className="admin-action-btn" onClick={() => navigate('/admin/users?action=add')}>
                <FiUsers /> Ajouter un utilisateur
              </button>
              <button type="button" className="admin-action-btn" onClick={() => navigate('/admin/security')}>
                <FiShield /> Voir les logs
              </button>
              <button type="button" className="admin-action-btn" onClick={() => navigate('/admin/form-builder')}>
                <FiFileText /> Générateur de formulaires
              </button>
              <button type="button" className="admin-action-btn" onClick={() => navigate('/admin/settings')}>
                <FiSettings /> Paramètres
              </button>              
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}

export default AdminDashboard;
