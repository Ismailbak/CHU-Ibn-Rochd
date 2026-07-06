import React, { useState, useEffect, useCallback } from 'react';
import Layout from '../../components/layout/Layout';
import { FiDownload, FiShield, FiAlertCircle, FiFileText, FiSearch, FiRefreshCw } from 'react-icons/fi';
import { SkeletonTableRow } from '../../components/common';
import EmptyState from '../../components/common/EmptyState';
import { getAuditLogs, exportAuditLogsCsv } from '../../api/api';
import './AdminDashboard.css';

const ACTION_OPTIONS = [
  { value: '', label: 'Toutes les actions' },
  { value: 'LOGIN_SUCCESS', label: 'Connexion réussie' },
  { value: 'LOGIN_FAILURE', label: 'Échec de connexion' },
  { value: 'CREATE_PATIENT', label: 'Ajout patient' },
  { value: 'UPDATE_PATIENT', label: 'Modification patient' },
  { value: 'DELETE_PATIENT', label: 'Suppression patient' },
  { value: 'CREATE_MEDICAL_ACT', label: 'Ajout acte médical' },
  { value: 'UPDATE_MEDICAL_ACT', label: 'Modification acte médical' },
  { value: 'DELETE_MEDICAL_ACT', label: 'Suppression acte médical' },
  { value: 'CREATE_APPOINTMENT', label: 'Ajout rendez-vous' },
  { value: 'UPDATE_APPOINTMENT', label: 'Modification rendez-vous' },
  { value: 'DELETE_APPOINTMENT', label: 'Suppression rendez-vous' },
  { value: 'PASSWORD_RESET_REQUEST', label: 'Demande mot de passe oublié' },
  { value: 'RESET_PASSWORD', label: 'Réinitialisation mot de passe (admin)' },
  { value: 'CHANGE_PASSWORD', label: 'Changement mot de passe' },
];

const formatLogStatus = (status) => {
  if (status === 'success') return { label: 'Succès', className: 'admin-badge--success' };
  if (status === 'pending') return { label: 'En attente', className: 'admin-badge--pending' };
  return { label: 'Échec', className: 'admin-badge--error' };
};

function AdminSecurity() {
  const [statusFilter, setStatusFilter] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [usernameFilter, setUsernameFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [logs, setLogs] = useState([]);
  const [exporting, setExporting] = useState(false);

  const buildFilters = useCallback(() => {
    const f = {};
    if (statusFilter) f.status = statusFilter;
    if (actionFilter) f.action = actionFilter;
    if (usernameFilter.trim()) f.username = usernameFilter.trim();
    if (dateFrom) f.date_from = dateFrom;
    if (dateTo) f.date_to = dateTo;
    return f;
  }, [statusFilter, actionFilter, usernameFilter, dateFrom, dateTo]);

  const fetchLogs = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await getAuditLogs(200, 0, buildFilters());
      setLogs(res.data);
    } catch (err) {
      console.error('Failed to fetch audit logs:', err);
    } finally {
      setIsLoading(false);
    }
  }, [buildFilters]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await exportAuditLogsCsv(buildFilters());
      const url = window.URL.createObjectURL(new Blob([res.data], { type: 'text/csv' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `audit_logs_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to export audit logs:', err);
    } finally {
      setExporting(false);
    }
  };

  const formatAction = (action) => {
    const match = ACTION_OPTIONS.find((o) => o.value === action);
    return match ? match.label : action;
  };

  const formatDate = (isoStr) => {
    if (!isoStr) return '';
    return new Date(isoStr).toLocaleDateString('fr-FR');
  };

  const formatTime = (isoStr) => {
    if (!isoStr) return '';
    return new Date(isoStr).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <Layout>
      <div className="admin-section-page">
        <div className="admin-page-header">
          <h1 className="admin-page-title">Logs & Sécurité</h1>
          <p className="admin-page-subtitle">Activité récente et tentatives de connexion</p>
        </div>

        <div className="admin-card-wrap">
          {/* Status filter buttons + export */}
          <div className="admin-toolbar">
            <div className="admin-security-filters">
              <button type="button" className={`admin-filter-btn ${statusFilter === '' ? 'active' : ''}`} onClick={() => setStatusFilter('')}>Tous</button>
              <button type="button" className={`admin-filter-btn ${statusFilter === 'success' ? 'active' : ''}`} onClick={() => setStatusFilter('success')}><FiShield /> Succès</button>
              <button type="button" className={`admin-filter-btn ${statusFilter === 'pending' ? 'active' : ''}`} onClick={() => setStatusFilter('pending')}>En attente</button>
              <button type="button" className={`admin-filter-btn ${statusFilter === 'failure' ? 'active' : ''}`} onClick={() => setStatusFilter('failure')}><FiAlertCircle /> Échecs</button>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" className="admin-btn-secondary" onClick={fetchLogs} disabled={isLoading}><FiRefreshCw /></button>
              <button type="button" className="admin-btn-secondary" onClick={handleExport} disabled={exporting || isLoading}>
                <FiDownload /> {exporting ? 'Export...' : 'Exporter CSV'}
              </button>
            </div>
          </div>

          {/* Advanced filters row */}
          <div className="admin-toolbar" style={{ borderTop: 'none', paddingTop: 0, flexWrap: 'wrap' }}>
            <div className="admin-search-wrap" style={{ flex: '1 1 180px', minWidth: 140 }}>
              <FiSearch className="admin-search-icon" />
              <input type="search" placeholder="Utilisateur..." value={usernameFilter} onChange={(e) => setUsernameFilter(e.target.value)} />
            </div>
            <select className="admin-input" style={{ flex: '1 1 180px', minWidth: 140 }} value={actionFilter} onChange={(e) => setActionFilter(e.target.value)}>
              {ACTION_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <input type="date" className="admin-input" style={{ flex: '0 1 160px', minWidth: 130 }} value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} title="Date début" />
            <input type="date" className="admin-input" style={{ flex: '0 1 160px', minWidth: 130 }} value={dateTo} onChange={(e) => setDateTo(e.target.value)} title="Date fin" />
          </div>

          {isLoading ? (
            <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Date</th><th>Heure</th><th>Utilisateur</th><th>Action</th><th>Statut</th><th>IP</th></tr></thead><tbody>{[1,2,3,4,5].map(i => <SkeletonTableRow key={i} columns={6} />)}</tbody></table></div>
          ) : logs.length === 0 ? (
            <EmptyState icon={FiFileText} title="Aucun log" description="Aucune activité ne correspond aux filtres sélectionnés." actionLabel="Réinitialiser les filtres" onAction={() => { setStatusFilter(''); setActionFilter(''); setUsernameFilter(''); setDateFrom(''); setDateTo(''); }} />
          ) : (
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead><tr><th>Date</th><th>Heure</th><th>Utilisateur</th><th>Action</th><th>Statut</th><th>IP</th></tr></thead>
                <tbody>
                  {logs.map((log) => (
                    <tr key={log.id}>
                      <td>{formatDate(log.timestamp)}</td>
                      <td>{formatTime(log.timestamp)}</td>
                      <td>{log.username || 'Inconnu'}</td>
                      <td>{formatAction(log.action)}</td>
                      <td>
                        {(() => {
                          const s = formatLogStatus(log.status);
                          return <span className={`admin-badge ${s.className}`}>{s.label}</span>;
                        })()}
                      </td>
                      <td><code className="admin-ip">{log.ip_address || '-'}</code></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}

export default AdminSecurity;
