import React, { useState, useEffect } from 'react';
import { 
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ComposedChart
} from 'recharts';
import { 
  FiTrendingUp, FiDownload, FiCalendar, FiUsers, 
  FiActivity, FiPieChart, FiBarChart2, FiFileText
} from 'react-icons/fi';
import jsPDF from 'jspdf';
import Layout from '../../components/layout/Layout';
import { SkeletonCard, SkeletonChart } from '../../components/common';
import { getAnalyticsSummary } from '../../api/api';
import './AnalyticsPage.css';

const diagnosisColors = [
  '#3B82F6',
  '#10B981',
  '#F59E0B',
  '#EF4444',
  '#8B5CF6',
  '#EC4899',
  '#06B6D4',
  '#84CC16',
  '#F97316',
  '#6366F1',
  '#14B8A6',
  '#6B7280',
];

function AnalyticsPage() {
  const [dateRange, setDateRange] = useState('6months');
  const [activeTab, setActiveTab] = useState('overview');
  const [isLoading, setIsLoading] = useState(true);
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    getAnalyticsSummary(dateRange)
      .then((analyticsRes) => {
        if (!cancelled) {
          setSummary(analyticsRes.data);
          setIsLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError('Erreur lors du chargement des statistiques.');
          setIsLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, [dateRange]);

  // Debug: log backend summary to help diagnose empty charts
  useEffect(() => {
    if (summary) {
      // eslint-disable-next-line no-console
      console.debug('Analytics summary loaded:', summary);
    }
  }, [summary]);

  const totalPatients = summary?.total_patients ?? 0;
  const avgAge = summary?.avg_age ?? 0;
  const avgAgeLabel = avgAge ? `${Number(avgAge).toFixed(1)} ans` : '-';
  const commonDiagnoses = summary?.common_diagnoses ?? [];

  // Data now comes directly from the backend summary
  const weeklyAppointmentsData = summary?.weekly_activity ?? [];
  const ageDistributionData = summary?.demographics ?? [];
  const activityTrendData = summary?.activity_trends ?? [];
  const topTreatmentsData = summary?.treatments ?? [];

  const handleExportPDF = () => {
    if (!summary) return;

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    let yPosition = 15;
    const margin = 15;

    // Helper function to add a table
    const addTable = (columns, data, startY, headerColor) => {
      const colWidth = (pageWidth - 2 * margin) / columns.length;
      let y = startY;

      // Header
      doc.setFillColor(...headerColor);
      doc.setTextColor(255);
      doc.setFont(undefined, 'bold');
      doc.setFontSize(10);

      columns.forEach((col, i) => {
        doc.rect(margin + i * colWidth, y, colWidth, 8, 'F');
        doc.text(col, margin + i * colWidth + 2, y + 6, { maxWidth: colWidth - 4 });
      });

      y += 8;

      // Body
      doc.setTextColor(0);
      doc.setFont(undefined, 'normal');
      doc.setFontSize(9);

      data.forEach((row, rowIndex) => {
        if (y > pageHeight - 20) {
          doc.addPage();
          y = 15;
        }

        const rowHeight = 7;
        if (rowIndex % 2 === 0) {
          doc.setFillColor(245, 245, 245);
          doc.rect(margin, y, pageWidth - 2 * margin, rowHeight, 'F');
        }

        row.forEach((cell, i) => {
          doc.text(String(cell), margin + i * colWidth + 2, y + 5.5, { maxWidth: colWidth - 4 });
        });

        y += rowHeight;
      });

      return y + 5;
    };

    // ===== PAGE 1: COVER PAGE & SUMMARY =====
    doc.setFontSize(24);
    doc.setFont(undefined, 'bold');
    doc.text('Rapports & Analytiques', pageWidth / 2, yPosition, { align: 'center' });
    yPosition += 15;

    doc.setFontSize(12);
    doc.setFont(undefined, 'normal');
    doc.setTextColor(100);
    doc.text(`Analyses détaillées de votre activité médicale`, pageWidth / 2, yPosition, { align: 'center' });
    yPosition += 12;

    doc.setTextColor(150);
    doc.setFontSize(10);
    doc.text(`Période: ${dateRange}`, pageWidth / 2, yPosition, { align: 'center' });
    yPosition += 3;
    doc.text(`Généré le: ${new Date().toLocaleDateString('fr-FR', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`, pageWidth / 2, yPosition, { align: 'center' });
    yPosition += 15;

    // Summary Stats Box
    doc.setDrawColor(52, 182, 244);
    doc.setFillColor(219, 239, 255);
    doc.rect(margin, yPosition, pageWidth - 2 * margin, 45, 'FD');

    doc.setTextColor(0);
    doc.setFontSize(11);
    doc.setFont(undefined, 'bold');
    doc.text('Statistiques Principales', margin + 5, yPosition + 7);

    doc.setFontSize(10);
    doc.setFont(undefined, 'normal');
    yPosition += 13;
    doc.text(`• Patients traités: ${totalPatients}`, margin + 10, yPosition);
    yPosition += 6;
    doc.text(`• Âge moyen: ${avgAge.toFixed(1)} ans`, margin + 10, yPosition);
    yPosition += 6;
    doc.text(`• Diagnostics courants: ${commonDiagnoses.length}`, margin + 10, yPosition);
    yPosition += 15;

    // ===== SECTION 1: DIAGNOSTICS =====
    yPosition += 5;
    doc.setFontSize(13);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(52, 182, 244);
    doc.text('1. RÉPARTITION DES DIAGNOSTICS', margin, yPosition);
    yPosition += 8;

    if (commonDiagnoses.length > 0) {
      const diagnosisData = commonDiagnoses.map((diag, index) => [String(index + 1), diag.name, String(diag.count)]);
      yPosition = addTable(['#', 'Diagnostic', 'Nombre'], diagnosisData, yPosition, [52, 182, 244]);
    }

    // ===== SECTION 2: TREATMENTS =====
    yPosition += 3;
    doc.setFontSize(13);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(16, 185, 129);
    doc.text('2. TRAITEMENTS LES PLUS PRESCRITS', margin, yPosition);
    yPosition += 8;

    if (topTreatmentsData.length > 0) {
      const treatmentData = topTreatmentsData.slice(0, 10).map((treatment, index) => [
        String(index + 1),
        treatment.treatment,
        String(treatment.count || 0)
      ]);
      yPosition = addTable(['Rang', 'Traitement', 'Nombre'], treatmentData, yPosition, [16, 185, 129]);
    }

    // ===== PAGE 2: ACTIVITY =====
    if (activityTrendData.length > 0) {
      doc.addPage();
      yPosition = 15;

      doc.setFontSize(13);
      doc.setFont(undefined, 'bold');
      doc.setTextColor(139, 92, 246);
      doc.text('3. TENDANCE D\'ACTIVITÉ (Derniers 12 mois)', margin, yPosition);
      yPosition += 8;

      const activityData = activityTrendData.slice(0, 12).map(item => [
        item.period || 'N/A',
        String(item.count || 0)
      ]);
      yPosition = addTable(['Période', 'Activité'], activityData, yPosition, [139, 92, 246]);
    }

    // ===== PAGE 3: DEMOGRAPHICS =====
    if (ageDistributionData.length > 0 || weeklyAppointmentsData.length > 0) {
      doc.addPage();
      yPosition = 15;

      doc.setFontSize(13);
      doc.setFont(undefined, 'bold');
      doc.setTextColor(236, 72, 153);
      doc.text('5. DÉMOGRAPHIE DES PATIENTS', margin, yPosition);
      yPosition += 8;

      if (ageDistributionData.length > 0) {
        const demoData = ageDistributionData.map(item => [
          item.age || 'N/A',
          String(item.male || 0),
          String(item.female || 0)
        ]);
        yPosition = addTable(['Groupe d\'âge', 'Hommes', 'Femmes'], demoData, yPosition, [236, 72, 153]);
      }

      // Weekly Appointments
      yPosition += 3;
      doc.setFontSize(13);
      doc.setFont(undefined, 'bold');
      doc.setTextColor(75, 85, 99);
      doc.text('6. RENDEZ-VOUS PAR JOUR (Cette semaine)', margin, yPosition);
      yPosition += 8;

      if (weeklyAppointmentsData.length > 0) {
        const weeklyData = weeklyAppointmentsData.map(item => [
          item.day || 'N/A',
          String(item.consultations || 0),
          String(item.suivis || 0),
          String(item.urgences || 0)
        ]);
        yPosition = addTable(['Jour', 'Consultations', 'Suivis', 'Urgences'], weeklyData, yPosition, [75, 85, 99]);
      }
    }

    // ===== FOOTER ON ALL PAGES =====
    const pageCount = doc.internal.pages.length - 1;
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(150);
      
      // Page number
      doc.text(`Page ${i} sur ${pageCount}`, pageWidth / 2, pageHeight - 8, { align: 'center' });
      
      // Footer line
      doc.setDrawColor(200);
      doc.line(margin, pageHeight - 12, pageWidth - margin, pageHeight - 12);
      
      // Footer text
      doc.setFontSize(7);
      doc.text('Médical AI - Rapport Généré Automatiquement', margin, pageHeight - 5);
      doc.text(`© ${new Date().getFullYear()} - Tous droits réservés`, pageWidth - margin, pageHeight - 5, { align: 'right' });
    }

    // Save PDF
    doc.save(`Rapport_Analytiques_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  return (
    <Layout>
      <div className="analytics-page">
        {/* Header */}
        <div className="page-header">
          <div className="header-content">
            <h1 className="page-title">Rapports & Analytiques</h1>
            <p className="page-subtitle">Analyses détaillées de votre activité médicale</p>
          </div>
          <div className="header-actions">
            <div className="date-filter">
              <FiCalendar />
              <select value={dateRange} onChange={(e) => setDateRange(e.target.value)}>
                <option value="7days">7 derniers jours</option>
                <option value="30days">30 derniers jours</option>
                <option value="3months">3 derniers mois</option>
                <option value="6months">6 derniers mois</option>
                <option value="1year">Cette année</option>
              </select>
            </div>
            <button className="export-btn" onClick={handleExportPDF}>
              <FiDownload />
              <span>Exporter PDF</span>
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="analytics-tabs">
          <button 
            className={`tab-btn ${activeTab === 'overview' ? 'active' : ''}`}
            onClick={() => setActiveTab('overview')}
          >
            <FiPieChart /> Vue d'ensemble
          </button>
          <button 
            className={`tab-btn ${activeTab === 'patients' ? 'active' : ''}`}
            onClick={() => setActiveTab('patients')}
          >
            <FiUsers /> Patients
          </button>
          <button 
            className={`tab-btn ${activeTab === 'activity' ? 'active' : ''}`}
            onClick={() => setActiveTab('activity')}
          >
            <FiActivity /> Activité
          </button>
        </div>

        {/* Summary Stats */}
        <div className="stats-summary">
          {isLoading ? (
            <>
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
            </>
          ) : error ? (
            <div style={{ color: 'red', gridColumn: 'span 4' }}>{error}</div>
          ) : (
            <>
              <div className="summary-card">
                <div className="summary-icon green">
                  <FiUsers />
                </div>
                <div className="summary-info">
                  <span className="summary-value">{totalPatients}</span>
                  <span className="summary-label">Patients traités</span>
                </div>
              </div>
              <div className="summary-card">
                <div className="summary-icon purple">
                  <FiFileText />
                </div>
                <div className="summary-info">
                  <span className="summary-value">{avgAgeLabel}</span>
                  <span className="summary-label">Âge moyen</span>
                </div>
              </div>
              <div className="summary-card">
                <div className="summary-icon blue">
                  <FiPieChart />
                </div>
                <div className="summary-info">
                  <span className="summary-value">{commonDiagnoses.length}</span>
                  <span className="summary-label">Top diagnostics</span>
                </div>
              </div>
              <div className="summary-card">
                <div className="summary-icon orange">
                  <FiTrendingUp />
                </div>
                <div className="summary-info">
                  <span className="summary-value">-</span>
                  <span className="summary-label">À compléter</span>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Charts Grid - Conditional rendering based on activeTab */}
        <div className="charts-grid">
          {isLoading ? (
            <>
              <SkeletonChart height="350px" />
              <SkeletonChart height="220px" />
            </>
          ) : (
            <>
              {/* Overview Tab: Show activity trend + diagnosis distribution + top treatments */}
              {activeTab === 'overview' && (
                <>
                  {/* Activity Trend */}
                  <div className="chart-card large">
                    <div className="chart-header">
                      <h3>Tendance d'Activité</h3>
                      <p className="chart-subtitle">Actes médicaux vs Rendez-vous</p>
                    </div>
                    <ResponsiveContainer width="100%" height={280}>
                      <LineChart data={activityTrendData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                        <XAxis dataKey="period" stroke="#9CA3AF" fontSize={12} />
                        <YAxis stroke="#9CA3AF" fontSize={12} />
                        <Tooltip 
                          contentStyle={{ 
                            background: '#fff', 
                            border: 'none', 
                            borderRadius: '10px', 
                            boxShadow: '0 4px 20px rgba(0,0,0,0.1)' 
                          }} 
                        />
                        <Line 
                          type="monotone"
                          dataKey="count" 
                          stroke="#8B5CF6"
                          strokeWidth={3}
                          dot={{ r: 4 }}
                          activeDot={{ r: 6 }}
                          name="Activité"
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Diagnosis Distribution */}
                  <div className="chart-card">
                    <div className="chart-header">
                      <h3>Répartition des Diagnostics</h3>
                      <p className="chart-subtitle">Top 5 diagnostics les plus fréquents (base patients)</p>
                    </div>
                    <div className="pie-chart-container">
                      <ResponsiveContainer width="100%" height={200}>
                        <PieChart>
                          <Pie
                            data={commonDiagnoses.map((diag, i) => ({ name: diag.name, value: diag.count, color: diagnosisColors[i % diagnosisColors.length] }))}
                            cx="50%"
                            cy="50%"
                            innerRadius={50}
                            outerRadius={80}
                            paddingAngle={3}
                            dataKey="value"
                          >
                            {commonDiagnoses.map((_, index) => (
                              <Cell key={`cell-${index}`} fill={diagnosisColors[index % diagnosisColors.length]} />
                            ))}
                          </Pie>
                          <Tooltip />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="pie-legend">
                        {commonDiagnoses.map((diag, index) => (
                          <div key={index} className="pie-legend-item">
                            <span className="pie-dot" style={{ background: diagnosisColors[index % diagnosisColors.length] }}></span>
                            <span className="pie-name">{diag.name} ({diag.count})</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Top Treatments */}
                  <div className="chart-card">
                    <div className="chart-header">
                      <h3>Traitements les Plus Prescrits</h3>
                    </div>
                    <div className="treatments-list">
                      {topTreatmentsData.map((treatment, index) => {
                        const maxCount = Math.max(...topTreatmentsData.map(t => t.count), 1);
                        const percentage = Math.round((treatment.count / maxCount) * 100);
                        return (
                        <div key={index} className="treatment-item">
                          <div className="treatment-rank">{index + 1}</div>
                          <div className="treatment-info">
                            <span className="treatment-name">{treatment.treatment}</span>
                            <div className="treatment-bar">
                              <div 
                                className="treatment-progress" 
                                style={{ width: `${percentage}%` }}
                              ></div>
                            </div>
                          </div>
                          <div className="treatment-stats">
                            <span className="treatment-count">{treatment.count}</span>
                          </div>
                        </div>
                      );
                      })}
                    </div>
                  </div>
                </>
              )}

              {/* Patients Tab: Show diagnosis distribution + demographics */}
              {activeTab === 'patients' && (
                <>
                  {/* Diagnosis Distribution */}
                  <div className="chart-card">
                    <div className="chart-header">
                      <h3>Répartition des Diagnostics</h3>
                      <p className="chart-subtitle">Top 5 diagnostics les plus fréquents (base patients)</p>
                    </div>
                    <div className="pie-chart-container">
                      <ResponsiveContainer width="100%" height={200}>
                        <PieChart>
                          <Pie
                            data={commonDiagnoses.map((diag, i) => ({ name: diag.name, value: diag.count, color: diagnosisColors[i % diagnosisColors.length] }))}
                            cx="50%"
                            cy="50%"
                            innerRadius={50}
                            outerRadius={80}
                            paddingAngle={3}
                            dataKey="value"
                          >
                            {commonDiagnoses.map((_, index) => (
                              <Cell key={`cell-patients-${index}`} fill={diagnosisColors[index % diagnosisColors.length]} />
                            ))}
                          </Pie>
                          <Tooltip />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="pie-legend">
                        {commonDiagnoses.map((diag, index) => (
                          <div key={index} className="pie-legend-item">
                            <span className="pie-dot" style={{ background: diagnosisColors[index % diagnosisColors.length] }}></span>
                            <span className="pie-name">{diag.name} ({diag.count})</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Age Distribution */}
                  <div className="chart-card">
                    <div className="chart-header">
                      <h3>Démographie des Patients</h3>
                      <p className="chart-subtitle">Distribution par âge et genre</p>
                    </div>
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={ageDistributionData} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                        <XAxis type="number" stroke="#9CA3AF" fontSize={12} />
                        <YAxis dataKey="age" type="category" stroke="#9CA3AF" fontSize={12} width={50} />
                        <Tooltip 
                          contentStyle={{ 
                            background: '#fff', 
                            border: 'none', 
                            borderRadius: '10px', 
                            boxShadow: '0 4px 20px rgba(0,0,0,0.1)' 
                          }} 
                        />
                        <Bar dataKey="male" stackId="a" fill="#3B82F6" radius={[0, 0, 0, 0]} name="Hommes" />
                        <Bar dataKey="female" stackId="a" fill="#EC4899" radius={[0, 4, 4, 0]} name="Femmes" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </>
              )}

              {/* Activity Tab: Show activity trend + weekly appointments */}
              {activeTab === 'activity' && (
                <>
                  {/* Activity Trend */}
                  <div className="chart-card large">
                    <div className="chart-header">
                      <h3>Tendance d'Activité</h3>
                      <p className="chart-subtitle">Actes médicaux vs Rendez-vous</p>
                    </div>
                    <ResponsiveContainer width="100%" height={280}>
                      <ComposedChart data={activityTrendData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                        <XAxis dataKey="period" stroke="#9CA3AF" fontSize={12} />
                        <YAxis stroke="#9CA3AF" fontSize={12} />
                        <Tooltip 
                          contentStyle={{ 
                            background: '#fff', 
                            border: 'none', 
                            borderRadius: '10px', 
                            boxShadow: '0 4px 20px rgba(0,0,0,0.1)' 
                          }} 
                        />
                        <Bar dataKey="count" fill="#E5E7EB" barSize={30} name="Volume" />
                        <Line type="monotone" dataKey="count" stroke="#8B5CF6" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} name="Tendance" />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Weekly Appointments */}
                  <div className="chart-card">
                    <div className="chart-header">
                      <h3>Rendez-vous par Jour</h3>
                      <p className="chart-subtitle">Cette semaine</p>
                    </div>
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={weeklyAppointmentsData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                        <XAxis dataKey="day" stroke="#9CA3AF" fontSize={12} />
                        <YAxis stroke="#9CA3AF" fontSize={12} />
                        <Tooltip 
                          contentStyle={{ 
                            background: '#fff', 
                            border: 'none', 
                            borderRadius: '10px', 
                            boxShadow: '0 4px 20px rgba(0,0,0,0.1)' 
                          }} 
                        />
                        <Bar dataKey="consultations" stackId="a" fill="#3B82F6" radius={[0, 0, 0, 0]} name="Consultations" />
                        <Bar dataKey="suivis" stackId="a" fill="#10B981" radius={[0, 0, 0, 0]} name="Suivis" />
                        <Bar dataKey="urgences" stackId="a" fill="#EF4444" radius={[4, 4, 0, 0]} name="Urgences" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </>
              )}
            </>
          )}
        </div>

        {/* Export Section */}
        <div className="export-section">
          <h3>Exporter les Rapports</h3>
          <div className="export-options">
            <button className="export-option">
              <FiFileText />
              <span>Rapport Mensuel</span>
              <small>PDF</small>
            </button>
            <button className="export-option">
              <FiBarChart2 />
              <span>Statistiques Patients</span>
              <small>Excel</small>
            </button>
            <button className="export-option">
              <FiActivity />
              <span>Activité Détaillée</span>
              <small>Excel</small>
            </button>
          </div>
        </div>
      </div>
    </Layout>
  );
}

export default AnalyticsPage;
