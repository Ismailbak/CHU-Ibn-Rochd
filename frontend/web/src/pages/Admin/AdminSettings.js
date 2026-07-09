import React, { useState, useEffect } from 'react';
import Layout from '../../components/layout/Layout';
import { FiSave, FiSend, FiActivity, FiDatabase, FiUsers, FiCalendar, FiFileText, FiRefreshCw, FiSettings, FiBell, FiShield, FiCheckCircle, FiClock, FiHardDrive } from 'react-icons/fi';
import { getSettings, saveSettings, getSystemHealth, broadcastNotification } from '../../api/api';
import './AdminDashboard.css';
import './AdminSettings.css';

function AdminSettings() {
  const [settings, setSettings] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState('');

  // Broadcast
  const [broadcastTitle, setBroadcastTitle] = useState('');
  const [broadcastMsg, setBroadcastMsg] = useState('');
  const [broadcastSent, setBroadcastSent] = useState(false);
  const [broadcastLoading, setBroadcastLoading] = useState(false);
  const [broadcastError, setBroadcastError] = useState('');

  // System health
  const [health, setHealth] = useState(null);
  const [healthLoading, setHealthLoading] = useState(false);
  const [healthError, setHealthError] = useState('');

  useEffect(() => {
    async function load() {
      setIsLoading(true);
      try {
        const res = await getSettings();
        setSettings(res.data);
      } catch (err) {
        console.error('Failed to load settings:', err);
      } finally { setIsLoading(false); }
    }
    load();
    fetchHealth();
  }, []);

  const fetchHealth = async () => {
    setHealthLoading(true);
    setHealthError('');
    try {
      const res = await getSystemHealth();
      setHealth(res.data);
    } catch (err) {
      console.error('Failed to fetch health:', err);
      setHealth(null);
      setHealthError(err.response?.data?.detail || 'Impossible de charger la santé du système.');
    } finally { setHealthLoading(false); }
  };

  const toggle = (key) => {
    setSettings((s) => ({ ...s, [key]: !s[key] }));
    setSaved(false);
  };

  const handleSave = async () => {
    setSaveError('');
    try {
      await saveSettings(settings);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setSaveError(err.response?.data?.detail || 'Erreur lors de la sauvegarde.');
    }
  };

  const handleBroadcast = async (e) => {
    e.preventDefault();
    if (!broadcastTitle.trim() || !broadcastMsg.trim()) return;
    setBroadcastLoading(true);
    setBroadcastError('');
    setBroadcastSent(false);
    try {
      await broadcastNotification({ title: broadcastTitle.trim(), message: broadcastMsg.trim() });
      setBroadcastSent(true);
      setBroadcastTitle('');
      setBroadcastMsg('');
      setTimeout(() => setBroadcastSent(false), 3000);
    } catch (err) {
      console.error('Broadcast failed:', err);
      setBroadcastError(err.response?.data?.detail || 'Échec de l\'envoi de la notification.');
    } finally { setBroadcastLoading(false); }
  };

  const isOk = (value) => value === 'operational' || value === 'connected' || value === 'running' || value === 'ok';
  const healthLabels = {
    database: { ok: 'Connectée', err: 'Hors ligne' },
    users: { ok: 'Accessible', err: 'Inaccessible' },
    patients: { ok: 'Disponible', err: 'Indisponible' },
    appointments: { ok: 'Synchronisé', err: 'Désynchronisé' },
  };

  if (isLoading || !settings) {
    return (
      <Layout>
        <div className="admin-section-page">
          <div className="admin-page-header">
            <h1 className="admin-page-title">Paramètres de la plateforme</h1>
          </div>
          <div className="settings-loading">
            <div className="settings-loading-spinner" />
            <span>Chargement des paramètres...</span>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="admin-section-page">
        <div className="admin-page-header">
          <h1 className="admin-page-title">Paramètres de la plateforme</h1>
          <p className="admin-page-subtitle">Configuration globale, notifications et santé du système</p>
        </div>

        <div className="settings-grid">
          {/* ─── Left Column ─── */}
          <div className="settings-column">
            {/* General Settings Card */}
            <div className="settings-card">
              <div className="settings-card-header">
                <div className="settings-card-icon settings-card-icon--blue"><FiSettings size={18} /></div>
                <div>
                  <h3 className="settings-card-title">Général</h3>
                  <p className="settings-card-desc">Configuration de base de la plateforme</p>
                </div>
              </div>
              <div className="settings-card-body">
                <div className="settings-field">
                  <label className="settings-field-label">Nom de la plateforme</label>
                  <input className="settings-field-input" value={settings.platformName || ''} onChange={(e) => { setSettings({ ...settings, platformName: e.target.value }); setSaved(false); }} />
                </div>
                <div className="settings-field">
                  <label className="settings-field-label">
                    <FiClock size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />
                    Délai de session (minutes)
                  </label>
                  <input type="number" min={5} max={240} className="settings-field-input settings-field-input--sm" value={settings.sessionTimeout || 30} onChange={(e) => { setSettings({ ...settings, sessionTimeout: parseInt(e.target.value) || 30 }); setSaved(false); }} />
                </div>
                <div className="settings-field">
                  <label className="settings-field-label">
                    <FiHardDrive size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />
                    Fréquence des sauvegardes
                  </label>
                  <select className="settings-field-input settings-field-input--md" value={settings.backupFrequency || 'quotidien'} onChange={(e) => { setSettings({ ...settings, backupFrequency: e.target.value }); setSaved(false); }}>
                    <option value="quotidien">Quotidien</option>
                    <option value="hebdomadaire">Hebdomadaire</option>
                    <option value="mensuel">Mensuel</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Notifications Card */}
            <div className="settings-card">
              <div className="settings-card-header">
                <div className="settings-card-icon settings-card-icon--amber"><FiBell size={18} /></div>
                <div>
                  <h3 className="settings-card-title">Notifications</h3>
                  <p className="settings-card-desc">Gérer les alertes et notifications</p>
                </div>
              </div>
              <div className="settings-card-body">
                <div className="settings-toggle-row">
                  <div className="settings-toggle-info">
                    <span className="settings-toggle-label">Notifications système</span>
                    <span className="settings-toggle-hint">Alertes en temps réel dans l'application</span>
                  </div>
                  <button type="button" className={`admin-toggle ${settings.notifications ? 'active' : ''}`} onClick={() => toggle('notifications')} />
                </div>
                <div className="settings-toggle-row">
                  <div className="settings-toggle-info">
                    <span className="settings-toggle-label">Alertes par email</span>
                    <span className="settings-toggle-hint">Notifications envoyées par courriel</span>
                  </div>
                  <button type="button" className={`admin-toggle ${settings.emailAlerts ? 'active' : ''}`} onClick={() => toggle('emailAlerts')} />
                </div>
              </div>
            </div>

            {/* Maintenance Card */}
            <div className="settings-card">
              <div className="settings-card-header">
                <div className={`settings-card-icon ${settings.maintenanceMode ? 'settings-card-icon--red' : 'settings-card-icon--green'}`}>
                  <FiShield size={18} />
                </div>
                <div>
                  <h3 className="settings-card-title">Maintenance & Sécurité</h3>
                  <p className="settings-card-desc">État opérationnel du système</p>
                </div>
              </div>
              <div className="settings-card-body">
                <div className="settings-toggle-row">
                  <div className="settings-toggle-info">
                    <span className="settings-toggle-label">Mode maintenance</span>
                    <span className="settings-toggle-hint">Seuls les administrateurs gardent l'accès ; les autres voient un écran de maintenance</span>
                  </div>
                  <button type="button" className={`admin-toggle ${settings.maintenanceMode ? 'active' : ''}`} onClick={() => toggle('maintenanceMode')} />
                </div>
                <div className="settings-status-bar">
                  <span className="settings-status-label">État actuel</span>
                  {settings.maintenanceMode
                    ? <span className="settings-status-badge settings-status-badge--danger"><span className="settings-status-dot settings-status-dot--danger" />Maintenance</span>
                    : <span className="settings-status-badge settings-status-badge--ok"><span className="settings-status-dot settings-status-dot--ok" />Opérationnel</span>}
                </div>
              </div>

              {/* Save Button */}
              <div className="settings-card-footer">
                {saveError && <span className="settings-error">{saveError}</span>}
                <button type="button" className={`settings-save-btn ${saved ? 'settings-save-btn--saved' : ''}`} onClick={handleSave}>
                  {saved ? <FiCheckCircle size={16} /> : <FiSave size={16} />}
                  {saved ? 'Enregistré !' : 'Enregistrer les modifications'}
                </button>
              </div>
            </div>
          </div>

          {/* ─── Right Column ─── */}
          <div className="settings-column">
            {/* System Health Card */}
            <div className="settings-card">
              <div className="settings-card-header">
                <div className="settings-card-icon settings-card-icon--purple"><FiActivity size={18} /></div>
                <div style={{ flex: 1 }}>
                  <h3 className="settings-card-title">Santé du système</h3>
                  <p className="settings-card-desc">Monitoring en temps réel</p>
                </div>
                <button type="button" className="settings-refresh-btn" onClick={fetchHealth} disabled={healthLoading} title="Actualiser">
                  <FiRefreshCw size={15} className={healthLoading ? 'settings-spin' : ''} />
                </button>
              </div>
              <div className="settings-card-body">
                {health ? (
                  <div className="settings-health-cards">
                    <div className={`settings-health-card ${isOk(health.database) ? 'settings-health-card--ok' : 'settings-health-card--err'}`}>
                      <FiDatabase size={22} />
                      <div className="settings-health-card-info">
                        <span className="settings-health-card-label">Base de données</span>
                        <span className="settings-health-card-val">
                          {isOk(health.database) ? healthLabels.database.ok : healthLabels.database.err}
                        </span>
                      </div>
                      <span className={`settings-health-dot ${isOk(health.database) ? 'settings-health-dot--ok' : 'settings-health-dot--err'}`} />
                    </div>
                    <div className={`settings-health-card ${isOk(health.users) ? 'settings-health-card--ok' : 'settings-health-card--err'}`}>
                      <FiUsers size={22} />
                      <div className="settings-health-card-info">
                        <span className="settings-health-card-label">Utilisateurs</span>
                        <span className="settings-health-card-val">
                          {isOk(health.users) ? healthLabels.users.ok : healthLabels.users.err}
                        </span>
                      </div>
                      <span className={`settings-health-dot ${isOk(health.users) ? 'settings-health-dot--ok' : 'settings-health-dot--err'}`} />
                    </div>
                    <div className={`settings-health-card ${isOk(health.patients) ? 'settings-health-card--ok' : 'settings-health-card--err'}`}>
                      <FiFileText size={22} />
                      <div className="settings-health-card-info">
                        <span className="settings-health-card-label">Patients</span>
                        <span className="settings-health-card-val">
                          {isOk(health.patients) ? healthLabels.patients.ok : healthLabels.patients.err}
                        </span>
                      </div>
                      <span className={`settings-health-dot ${isOk(health.patients) ? 'settings-health-dot--ok' : 'settings-health-dot--err'}`} />
                    </div>
                    <div className={`settings-health-card ${isOk(health.appointments) ? 'settings-health-card--ok' : 'settings-health-card--err'}`}>
                      <FiCalendar size={22} />
                      <div className="settings-health-card-info">
                        <span className="settings-health-card-label">Rendez-vous</span>
                        <span className="settings-health-card-val">
                          {isOk(health.appointments) ? healthLabels.appointments.ok : healthLabels.appointments.err}
                        </span>
                      </div>
                      <span className={`settings-health-dot ${isOk(health.appointments) ? 'settings-health-dot--ok' : 'settings-health-dot--err'}`} />
                    </div>
                  </div>
                ) : (
                  <div className="settings-health-empty">
                    {healthLoading ? (
                      <><div className="settings-loading-spinner settings-loading-spinner--sm" /><span>Chargement...</span></>
                    ) : (healthError || 'Indisponible')}
                  </div>
                )}
              </div>
            </div>

            {/* Broadcast Card */}
            <div className="settings-card">
              <div className="settings-card-header">
                <div className="settings-card-icon settings-card-icon--teal"><FiSend size={18} /></div>
                <div>
                  <h3 className="settings-card-title">Notification globale</h3>
                  <p className="settings-card-desc">Diffuser un message à tous les utilisateurs actifs</p>
                </div>
              </div>
              <div className="settings-card-body">
                <form onSubmit={handleBroadcast} className="settings-broadcast-form">
                  <div className="settings-field">
                    <label className="settings-field-label">Titre</label>
                    <input className="settings-field-input" placeholder="Ex: Maintenance prévue..." required value={broadcastTitle} onChange={(e) => setBroadcastTitle(e.target.value)} />
                  </div>
                  <div className="settings-field">
                    <label className="settings-field-label">Message</label>
                    <textarea className="settings-field-input settings-textarea" placeholder="Détails de la notification..." required rows={4} value={broadcastMsg} onChange={(e) => setBroadcastMsg(e.target.value)} />
                  </div>
                  {broadcastError && <span className="settings-error">{broadcastError}</span>}
                  <button type="submit" className={`settings-broadcast-btn ${broadcastSent ? 'settings-broadcast-btn--sent' : ''}`} disabled={broadcastLoading}>
                    {broadcastSent ? <FiCheckCircle size={16} /> : <FiSend size={16} />}
                    {broadcastLoading ? 'Envoi en cours...' : broadcastSent ? 'Envoyé avec succès !' : 'Diffuser la notification'}
                  </button>
                </form>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}

export default AdminSettings;
