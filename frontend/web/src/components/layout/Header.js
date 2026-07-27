import React, { useState, useRef, useEffect } from 'react';
import { FiSearch, FiMenu, FiFileText, FiShield, FiX, FiMessageSquare, FiUser, FiCalendar, FiActivity } from 'react-icons/fi';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { globalSearch } from '../../api/api';
import { AI_ASSISTANT_ENABLED } from '../../config/features';
import './Header.css';

const navTabs = [
  { path: '/dashboard', label: 'Tableau de Bord' },
  { path: '/patients', label: 'Patients' },
  { path: '/appointments', label: 'Rendez-vous' },
  { path: '/medical-acts', label: 'Actes Médicaux' },
];

function Header() {
  const location = useLocation();
  const navigate = useNavigate();
  const isDashboard = location.pathname === '/dashboard';
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState({ patients: [], appointments: [], acts: [] });
  const [showResults, setShowResults] = useState(false);
  const menuRef = useRef(null);
  const searchRef = useRef(null);
  const [searchLoading, setSearchLoading] = useState(false);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setMenuOpen(false);
      }
      if (searchRef.current && !searchRef.current.contains(event.target)) {
        setShowResults(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const calculateAge = (dateOfBirth) => {
    if (!dateOfBirth) return null;
    const today = new Date();
    const birthDate = new Date(dateOfBirth);
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
  };

  // Server-side search (no bulk preload of 80k+ rows)
  useEffect(() => {
    const query = searchQuery.trim();
    if (query.length < 2) {
      setSearchResults({ patients: [], appointments: [], acts: [] });
      setShowResults(false);
      setSearchLoading(false);
      return undefined;
    }

    const timer = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const res = await globalSearch(query, 5);
        const data = res.data || {};
        const patients = (data.patients || []).map((p) => {
          const age = calculateAge(p.date_of_birth);
          return {
            id: p.id,
            name: `${p.first_name} ${p.last_name}`,
            detail: `${p.ipp ? `IPP ${p.ipp} • ` : ''}${age ? `${age} ans` : ''}${p.primary_diagnosis ? ` • ${p.primary_diagnosis}` : ''}`.replace(/^ • /, ''),
            avatar: p.gender?.toLowerCase() === 'femme' ? '👩' : '👨',
          };
        });
        const appointments = (data.appointments || []).map((apt) => ({
          id: apt.id,
          patientName: apt.patient_name,
          detail: apt.datetime_scheduled
            ? new Date(apt.datetime_scheduled).toLocaleString('fr-FR')
            : '',
          reason: apt.reason || '',
        }));
        const acts = (data.acts || []).map((act) => ({
          id: act.id,
          patientName: act.patient_name,
          detail: act.act_date
            ? new Date(act.act_date).toLocaleDateString('fr-FR')
            : '',
          actType: act.act_type || act.description || 'Acte',
        }));
        setSearchResults({ patients, appointments, acts });
        setShowResults(true);
      } catch {
        setSearchResults({ patients: [], appointments: [], acts: [] });
      } finally {
        setSearchLoading(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleSearch = (query) => {
    setSearchQuery(query);
  };

  const handleResultClick = (type, id) => {
    setShowResults(false);
    setSearchQuery('');
    if (type === 'patient') {
      navigate(`/patients/${id}`);
    } else if (type === 'appointment') {
      navigate('/appointments');
    } else if (type === 'act') {
      navigate('/medical-acts');
    }
  };

  const hasResults = searchResults.patients.length > 0 || 
                     searchResults.appointments.length > 0 || 
                     searchResults.acts.length > 0;

  return (
    <header className={`header ${isDashboard ? 'header-centered' : ''}`}>
      {!isDashboard && (
        <div className="header-left" ref={searchRef}>
          <div className="search-container">
            <FiSearch className="search-icon" />
            <input 
              type="text" 
              placeholder="Rechercher patients, rendez-vous..." 
              className="search-input"
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
              onFocus={() => searchQuery.length >= 2 && setShowResults(true)}
            />
            {searchQuery && (
              <button className="search-clear" onClick={() => { setSearchQuery(''); setShowResults(false); }}>
                <FiX />
              </button>
            )}
            
            {/* Search Results Dropdown */}
            {showResults && (
              <div className="search-results">
                {!hasResults ? (
                  <div className="search-no-results">
                    <FiSearch />
                    <span>Aucun résultat pour "{searchQuery}"</span>
                  </div>
                ) : (
                  <>
                    {searchResults.patients.length > 0 && (
                      <div className="search-category">
                        <div className="search-category-header">
                          <FiUser />
                          <span>Patients</span>
                        </div>
                        {searchResults.patients.map(patient => (
                          <div 
                            key={patient.id} 
                            className="search-result-item"
                            onClick={() => handleResultClick('patient', patient.id)}
                          >
                            <span className="result-avatar">{patient.avatar}</span>
                            <div className="result-info">
                              <span className="result-name">{patient.name}</span>
                              <span className="result-detail">{patient.detail}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    
                    {searchResults.appointments.length > 0 && (
                      <div className="search-category">
                        <div className="search-category-header">
                          <FiCalendar />
                          <span>Rendez-vous</span>
                        </div>
                        {searchResults.appointments.map(apt => (
                          <div 
                            key={apt.id} 
                            className="search-result-item"
                            onClick={() => handleResultClick('appointment', apt.id)}
                          >
                            <span className="result-icon"><FiCalendar /></span>
                            <div className="result-info">
                              <span className="result-name">{apt.patientName}</span>
                              <span className="result-detail">{apt.reason ? `${apt.reason} • ` : ''}{apt.detail}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    
                    {searchResults.acts.length > 0 && (
                      <div className="search-category">
                        <div className="search-category-header">
                          <FiActivity />
                          <span>Actes Médicaux</span>
                        </div>
                        {searchResults.acts.map(act => (
                          <div 
                            key={act.id} 
                            className="search-result-item"
                            onClick={() => handleResultClick('act', act.id)}
                          >
                            <span className="result-icon"><FiActivity /></span>
                            <div className="result-info">
                              <span className="result-name">{act.actType}</span>
                              <span className="result-detail">{act.patientName}{act.detail ? ` • ${act.detail}` : ''}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      <nav className="header-nav">
        {navTabs.slice(0, 2).map((tab) => (
          <NavLink
            key={tab.path}
            to={tab.path}
            className={`header-tab ${location.pathname === tab.path ? 'active' : ''}`}
          >
            {tab.label}
          </NavLink>
        ))}
        
        {isDashboard && AI_ASSISTANT_ENABLED && (
          <button 
            className="ai-assistant-btn"
            onClick={() => navigate('/assistant')}
          >
            <FiMessageSquare />
            <span>Assistant IA</span>
          </button>
        )}
        
        {navTabs.slice(2).map((tab) => (
          <NavLink
            key={tab.path}
            to={tab.path}
            className={`header-tab ${location.pathname === tab.path ? 'active' : ''}`}
          >
            {tab.label}
          </NavLink>
        ))}
      </nav>

      <div className="header-right">
        <div className="menu-container" ref={menuRef}>
          <button 
            className={`header-icon-btn ${menuOpen ? 'active' : ''}`}
            onClick={() => setMenuOpen(!menuOpen)}
          >
            {menuOpen ? <FiX size={20} /> : <FiMenu size={20} />}
          </button>
          
          {menuOpen && (
            <div className="dropdown-menu">
              <a href="/terms" className="dropdown-item" onClick={() => setMenuOpen(false)}>
                <FiFileText />
                <span>Conditions d'utilisation</span>
              </a>
              <a href="/privacy" className="dropdown-item" onClick={() => setMenuOpen(false)}>
                <FiShield />
                <span>Politique de confidentialité</span>
              </a>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

export default Header;
