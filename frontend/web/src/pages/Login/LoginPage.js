import React, { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { FiMail, FiLock, FiEye, FiEyeOff, FiActivity, FiAlertCircle, FiTool } from 'react-icons/fi';
import { login, getCurrentUser, getMaintenanceStatus, formatApiError } from '../../api/api';
import './LoginPage.css';

function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [maintenanceMessage, setMaintenanceMessage] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    getMaintenanceStatus()
      .then((res) => {
        setMaintenanceMode(Boolean(res.data?.maintenanceMode));
        setMaintenanceMessage(res.data?.message || '');
      })
      .catch(() => {});
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    try {
      const res = await login(email, password);
      localStorage.setItem('token', res.data.access_token);
      const userRes = await getCurrentUser();
      const userData = userRes.data;
      // Ensure user object includes first_name, last_name, specialty
      const userProfile = userData.user || userData;
      const enrichedUser = {
        ...userProfile,
        first_name: userProfile.first_name || userProfile.firstName || '',
        last_name: userProfile.last_name || userProfile.lastName || '',
        specialty: userProfile.specialty || '',
        gender: userProfile.gender || '',
      };
      localStorage.setItem('user', JSON.stringify(enrichedUser));
      if (rememberMe) {
        localStorage.setItem('rememberEmail', email);
      }
      // Redirect based on admin status
      if ((userData.user && userData.user.is_admin) || userData.is_admin) {
        navigate('/admin');
      } else {
        navigate('/dashboard');
      }
    } catch (err) {
      const status = err?.response?.status;
      const detail = formatApiError(err, '');
      if (status === 503 || err?.response?.data?.code === 'maintenance') {
        setMaintenanceMode(true);
        setMaintenanceMessage(detail || maintenanceMessage);
        setError(detail || "L'application est en maintenance. Accès réservé aux administrateurs.");
      } else {
        setError(detail || 'Email ou mot de passe incorrect');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="auth-container">
      {/* Left Side - Branding */}
      <div className="auth-branding">
        <div className="branding-content">
          <div className="brand-logo">
            <FiActivity />
            <span>SmartHos</span>
          </div>
          <h1>Smart Hospital EHR</h1>
          <p>
            Optimisez votre pratique médicale avec notre assistant intelligent. 
            Gestion des patients, aide au diagnostic et suivi personnalisé.
          </p>
          <div className="brand-features">
            <div className="feature-item">
              <div className="feature-icon">🏥</div>
              <div>
                <h4>Établissement de santé</h4>
                <p>Service de Rhumatologie</p>
              </div>
            </div>
            <div className="feature-item">
              <div className="feature-icon">🤖</div>
              <div>
                <h4>IA Médicale</h4>
                <p>Assistance intelligente</p>
              </div>
            </div>
            <div className="feature-item">
              <div className="feature-icon">🔒</div>
              <div>
                <h4>Sécurisé</h4>
                <p>Données protégées</p>
              </div>
            </div>
          </div>
        </div>
        <div className="branding-footer">
          <p>© 2026 SmartHos - Tous droits réservés</p>
        </div>
      </div>

      {/* Right Side - Login Form */}
      <div className="auth-form-container">
        <div className="auth-form-wrapper">
          <div className="auth-header">
            <h2>Connexion</h2>
            <p>Bienvenue ! Connectez-vous pour accéder à votre espace.</p>
          </div>

          {maintenanceMode && (
            <div className="auth-error" style={{ background: '#FEF3C7', color: '#92400E', borderColor: '#FCD34D' }}>
              <FiTool />
              <span>
                {maintenanceMessage ||
                  "Application en maintenance — seuls les administrateurs peuvent se connecter."}
              </span>
            </div>
          )}

          {error && (
            <div className="auth-error">
              <FiAlertCircle />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleLogin} className="auth-form">
            <div className="form-group">
              <label htmlFor="email">Adresse email</label>
              <div className="input-with-icon">
                <div className="input-icon-slot" aria-hidden="true">
                  <FiMail className="input-icon" />
                </div>
                <input
                  id="email"
                  type="email"
                  placeholder="votre.email@etablissement.ma"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="password">Mot de passe</label>
              <div className="input-with-icon">
                <div className="input-icon-slot" aria-hidden="true">
                  <FiLock className="input-icon" />
                </div>
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <button 
                  type="button" 
                  className="toggle-password"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                >
                  {showPassword ? <FiEyeOff /> : <FiEye />}
                </button>
              </div>
            </div>

            <div className="form-options">
              <label className="remember-me">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                />
                <span className="checkmark"></span>
                Se souvenir de moi
              </label>
              <Link to="/forgot-password" className="forgot-password">
                Mot de passe oublié ?
              </Link>
            </div>

            <button 
              type="submit" 
              className={`submit-btn ${isLoading ? 'loading' : ''}`}
              disabled={isLoading}
            >
              {isLoading ? (
                <span className="spinner"></span>
              ) : (
                'Se connecter'
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

export default LoginPage;
