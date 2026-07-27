import React, { useState, useEffect, useCallback } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { FiHome, FiUsers, FiCalendar, FiFileText, FiMessageSquare, FiBarChart2, FiBell, FiLogOut, FiUser, FiShield } from 'react-icons/fi';
import { useToast } from '../common';
import ConfirmDialog from '../common/ConfirmDialog';
import { getNotifications } from '../../api/api';
import { AI_ASSISTANT_ENABLED } from '../../config/features';
import logo from '../../assets/images/logo.png';
import './Sidebar.css';

const navItems = [
  { path: '/dashboard', icon: FiHome, label: 'Dashboard' },
  { path: '/patients', icon: FiUsers, label: 'Patients' },
  { path: '/appointments', icon: FiCalendar, label: 'Rendez-vous' },
  { path: '/medical-acts', icon: FiFileText, label: 'Actes Médicaux' },
  ...(AI_ASSISTANT_ENABLED
    ? [{ path: '/assistant', icon: FiMessageSquare, label: 'Assistant IA' }]
    : []),
  { path: '/analytics', icon: FiBarChart2, label: 'Analytics', roles: ['admin', 'doctor', 'department_head'] },
  { path: '/notifications', icon: FiBell, label: 'Notifications' },
];

const UNREAD_POLL_MS = 45000;

function countUnreadReceived(notifications, currentUserId) {
  const uid = Number(currentUserId);
  if (!uid) return 0;
  return (notifications || []).filter((n) => {
    if (n.read) return false;
    const userId = n.user_id != null ? Number(n.user_id) : null;
    const senderId = n.sender_id != null ? Number(n.sender_id) : null;
    // Received inbox items only (exclude the sender's own "sent" copy)
    return userId === uid && senderId !== uid;
  }).length;
}

function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { warning } = useToast();
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const [showConfirm, setShowConfirm] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  const refreshUnread = useCallback(async () => {
    if (!localStorage.getItem('token')) {
      setUnreadCount(0);
      return;
    }
    try {
      const res = await getNotifications();
      setUnreadCount(countUnreadReceived(res.data, user.id));
    } catch {
      // Keep last known badge state on transient errors
    }
  }, [user.id]);

  useEffect(() => {
    refreshUnread();
    const timer = setInterval(refreshUnread, UNREAD_POLL_MS);
    const onFocus = () => refreshUnread();
    const onUnreadChanged = () => refreshUnread();
    window.addEventListener('focus', onFocus);
    window.addEventListener('notifications:changed', onUnreadChanged);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('notifications:changed', onUnreadChanged);
    };
  }, [refreshUnread]);

  useEffect(() => {
    // Re-check when navigating (e.g. after reading notifications)
    refreshUnread();
  }, [location.pathname, refreshUnread]);

  const filteredNavItems = navItems.filter(item => {
    if (!item.roles) return true;
    if (user.is_admin) return true;
    return item.roles.includes(user.role);
  });

  const handleLogoutClick = (e) => {
    e.preventDefault();
    setShowConfirm(true);
  };

  const handleConfirm = () => {
    setShowConfirm(false);
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    warning('Vous avez été déconnecté.', 3500);
    navigate('/');
  };

  const handleCancel = () => {
    setShowConfirm(false);
  };

  return (
    <>
      <div className="sidebar">
        <div className="sidebar-gradient"></div>
        <div className="sidebar-content">
          {/* Logo */}
          <div className="sidebar-logo">
            <img src={logo} alt="SmartHos Logo" className="logo-img" />
          </div>

          {/* Navigation */}
          <nav className="sidebar-nav">
            {filteredNavItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path;
              const showUnreadDot = item.path === '/notifications' && unreadCount > 0;
              return (
                <NavLink
                  key={item.path}
                  to={item.path}
                  className={`nav-item ${isActive ? 'active' : ''}`}
                  title={showUnreadDot ? `${item.label} (${unreadCount} non lue${unreadCount > 1 ? 's' : ''})` : item.label}
                >
                  <span className="nav-item-icon-wrap">
                    <Icon size={22} />
                    {showUnreadDot && <span className="nav-unread-dot" aria-label="Nouvelles notifications" />}
                  </span>
                </NavLink>
              );
            })}
            {/* Admin Dashboard link for admin users */}
            {user.is_admin && (
              <NavLink
                to="/admin"
                className={`nav-item ${location.pathname === '/admin' ? 'active' : ''}`}
                title="Admin Dashboard"
              >
                <FiShield size={22} />
              </NavLink>
            )}
          </nav>

          {/* Profile & Logout */}
          <div className="sidebar-footer">
            <NavLink to="/profile" className="nav-item profile" title="Mon Profil">
              <FiUser size={22} />
            </NavLink>
            <a href="/" className="nav-item logout" title="Déconnexion" onClick={handleLogoutClick}>
              <FiLogOut size={22} />
            </a>
          </div>
        </div>
      </div>
      <ConfirmDialog
        open={showConfirm}
        title="Déconnexion"
        message="Êtes-vous sûr de vouloir vous déconnecter ?"
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />
    </>
  );
}

export default Sidebar;
