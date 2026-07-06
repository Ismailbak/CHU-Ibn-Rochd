import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { FiCalendar, FiClock, FiUser, FiPlus, FiChevronLeft, FiChevronRight, FiCheck, FiX, FiEdit2, FiPhone } from 'react-icons/fi';
import Layout from '../../components/layout/Layout';
import StatCard from '../../components/cards/StatCard';
import { SkeletonCard, SkeletonListItem, useToast } from '../../components/common';
import { getAppointments, getTodayAppointments, createAppointment, updateAppointment, deleteAppointment } from '../../api/api';
import AppointmentForm from './AppointmentForm';
import './AppointmentsPage.css';

function mapApiAppointmentToUi(apt) {
  const dateTime = apt.datetime_scheduled ? new Date(apt.datetime_scheduled) : null;
  const dateStr = dateTime ? dateTime.toISOString().split('T')[0] : apt.date || '';
  const timeStr = dateTime ? dateTime.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : apt.time || '';
  return {
    id: apt.id,
    patient_id: apt.patient_id,
    patientName: apt.patient_name || '-',
    patientPhone: '',
    type: 'Consultation',
    date: dateStr,
    time: timeStr,
    datetime_scheduled: apt.datetime_scheduled,
    duration: 30,
    status:
      apt.status === 'scheduled' ? 'pending'
      : apt.status === 'cancelled' ? 'cancelled'
      : apt.status === 'completed' || apt.status === 'confirmed' ? 'confirmed'
      : 'pending',
    notes: apt.reason || '',
  };
}

// Generate calendar days
const generateCalendarDays = (year, month) => {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const daysInMonth = lastDay.getDate();
  const startingDay = firstDay.getDay();

  const days = [];

  // Previous month days
  const prevMonthLastDay = new Date(year, month, 0).getDate();
  for (let i = startingDay - 1; i >= 0; i--) {
    days.push({ day: prevMonthLastDay - i, currentMonth: false });
  }

  // Current month days
  for (let i = 1; i <= daysInMonth; i++) {
    days.push({ day: i, currentMonth: true });
  }

  // Next month days
  const remainingDays = 42 - days.length;
  for (let i = 1; i <= remainingDays; i++) {
    days.push({ day: i, currentMonth: false });
  }

  return days;
};

const getMonthRange = (d) => {
  const year = d.getFullYear();
  const month = d.getMonth();
  const from = `${year}-${String(month + 1).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month + 1, 0).getDate();
  const to = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return { from, to };
};

const getWeekRange = () => {
  const weekStart = new Date();
  weekStart.setHours(0, 0, 0, 0);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  return {
    from: weekStart.toISOString().slice(0, 10),
    to: weekEnd.toISOString().slice(0, 10),
  };
};

const months = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
const weekDays = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
const APPOINTMENTS_PER_PAGE = 7;

function AppointmentsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const urlPrefillPatientId = searchParams.get('new') === '1' ? searchParams.get('patientId') : null;
  const [newAppointmentPatientId, setNewAppointmentPatientId] = useState(urlPrefillPatientId);

  // State for selected day insights modal
  const [insightsModal, setInsightsModal] = useState({ open: false, date: null, appointments: [] });

  // Helper to open add appointment form for a clicked day
  const openDayForAppointment = (dayObj) => {
    if (!dayObj.currentMonth) return;
    const dateStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(dayObj.day).padStart(2, '0')}`;
    const dayAppointments = appointments.filter(apt => apt.date === dateStr);
    // Open the insights modal which now allows creating appointments
    setInsightsModal({ open: true, date: dateStr, appointments: dayAppointments, showForm: false });
  };

  // Helper to toggle form in modal
  const toggleFormInModal = () => {
    setInsightsModal(prev => ({ ...prev, showForm: !prev.showForm }));
  };

  // Helper to format date for modal
  const formatDateForModal = (dateStr) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  };
  const [appointments, setAppointments] = useState([]);
  const [stats, setStats] = useState({ today: 0, week: 0, confirmedMonth: 0, pending: 0 });
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());

  const rdvToday = stats.today;
  const rdvWeek = stats.week;
  const confirmedThisMonth = stats.confirmedMonth;
  const pending = stats.pending;
  const [showAddModal, setShowAddModal] = useState(Boolean(urlPrefillPatientId));

  useEffect(() => {
    if (searchParams.get('new') === '1' && searchParams.get('patientId')) {
      const next = new URLSearchParams(searchParams);
      next.delete('patientId');
      next.delete('new');
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingAppointment, setEditingAppointment] = useState(null);
  const [viewMode, setViewMode] = useState('list');
  const [isLoading, setIsLoading] = useState(true);
  const [appointmentsPage, setAppointmentsPage] = useState(1);
  const toast = useToast();

  const [addFormData, setAddFormData] = useState({
    patientId: '',
    date: '',
    time: '',
    type: '',
    duration: '60',
    notes: ''
  });

  const resetAddForm = () => {
    setAddFormData({
      patientId: '',
      date: selectedDate.toISOString().split('T')[0],
      time: '',
      type: '',
      duration: '60',
      notes: ''
    });
  };

  const reloadAppointments = async () => {
    const { from, to } = getMonthRange(currentDate);
    const week = getWeekRange();
    const [monthRes, todayRes, weekRes] = await Promise.all([
      getAppointments({ from_date: from, to_date: to }),
      getTodayAppointments(),
      getAppointments({ from_date: week.from, to_date: week.to }),
    ]);
    const monthRows = (monthRes.data || []).map(mapApiAppointmentToUi);
    setAppointments(monthRows);
    setStats({
      today: (todayRes.data || []).length,
      week: (weekRes.data || []).length,
      confirmedMonth: monthRows.filter((a) => a.status === 'confirmed').length,
      pending: monthRows.filter((a) => a.status === 'pending').length,
    });
  };

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setIsLoading(true);
      try {
        await reloadAppointments();
      } catch {
        if (!cancelled) toast.error('Impossible de charger les rendez-vous');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [currentDate]);

  const calendarDays = generateCalendarDays(currentDate.getFullYear(), currentDate.getMonth());

  const navigateMonth = (direction) => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + direction, 1));
  };

  const formatSelectedDate = (date) => {
    return date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  };

  const getAppointmentsForDate = (date) => {
    const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    return appointments.filter(apt => apt.date === dateStr);
  };

  const selectedDateAppointments = getAppointmentsForDate(selectedDate);
  const appointmentPageCount = Math.ceil(selectedDateAppointments.length / APPOINTMENTS_PER_PAGE);
  const shouldPaginateAppointments = selectedDateAppointments.length > APPOINTMENTS_PER_PAGE;
  const paginatedDateAppointments = selectedDateAppointments.slice(
    (appointmentsPage - 1) * APPOINTMENTS_PER_PAGE,
    appointmentsPage * APPOINTMENTS_PER_PAGE
  );

  useEffect(() => {
    setAppointmentsPage(1);
  }, [selectedDate]);

  useEffect(() => {
    if (appointmentPageCount > 0 && appointmentsPage > appointmentPageCount) {
      setAppointmentsPage(appointmentPageCount);
    }
  }, [appointmentPageCount, appointmentsPage]);

  const getStatusColor = (status) => {
    switch (status) {
      case 'confirmed': return 'confirmed';
      case 'pending': return 'pending';
      case 'cancelled': return 'cancelled';
      default: return 'pending';
    }
  };

  const getStatusLabel = (status) => {
    switch (status) {
      case 'confirmed': return 'Confirmé';
      case 'pending': return 'En attente';
      case 'cancelled': return 'Annulé';
      default: return status;
    }
  };

  const hasAppointments = (day, currentMonth) => {
    if (!currentMonth) return false;
    const dateStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return appointments.some(apt => apt.date === dateStr);
  };

  // Handle form change
  const handleAddFormChange = (e) => {
    const { name, value } = e.target;
    setAddFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleConfirmAppointment = async (id) => {
    const apt = appointments.find(a => a.id === id);
    if (!apt) return;
    try {
      await updateAppointment(id, {
        patient_id: apt.patient_id,
        datetime_scheduled: apt.datetime_scheduled,
        reason: apt.notes,
        status: 'confirmed',
      });
      setAppointments(appointments.map(a => a.id === id ? { ...a, status: 'confirmed' } : a));
      toast.success('Rendez-vous confirmé');
    } catch {
      toast.error('Erreur lors de la confirmation');
    }
  };

  const handleCancelAppointment = async (id) => {
    const apt = appointments.find(a => a.id === id);
    if (!apt) return;
    try {
      await updateAppointment(id, {
        patient_id: apt.patient_id,
        datetime_scheduled: apt.datetime_scheduled,
        reason: apt.notes,
        status: 'cancelled',
      });
      setAppointments(appointments.map(a => a.id === id ? { ...a, status: 'cancelled' } : a));
      toast.info('Rendez-vous annulé');
    } catch {
      toast.error('Erreur lors de l\'annulation');
    }
  };

  const handleEditClick = (appointment) => {
    setEditingAppointment(appointment);
    setShowEditModal(true);
  };

  const handleAddSubmit = async (e) => {
    e.preventDefault();
    if (!addFormData.patientId || !addFormData.date || !addFormData.time) {
      toast.error('Veuillez remplir patient, date et heure');
      return;
    }
    try {
      // Combine date and time into ISO datetime string
      const [hours, minutes] = addFormData.time.split(':');
      const datetimeScheduled = new Date(`${addFormData.date}T${addFormData.time}:00`).toISOString();
      
      const res = await createAppointment({
        patient_id: parseInt(addFormData.patientId, 10),
        datetime_scheduled: datetimeScheduled,
        reason: [addFormData.type, addFormData.notes].filter(Boolean).join(' – ') || null,
        status: 'scheduled',
      });
      const created = mapApiAppointmentToUi(res.data);
      if (created.date.startsWith(getMonthRange(currentDate).from.slice(0, 7))) {
        setAppointments((prev) => [...prev, created].sort((a, b) => (a.time > b.time ? 1 : -1)));
      } else {
        await reloadAppointments();
      }
      setShowAddModal(false);
      resetAddForm();
      toast.success(created.patientName ? `Rendez-vous créé pour ${created.patientName}` : 'Rendez-vous créé');
    } catch {
      toast.error('Erreur lors de la création du rendez-vous');
    }
  };

  const isToday = (day, currentMonth) => {
    if (!currentMonth) return false;
    const today = new Date();
    return day === today.getDate() &&
      currentDate.getMonth() === today.getMonth() &&
      currentDate.getFullYear() === today.getFullYear();
  };

  const isSelected = (day, currentMonth) => {
    if (!currentMonth) return false;
    return day === selectedDate.getDate() &&
      currentDate.getMonth() === selectedDate.getMonth() &&
      currentDate.getFullYear() === selectedDate.getFullYear();
  };

  return (
    <Layout>
      <div className="appointments-page">
        {/* Header Section */}
        <div className="page-header">
          <div className="header-content">
            <h1 className="page-title">Rendez-vous</h1>
            <p className="page-subtitle">Gérez votre agenda et vos consultations</p>
          </div>
          <div className="header-actions">
            <div className="view-toggle">
              <button
                className={`view-btn ${viewMode === 'list' ? 'active' : ''}`}
                onClick={() => setViewMode('list')}
              >
                Liste
              </button>
              <button
                className={`view-btn ${viewMode === 'calendar' ? 'active' : ''}`}
                onClick={() => setViewMode('calendar')}
              >
                Calendrier
              </button>
            </div>
            <button className="add-appointment-btn" onClick={() => { setShowAddModal(true); setAddFormData(prev => ({ ...prev, date: selectedDate.toISOString().split('T')[0] })); }}>
              <FiPlus />
              <span>Nouveau RDV</span>
            </button>
          </div>
        </div>

        {viewMode === 'list' ? (
          <>
            {/* Stats Cards */}
            <div className="appointments-stats">
              {isLoading ? (
                <>
                  <SkeletonCard />
                  <SkeletonCard />
                  <SkeletonCard />
                  <SkeletonCard />
                </>
              ) : (
                <>
                  <StatCard
                    icon={<FiCalendar />}
                    label="RDV Aujourd'hui"
                    percentage="Planifiés"
                    value={rdvToday}
                    color="blue"
                  />
                  <StatCard
                    icon={<FiClock />}
                    label="Cette semaine"
                    percentage="Total"
                    value={rdvWeek}
                    color="green"
                  />
                  <StatCard
                    icon={<FiCheck />}
                    label="Confirmés"
                    percentage="Ce mois"
                    value={confirmedThisMonth}
                    color="pink"
                  />
                  <StatCard
                    icon={<FiUser />}
                    label="En attente"
                    percentage="À confirmer"
                    value={pending}
                    color="yellow"
                  />
                </>
              )}
            </div>

            {/* Main Content Grid */}
            <div className="appointments-content">
              {/* Calendar Section */}
              <div className="calendar-card">
                <div className="calendar-header">
                  <h3>{months[currentDate.getMonth()]} {currentDate.getFullYear()}</h3>
                  <div className="calendar-nav">
                    <button onClick={() => navigateMonth(-1)}><FiChevronLeft /></button>
                    <button onClick={() => navigateMonth(1)}><FiChevronRight /></button>
                  </div>
                </div>

                <div className="calendar-weekdays">
                  {weekDays.map(day => (
                    <div key={day} className="weekday">{day}</div>
                  ))}
                </div>

                <div className="calendar-days">
                  {calendarDays.map((dayObj, index) => (
                    <div
                      key={index}
                      className={`calendar-day ${!dayObj.currentMonth ? 'other-month' : ''} ${isToday(dayObj.day, dayObj.currentMonth) ? 'today' : ''} ${isSelected(dayObj.day, dayObj.currentMonth) ? 'selected' : ''} ${hasAppointments(dayObj.day, dayObj.currentMonth) ? 'has-appointments' : ''}`}
                      onClick={() => {
                        if (dayObj.currentMonth) {
                          setSelectedDate(new Date(currentDate.getFullYear(), currentDate.getMonth(), dayObj.day));
                        }
                      }}
                    >
                      <span>{dayObj.day}</span>
                      {hasAppointments(dayObj.day, dayObj.currentMonth) && <div className="appointment-dot"></div>}
                    </div>
                  ))}
                </div>

                {/* Quick Stats */}
                <div className="calendar-quick-stats">
                  <div className="quick-stat">
                    <span className="stat-dot confirmed"></span>
                    <span>{confirmedThisMonth} Confirmés</span>
                  </div>
                  <div className="quick-stat">
                    <span className="stat-dot pending"></span>
                    <span>{pending} En attente</span>
                  </div>
                </div>
              </div>

              {/* Appointments List */}
              <div className="appointments-list-card">
                <div className="list-header">
                  <div className="list-title">
                    <h3>Rendez-vous du jour</h3>
                    <span className="selected-date">{formatSelectedDate(selectedDate)}</span>
                  </div>
                  <span className="appointment-count">{selectedDateAppointments.length} rendez-vous</span>
                </div>

                <div className="appointments-list">
                  {selectedDateAppointments.length === 0 ? (
                    <div className="no-appointments">
                      <FiCalendar className="no-apt-icon" />
                      <p>Aucun rendez-vous pour cette date</p>
                      <button className="add-apt-btn" onClick={() => setShowAddModal(true)}>
                        Ajouter un rendez-vous
                      </button>
                    </div>
                  ) : (
                    paginatedDateAppointments.map(appointment => (
                      <div key={appointment.id} className="appointment-item">
                        <div className="appointment-time">
                          <span className="time">{appointment.time}</span>
                          <span className="duration">{appointment.duration} min</span>
                        </div>
                        <div className="appointment-details">
                          <div className="appointment-main">
                            <h4 className="patient-name">{appointment.patientName}</h4>
                            <span className={`appointment-status ${getStatusColor(appointment.status)}`}>
                              {getStatusLabel(appointment.status)}
                            </span>
                          </div>
                          <p className="appointment-type">{appointment.type}</p>
                          <p className="appointment-notes">{appointment.notes}</p>
                          <div className="appointment-contact">
                            <FiPhone /> {appointment.patientPhone}
                          </div>
                        </div>
                        <div className="appointment-actions">
                          {appointment.status === 'pending' && (
                            <>
                              <button className="action-btn confirm" title="Confirmer" onClick={() => handleConfirmAppointment(appointment.id)}>
                                <FiCheck />
                              </button>
                              <button className="action-btn cancel" title="Annuler" onClick={() => handleCancelAppointment(appointment.id)}>
                                <FiX />
                              </button>
                            </>
                          )}
                          <button className="action-btn edit" title="Modifier" onClick={() => handleEditClick(appointment)}>
                            <FiEdit2 />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
                {shouldPaginateAppointments && (
                  <div className="table-pagination">
                    <span className="pagination-info">
                      {(appointmentsPage - 1) * APPOINTMENTS_PER_PAGE + 1}
                      -
                      {Math.min(appointmentsPage * APPOINTMENTS_PER_PAGE, selectedDateAppointments.length)}
                      {' '}sur {selectedDateAppointments.length}
                    </span>
                    <div className="pagination-buttons">
                      <button
                        type="button"
                        className="pagination-btn"
                        onClick={() => setAppointmentsPage((page) => Math.max(1, page - 1))}
                        disabled={appointmentsPage === 1}
                        title="Page précédente"
                      >
                        ←
                      </button>
                      {Array.from({ length: appointmentPageCount }, (_, index) => index + 1).map(page => (
                        <button
                          key={page}
                          type="button"
                          className={`pagination-btn ${appointmentsPage === page ? 'active' : ''}`}
                          onClick={() => setAppointmentsPage(page)}
                        >
                          {page}
                        </button>
                      ))}
                      <button
                        type="button"
                        className="pagination-btn"
                        onClick={() => setAppointmentsPage((page) => Math.min(appointmentPageCount, page + 1))}
                        disabled={appointmentsPage === appointmentPageCount}
                        title="Page suivante"
                      >
                        →
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </>
        ) : (
          // Full-page calendar mode
          <div className="full-calendar-view">
            <div className="calendar-header">
              <h2>{months[currentDate.getMonth()]} {currentDate.getFullYear()}</h2>
              <div className="calendar-nav">
                <button onClick={() => navigateMonth(-1)}><FiChevronLeft /></button>
                <button onClick={() => navigateMonth(1)}><FiChevronRight /></button>
              </div>
            </div>
            <div className="calendar-weekdays full">
              {weekDays.map(day => (
                <div key={day} className="weekday">{day}</div>
              ))}
            </div>
            <div className="calendar-days full">
              {calendarDays.map((dayObj, index) => {
                // Get appointments for this day
                const dateStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(dayObj.day).padStart(2, '0')}`;
                const dayAppointments = dayObj.currentMonth ? appointments.filter(apt => apt.date === dateStr) : [];
                return (
                  <div
                    key={index}
                    className={`calendar-day full clickable ${!dayObj.currentMonth ? 'other-month' : ''} ${isToday(dayObj.day, dayObj.currentMonth) ? 'today' : ''}`}
                    onClick={() => openDayForAppointment(dayObj)}
                    tabIndex={dayObj.currentMonth ? 0 : -1}
                    style={{ cursor: dayObj.currentMonth ? 'pointer' : 'default', outline: 'none' }}
                  >
                    <span className="day-number">{dayObj.day}</span>
                    <div className="day-appointments">
                      {dayAppointments.map(apt => (
                        <div
                          key={apt.id}
                          className={`apt-chip ${getStatusColor(apt.status)}`}
                          title={`${apt.patientName} (${getStatusLabel(apt.status)})`}
                        >
                          <span className="apt-time">{apt.time}</span>
                          <span className="apt-patient">{apt.patientName}</span>
                        </div>
                      ))}
                    </div>
                    {dayObj.currentMonth && dayAppointments.length > 0 && (
                      <span className="day-insights-icon" title="Voir les rendez-vous">🔍</span>
                    )}
                  </div>
                );
              })}
            </div>
            {/* Insights Modal with Add Appointment Form */}
            {insightsModal.open && (
              <div className="modal-overlay">
                <div className="modal-content" onClick={e => e.stopPropagation()}>
                  <div className="modal-header">
                    <h2>{insightsModal.showForm ? 'Créer un rendez-vous' : 'Rendez-vous du ' + formatDateForModal(insightsModal.date)}</h2>
                    <button className="modal-close" onClick={() => setInsightsModal({ open: false, date: null, appointments: [], showForm: false })}>×</button>
                  </div>
                  
                  {/* Show Form if toggled */}
                  {insightsModal.showForm ? (
                    <div className="modal-form-wrapper">
                      <AppointmentForm
                        defaultDate={insightsModal.date}
                        lockDate={true}
                        onSuccess={async () => { 
                          await reloadAppointments(); 
                          toast.success('Rendez-vous créé avec succès'); 
                          setInsightsModal({ open: false, date: null, appointments: [], showForm: false });
                        }}
                        onClose={() => { 
                          setInsightsModal(prev => ({ ...prev, showForm: false }));
                        }}
                      />
                    </div>
                  ) : (
                    <>
                      {/* Show Existing Appointments */}
                      <div className="insights-list">
                        {insightsModal.appointments.length === 0 ? (
                          <div className="no-appointments">
                            <FiCalendar className="no-apt-icon" />
                            <p>Aucun rendez-vous pour cette date</p>
                          </div>
                        ) : (
                          insightsModal.appointments.map(apt => (
                            <div key={apt.id} className="insight-apt-item">
                              <div className={`apt-chip ${getStatusColor(apt.status)}`}
                                style={{ marginBottom: 6 }}>
                                <span className="apt-time">{apt.time}</span>
                                <span className="apt-patient">{apt.patientName}</span>
                              </div>
                              <div className="apt-details">
                                <span className="apt-type">{apt.type}</span>
                                <span className={`apt-status ${getStatusColor(apt.status)}`}>{getStatusLabel(apt.status)}</span>
                                {apt.notes && <p className="apt-notes">{apt.notes}</p>}
                                {apt.patientPhone && <span className="apt-phone"><FiPhone /> {apt.patientPhone}</span>}
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                      
                      {/* Add Appointment Button */}
                      <button 
                        className="modal-add-appointment-btn" 
                        onClick={toggleFormInModal}
                      >
                        <FiPlus /> Ajouter un rendez-vous
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Add Appointment Modal */}
        {showAddModal && (
          <div className="modal-overlay">
            <div className="modal-content" onClick={e => e.stopPropagation()}>
              <AppointmentForm
                key={`add-rdv-${newAppointmentPatientId || 'new'}`}
                defaultDate={selectedDate.toISOString().split('T')[0]}
                defaultPatientId={newAppointmentPatientId || undefined}
                initialStep={newAppointmentPatientId ? 2 : 1}
                onSuccess={async () => {
                  await reloadAppointments();
                  toast.success('Rendez-vous créé avec succès');
                  setNewAppointmentPatientId(null);
                }}
                onClose={() => {
                  setShowAddModal(false);
                  resetAddForm();
                  setNewAppointmentPatientId(null);
                }}
              />
            </div>
          </div>
        )}

        {/* Edit Modal */}
        {showEditModal && editingAppointment && (
          <div className="modal-overlay">
            <div className="modal-content" onClick={e => e.stopPropagation()}>
              <AppointmentForm
                defaultDate={editingAppointment.date}
                defaultTime={editingAppointment.time}
                defaultPatientId={editingAppointment.patient_id}
                defaultNotes={editingAppointment.notes}
                isEditing={true}
                appointmentId={editingAppointment.id}
                onSuccess={async () => { await reloadAppointments(); setShowEditModal(false); setEditingAppointment(null); toast.success('Rendez-vous modifié avec succès'); }}
                onClose={() => { setShowEditModal(false); setEditingAppointment(null); }}
              />
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}

export default AppointmentsPage;
