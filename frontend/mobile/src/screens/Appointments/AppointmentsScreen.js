import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, FlatList, RefreshControl, TouchableOpacity, Modal, ScrollView, Alert, TextInput } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { getAppointments, createAppointment, getPatients, deleteAppointment, updateAppointment } from '../../api/api';
import { isNurse } from '../../utils/permissions';
import { colors, fonts, spacing, radius } from '../../styles/theme';
import PhoneShell from '../../components/common/PhoneShell';
import PrimaryButton from '../../components/common/PrimaryButton';

const STATUS = {
  scheduled: { label: 'Planifié', color: colors.mobilePrimary, bg: '#E9F7F8', icon: 'clock' },
  completed: { label: 'Terminé', color: colors.success, bg: colors.successLight, icon: 'check' },
  cancelled: { label: 'Annulé', color: colors.error, bg: colors.errorLight, icon: 'x' },
};

function formatDateLabel(dateStr) {
  try {
    const d = new Date(`${dateStr}T00:00:00`);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diff = Math.round((d - today) / 86400000);
    if (diff === 0) return "Aujourd'hui";
    if (diff === 1) return 'Demain';
    if (diff === -1) return 'Hier';
    return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  } catch {
    return dateStr;
  }
}

function groupByDate(appointments) {
  const groups = {};
  appointments.forEach((apt) => {
    const date = apt.datetime_scheduled ? apt.datetime_scheduled.split('T')[0] : 'Sans date';
    if (!groups[date]) groups[date] = [];
    groups[date].push(apt);
  });
  return Object.entries(groups)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, items]) => ({ date, items }));
}

function SummaryPill({ value, label, icon }) {
  return (
    <View style={styles.summaryPill}>
      <Feather name={icon} size={15} color={colors.mobilePrimary} />
      <Text style={styles.summaryValue}>{value}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
  );
}

function AppointmentCard({ item, onLongPress }) {
  const state = STATUS[item.status] || STATUS.scheduled;
  const date = item.datetime_scheduled ? new Date(item.datetime_scheduled) : null;
  const time = date ? date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '--:--';

  return (
    <TouchableOpacity style={styles.appointmentCard} activeOpacity={0.86} onLongPress={() => onLongPress(item)}>
      <View style={styles.timeBox}>
        <Text style={styles.timeText}>{time}</Text>
        <Text style={styles.timeLabel}>RDV</Text>
      </View>
      <View style={styles.apptBody}>
        <Text style={styles.patientName} numberOfLines={1}>{item.patient_name || `Patient #${item.patient_id}`}</Text>
        <Text style={styles.reason} numberOfLines={2}>{item.reason || 'Rendez-vous médical'}</Text>
        <View style={[styles.statusChip, { backgroundColor: state.bg }]}>
          <Feather name={state.icon} size={11} color={state.color} />
          <Text style={[styles.statusText, { color: state.color }]}>{state.label}</Text>
        </View>
      </View>
      <View style={styles.cardAction}>
        <Feather name="chevron-right" size={17} color={colors.mobilePrimary} />
      </View>
    </TouchableOpacity>
  );
}

export default function AppointmentsScreen() {
  const [appointments, setAppointments] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [patients, setPatients] = useState([]);
  const [form, setForm] = useState({ patient_id: '', datetime_scheduled: '', reason: '' });
  const [submitting, setSubmitting] = useState(false);

  const fetchData = useCallback(() => {
    getAppointments()
      .then((res) => setAppointments(Array.isArray(res.data) ? res.data : []))
      .catch(() => setAppointments([]))
      .finally(() => setRefreshing(false));
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  const openModal = () => {
    setForm({ patient_id: '', datetime_scheduled: '', reason: '' });
    getPatients()
      .then((res) => setPatients(Array.isArray(res.data) ? res.data : []))
      .catch(() => setPatients([]));
    setShowModal(true);
  };

  const handleSubmit = async () => {
    if (!form.patient_id || !form.datetime_scheduled) {
      Alert.alert('Erreur', 'Patient, date et heure sont obligatoires.');
      return;
    }
    setSubmitting(true);
    try {
      await createAppointment({
        patient_id: parseInt(form.patient_id, 10),
        datetime_scheduled: form.datetime_scheduled,
        reason: form.reason || null,
        status: 'scheduled',
      });
      setShowModal(false);
      fetchData();
    } catch {
      Alert.alert('Erreur', 'Impossible de créer le rendez-vous.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = (id) => {
    Alert.alert('Confirmer', 'Supprimer ce rendez-vous ?', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer', style: 'destructive',
        onPress: async () => {
          try {
            await deleteAppointment(id);
            fetchData();
          } catch {
            Alert.alert('Erreur', 'Impossible de supprimer.');
          }
        },
      },
    ]);
  };

  const handleCancel = (item) => {
    Alert.alert('Annuler le rendez-vous', 'Marquer ce rendez-vous comme annulé ?', [
      { text: 'Non', style: 'cancel' },
      {
        text: 'Annuler le RDV',
        style: 'destructive',
        onPress: async () => {
          try {
            await updateAppointment(item.id, {
              patient_id: item.patient_id,
              datetime_scheduled: item.datetime_scheduled,
              reason: item.reason,
              status: 'cancelled',
            });
            fetchData();
          } catch {
            Alert.alert('Erreur', 'Impossible d\'annuler le rendez-vous.');
          }
        },
      },
    ]);
  };

  const handleAppointmentLongPress = async (item) => {
    if (item.status === 'cancelled' || item.status === 'completed') return;
    const nurse = await isNurse();
    if (nurse) {
      handleCancel(item);
    } else {
      handleDelete(item.id);
    }
  };

  const grouped = useMemo(() => groupByDate(appointments), [appointments]);
  const today = new Date().toISOString().split('T')[0];
  const todayCount = appointments.filter((apt) => apt.datetime_scheduled?.startsWith(today)).length;
  const plannedCount = appointments.filter((apt) => apt.status !== 'completed' && apt.status !== 'cancelled').length;

  return (
    <PhoneShell scroll={false} contentStyle={styles.shellContent}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Rendez-vous</Text>
          <Text style={styles.subtitle}>Planning des consultations</Text>
        </View>
        <TouchableOpacity style={styles.addButton} onPress={openModal} activeOpacity={0.85}>
          <Feather name="plus" size={22} color={colors.surface} />
        </TouchableOpacity>
      </View>

      <View style={styles.summaryRow}>
        <SummaryPill value={todayCount} label="Aujourd'hui" icon="calendar" />
        <SummaryPill value={plannedCount} label="Planifiés" icon="clock" />
        <SummaryPill value={appointments.length} label="Total" icon="list" />
      </View>

      <FlatList
        data={grouped}
        keyExtractor={(item) => item.date}
        style={styles.listView}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.mobilePrimary} />}
        renderItem={({ item }) => (
          <View style={styles.section}>
            <View style={styles.dateHeader}>
              <Text style={styles.dateLabel}>{formatDateLabel(item.date)}</Text>
              <Text style={styles.dateCount}>{item.items.length}</Text>
            </View>
            {item.items.map((apt) => <AppointmentCard key={String(apt.id)} item={apt} onLongPress={handleAppointmentLongPress} />)}
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Feather name="calendar" size={42} color={colors.mobileMuted} />
            <Text style={styles.emptyTitle}>Aucun rendez-vous</Text>
          </View>
        }
      />

      <Modal visible={showModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Nouveau rendez-vous</Text>
              <TouchableOpacity style={styles.closeButton} onPress={() => setShowModal(false)}>
                <Feather name="x" size={18} color={colors.mobileMuted} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.fieldLabel}>Patient</Text>
              <View style={styles.patientPicker}>
                {patients.map((patient) => {
                  const patientName = patient.name || `${patient.first_name || ''} ${patient.last_name || ''}`.trim() || 'Patient';
                  const active = String(form.patient_id) === String(patient.id);
                  return (
                    <TouchableOpacity
                      key={String(patient.id)}
                      style={[styles.patientOption, active && styles.patientOptionActive]}
                      onPress={() => {
                        setForm({ ...form, patient_id: String(patient.id) });
                      }}
                    >
                      <Text style={[styles.patientOptionText, active && styles.patientOptionTextActive]}>{patientName}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={styles.fieldLabel}>Date & heure</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="2026-06-12T09:30"
                placeholderTextColor={colors.mobileMuted}
                value={form.datetime_scheduled}
                onChangeText={(value) => setForm({ ...form, datetime_scheduled: value })}
              />

              <Text style={styles.fieldLabel}>Motif</Text>
              <TextInput
                style={[styles.modalInput, styles.modalTextarea]}
                placeholder="Consultation de suivi..."
                placeholderTextColor={colors.mobileMuted}
                value={form.reason}
                onChangeText={(value) => setForm({ ...form, reason: value })}
                multiline
              />

              <PrimaryButton title="Créer" onPress={handleSubmit} loading={submitting} style={styles.createButton} />
            </ScrollView>
          </View>
        </View>
      </Modal>
    </PhoneShell>
  );
}

const styles = StyleSheet.create({
  shellContent: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.lg,
    paddingBottom: 0,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  title: {
    fontSize: 25,
    fontWeight: '900',
    color: colors.mobileText,
    letterSpacing: -0.6,
  },
  subtitle: {
    ...fonts.caption,
    color: colors.mobileMuted,
    marginTop: 2,
  },
  addButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.mobileBackground,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  summaryPill: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: spacing.sm,
    minHeight: 72,
    justifyContent: 'center',
    alignItems: 'center',
  },
  summaryValue: {
    color: colors.mobileText,
    fontSize: 18,
    fontWeight: '900',
    marginTop: 3,
  },
  summaryLabel: {
    fontSize: 9,
    color: colors.mobileMuted,
    fontWeight: '700',
    marginTop: 1,
  },
  list: {
    paddingBottom: 112,
  },
  listView: {
    flex: 1,
  },
  section: {
    marginBottom: spacing.md,
  },
  dateHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  dateLabel: {
    fontSize: 17,
    color: colors.mobileText,
    fontWeight: '900',
    textTransform: 'capitalize',
  },
  dateCount: {
    color: colors.mobilePrimary,
    fontWeight: '900',
  },
  appointmentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  timeBox: {
    width: 58,
    height: 58,
    borderRadius: 14,
    backgroundColor: '#E9F7F8',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  timeText: {
    color: colors.mobilePrimary,
    fontSize: 15,
    fontWeight: '900',
  },
  timeLabel: {
    color: colors.mobileMuted,
    fontSize: 8,
    fontWeight: '800',
    marginTop: 1,
  },
  apptBody: {
    flex: 1,
  },
  patientName: {
    color: colors.mobileText,
    fontSize: 16,
    fontWeight: '900',
  },
  reason: {
    ...fonts.caption,
    color: colors.mobileMuted,
    marginTop: 2,
  },
  statusChip: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: spacing.sm,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: radius.full,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '900',
  },
  cardAction: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#E9F7F8',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: spacing.sm,
  },
  emptyState: {
    alignItems: 'center',
    paddingTop: spacing.xxl,
  },
  emptyTitle: {
    ...fonts.body,
    color: colors.mobileMuted,
    marginTop: spacing.md,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.42)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.mobilePanel,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: spacing.lg,
    maxHeight: '86%',
  },
  modalHandle: {
    width: 42,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.mobileDivider,
    alignSelf: 'center',
    marginBottom: spacing.md,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  modalTitle: {
    color: colors.mobileText,
    fontSize: 21,
    fontWeight: '900',
  },
  closeButton: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fieldLabel: {
    color: colors.mobileText,
    fontSize: 13,
    fontWeight: '900',
    marginBottom: spacing.xs,
    marginTop: spacing.sm,
  },
  patientPicker: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  patientOption: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
  },
  patientOptionActive: {
    backgroundColor: colors.mobilePrimary,
  },
  patientOptionText: {
    color: colors.mobileText,
    fontWeight: '800',
  },
  patientOptionTextActive: {
    color: colors.surface,
  },
  modalInput: {
    minHeight: 48,
    borderRadius: 14,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    color: colors.mobileText,
    fontSize: 14,
    marginBottom: spacing.sm,
  },
  modalTextarea: {
    minHeight: 92,
    paddingTop: spacing.md,
    textAlignVertical: 'top',
  },
  createButton: {
    marginTop: spacing.md,
    backgroundColor: colors.mobilePrimary,
  },
});
