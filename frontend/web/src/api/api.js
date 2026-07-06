import axios from 'axios';
import { repairDeep } from '../utils/textEncoding';

/** API base: dev uses FastAPI directly; production uses Nginx same-origin /api. */
export const API_URL =
  process.env.REACT_APP_API_URL ||
  (process.env.NODE_ENV === 'development' ? 'http://localhost:8000/api' : '/api');

/** Origin for static assets (/uploads) — empty string = same origin as the web app */
export const getBackendOrigin = () => {
  if (API_URL.startsWith('http://') || API_URL.startsWith('https://')) {
    return API_URL.replace(/\/api\/?$/, '');
  }
  return '';
};

/** Build URL for profile/uploads paths stored as data/uploads/... */
export const getUploadsUrl = (storedPath) => {
  if (!storedPath) return null;
  const path = storedPath.replace(/\\/g, '/').replace(/^data\//, '');
  const origin = getBackendOrigin();
  if (origin) {
    return `${origin}/${path}`;
  }
  return `/${path}`;
};

const api = axios.create({
  baseURL: API_URL,
});

/** Turn FastAPI/axios error payloads into a user-visible string. */
export const formatApiError = (err, fallback = 'Une erreur est survenue.') => {
  const detail = err?.response?.data?.detail;
  if (typeof detail === 'string' && detail.trim()) return detail;
  if (Array.isArray(detail)) {
    return detail.map((item) => item?.msg || item?.message || String(item)).join(', ');
  }
  if (detail && typeof detail === 'object') {
    return detail.message || detail.msg || fallback;
  }
  return fallback;
};

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => {
    if (response?.data != null && typeof response.data === 'object') {
      response.data = repairDeep(response.data);
    }
    return response;
  },
  (error) => {
    if (error.response && error.response.status === 401 && localStorage.getItem('token')) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/';
    }
    return Promise.reject(error);
  }
);

// Auth
export const login = (username, password) =>
  api.post('/auth/login', new URLSearchParams({ username, password }));

export const requestPasswordReset = (email) =>
  api.post('/auth/forgot-password', { email });

export const getCurrentUser = () => api.get('/auth/me');

// Patients
export const getPatients = (params = {}) => api.get('/patients/', { params });
export const getPatient = (id) => api.get(`/patients/${id}`);
export const createPatient = (data) => api.post('/patients/', data);
export const updatePatient = (id, data) => api.put(`/patients/${id}`, data);
export const deletePatient = (id) => api.delete(`/patients/${id}`);
export const exportPatientDossier = (id) => api.get(`/patients/${id}/dossier`, { responseType: 'blob' });

// Patient Allergies
export const getPatientAllergies = (patientId) => api.get(`/patients/${patientId}/allergies`);
export const createPatientAllergy = (patientId, data) => api.post(`/patients/${patientId}/allergies`, data);
export const updatePatientAllergy = (patientId, allergyId, data) => api.put(`/patients/${patientId}/allergies/${allergyId}`, data);
export const deletePatientAllergy = (patientId, allergyId) => api.delete(`/patients/${patientId}/allergies/${allergyId}`);

// Appointments
export const getAppointments = (params = {}) => api.get('/appointments/', { params });
export const getAppointment = (id) => api.get(`/appointments/${id}`);
export const createAppointment = (data) => api.post('/appointments/', data);
export const updateAppointment = (id, data) => api.put(`/appointments/${id}`, data);
export const deleteAppointment = (id) => api.delete(`/appointments/${id}`);
export const getTodayAppointments = () => api.get('/appointments/today');
export const getPatientAppointments = (patientId) => api.get(`/appointments/patient/${patientId}`);

// Medical Acts
export const getMedicalActs = (params = {}) => api.get('/medical-acts/', { params });
export const getMedicalAct = (id) => api.get(`/medical-acts/${id}`);
export const createMedicalAct = (data) => api.post('/medical-acts/', data);
export const updateMedicalAct = (id, data) => api.put(`/medical-acts/${id}`, data);
export const deleteMedicalAct = (id) => api.delete(`/medical-acts/${id}`);
export const getPatientMedicalActs = (patientId) => api.get(`/medical-acts/patient/${patientId}`);
export const getMedicalActTypes = () => api.get('/medical-acts/types');
export const uploadMedicalActDocument = (actId, formData) =>
  api.post(`/medical-acts/${actId}/upload`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
export const downloadMedicalActDocument = (actId, docId) =>
  api.get(`/medical-acts/${actId}/documents/${docId}/download`, { responseType: 'blob' });
export const getMedicalActPdf = (actId) =>
  api.get(`/medical-acts/${actId}/pdf`, { responseType: 'blob' });

// Act Results (Lab Tests)
export const getActResults = (actId) => api.get(`/act-results/act/${actId}`);
export const getPatientResults = (patientId) => api.get(`/act-results/patient/${patientId}`);
export const getActResult = (resultId) => api.get(`/act-results/${resultId}`);
export const createActResult = (data) => api.post('/act-results/', data);
export const updateActResult = (resultId, data) => api.put(`/act-results/${resultId}`, data);
export const deleteActResult = (resultId) => api.delete(`/act-results/${resultId}`);

// Chat
// Supports both signatures:
// 1) sendChatMessage(message, patientId, language, config)
// 2) sendChatMessage(message, userId, patientId, language, config) (legacy)
export const sendChatMessage = (message, arg2 = null, arg3 = 'fr', arg4 = {}, arg5 = {}) => {
  let patientId = null;
  let language = 'fr';
  let config = {};

  if (typeof arg2 === 'string' && (typeof arg3 === 'number' || arg3 === null || typeof arg3 === 'undefined')) {
    // Legacy: (message, userId, patientId, language, config)
    patientId = arg3 ?? null;
    language = typeof arg4 === 'string' ? arg4 : 'fr';
    config = (arg5 && typeof arg5 === 'object') ? arg5 : {};
  } else {
    // Preferred: (message, patientId, language, config)
    patientId = arg2 ?? null;
    language = typeof arg3 === 'string' ? arg3 : 'fr';
    config = (arg4 && typeof arg4 === 'object') ? arg4 : {};
  }

  const { sessionId, ...axiosConfig } = config;
  return api.post(
    '/chat/grounded',
    { message, patient_id: patientId, session_id: sessionId || null, language },
    axiosConfig
  );
};

export const sendChatMessageWithAttachment = ({
  message,
  patientId = null,
  sessionId = null,
  language = 'fr',
  file,
  signal,
}) => {
  const formData = new FormData();
  formData.append('message', message || '');
  formData.append('language', language);
  if (patientId) formData.append('patient_id', patientId);
  if (sessionId) formData.append('session_id', sessionId);
  formData.append('file', file);

  return api.post('/chat/grounded/attachment', formData, {
    signal,
    headers: { 'Content-Type': 'multipart/form-data' },
  });
};

export const getChatHistory = (patientId = null, limit = 50) => {
  const params = new URLSearchParams({ limit });
  if (patientId) params.append('patient_id', patientId);
  return api.get(`/chat/history?${params.toString()}`);
};

export const deleteChatHistoryItem = (messageId) =>
  api.delete(`/chat/history/${messageId}`);

// Chat Sessions
export const createChatSession = (patientId, title = null) =>
  api.post('/chat/sessions', { patient_id: patientId, title });

export const getChatSession = (sessionId) =>
  api.get(`/chat/sessions/${sessionId}`);

export const listPatientChatSessions = (patientId, limit = 50, offset = 0) =>
  api.get(`/chat/patients/${patientId}/sessions`, { params: { limit, offset } });

export const updateChatSession = (sessionId, title) =>
  api.patch(`/chat/sessions/${sessionId}`, { title });

export const deleteChatSession = (sessionId) =>
  api.delete(`/chat/sessions/${sessionId}`);

export const addMessageToSession = (sessionId, role, content) =>
  api.post(`/chat/sessions/${sessionId}/messages`, { session_id: sessionId, role, content });

export const getSessionMessages = (sessionId, limit = 100, offset = 0) =>
  api.get(`/chat/sessions/${sessionId}/messages`, { params: { limit, offset } });

// Analytics & Notifications
export const getAnalyticsSummary = (dateRange = '6months') => api.get('/analytics/summary', { params: { date_range: dateRange } });
export const getDashboardSummary = () => api.get('/analytics/dashboard-summary');
export const getRecentActivity = () => api.get('/analytics/recent-activity');

// User Profile & Security
export const changePassword = (currentPassword, newPassword) => api.post('/auth/change-password', { current_password: currentPassword, new_password: newPassword });
export const getUserActivity = () => api.get('/auth/activity');
export const uploadProfilePicture = (file) => {
  const formData = new FormData();
  formData.append('file', file);
  return api.post('/auth/upload-profile-picture', formData, {
    headers: {
      'Content-Type': 'multipart/form-data'
    }
  });
};
export const getNotifications = () => api.get('/notifications/');
export const createNotification = (data) => api.post('/notifications/', data);
export const markNotificationRead = (id) => api.post(`/notifications/read/${id}`);

export const getMedicalActsStats = () => api.get('/medical-acts/stats');

// admin dashbaord
export const getAuditLogs = (limit = 50, skip = 0, filters = {}) => {
  const params = new URLSearchParams({ limit, skip });
  if (filters.status && filters.status !== 'all') params.append('status', filters.status);
  if (filters.action) params.append('action', filters.action);
  if (filters.username) params.append('username', filters.username);
  if (filters.date_from) params.append('date_from', filters.date_from);
  if (filters.date_to) params.append('date_to', filters.date_to);
  return api.get(`/analytics/audit-logs?${params.toString()}`);
};

export const exportAuditLogsCsv = (filters = {}) => {
  const params = new URLSearchParams();
  if (filters.status && filters.status !== 'all') params.append('status', filters.status);
  if (filters.action) params.append('action', filters.action);
  if (filters.username) params.append('username', filters.username);
  if (filters.date_from) params.append('date_from', filters.date_from);
  if (filters.date_to) params.append('date_to', filters.date_to);
  return api.get(`/analytics/audit-logs/export?${params.toString()}`, { responseType: 'blob' });
};

export const getAdminStats = () => api.get('/analytics/admin-stats');
export const getAdminUsers = () => api.get('/auth/users');
export const getDoctors = () => api.get('/auth/doctors');
export const getNotificationRecipients = () => api.get('/auth/notification-recipients');
export const toggleUserStatus = (userId) => api.patch(`/auth/users/${userId}/toggle`);
export const createUser = (data) => api.post('/auth/signup', data);
export const updateUser = (userId, data) => api.put(`/auth/users/${userId}`, data);
export const deleteUser = (userId) => api.delete(`/auth/users/${userId}`);
export const resetUserPassword = (userId, newPassword) =>
  api.post(`/auth/users/${userId}/reset-password`, { new_password: newPassword });
export const getUserDetail = (userId) => api.get(`/auth/users/${userId}`);

// Settings
export const getSettings = () => api.get('/analytics/settings');
export const saveSettings = (data) => api.put('/analytics/settings', data);

// ═══════════════════════════════════════════════════════════════════════════
// FORMS SYSTEM - Reference Data & Form CRUD
// ═══════════════════════════════════════════════════════════════════════════

// Reference Data (Catalog)
export const getCareTypes = () => api.get('/forms/ref/care-types');
export const getActTypes = (careTypeId) => api.get(`/forms/ref/act-types?care_type_id=${careTypeId}`);
export const getFormTypes = (actTypeId) => api.get(`/forms/ref/form-types?act_type_id=${actTypeId}`);

// Form Data CRUD - form_cs_rd
export const createFormCsRd = (data) => api.post('/forms/cs_rd', data);
export const getFormCsRd = (formId) => api.get(`/forms/cs_rd/${formId}`);
export const updateFormCsRd = (formId, data) => api.put(`/forms/cs_rd/${formId}`, data);
export const deleteFormCsRd = (formId) => api.delete(`/forms/cs_rd/${formId}`);

// Form Data CRUD - form_cs_ric (Rhumatismes Inflammatoires Chroniques)
export const createFormCsRic = (data) => api.post('/forms/cs-ric', data);
export const getFormCsRic = (formId) => api.get(`/forms/cs-ric/${formId}`);
export const updateFormCsRic = (formId, data) => api.patch(`/forms/cs-ric/${formId}`, data);
export const deleteFormCsRic = (formId) => api.delete(`/forms/cs-ric/${formId}`);

// Form Data CRUD - form_cs_os (Ostéopathies Fragilisantes)
export const createFormCsOs = (data) => api.post('/forms/cs-os', data);
export const getFormCsOs = (formId) => api.get(`/forms/cs-os/${formId}`);
export const updateFormCsOs = (formId, data) => api.patch(`/forms/cs-os/${formId}`, data);
export const deleteFormCsOs = (formId) => api.delete(`/forms/cs-os/${formId}`);

// Form Data CRUD - form_cs_echo (Échographie)
export const createFormCsEcho = (data) => api.post('/forms/cs-echo', data);
export const getFormCsEcho = (formId) => api.get(`/forms/cs-echo/${formId}`);
export const updateFormCsEcho = (formId, data) => api.patch(`/forms/cs-echo/${formId}`, data);
export const deleteFormCsEcho = (formId) => api.delete(`/forms/cs-echo/${formId}`);

// Form Data CRUD - form_cs_geste (Gestes Techniques)
export const createFormCsGeste = (data) => api.post('/forms/cs-geste', data);
export const getFormCsGeste = (formId) => api.get(`/forms/cs-geste/${formId}`);
export const updateFormCsGeste = (formId, data) => api.patch(`/forms/cs-geste/${formId}`, data);
export const deleteFormCsGeste = (formId) => api.delete(`/forms/cs-geste/${formId}`);

// Form Data CRUD - form_cs_seances (Séances Thérapeutiques)
export const createFormCsSeances = (data) => api.post('/forms/cs-seances', data);
export const getFormCsSeances = (formId) => api.get(`/forms/cs-seances/${formId}`);
export const updateFormCsSeances = (formId, data) => api.patch(`/forms/cs-seances/${formId}`, data);
export const deleteFormCsSeances = (formId) => api.delete(`/forms/cs-seances/${formId}`);

// Form Data CRUD - form_cs_dxa (Ostéodensitométrie)
export const createFormCsDxa = (data) => api.post('/forms/cs-dxa', data);
export const getFormCsDxa = (formId) => api.get(`/forms/cs-dxa/${formId}`);
export const updateFormCsDxa = (formId, data) => api.patch(`/forms/cs-dxa/${formId}`, data);
export const deleteFormCsDxa = (formId) => api.delete(`/forms/cs-dxa/${formId}`);

// FormCsDouleur (Pain Management)
export const createFormCsDouleur = (data) => api.post(`/forms/cs-douleur`, data);
export const getFormCsDouleur = (formId) => api.get(`/forms/cs-douleur/${formId}`);
export const updateFormCsDouleur = (formId, data) => api.patch(`/forms/cs-douleur/${formId}`, data);
export const deleteFormCsDouleur = (formId) => api.delete(`/forms/cs-douleur/${formId}`);

// Bridge Table - Link act to form
export const linkFormToAct = (actId, refFormTypeId, formTableId) =>
  api.post(`/forms/acts/${actId}/forms?ref_form_type_id=${refFormTypeId}&form_table_id=${formTableId}`);
export const getActForms = (actId) => api.get(`/forms/acts/${actId}/forms`);
export const getActForm = (actId, refFormTypeId) =>
  api.get(`/forms/acts/${actId}/forms/${refFormTypeId}`);
export const unlinkFormFromAct = (actId, refFormTypeId) =>
  api.delete(`/forms/acts/${actId}/forms/${refFormTypeId}`);

// Dynamic Forms API
export const getDynamicTemplates = (activeOnly = true) => api.get(`/forms/templates?active_only=${activeOnly}`);
export const getDynamicTemplate = (id) => api.get(`/forms/templates/${id}`);
export const createDynamicTemplate = (data) => api.post(`/forms/templates`, data);
export const updateDynamicTemplate = (id, data) => api.put(`/forms/templates/${id}`, data);
export const submitDynamicResponse = (data) => api.post(`/forms/responses`, data);
export const getDynamicResponsesForAct = (actId) => api.get(`/forms/responses/act/${actId}`);

// System health
export const getSystemHealth = () => api.get('/analytics/system-health');

// Broadcast notification
export const broadcastNotification = (title, message) =>
  api.post('/analytics/broadcast', { title, message });

export default api;
