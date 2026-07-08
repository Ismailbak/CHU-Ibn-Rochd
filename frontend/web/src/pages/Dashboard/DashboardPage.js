import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { FiUsers, FiCalendar, FiFileText, FiMessageSquare, FiHeart, FiArrowRight } from 'react-icons/fi';
import Layout from '../../components/layout/Layout';
import StatCard from '../../components/cards/StatCard';
import { SkeletonCard, SkeletonChart, SkeletonListItem } from '../../components/common';
import { getDashboardSummary, getRecentActivity, getUpcomingAppointments } from '../../api/api';
import { getWelcomeDisplayName, isAdminWelcome } from '../../utils/userGreeting';
import './DashboardPage.css';

const diagnosisColors = [
  '#6B7280',
  '#F97316',
  '#3B82F6',
  '#06B6D4',
  '#10B981',
  '#F59E0B',
  '#EF4444',
  '#14B8A6',
  '#6366F1',
  '#84CC16',
  '#0EA5E9',
  '#A855F7',
];
const activityIcons = {
  patient: '👤',
  appointment: '📅',
  medical_act: '📋',
  medical: '📋',
};

function timeAgo(isoString) {
  if (!isoString) return 'Date inconnue';
  const now = new Date();
  const date = new Date(isoString);
  if (isNaN(date.getTime())) return 'Date inconnue';
  const diff = Math.floor((now - date) / 1000);
  if (diff < 0) return date.toLocaleDateString('fr-FR');
  if (diff < 60) return 'À l’instant';
  if (diff < 3600) return `Il y a ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `Il y a ${Math.floor(diff / 3600)} h`;
  if (diff < 172800) return 'Hier';
  return date.toLocaleDateString('fr-FR');
}

function formatUpcoming(isoString) {
  if (!isoString) return 'Date inconnue';
  const now = new Date();
  const date = new Date(isoString);
  if (isNaN(date.getTime())) return 'Date inconnue';

  const diffSec = Math.floor((date - now) / 1000);
  if (diffSec < 0) {
    return date.toLocaleString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  const timeLabel = date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const aptDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const dayDiff = Math.round((aptDay - today) / 86400000);

  if (dayDiff === 0) {
    if (diffSec < 3600) return `Dans ${Math.max(1, Math.floor(diffSec / 60))} min`;
    return `Aujourd'hui ${timeLabel}`;
  }
  if (dayDiff === 1) return `Demain ${timeLabel}`;
  if (diffSec < 86400 * 7) return `Dans ${dayDiff} j · ${timeLabel}`;

  return date.toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function DashboardPage() {
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const userName = getWelcomeDisplayName(user);
  const adminWelcome = isAdminWelcome(user);
  const [isLoading, setIsLoading] = useState(true);
  const [stats, setStats] = useState({
    totalPatients: 0,
    todayAppointments: 0,
    medicalActs: 0,
    diagnosisRecords: 0,
    commonDiagnoses: [],
  });
  const [activity, setActivity] = useState([]);
  const [upcomingAppointments, setUpcomingAppointments] = useState([]);

  const [trendData, setTrendData] = useState([]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setIsLoading(true);
      try {
        // Keep the dashboard light: fetch aggregate data instead of full tables.
        const fetchDashboard = getDashboardSummary().then(r => r.data).catch(e => { console.error("Dashboard Summary Load Error:", e); return {}; });
        const fetchRecentActivity = getRecentActivity().then(r => r.data?.activities).catch(e => { console.error("Activity Load Error:", e); return []; });
        const fetchUpcomingAppointments = getUpcomingAppointments(5).then(r => r.data?.appointments).catch(e => { console.error("Upcoming Appointments Load Error:", e); return []; });

        const [dashboard, remoteActivity, remoteUpcoming] = await Promise.all([
          fetchDashboard, fetchRecentActivity, fetchUpcomingAppointments
        ]);

        if (cancelled) return;

        setStats({
          totalPatients: dashboard?.total_patients || 0,
          todayAppointments: dashboard?.today_appointments || 0,
          medicalActs: dashboard?.medical_acts || 0,
          diagnosisRecords: dashboard?.diagnosis_records || 0,
          commonDiagnoses: (dashboard?.common_diagnoses || []).slice(0, 10).map((diag, i) => ({
            name: diag.name,
            value: diag.count,
            color: diagnosisColors[i % diagnosisColors.length]
          })),
        });

        setTrendData(dashboard?.weekly_trend || []);
        setActivity((remoteActivity || []).slice(0, 5).map(item => ({
          ...item,
          icon: item.icon || activityIcons[item.type] || '•',
        })));
        setUpcomingAppointments(remoteUpcoming || []);

      } catch (err) {
        if (!cancelled) {
          console.error("Dashboard Global Load Error:", err);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  return (
    <Layout>
      <div className="dashboard">
        {/* Welcome Section */}
        <div className="dashboard-grid">
          <div className="welcome-section">
            <p className="welcome-subtitle">
              {adminWelcome ? (
                <>Bonjour <strong>{userName}</strong></>
              ) : (
                <>Bonjour, <strong>{userName}</strong> - Bienvenue</>
              )}
            </p>
            <h1 className="welcome-title">Tableau de Bord</h1>
            <p className="welcome-text">
              <span className="status-icon"> </span> Vue d'ensemble de votre activité
            </p>
          </div>

          {/* Line Chart */}
          {isLoading ? (
            <SkeletonChart height="220px" />
          ) : (
            <div className="chart-card">
              <div className="chart-header">
                <h3>Activité Hebdomadaire</h3>
                <div className="chart-legend-top">
                  <span className="legend-item"><i className="dot rdv"></i> RDV</span>
                  <span className="legend-item"><i className="dot actes"></i> Actes</span>
                </div>
              </div>
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
                  <XAxis dataKey="name" stroke="#9CA3AF" fontSize={11} axisLine={false} tickLine={false} />
                  <YAxis stroke="#9CA3AF" fontSize={11} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 15px rgba(0,0,0,0.1)' }}
                  />
                  <Line
                    type="monotone"
                    dataKey="rdv"
                    name="Rendez-vous"
                    stroke="#3B82F6"
                    strokeWidth={3}
                    dot={{ fill: '#3B82F6', strokeWidth: 2, r: 4 }}
                    activeDot={{ r: 6, strokeWidth: 0 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="actes"
                    name="Actes"
                    stroke="#8B5CF6"
                    strokeWidth={3}
                    dot={{ fill: '#8B5CF6', strokeWidth: 2, r: 4 }}
                    activeDot={{ r: 6, strokeWidth: 0 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Stat Cards */}
        <div className="stats-grid">
          {isLoading ? (
            <>
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
            </>
          ) : (
            <>
              <StatCard
                icon={<FiUsers />}
                label="Patients"
                percentage="Total"
                value={`${stats.totalPatients} patients`}
                color="pink"
                onClick={() => navigate('/patients')}
              />
              <StatCard
                icon={<FiCalendar />}
                label="Rendez-vous Aujourd'hui"
                percentage="Planifiés"
                value={`${stats.todayAppointments} rdv`}
                color="blue"
                onClick={() => navigate('/appointments')}
              />
              <StatCard
                icon={<FiFileText />}
                label="Actes Médicaux"
                percentage="Total"
                value={`${stats.medicalActs} actes`}
                color="green"
                onClick={() => navigate('/medical-acts')}
              />
              <StatCard
                icon={<FiMessageSquare />}
                label="Assistant"
                percentage="Statut"
                value="Ready"
                color="yellow"
                onClick={() => navigate('/assistant')}
              />
              <StatCard
                icon={<FiHeart />}
                label="Diagnostics"
                percentage="Fréquents"
                value={stats.commonDiagnoses.length ? `${stats.commonDiagnoses.length} types` : '-'}
                color="purple"
                onClick={() => navigate('/analytics')}
              />
            </>
          )}
        </div>

        {/* Bottom Section */}
        <div className="bottom-grid">
          {/* Recent Activity */}
          {isLoading ? (
            <div className="activity-card">
              <h3>Activité Récente</h3>
              <div className="activity-list">
                <SkeletonListItem />
                <SkeletonListItem />
                <SkeletonListItem />
              </div>
            </div>
          ) : (
            <div className="activity-card">
              <h3>Activité Récente</h3>
              <div className="activity-list">
                {activity.length === 0 && <div className="activity-empty-state">Aucune activité récente à afficher</div>}
                {activity.map((item, idx) => (
                  <div className={`activity-item ${item.type}`} key={idx}>
                    <div className={`activity-icon ${item.type}`}>{item.icon}</div>
                    <div className="activity-info">
                      <p className="activity-title">{item.title}</p>
                      <p className="activity-subtitle">{item.subtitle}</p>
                    </div>
                    <span className="activity-time">{timeAgo(item.time)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Upcoming Appointments */}
          {isLoading ? (
            <div className="upcoming-card">
              <h3>Prochains rendez-vous</h3>
              <div className="activity-list">
                <SkeletonListItem />
                <SkeletonListItem />
                <SkeletonListItem />
              </div>
            </div>
          ) : (
            <div className="upcoming-card">
              <div className="upcoming-card-header">
                <h3>Prochains rendez-vous</h3>
                <button
                  type="button"
                  className="upcoming-view-all"
                  onClick={() => navigate('/appointments')}
                >
                  <span>Voir tout</span>
                  <FiArrowRight />
                </button>
              </div>
              <div className="activity-list">
                {upcomingAppointments.length === 0 && (
                  <div className="activity-empty-state">Aucun rendez-vous à venir</div>
                )}
                {upcomingAppointments.map((apt) => (
                  <div
                    className="activity-item appointment upcoming-item"
                    key={apt.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => navigate('/appointments')}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') navigate('/appointments');
                    }}
                  >
                    <div className="activity-icon appointment">
                      <FiCalendar />
                    </div>
                    <div className="activity-info">
                      <p className="activity-title">{apt.patient_name || 'Patient'}</p>
                      <p className="activity-subtitle">
                        {apt.reason?.trim() || 'Rendez-vous'}
                        {' · '}
                        <span className={`upcoming-status upcoming-status-${apt.status || 'scheduled'}`}>
                          {apt.status_label || 'En attente'}
                        </span>
                      </p>
                    </div>
                    <span className="activity-time">{formatUpcoming(apt.datetime_scheduled)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Diagnosis Chart */}
          <div className="diagnosis-card">
            <h3>Diagnostics</h3>
            <div className="diagnosis-chart">
              <ResponsiveContainer width="100%" height={150}>
                <PieChart>
                  <Pie
                    data={stats.commonDiagnoses.length ? stats.commonDiagnoses : [{ name: '-', value: 1, color: '#E5E7EB' }]}
                    cx="50%"
                    cy="50%"
                    innerRadius={40}
                    outerRadius={60}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {(stats.commonDiagnoses.length ? stats.commonDiagnoses : [{ color: '#E5E7EB' }]).map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="diagnosis-center">
                <span className="diagnosis-total">{stats.diagnosisRecords}</span>
                <span className="diagnosis-label">Diagnostics</span>
              </div>
            </div>
            <div className="diagnosis-legend">
              {(stats.commonDiagnoses.length ? stats.commonDiagnoses : []).map((item, index) => (
                <div key={index} className="legend-item">
                  <span className="legend-dot" style={{ background: item.color }}></span>
                  <span>{item.name} ({item.value})</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}

export default DashboardPage;
