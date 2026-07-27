import React, { useState, useEffect } from 'react';
import { 
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ComposedChart
} from 'recharts';
import { 
  FiDownload, FiCalendar, FiUsers, 
  FiActivity, FiPieChart, FiBarChart2, FiFileText, FiDollarSign
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

const PERIOD_LABELS = {
  '7days': '7 derniers jours',
  '30days': '30 derniers jours',
  '3months': '3 derniers mois',
  '6months': '6 derniers mois',
  '1year': 'Cette année',
  'all': 'Toute la période',
};

// Report theme (hospital-grade: single navy accent, grey text)
const PDF_NAVY = [30, 58, 138];
const PDF_TEXT = [55, 65, 81];
const PDF_ZEBRA = [248, 250, 252];
const PDF_TOTAL_BG = [226, 232, 240];

function AnalyticsPage() {
  const [dateRange, setDateRange] = useState('all');
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
  const revenueTrendData = summary?.revenue_trends ?? [];
  const topTreatmentsData = summary?.treatments ?? [];
  const totalRevenue = Number(summary?.total_revenue ?? revenueTrendData.reduce((sum, row) => sum + (Number(row.revenue) || 0), 0));
  const billedActs = Number(summary?.billed_acts ?? 0);
  const completedRevenue = Number(summary?.completed_revenue ?? 0);
  const pendingRevenue = Number(summary?.pending_revenue ?? 0);
  const fmtMoney = (value) => `${Number(value || 0).toLocaleString('fr-FR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })} DH`;
  const totalRevenueLabel = fmtMoney(totalRevenue);

  const periodLabel = PERIOD_LABELS[dateRange] || dateRange;

  const buildPdfReport = (reportTitle) => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 16;
    const contentWidth = pageWidth - 2 * margin;
    const HEADER_H = 24;
    const FOOTER_H = 18;
    const generatedAt = new Date().toLocaleDateString('fr-FR', {
      year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit',
    });

    let y = HEADER_H + 12;

    const ensureSpace = (needed) => {
      if (y + needed > pageHeight - FOOTER_H) {
        doc.addPage();
        y = HEADER_H + 12;
      }
    };

    // columns: [{ label, weight, align }]
    const addTable = (columns, rows, { totalsRow = null } = {}) => {
      const totalWeight = columns.reduce((s, c) => s + (c.weight || 1), 0);
      const widths = columns.map(c => ((c.weight || 1) / totalWeight) * contentWidth);
      const xs = widths.reduce((acc, w, i) => { acc.push(i === 0 ? margin : acc[i - 1] + widths[i - 1]); return acc; }, []);
      const ROW_H = 7.5;

      const cellText = (value, colIdx, yy) => {
        const col = columns[colIdx];
        const pad = 3;
        const x = col.align === 'right' ? xs[colIdx] + widths[colIdx] - pad : xs[colIdx] + pad;
        doc.text(String(value ?? ''), x, yy, {
          align: col.align === 'right' ? 'right' : 'left',
          maxWidth: widths[colIdx] - 2 * pad,
        });
      };

      const drawHeader = () => {
        doc.setFillColor(...PDF_NAVY);
        doc.rect(margin, y, contentWidth, ROW_H + 0.5, 'F');
        doc.setTextColor(255);
        doc.setFont(undefined, 'bold');
        doc.setFontSize(8.5);
        columns.forEach((c, i) => cellText(c.label, i, y + 5.3));
        y += ROW_H + 0.5;
      };

      ensureSpace(ROW_H * 3);
      drawHeader();

      doc.setFont(undefined, 'normal');
      doc.setFontSize(9);
      rows.forEach((row, rowIdx) => {
        if (y + ROW_H > pageHeight - FOOTER_H) {
          doc.addPage();
          y = HEADER_H + 12;
          drawHeader();
          doc.setFont(undefined, 'normal');
          doc.setFontSize(9);
        }
        if (rowIdx % 2 === 1) {
          doc.setFillColor(...PDF_ZEBRA);
          doc.rect(margin, y, contentWidth, ROW_H, 'F');
        }
        doc.setTextColor(...PDF_TEXT);
        row.forEach((cell, i) => cellText(cell, i, y + 5.2));
        // thin row separator
        doc.setDrawColor(229, 231, 235);
        doc.setLineWidth(0.1);
        doc.line(margin, y + ROW_H, margin + contentWidth, y + ROW_H);
        y += ROW_H;
      });

      if (totalsRow) {
        ensureSpace(ROW_H);
        doc.setFillColor(...PDF_TOTAL_BG);
        doc.rect(margin, y, contentWidth, ROW_H, 'F');
        doc.setFont(undefined, 'bold');
        doc.setTextColor(...PDF_NAVY);
        totalsRow.forEach((cell, i) => cellText(cell, i, y + 5.2));
        doc.setFont(undefined, 'normal');
        y += ROW_H;
      }

      // table outer border
      doc.setDrawColor(...PDF_NAVY);
      doc.setLineWidth(0.2);
      y += 2;
    };

    const addSectionTitle = (num, title, note) => {
      ensureSpace(20);
      y += 6;
      doc.setFillColor(...PDF_NAVY);
      doc.rect(margin, y - 4.5, 1.8, 6.5, 'F');
      doc.setFont(undefined, 'bold');
      doc.setFontSize(12);
      doc.setTextColor(...PDF_NAVY);
      doc.text(`${num}. ${title}`, margin + 5, y);
      if (note) {
        doc.setFont(undefined, 'normal');
        doc.setFontSize(8.5);
        doc.setTextColor(120);
        doc.text(note, margin + 5, y + 5);
        y += 5;
      }
      y += 7;
    };

    const pct = (count, total) => (total > 0 ? `${((count / total) * 100).toFixed(1)} %` : '—');
    const fmtInt = (n) => Number(n || 0).toLocaleString('fr-FR');

    // ===== Cover block =====
    doc.setFont(undefined, 'bold');
    doc.setFontSize(20);
    doc.setTextColor(...PDF_NAVY);
    doc.text(reportTitle, margin, y);
    y += 8;
    doc.setFont(undefined, 'normal');
    doc.setFontSize(10.5);
    doc.setTextColor(...PDF_TEXT);
    doc.text('Rapport statistique du service de rhumatologie', margin, y);
    y += 9;

    // Metadata box
    doc.setDrawColor(203, 213, 225);
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(margin, y, contentWidth, 22, 1.5, 1.5, 'FD');
    doc.setFontSize(9);
    const metaCol2 = margin + contentWidth / 2;
    doc.setFont(undefined, 'bold');
    doc.setTextColor(...PDF_NAVY);
    doc.text('Période analysée', margin + 5, y + 7);
    doc.text('Date de génération', metaCol2, y + 7);
    doc.setFont(undefined, 'normal');
    doc.setTextColor(...PDF_TEXT);
    doc.text(periodLabel, margin + 5, y + 13);
    doc.text(generatedAt, metaCol2, y + 13);
    doc.setFontSize(7.5);
    doc.setTextColor(150);
    doc.text('Document confidentiel — réservé à un usage interne', margin + 5, y + 19);
    y += 30;

    // ===== 1. Synthèse =====
    addSectionTitle(1, 'SYNTHÈSE GÉNÉRALE');
    const weekTotalRdv = weeklyAppointmentsData.reduce((s, d) => s + (d.total ?? 0), 0);
    addTable(
      [
        { label: 'Indicateur', weight: 3 },
        { label: 'Valeur', weight: 1.2, align: 'right' },
      ],
      [
        ['Patients enregistrés', fmtInt(totalPatients)],
        ['Âge moyen des patients', avgAge ? `${Number(avgAge).toFixed(1)} ans` : '—'],
        ['Diagnostics distincts (top 5 affichés)', fmtInt(commonDiagnoses.length)],
        ['Rendez-vous de la semaine en cours', fmtInt(weekTotalRdv)],
        ['Facturation (période sélectionnée)', totalRevenueLabel],
      ]
    );

    // ===== 2. Diagnostics =====
    if (commonDiagnoses.length > 0) {
      const diagTotal = commonDiagnoses.reduce((s, d) => s + (d.count || 0), 0);
      addSectionTitle(2, 'RÉPARTITION DES DIAGNOSTICS', 'Top 5 des diagnostics les plus fréquents — ensemble de la base patients');
      addTable(
        [
          { label: '#', weight: 0.5 },
          { label: 'Diagnostic', weight: 3.5 },
          { label: 'Nombre de cas', weight: 1.3, align: 'right' },
          { label: 'Part (%)', weight: 1, align: 'right' },
        ],
        commonDiagnoses.map((d, i) => [String(i + 1), d.name, fmtInt(d.count), pct(d.count, diagTotal)]),
        { totalsRow: ['', 'Total', fmtInt(diagTotal), '100 %'] }
      );
    }

    // ===== 3. Traitements =====
    if (topTreatmentsData.length > 0) {
      const treatTotal = topTreatmentsData.reduce((s, t) => s + (t.count || 0), 0);
      addSectionTitle(3, 'TRAITEMENTS LES PLUS PRESCRITS', `Période : ${periodLabel}`);
      addTable(
        [
          { label: 'Rang', weight: 0.6 },
          { label: 'Traitement', weight: 3.4 },
          { label: 'Prescriptions', weight: 1.3, align: 'right' },
          { label: 'Part (%)', weight: 1, align: 'right' },
        ],
        topTreatmentsData.slice(0, 10).map((t, i) => [String(i + 1), t.treatment, fmtInt(t.count), pct(t.count, treatTotal)]),
        { totalsRow: ['', 'Total', fmtInt(treatTotal), '100 %'] }
      );
    }

    // ===== 4. Activité =====
    if (activityTrendData.length > 0) {
      const actTotal = activityTrendData.reduce((s, a) => s + (a.count || 0), 0);
      addSectionTitle(4, "TENDANCE D'ACTIVITÉ", `Volume de rendez-vous par période — ${periodLabel}`);
      addTable(
        [
          { label: 'Période', weight: 2 },
          { label: 'Rendez-vous', weight: 1.3, align: 'right' },
          { label: 'Part (%)', weight: 1, align: 'right' },
        ],
        activityTrendData.slice(0, 12).map(a => [a.period || '—', fmtInt(a.count), pct(a.count || 0, actTotal)]),
        { totalsRow: ['Total', fmtInt(actTotal), '100 %'] }
      );
    }

    // ===== 4b. Facturation =====
    if (revenueTrendData.length > 0) {
      addSectionTitle(5, 'FACTURATION', `Montants facturés des actes médicaux — ${periodLabel}`);
      addTable(
        [
          { label: 'Période', weight: 2 },
          { label: 'Montant (DH)', weight: 1.5, align: 'right' },
          { label: 'Part (%)', weight: 1, align: 'right' },
        ],
        revenueTrendData.slice(0, 12).map(r => [
          r.period || '—',
          Number(r.revenue || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
          pct(r.revenue || 0, totalRevenue),
        ]),
        {
          totalsRow: [
            'Total',
            totalRevenue.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
            '100 %',
          ],
        }
      );
    }

    // ===== 6. Démographie =====
    if (ageDistributionData.length > 0) {
      addSectionTitle(revenueTrendData.length > 0 ? 6 : 5, 'DÉMOGRAPHIE DES PATIENTS', 'Distribution par tranche d\'âge et par sexe');
      const demoTotals = ageDistributionData.reduce(
        (acc, r) => ({ m: acc.m + (r.male || 0), f: acc.f + (r.female || 0) }),
        { m: 0, f: 0 }
      );
      addTable(
        [
          { label: 'Tranche d\'âge', weight: 1.6 },
          { label: 'Hommes', weight: 1, align: 'right' },
          { label: 'Femmes', weight: 1, align: 'right' },
          { label: 'Total', weight: 1, align: 'right' },
        ],
        ageDistributionData.map(r => [
          r.age || '—', fmtInt(r.male), fmtInt(r.female), fmtInt((r.male || 0) + (r.female || 0)),
        ]),
        { totalsRow: ['Total', fmtInt(demoTotals.m), fmtInt(demoTotals.f), fmtInt(demoTotals.m + demoTotals.f)] }
      );
    }

    // ===== 7. Rendez-vous de la semaine =====
    if (weeklyAppointmentsData.length > 0) {
      addSectionTitle(revenueTrendData.length > 0 ? 7 : 6, 'RENDEZ-VOUS DE LA SEMAINE EN COURS', 'Répartition journalière par motif');
      const wTotals = weeklyAppointmentsData.reduce(
        (acc, d) => ({
          c: acc.c + (d.consultations || 0),
          s: acc.s + (d.suivis || 0),
          u: acc.u + (d.urgences || 0),
          a: acc.a + (d.autres || 0),
          t: acc.t + (d.total ?? 0),
        }),
        { c: 0, s: 0, u: 0, a: 0, t: 0 }
      );
      addTable(
        [
          { label: 'Jour', weight: 1 },
          { label: 'Consultations', weight: 1.2, align: 'right' },
          { label: 'Suivis', weight: 1, align: 'right' },
          { label: 'Urgences', weight: 1, align: 'right' },
          { label: 'Autres', weight: 1, align: 'right' },
          { label: 'Total', weight: 1, align: 'right' },
        ],
        weeklyAppointmentsData.map(d => [
          d.day || '—', fmtInt(d.consultations), fmtInt(d.suivis), fmtInt(d.urgences), fmtInt(d.autres), fmtInt(d.total),
        ]),
        { totalsRow: ['Total', fmtInt(wTotals.c), fmtInt(wTotals.s), fmtInt(wTotals.u), fmtInt(wTotals.a), fmtInt(wTotals.t)] }
      );
    }

    // ===== Header & footer on every page =====
    const pageCount = doc.internal.pages.length - 1;
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);

      // Header band
      doc.setFillColor(...PDF_NAVY);
      doc.rect(0, 0, pageWidth, HEADER_H - 8, 'F');
      doc.setTextColor(255);
      doc.setFont(undefined, 'bold');
      doc.setFontSize(11);
      doc.text('RhumatoAI', margin, 10.5);
      doc.setFont(undefined, 'normal');
      doc.setFontSize(8);
      doc.text('Service de Rhumatologie — Rapport statistique', pageWidth - margin, 10.5, { align: 'right' });
      doc.setDrawColor(...PDF_NAVY);
      doc.setLineWidth(0.4);
      doc.line(margin, HEADER_H - 5, pageWidth - margin, HEADER_H - 5);

      // Footer
      doc.setDrawColor(203, 213, 225);
      doc.setLineWidth(0.2);
      doc.line(margin, pageHeight - FOOTER_H + 6, pageWidth - margin, pageHeight - FOOTER_H + 6);
      doc.setFontSize(7.5);
      doc.setTextColor(130);
      doc.text('RhumatoAI — Document confidentiel, usage interne uniquement', margin, pageHeight - 7);
      doc.text(`Généré le ${generatedAt}`, pageWidth / 2, pageHeight - 7, { align: 'center' });
      doc.text(`Page ${i} / ${pageCount}`, pageWidth - margin, pageHeight - 7, { align: 'right' });
    }

    return doc;
  };

  const handleExportPDF = () => {
    if (!summary) return;
    const doc = buildPdfReport('Rapport d\'Activité Médicale');
    doc.save(`RhumatoAI_Rapport_${dateRange}_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  const handleExportMonthlyPDF = () => {
    if (!summary) return;
    const doc = buildPdfReport('Rapport Mensuel d\'Activité');
    doc.save(`RhumatoAI_Rapport_Mensuel_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  // CSV with UTF-8 BOM + semicolons so Excel (FR locale) opens it correctly
  const downloadCSV = (filename, sections) => {
    const lines = [];
    sections.forEach(({ title, headers, rows }, idx) => {
      if (idx > 0) lines.push('');
      lines.push(title);
      lines.push(headers.join(';'));
      rows.forEach(r => lines.push(r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(';')));
    });
    const blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportPatientsCSV = () => {
    if (!summary) return;
    downloadCSV(`RhumatoAI_Statistiques_Patients_${new Date().toISOString().split('T')[0]}.csv`, [
      {
        title: `Statistiques Patients — ${periodLabel}`,
        headers: ['Indicateur', 'Valeur'],
        rows: [
          ['Patients enregistrés', totalPatients],
          ['Âge moyen', avgAge ? `${Number(avgAge).toFixed(1)} ans` : ''],
          ['Facturation (période)', totalRevenueLabel],
        ],
      },
      {
        title: 'Démographie (par tranche d\'âge)',
        headers: ['Tranche d\'âge', 'Hommes', 'Femmes', 'Total'],
        rows: ageDistributionData.map(r => [r.age, r.male || 0, r.female || 0, (r.male || 0) + (r.female || 0)]),
      },
      {
        title: 'Top diagnostics',
        headers: ['Rang', 'Diagnostic', 'Nombre de cas'],
        rows: commonDiagnoses.map((d, i) => [i + 1, d.name, d.count]),
      },
    ]);
  };

  const handleExportActivityCSV = () => {
    if (!summary) return;
    downloadCSV(`RhumatoAI_Activite_Detaillee_${new Date().toISOString().split('T')[0]}.csv`, [
      {
        title: `Tendance d'activité — ${periodLabel}`,
        headers: ['Période', 'Rendez-vous'],
        rows: activityTrendData.map(a => [a.period, a.count || 0]),
      },
      {
        title: 'Rendez-vous de la semaine en cours',
        headers: ['Jour', 'Consultations', 'Suivis', 'Urgences', 'Autres', 'Total'],
        rows: weeklyAppointmentsData.map(d => [
          d.day, d.consultations || 0, d.suivis || 0, d.urgences || 0, d.autres || 0, d.total ?? 0,
        ]),
      },
      {
        title: `Traitements les plus prescrits — ${periodLabel}`,
        headers: ['Rang', 'Traitement', 'Prescriptions'],
        rows: topTreatmentsData.map((t, i) => [i + 1, t.treatment, t.count || 0]),
      },
      {
        title: `Facturation — ${periodLabel}`,
        headers: ['Période', 'Montant (DH)'],
        rows: [
          ...revenueTrendData.map(r => [r.period, Number(r.revenue || 0).toFixed(2)]),
          ['Total', totalRevenue.toFixed(2)],
        ],
      },
    ]);
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
                <option value="all">Toute la période</option>
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
          <button 
            className={`tab-btn ${activeTab === 'billing' ? 'active' : ''}`}
            onClick={() => setActiveTab('billing')}
          >
            <FiDollarSign /> Facturation
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
                  <FiDollarSign />
                </div>
                <div className="summary-info">
                  <span className="summary-value">{totalRevenueLabel}</span>
                  <span className="summary-label">Facturation</span>
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

                  {/* Facturation */}
                  <div className="chart-card large">
                    <div className="chart-header">
                      <h3>Facturation</h3>
                      <p className="chart-subtitle">Montants des actes médicaux (DH) — {periodLabel}</p>
                    </div>
                    <ResponsiveContainer width="100%" height={280}>
                      <BarChart data={revenueTrendData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                        <XAxis dataKey="period" stroke="#9CA3AF" fontSize={12} />
                        <YAxis stroke="#9CA3AF" fontSize={12} />
                        <Tooltip
                          formatter={(value) => [
                            `${Number(value || 0).toLocaleString('fr-FR', {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })} DH`,
                            'Facturation',
                          ]}
                          contentStyle={{
                            background: '#fff',
                            border: 'none',
                            borderRadius: '10px',
                            boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
                          }}
                        />
                        <Bar dataKey="revenue" fill="#F59E0B" radius={[6, 6, 0, 0]} name="Facturation" />
                      </BarChart>
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

              {/* Activity Tab: activity trend + weekly appointments */}
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
                        <Bar dataKey="urgences" stackId="a" fill="#EF4444" radius={[0, 0, 0, 0]} name="Urgences" />
                        <Bar dataKey="autres" stackId="a" fill="#9CA3AF" radius={[4, 4, 0, 0]} name="Autres" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </>
              )}

              {/* Facturation Tab */}
              {activeTab === 'billing' && (
                <>
                  <div className="chart-card">
                    <div className="chart-header">
                      <h3>Synthèse Facturation</h3>
                      <p className="chart-subtitle">{periodLabel}</p>
                    </div>
                    <div className="treatments-list">
                      <div className="treatment-item">
                        <div className="treatment-rank">DH</div>
                        <div className="treatment-info">
                          <span className="treatment-name">Montant total</span>
                        </div>
                        <div className="treatment-stats">
                          <span className="treatment-count">{fmtMoney(totalRevenue)}</span>
                        </div>
                      </div>
                      <div className="treatment-item">
                        <div className="treatment-rank">#</div>
                        <div className="treatment-info">
                          <span className="treatment-name">Actes facturés</span>
                        </div>
                        <div className="treatment-stats">
                          <span className="treatment-count">{billedActs}</span>
                        </div>
                      </div>
                      <div className="treatment-item">
                        <div className="treatment-rank">✓</div>
                        <div className="treatment-info">
                          <span className="treatment-name">Terminé</span>
                        </div>
                        <div className="treatment-stats">
                          <span className="treatment-count">{fmtMoney(completedRevenue)}</span>
                        </div>
                      </div>
                      <div className="treatment-item">
                        <div className="treatment-rank">…</div>
                        <div className="treatment-info">
                          <span className="treatment-name">En cours</span>
                        </div>
                        <div className="treatment-stats">
                          <span className="treatment-count">{fmtMoney(pendingRevenue)}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="chart-card large">
                    <div className="chart-header">
                      <h3>Évolution de la Facturation</h3>
                      <p className="chart-subtitle">Montants des actes médicaux (DH) — {periodLabel}</p>
                    </div>
                    {revenueTrendData.length === 0 ? (
                      <div className="activity-empty-state" style={{ padding: '40px', textAlign: 'center', color: '#64748B' }}>
                        Aucun montant facturé sur cette période.
                      </div>
                    ) : (
                      <ResponsiveContainer width="100%" height={300}>
                        <ComposedChart data={revenueTrendData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                          <XAxis dataKey="period" stroke="#9CA3AF" fontSize={12} />
                          <YAxis stroke="#9CA3AF" fontSize={12} />
                          <Tooltip
                            formatter={(value, name) => {
                              if (name === 'Actes') return [value, 'Actes facturés'];
                              return [fmtMoney(value), 'Facturation'];
                            }}
                            contentStyle={{
                              background: '#fff',
                              border: 'none',
                              borderRadius: '10px',
                              boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
                            }}
                          />
                          <Bar dataKey="revenue" fill="#FDE68A" barSize={28} name="Montant" radius={[6, 6, 0, 0]} />
                          <Line type="monotone" dataKey="revenue" stroke="#F59E0B" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} name="Tendance" />
                        </ComposedChart>
                      </ResponsiveContainer>
                    )}
                  </div>

                  <div className="chart-card large">
                    <div className="chart-header">
                      <h3>Détail par période</h3>
                      <p className="chart-subtitle">Montant et nombre d'actes facturés</p>
                    </div>
                    {revenueTrendData.length === 0 ? (
                      <div style={{ padding: '24px', color: '#64748B' }}>Aucune donnée de facturation.</div>
                    ) : (
                      <div className="treatments-list">
                        {revenueTrendData.map((row, index) => {
                          const maxRevenue = Math.max(...revenueTrendData.map((r) => Number(r.revenue) || 0), 1);
                          const percentage = Math.round(((Number(row.revenue) || 0) / maxRevenue) * 100);
                          return (
                            <div key={`${row.period}-${index}`} className="treatment-item">
                              <div className="treatment-rank">{index + 1}</div>
                              <div className="treatment-info">
                                <span className="treatment-name">{row.period}</span>
                                <div className="treatment-bar">
                                  <div className="treatment-progress" style={{ width: `${percentage}%`, background: '#F59E0B' }} />
                                </div>
                              </div>
                              <div className="treatment-stats">
                                <span className="treatment-count">{fmtMoney(row.revenue)}</span>
                                <small style={{ display: 'block', color: '#94A3B8' }}>
                                  {Number(row.acts || 0)} acte{Number(row.acts || 0) === 1 ? '' : 's'}
                                </small>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </>
              )}
            </>
          )}
        </div>

        {/* Export Section */}
        <div className="export-section">
          <h3>Exporter les Rapports</h3>
          <p className="export-subtitle">Documents générés à partir des données de la période sélectionnée ({periodLabel})</p>
          <div className="export-options">
            <button className="export-option" onClick={handleExportMonthlyPDF} disabled={!summary}>
              <FiFileText />
              <span>Rapport Mensuel</span>
              <small>PDF</small>
            </button>
            <button className="export-option" onClick={handleExportPatientsCSV} disabled={!summary}>
              <FiBarChart2 />
              <span>Statistiques Patients</span>
              <small>Excel (CSV)</small>
            </button>
            <button className="export-option" onClick={handleExportActivityCSV} disabled={!summary}>
              <FiActivity />
              <span>Activité Détaillée</span>
              <small>Excel (CSV)</small>
            </button>
            <button
              className="export-option"
              disabled={!summary}
              onClick={() => {
                if (!summary) return;
                downloadCSV(`RhumatoAI_Facturation_${new Date().toISOString().split('T')[0]}.csv`, [
                  {
                    title: `Facturation — ${periodLabel}`,
                    headers: ['Indicateur', 'Valeur'],
                    rows: [
                      ['Montant total (DH)', totalRevenue.toFixed(2)],
                      ['Actes facturés', billedActs],
                      ['Terminé (DH)', completedRevenue.toFixed(2)],
                      ['En cours (DH)', pendingRevenue.toFixed(2)],
                    ],
                  },
                  {
                    title: 'Détail par période',
                    headers: ['Période', 'Montant (DH)', 'Actes'],
                    rows: revenueTrendData.map((r) => [
                      r.period,
                      Number(r.revenue || 0).toFixed(2),
                      r.acts || 0,
                    ]),
                  },
                ]);
              }}
            >
              <FiDollarSign />
              <span>Facturation</span>
              <small>Excel (CSV)</small>
            </button>
          </div>
        </div>
      </div>
    </Layout>
  );
}

export default AnalyticsPage;
