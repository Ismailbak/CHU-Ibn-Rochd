import React, { useEffect, useCallback, useRef, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { ToastProvider } from './components/common';
import { getCurrentUser } from './api/api';
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
import { TermsPage, PrivacyPage } from './pages/Legal';

const INACTIVITY_TIMEOUT = 30 * 60 * 1000; // 30 minutes
const PUBLIC_PATHS = ['/', '/forgot-password', '/terms', '/privacy'];

function clearAuth() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
}

function AuthRoute({ children, adminOnly = false }) {
  const location = useLocation();
  const [state, setState] = useState({ status: 'checking', user: null });

  useEffect(() => {
    let isMounted = true;
    const token = localStorage.getItem('token');

    if (!token) {
      setState({ status: 'unauthenticated', user: null });
      return () => {
        isMounted = false;
      };
    }

    getCurrentUser()
      .then((res) => {
        if (!isMounted) return;
        const user = res.data?.user || res.data;
        localStorage.setItem('user', JSON.stringify(user));
        setState({ status: 'authenticated', user });
      })
      .catch(() => {
        if (!isMounted) return;
        clearAuth();
        setState({ status: 'unauthenticated', user: null });
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

  const logout = useCallback(() => {
    clearAuth();
    navigate('/', { replace: true });
  }, [navigate]);

  const resetTimer = useCallback(() => {
    if (!localStorage.getItem('token')) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(logout, INACTIVITY_TIMEOUT);
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
      <InactivityGuard>
      <Routes>
        <Route path="/" element={<LoginPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
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
      </ToastProvider>
    </BrowserRouter>
  );
}

export default App;
