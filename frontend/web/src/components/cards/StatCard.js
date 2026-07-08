import React from 'react';
import './StatCard.css';

function StatCard({ icon, label, percentage, value, color = 'pink', onClick }) {
  const colorClasses = {
    pink: 'stat-card-pink',
    blue: 'stat-card-blue',
    green: 'stat-card-green',
    yellow: 'stat-card-yellow',
    purple: 'stat-card-purple',
  };

  const handleKeyDown = (event) => {
    if (!onClick) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onClick();
    }
  };

  return (
    <div
      className={`stat-card ${colorClasses[color]}${onClick ? ' stat-card-clickable' : ''}`}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      <div className="stat-icon">{icon}</div>
      <div className="stat-label">{label}</div>
      <div className="stat-percentage">{percentage}</div>
      <div className="stat-value">{value}</div>
    </div>
  );
}

export default StatCard;
