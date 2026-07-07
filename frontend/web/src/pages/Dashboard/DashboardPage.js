import React, { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { FiUsers, FiCalendar, FiFileText, FiActivity, FiHeart, FiArrowRight } from 'react-icons/fi';
import Layout from '../../components/layout/Layout';
import StatCard from '../../components/cards/StatCard';
import { SkeletonCard, SkeletonChart, SkeletonListItem } from '../../components/common';
import { getDashboardSummary, getRecentActivity } from '../../api/api';
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

function DashboardPage() {
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const userName = getWelcomeDisplayName(user);
  const adminWelcome = isAdminWelcome(user);
  const [isLoading, setIsLoading] = useState(true);
  const [stats, setStats] = useState({
    totalPatients: 0,
    todayAppointments: 0,
    medicalActs: 0,
    consultations: 0,
    diagnosisRecords: 0,
    commonDiagnoses: [],
  });
  const [activity, setActivity] = useState([]);

  const [trendData, setTrendData] = useState([]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setIsLoading(true);
      try {
        // Keep the dashboard light: fetch aggregate data instead of full tables.
        const fetchDashboard = getDashboardSummary().then(r => r.data).catch(e => { console.error("Dashboard Summary Load Error:", e); return {}; });
        const fetchRecentActivity = getRecentActivity().then(r => r.data?.activities).catch(e => { console.error("Activity Load Error:", e); return []; });

        const [dashboard, remoteActivity] = await Promise.all([
          fetchDashboard, fetchRecentActivity
        ]);

        if (cancelled) return;

        setStats({
          totalPatients: dashboard?.total_patients || 0,
          todayAppointments: dashboard?.today_appointments || 0,
          medicalActs: dashboard?.medical_acts || 0,
          consultations: dashboard?.consultations || 0,
          diagnosisRecords: dashboard?.diagnosis_records || 0,
          commonDiagnoses: (dashboard?.common_diagnoses || []).map((diag, i) => ({
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
              />
              <StatCard
                icon={<FiCalendar />}
                label="Rendez-vous Aujourd'hui"
                percentage="Planifiés"
                value={`${stats.todayAppointments} rdv`}
                color="blue"
              />
              <StatCard
                icon={<FiFileText />}
                label="Actes Médicaux"
                percentage="Total"
                value={`${stats.medicalActs} actes`}
                color="green"
              />
              <StatCard
                icon={<FiActivity />}
                label="Consultations"
                percentage="Total"
                value={`${stats.consultations} consultations`}
                color="yellow"
              />
              <StatCard
                icon={<FiHeart />}
                label="Diagnostics"
                percentage="Fréquents"
                value={stats.commonDiagnoses.length ? `${stats.commonDiagnoses.length} types` : '-'}
                color="purple"
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

          {/* Assistant AI Promo */}
          <div className="assistant-promo-card">
            <div className="promo-content">
              <h3>Assistant IA</h3>
              <p>Obtenez des résumés de dossiers patients et des suggestions médicales en temps réel.</p>
              <button className="promo-btn" onClick={() => window.location.href = '/assistant'}>
                <span>Essayer maintenant</span>
                <FiArrowRight />
              </button>
            </div>
            <div className="promo-illustration">🤖</div>
          </div>

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
