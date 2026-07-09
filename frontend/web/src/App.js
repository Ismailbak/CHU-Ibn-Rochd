import React, { useEffect, useCallback, useRef, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { ToastProvider } from './components/common';
import { getCurrentUser, getMaintenanceStatus, getSessionConfig } from './api/api';
import LoginPage from './pages/Login';
import ForgotPasswordPage from './pages/Login/ForgotPasswordPage';
import DashboardPage from './pages/Dashboard';
import AdminDashboard from './pages/Admin/AdminDashboard';
import AdminUsers from './pages/Admin/AdminUsers';
import AdminAnalytics from './pages/Admin/AdminAnalytics';
import AdminSecurity from './pages/Admin/AdminSecurity';
import AdminSettings from './pages/Admin/AdminSettings';
import AdminUserDetail from './pages/Admin/AdminUserDetail';
import FormBuilder from './pages/Admin/FormBuilder';
import PatientPage from './pages/Patients';
import PatientDetailPage from './pages/Patients/PatientDetailPage';
import AppointmentsPage from './pages/Appointments';
import MedicalActsPage from './pages/MedicalActs';
import AssistantPage from './pages/Assistant';
import ChatPage from './pages/Chat/ChatPage';
import AnalyticsPage from './pages/Analytics';
import NotificationsPage from './pages/Notifications';
import ProfilePage from './pages/Profile';
import MaintenancePage from './pages/Maintenance';
import { TermsPage, PrivacyPage } from './pages/Legal';

const DEFAULT_SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes fallback
const PUBLIC_PATHS = ['/', '/forgot-password', '/terms', '/privacy', '/maintenance'];

function clearAuth() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
}

function readStoredUser() {
  try {
    return JSON.parse(localStorage.getItem('user') || '{}');
  } catch {
    return {};
  }
}

function MaintenanceGate({ children }) {
  const location = useLocation();
  const [state, setState] = useState({ loading: true, enabled: false, message: null });

  useEffect(() => {
    let mounted = true;
    const check = async () => {
      try {
        const res = await getMaintenanceStatus();
        if (!mounted) return;
        setState({
          loading: false,
          enabled: Boolean(res.data?.maintenanceMode),
          message: res.data?.message || null,
        });
      } catch {
        if (!mounted) return;
        setState((prev) => ({ ...prev, loading: false }));
      }
    };
    check();
    const timer = setInterval(check, 30000);
    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, [location.pathname]);

  if (state.loading && !PUBLIC_PATHS.includes(location.pathname)) {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', color: '#64748B' }}>
        Vérification de la disponibilité...
      </div>
    );
  }

  const user = readStoredUser();
  const isAdmin = Boolean(user?.is_admin);
  const onAllowedPath = PUBLIC_PATHS.includes(location.pathname) || location.pathname.startsWith('/admin');

  if (state.enabled && !isAdmin && !onAllowedPath) {
    return <MaintenancePage message={state.message} />;
  }

  if (state.enabled && !isAdmin && location.pathname === '/maintenance') {
    return <MaintenancePage message={state.message} />;
  }

  if (!state.enabled && location.pathname === '/maintenance') {
    return <Navigate to={localStorage.getItem('token') ? '/dashboard' : '/'} replace />;
  }

  return children;
}

function AuthRoute({ children, adminOnly = false }) {
  const location = useLocation();
  const [state, setState] = useState({ status: 'checking', user: null, maintenance: false, maintenanceMessage: null });

  useEffect(() => {
    let isMounted = true;
    const token = localStorage.getItem('token');

    if (!token) {
      setState({ status: 'unauthenticated', user: null, maintenance: false, maintenanceMessage: null });
      return () => {
        isMounted = false;
      };
    }

    getCurrentUser()
      .then((res) => {
        if (!isMounted) return;
        const user = res.data?.user || res.data;
        localStorage.setItem('user', JSON.stringify(user));
        setState({ status: 'authenticated', user, maintenance: false, maintenanceMessage: null });
      })
      .catch(async (err) => {
        if (!isMounted) return;
        const data = err?.response?.data;
        const isMaintenance =
          err?.response?.status === 503 &&
          (data?.code === 'maintenance' || data?.maintenanceMode === true);
        if (isMaintenance) {
          setState({
            status: 'maintenance',
            user: null,
            maintenance: true,
            maintenanceMessage: data?.detail || null,
          });
          return;
        }
        clearAuth();
        setState({ status: 'unauthenticated', user: null, maintenance: false, maintenanceMessage: null });
      });

    return () => {
      isMounted = false;
    };
  }, [location.pathname]);

  if (state.status === 'checking') {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', color: '#64748B' }}>
        Vérification de la session...
      </div>
    );
  }

  if (state.status === 'maintenance') {
    return <MaintenancePage message={state.maintenanceMessage} />;
  }

  if (state.status === 'unauthenticated') {
    return <Navigate to="/" replace state={{ from: location }} />;
  }

  if (adminOnly && !state.user?.is_admin) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
}

function InactivityGuard({ children }) {
  const navigate = useNavigate();
  const location = useLocation();
  const timerRef = useRef(null);
  const timeoutMsRef = useRef(DEFAULT_SESSION_TIMEOUT_MS);

  useEffect(() => {
    let mounted = true;
    getSessionConfig()
      .then((res) => {
        if (!mounted) return;
        const minutes = Number(res.data?.sessionTimeout);
        if (Number.isFinite(minutes) && minutes >= 5) {
          timeoutMsRef.current = Math.min(240, minutes) * 60 * 1000;
        }
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, [location.pathname]);

  const logout = useCallback(() => {
    clearAuth();
    navigate('/', { replace: true });
  }, [navigate]);

  const resetTimer = useCallback(() => {
    if (!localStorage.getItem('token')) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(logout, timeoutMsRef.current || DEFAULT_SESSION_TIMEOUT_MS);
  }, [logout]);

  useEffect(() => {
    // Skip on public pages
    if (PUBLIC_PATHS.includes(location.pathname)) return;
    if (!localStorage.getItem('token')) return;

    const events = ['mousedown', 'keydown', 'scroll', 'touchstart'];
    events.forEach((e) => window.addEventListener(e, resetTimer));
    resetTimer();

    return () => {
      events.forEach((e) => window.removeEventListener(e, resetTimer));
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [location.pathname, resetTimer]);

  return children;
}

function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
      <MaintenanceGate>
      <InactivityGuard>
      <Routes>
        <Route path="/" element={<LoginPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/maintenance" element={<MaintenancePage />} />
        <Route path="/signup" element={<Navigate to="/" replace />} />
        <Route path="/dashboard" element={<AuthRoute><DashboardPage /></AuthRoute>} />
        <Route path="/admin" element={<AuthRoute adminOnly><AdminDashboard /></AuthRoute>} />
        <Route path="/admin/users" element={<AuthRoute adminOnly><AdminUsers /></AuthRoute>} />
        <Route path="/admin/users/:id" element={<AuthRoute adminOnly><AdminUserDetail /></AuthRoute>} />
        <Route path="/admin/analytics" element={<AuthRoute adminOnly><AdminAnalytics /></AuthRoute>} />
        <Route path="/admin/security" element={<AuthRoute adminOnly><AdminSecurity /></AuthRoute>} />
        <Route path="/admin/settings" element={<AuthRoute adminOnly><AdminSettings /></AuthRoute>} />
        <Route path="/admin/form-builder" element={<AuthRoute adminOnly><FormBuilder /></AuthRoute>} />
        <Route path="/patients" element={<AuthRoute><PatientPage /></AuthRoute>} />
        <Route path="/patients/:id" element={<AuthRoute><PatientDetailPage /></AuthRoute>} />
        <Route path="/patients/:patientId/chat" element={<AuthRoute><ChatPage /></AuthRoute>} />
        <Route path="/appointments" element={<AuthRoute><AppointmentsPage /></AuthRoute>} />
        <Route path="/medical-acts" element={<AuthRoute><MedicalActsPage /></AuthRoute>} />
        <Route path="/assistant" element={<AuthRoute><AssistantPage /></AuthRoute>} />
        <Route path="/analytics" element={<AuthRoute><AnalyticsPage /></AuthRoute>} />
        <Route path="/notifications" element={<AuthRoute><NotificationsPage /></AuthRoute>} />
        <Route path="/profile" element={<AuthRoute><ProfilePage /></AuthRoute>} />
        <Route path="/terms" element={<TermsPage />} />
        <Route path="/privacy" element={<PrivacyPage />} />
      </Routes>
      </InactivityGuard>
      </MaintenanceGate>
      </ToastProvider>
    </BrowserRouter>
  );
}

export default App;
