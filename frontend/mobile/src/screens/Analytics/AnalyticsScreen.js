import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { getAnalyticsSummary } from '../../api/api';
import { colors, fonts, spacing, radius } from '../../styles/theme';
import PhoneShell, { ScreenHeader } from '../../components/common/PhoneShell';

function MetricCard({ title, value, icon, tint }) {
  return (
    <View style={styles.metricCard}>
      <View style={[styles.metricIcon, { backgroundColor: tint }]}>
        <Feather name={icon} size={18} color={colors.mobilePrimary} />
      </View>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{title}</Text>
    </View>
  );
}

function SectionCard({ title, icon, children }) {
  return (
    <View style={styles.sectionCard}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionTitleRow}>
          <Feather name={icon} size={17} color={colors.mobilePrimary} />
          <Text style={styles.sectionTitle}>{title}</Text>
        </View>
      </View>
      {children}
    </View>
  );
}

function formatAverageAge(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '0';
  return numeric.toFixed(1);
}

export default function AnalyticsScreen({ navigation }) {
  const [data, setData] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = () => {
    getAnalyticsSummary()
      .then((res) => setData(res.data))
      .catch(() => setData(null))
      .finally(() => setRefreshing(false));
  };

  useEffect(() => { fetchData(); }, []);

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  return (
    <PhoneShell scroll={false} contentStyle={styles.shellContent}>
      <ScreenHeader title="Statistiques" onBack={() => navigation.goBack()} />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.mobilePrimary} />}
      >
        <View style={styles.heroCard}>
          <Text style={styles.heroEyebrow}>Vue d'ensemble</Text>
          <Text style={styles.heroTitle}>Activité du cabinet</Text>
          <Text style={styles.heroSubtitle}>Suivez les patients, les consultations et les revenus récents.</Text>
        </View>

        {data ? (
          <View style={styles.kpiRow}>
            <MetricCard title="Patients" value={data.total_patients} icon="users" tint="#E9F7F8" />
            <MetricCard title="Âge moyen" value={formatAverageAge(data.avg_age)} icon="bar-chart-2" tint="#FFF4DE" />
          </View>
        ) : (
          <Text style={styles.emptyText}>Connectez-vous pour charger les statistiques du cabinet.</Text>
        )}

        {data?.demographics && data.demographics.length > 0 ? (
          <SectionCard title="Démographie" icon="pie-chart">
            <View style={styles.demoTable}>
              <View style={styles.demoHeader}>
                <Text style={[styles.demoLabel, { flex: 2 }]}>{'Tranche'}</Text>
                <Text style={styles.demoLabel}>{'Hommes'}</Text>
                <Text style={styles.demoLabel}>{'Femmes'}</Text>
              </View>
              {data.demographics.map((d, i) => (
                <View key={String(i)} style={styles.demoRow}>
                  <Text style={[styles.demoAge, { flex: 2 }]}>{String(d.age)}</Text>
                  <Text style={styles.demoVal}>{String(d.male)}</Text>
                  <Text style={styles.demoVal}>{String(d.female)}</Text>
                </View>
              ))}
            </View>
          </SectionCard>
        ) : null}

        {data?.weekly_activity && data.weekly_activity.length > 0 ? (
          <SectionCard title="Activité hebdomadaire" icon="activity">
            <View style={styles.weekTable}>
              {data.weekly_activity.map((w, i) => {
                const total = (w.consultations || 0) + (w.suivis || 0) + (w.urgences || 0);
                return (
                  <View key={String(i)} style={styles.weekRow}>
                    <Text style={styles.weekDay}>{String(w.day)}</Text>
                    <View style={styles.weekBarBg}>
                      <View style={[styles.weekBar, { width: Math.min(total * 10, 100) + '%' }]} />
                    </View>
                    <Text style={styles.weekTotal}>{String(total)}</Text>
                  </View>
                );
              })}
            </View>
          </SectionCard>
        ) : null}

      </ScrollView>
    </PhoneShell>
  );
}

const styles = StyleSheet.create({
  shellContent: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.lg,
    paddingBottom: 0,
  },
  scroll: { flex: 1 },
  content: { paddingBottom: 112 },
  heroCard: {
    backgroundColor: colors.mobileBackground,
    borderRadius: 22,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  heroEyebrow: {
    color: '#BFE4E7',
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  heroTitle: {
    color: colors.surface,
    fontSize: 24,
    fontWeight: '900',
    marginTop: spacing.xs,
  },
  heroSubtitle: {
    color: '#D6ECEE',
    fontSize: 13,
    lineHeight: 19,
    marginTop: spacing.xs,
  },
  kpiRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  metricCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 18,
    padding: spacing.md,
    minHeight: 118,
  },
  metricIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  metricValue: {
    color: colors.mobileText,
    fontSize: 26,
    fontWeight: '900',
  },
  metricLabel: {
    color: colors.mobileMuted,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 2,
  },
  sectionCard: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  sectionHeader: {
    marginBottom: spacing.sm,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  sectionTitle: {
    color: colors.mobileText,
    fontSize: 17,
    fontWeight: '900',
  },
  demoTable: { marginTop: spacing.xs },
  demoHeader: {
    flexDirection: 'row',
    marginBottom: spacing.xs,
    paddingBottom: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.mobileDivider,
  },
  demoLabel: { color: colors.mobileMuted, fontSize: 11, fontWeight: '900', flex: 1, textAlign: 'center' },
  demoRow: { flexDirection: 'row', paddingVertical: spacing.sm },
  demoAge: { ...fonts.bodySmall, flex: 1, textAlign: 'center', color: colors.mobileText },
  demoVal: { ...fonts.bodySmall, flex: 1, textAlign: 'center', fontWeight: '900', color: colors.mobileText },
  weekTable: { marginTop: spacing.xs },
  weekRow: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm },
  weekDay: { ...fonts.caption, width: 38, color: colors.mobileText, fontWeight: '800' },
  weekBarBg: { flex: 1, height: 9, backgroundColor: '#E9F7F8', borderRadius: radius.full, marginHorizontal: spacing.sm },
  weekBar: { height: 9, backgroundColor: colors.mobilePrimary, borderRadius: radius.full },
  weekTotal: { ...fonts.caption, width: 28, textAlign: 'right', color: colors.mobileMuted, fontWeight: '800' },
  revTable: { marginTop: spacing.xs },
  revRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.mobileDivider,
  },
  revMonth: { ...fonts.bodySmall, fontWeight: '900', color: colors.mobileText, width: 50 },
  revAmount: { ...fonts.bodySmall, color: colors.mobileText, fontWeight: '900' },
  revPatients: { ...fonts.caption, color: colors.mobileMuted, width: 50, textAlign: 'right' },
  emptyText: { ...fonts.caption, color: colors.mobileMuted, textAlign: 'center', marginTop: spacing.md },
});
