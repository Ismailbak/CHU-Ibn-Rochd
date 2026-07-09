import React from 'react';
import { FiTool, FiShield } from 'react-icons/fi';
import { Link } from 'react-router-dom';
import './MaintenancePage.css';

function MaintenancePage({ message }) {
  return (
    <div className="maintenance-page">
      <div className="maintenance-card">
        <div className="maintenance-icon-wrap">
          <FiTool size={28} />
        </div>
        <h1>Application en maintenance</h1>
        <p>
          {message ||
            "L'application est temporairement indisponible. Seuls les administrateurs peuvent y accéder. Veuillez réessayer plus tard."}
        </p>
        <div className="maintenance-actions">
          <Link to="/" className="maintenance-admin-link">
            <FiShield size={16} />
            Accès administrateur
          </Link>
        </div>
      </div>
    </div>
  );
}

export default MaintenancePage;
