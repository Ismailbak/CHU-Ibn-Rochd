import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

const getDevApiUrl = () => {
  const debuggerHost =
    Constants.expoGoConfig?.debuggerHost
    || Constants.expoConfig?.hostUri
    || Constants.manifest2?.extra?.expoClient?.hostUri;

  const host = debuggerHost?.split(':')[0];

  if (host) {
    return `http://${host}:8000/api`;
  }

  return 'http://localhost:8000/api';
};

export const getApiUrl = getDevApiUrl;
export const API_URL = getDevApiUrl();

const api = axios.create({
  timeout: 10000,
});

api.interceptors.request.use(async (config) => {
  config.baseURL = getDevApiUrl();
  const token = await AsyncStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ─── Auth ────────────────────────────────────────────────────────────────────
export const login = (username, password) =>
  api.post('/auth/login', new URLSearchParams({ username, password }));

export const getCurrentUser = () => api.get('/auth/me');

// ─── Patients ────────────────────────────────────────────────────────────────
export const getPatients = (q) =>
  api.get('/patients/', { params: q ? { q } : {} });
export const getPatient = (id) => api.get(`/patients/${id}`);
export const getPatientDossierPdf = (id) =>
  api.get(`/patients/${id}/dossier`, { responseType: 'arraybuffer' });

// ─── Appointments ────────────────────────────────────────────────────────────
export const getAppointments = () => api.get('/appointments/');
export const getTodayAppointments = () => api.get('/appointments/today');
export const getPatientAppointments = (patientId) =>
  api.get(`/appointments/patient/${patientId}`);
export const createAppointment = (data) => api.post('/appointments/', data);
export const updateAppointment = (id, data) =>
  api.put(`/appointments/${id}`, data);
export const deleteAppointment = (id) => api.delete(`/appointments/${id}`);

// ─── Medical Acts ────────────────────────────────────────────────────────────
export const getMedicalActs = (params) =>
  api.get('/medical-acts/', { params });
export const getMedicalActTypes = () => api.get('/medical-acts/types');
export const getPatientMedicalActs = (patientId) =>
  api.get(`/medical-acts/patient/${patientId}`);
export const createMedicalAct = (data) => api.post('/medical-acts/', data);
export const getMedicalActPdf = (actId) =>
  api.get(`/medical-acts/${actId}/pdf`, { responseType: 'arraybuffer' });

// ─── Analytics ───────────────────────────────────────────────────────────────
export const getAnalyticsSummary = () => api.get('/analytics/summary');

// ─── Notifications ───────────────────────────────────────────────────────────
export const getNotifications = () => api.get('/notifications/');

// ─── Chat AI ─────────────────────────────────────────────────────────────────
export const sendChatMessage = (message, patientId = null, language = 'fr', config = {}) => {
  const { sessionId, ...axiosConfig } = config || {};
  return api.post(
    '/chat/grounded',
    {
      message,
      patient_id: patientId || null,
      session_id: sessionId || null,
      language,
    },
    { timeout: 60000, ...axiosConfig },
  );
};

export const getChatHistory = (patientId = null, limit = 50) => {
  const params = { limit };
  if (patientId) params.patient_id = patientId;
  return api.get('/chat/history', { params });
};

export default api;
