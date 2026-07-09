import React, { useState, useEffect } from 'react';
import { 
  FiBell, FiCalendar, FiUser, FiFileText, FiAlertCircle, FiCheckCircle, 
  FiClock, FiTrash2, FiCheck, FiFilter,
  FiActivity, FiMessageSquare
} from 'react-icons/fi';
import Layout from '../../components/layout/Layout';
import { SkeletonListItem, useToast } from '../../components/common';
import { getNotifications, markNotificationRead as apiMarkRead } from '../../api/api';
import { canSendNotifications } from '../../utils/permissions';
import {
  formatMoroccoGroupDate,
  formatMoroccoTime,
  getMoroccoDateKey,
} from '../../utils/dateTime';
import CreateNotificationModal from './CreateNotificationModal';
import './NotificationsPage.css';

function mapApiNotification(n, currentUserId) {
  const category = n.category || 'message';
  let type = category;
  let icon = 'bell';

  if (category === 'patients') {
    type = 'new_patient';
    icon = 'user';
  } else if (category === 'results') {
    type = 'lab_results';
    icon = 'file';
  } else if (category === 'message') {
    type = n.is_public ? 'public' : 'message';
    icon = 'message';
  }

  const uid = Number(currentUserId);
  const userId = n.user_id != null ? Number(n.user_id) : null;
  const senderId = n.sender_id != null ? Number(n.sender_id) : null;
  const isSent = userId === uid && senderId === uid;
  const isReceived = userId === uid && senderId !== uid;

  return {
    id: n.id,
    userId,
    senderId,
    isSent,
    isReceived,
    type: type,
    category: category,
    title: n.title,
    message: n.message,
    isRead: n.read,
    isPublic: n.is_public,
    senderName: isSent ? 'Moi' : (n.sender_name || 'Système'),
    icon: icon,
    date: n.created_at ? getMoroccoDateKey(n.created_at) : getMoroccoDateKey(new Date()),
    time: n.created_at ? formatMoroccoTime(n.created_at) : '',
    priority: 'normal',
  };
}

const notificationFilters = ['Toutes', 'Envoyées', 'Non lues', 'RDV', 'Patients', 'Résultats', 'Messages'];

function NotificationsPage() {
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const currentUserId = user.id;
  const maySendNotifications = canSendNotifications(user);
  const [notifications, setNotifications] = useState([]);
  const [selectedFilter, setSelectedFilter] = useState('Toutes');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const toast = useToast();

  const fetchNotifications = () => {
    setIsLoading(true);
    getNotifications()
      .then(res => {
        setNotifications((res.data || []).map((n) => mapApiNotification(n, currentUserId)));
      })
      .catch(() => { setNotifications([]); })
      .finally(() => { setIsLoading(false); });
  };

  useEffect(() => {
    fetchNotifications();
  }, []);


  const unreadCount = notifications.filter(n => !n.isRead && n.isReceived).length;
  const sentCount = notifications.filter(n => n.isSent).length;

  const filteredNotifications = notifications.filter(notif => {
    switch(selectedFilter) {
      case 'Envoyées': return notif.isSent;
      case 'Non lues': return !notif.isRead && notif.isReceived;
      case 'RDV': return notif.isReceived && (notif.type === 'appointment' || notif.category === 'appointment');
      case 'Patients': return notif.isReceived && (notif.type === 'new_patient' || notif.category === 'patients');
      case 'Résultats': return notif.isReceived && (notif.type === 'lab_results' || notif.category === 'results');
      case 'Messages': return notif.isReceived && notif.category === 'message';
      default: return notif.isReceived && !notif.isSent;
    }
  });

  const notifySidebar = () => {
    window.dispatchEvent(new Event('notifications:changed'));
  };

  const markAsRead = async (id) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
    );
    try {
      await apiMarkRead(id);
      notifySidebar();
    } catch {
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, isRead: false } : n))
      );
      toast.error('Erreur');
    }
  };

  const handleNotificationClick = (notification) => {
    if (!notification.isRead) {
      markAsRead(notification.id);
    }
  };

  const markAllAsRead = async () => {
    const unreadReceived = notifications.filter((n) => !n.isRead && n.isReceived);
    if (unreadReceived.length === 0) return;
    try {
      await Promise.all(unreadReceived.map((n) => apiMarkRead(n.id)));
      setNotifications(notifications.map((n) =>
        n.isReceived ? { ...n, isRead: true } : n
      ));
      notifySidebar();
      toast.success('Toutes les notifications reçues marquées comme lues');
    } catch {
      toast.error('Erreur lors du marquage');
    }
  };

  const deleteNotification = (id) => {
    setNotifications(notifications.filter(n => n.id !== id));
    toast.info('Notification supprimée');
  };

  const getIcon = (iconType) => {
    switch(iconType) {
      case 'calendar': return <FiCalendar />;
      case 'user': return <FiUser />;
      case 'file': return <FiFileText />;
      case 'alert': return <FiAlertCircle />;
      case 'check': return <FiCheckCircle />;
      case 'activity': return <FiActivity />;
      case 'message': return <FiMessageSquare />;
      default: return <FiBell />;
    }
  };

  const getPriorityClass = (priority) => {
    switch(priority) {
      case 'high': return 'priority-high';
      case 'low': return 'priority-low';
      default: return 'priority-normal';
    }
  };

  const getTypeClass = (type) => {
    if (type.includes('appointment')) return 'type-appointment';
    if (type === 'new_patient' || type === 'follow_up') return 'type-patient';
    if (type === 'lab_results') return 'type-results';
    if (type === 'message') return 'type-message';
    if (type === 'system') return 'type-system';
    return 'type-default';
  };

  // Group notifications by date
  const groupedNotifications = filteredNotifications.reduce((groups, notif) => {
    const date = formatMoroccoGroupDate(notif.date);
    if (!groups[date]) groups[date] = [];
    groups[date].push(notif);
    return groups;
  }, {});

  return (
    <Layout>
      <div className="notifications-page">
        {/* Header */}
        <div className="page-header">
          <div className="header-content">
            <h1 className="page-title">
              Notifications
              {unreadCount > 0 && <span className="unread-badge">{unreadCount}</span>}
            </h1>
            <p className="page-subtitle">Messages et alertes du staff médical</p>
          </div>
          <div className="header-actions">
            {maySendNotifications && (
              <button className="new-notif-btn" onClick={() => setShowCreateModal(true)}>
                <FiMessageSquare />
                <span>Nouvelle Notification</span>
              </button>
            )}
            <button className="mark-all-btn" onClick={markAllAsRead} disabled={unreadCount === 0}>
              <FiCheck />
              <span>Marquer tout lu</span>
            </button>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="filter-bar">
          {notificationFilters.map(filter => (
            <button 
              key={filter}
              className={`filter-btn ${selectedFilter === filter ? 'active' : ''}`}
              onClick={() => setSelectedFilter(filter)}
            >
              {filter}
              {filter === 'Non lues' && unreadCount > 0 && (
                <span className="filter-count">{unreadCount}</span>
              )}
              {filter === 'Envoyées' && sentCount > 0 && (
                <span className="filter-count">{sentCount}</span>
              )}
            </button>
          ))}
        </div>

        {/* Notifications List */}
        <div className="notifications-container">
          {isLoading ? (
            <div className="notification-group">
              <div className="skeleton-date" style={{ width: '100px', height: '20px', background: '#e9ecef', borderRadius: '4px', marginBottom: '16px' }}></div>
              <div className="notification-list">
                {[1, 2, 3, 4, 5].map(i => (
                  <SkeletonListItem key={i} />
                ))}
              </div>
            </div>
          ) : Object.keys(groupedNotifications).length === 0 ? (
            <div className="no-notifications">
              <FiBell className="no-notif-icon" />
              <h3>Aucune notification</h3>
              <p>Vous n'avez aucune notification dans cette catégorie</p>
            </div>
          ) : (
            Object.entries(groupedNotifications).map(([date, notifs]) => (
              <div key={date} className="notification-group">
                <h3 className="group-date">{date}</h3>
                <div className="notification-list">
                  {notifs.map(notification => (
                    <div 
                      key={notification.id} 
                      className={`notification-item ${!notification.isRead && notification.isReceived ? 'unread' : ''} ${notification.isSent ? 'sent' : ''} ${getPriorityClass(notification.priority)}`}
                      onClick={() => handleNotificationClick(notification)}
                    >
                      <div className={`notification-icon ${getTypeClass(notification.type)}`}>
                        {getIcon(notification.icon)}
                      </div>
                      
                      <div className="notification-content">
                        <div className="notification-header">
                          <h4 className="notification-title">
                            {notification.title}
                            {notification.isPublic && <span className="public-tag">Staff</span>}
                            {notification.isSent && <span className="sent-tag">Envoyée</span>}
                          </h4>
                          <span className="notification-time">{notification.time}</span>
                        </div>
                        <p className="notification-message">{notification.message}</p>
                        <div className="notification-meta">
                          <span className="notification-sender">
                            <FiUser /> {notification.senderName}
                          </span>
                        </div>
                      </div>

                      <div className="notification-actions">
                        {!notification.isRead && notification.isReceived && (
                          <div className="unread-dot" title="Non lu"></div>
                        )}
                        <button 
                          className="delete-btn" 
                          onClick={(e) => { e.stopPropagation(); deleteNotification(notification.id); }}
                          title="Supprimer"
                        >
                          <FiTrash2 />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>

        <CreateNotificationModal 
          isOpen={showCreateModal} 
          onClose={() => setShowCreateModal(false)} 
          onCreated={() => {
            fetchNotifications();
            toast.success('Notification envoyée avec succès');
          }}
          onError={(msg) => toast.error(msg)}
        />
      </div>
    </Layout>
  );
}

export default NotificationsPage;
