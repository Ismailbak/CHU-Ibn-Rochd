import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { 
  FiMail, FiLock, FiEye, FiEyeOff, FiActivity, 
  FiAlertCircle, FiUser, FiPhone, FiCheckCircle 
} from 'react-icons/fi';
import api from '../../api/api';
import { specialtyToRole } from '../../utils/permissions';
import { LegalAcceptanceModal } from '../Legal';
import '../Login/LoginPage.css';
import './SignupPage.css';

function SignupPage() {
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    specialty: 'rhumatologie',
    department: '',
    password: '',
    confirmPassword: ''
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [acceptedPrivacy, setAcceptedPrivacy] = useState(false);
  const [legalModal, setLegalModal] = useState(null);
  const [step, setStep] = useState(1);
  const legalPromptedRef = useRef(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (step !== 2) {
      legalPromptedRef.current = false;
      return;
    }
    if (legalPromptedRef.current) return;
    legalPromptedRef.current = true;
    if (!acceptedTerms) {
      setLegalModal('terms');
    } else if (!acceptedPrivacy) {
      setLegalModal('privacy');
    }
  }, [step, acceptedTerms, acceptedPrivacy]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const validateStep1 = () => {
    if (!formData.firstName || !formData.lastName) {
      setError('Veuillez remplir tous les champs obligatoires');
      return false;
    }
    if (!formData.email.includes('@')) {
      setError('Veuillez entrer une adresse email valide');
      return false;
    }
    setError('');
    return true;
  };

  const validateStep2 = () => {
    if (formData.password.length < 8) {
      setError('Le mot de passe doit contenir au moins 8 caractères');
      return false;
    }
    if (formData.password !== formData.confirmPassword) {
      setError('Les mots de passe ne correspondent pas');
      return false;
    }
    if (!acceptedTerms || !acceptedPrivacy) {
      setError('Veuillez lire et approuver les conditions d\'utilisation et la politique de confidentialité');
      if (!acceptedTerms) setLegalModal('terms');
      else setLegalModal('privacy');
      return false;
    }
    setError('');
    return true;
  };

  const handleNextStep = () => {
    if (validateStep1()) {
      setStep(2);
    }
  };

  const handleSignup = async (e) => {
    e.preventDefault();
    if (!validateStep2()) return;

    setIsLoading(true);
    setError('');
    try {
      const username = [formData.firstName, formData.lastName].filter(Boolean).join('.').toLowerCase().replace(/\s/g, '') || formData.email;
      await api.post('/auth/signup', {
        email: formData.email,
        password: formData.password,
        username,
        first_name: formData.firstName,
        last_name: formData.lastName,
        phone: formData.phone,
        specialty: formData.specialty,
        department: formData.department,
        role: specialtyToRole(formData.specialty),
      });
      setIsLoading(false);
      navigate('/'); // Redirect to login page
    } catch (err) {
      setIsLoading(false);
      const detail = err.response?.data?.detail;
      setError(Array.isArray(detail) ? detail.map((d) => d.msg).join(', ') : detail || 'Inscription impossible');
    }
  };

  const getPasswordStrength = () => {
    const password = formData.password;
    if (!password) return { strength: 0, label: '', color: '' };
    
    let strength = 0;
    if (password.length >= 8) strength++;
    if (/[A-Z]/.test(password)) strength++;
    if (/[0-9]/.test(password)) strength++;
    if (/[^A-Za-z0-9]/.test(password)) strength++;

    const levels = [
      { label: 'Faible', color: '#EF4444' },
      { label: 'Moyen', color: '#F59E0B' },
      { label: 'Bon', color: '#10B981' },
      { label: 'Fort', color: '#059669' }
    ];

    return { strength, ...levels[strength - 1] };
  };

  const passwordStrength = getPasswordStrength();

  const handleLegalApprove = () => {
    if (legalModal === 'terms') {
      setAcceptedTerms(true);
      setLegalModal(acceptedPrivacy ? null : 'privacy');
      return;
    }
    if (legalModal === 'privacy') {
      setAcceptedPrivacy(true);
      setLegalModal(null);
    }
  };

  const openLegalModal = (type) => {
    setLegalModal(type);
  };

  return (
    <div className="auth-container signup-container">
      <LegalAcceptanceModal
        isOpen={Boolean(legalModal)}
        type={legalModal}
        onApprove={handleLegalApprove}
        onClose={() => setLegalModal(null)}
      />
      {/* Left Side - Branding */}
      <div className="auth-branding">
        <div className="branding-content">
          <div className="brand-logo">
            <FiActivity />
            <span>RhumatoAI</span>
          </div>
          <h1>Rejoignez notre plateforme</h1>
          <p>
            Créez votre compte professionnel et accédez à des outils 
            d'intelligence artificielle conçus pour les rhumatologues.
          </p>
          
          <div className="signup-benefits">
            <div className="benefit-item">
              <FiCheckCircle />
              <span>Gestion complète des patients</span>
            </div>
            <div className="benefit-item">
              <FiCheckCircle />
              <span>Aide au diagnostic par IA</span>
            </div>
            <div className="benefit-item">
              <FiCheckCircle />
              <span>Suivi des rendez-vous automatisé</span>
            </div>
            <div className="benefit-item">
              <FiCheckCircle />
              <span>Accès aux protocoles actualisés</span>
            </div>
            <div className="benefit-item">
              <FiCheckCircle />
              <span>Données sécurisées et cryptées</span>
            </div>
          </div>
        </div>
        <div className="branding-footer">
          <p>© 2026 RhumatoAI - Tous droits réservés</p>
        </div>
      </div>

      {/* Right Side - Signup Form */}
      <div className="auth-form-container">
        <div className="auth-form-wrapper">
          <div className="auth-header">
            <h2>Créer un compte</h2>
            <p>Remplissez le formulaire pour créer votre compte professionnel.</p>
          </div>

          {/* Progress Steps */}
          <div className="signup-progress">
            <div className={`progress-step ${step >= 1 ? 'active' : ''}`}>
              <div className="step-number">1</div>
              <span>Informations</span>
            </div>
            <div className="progress-line"></div>
            <div className={`progress-step ${step >= 2 ? 'active' : ''}`}>
              <div className="step-number">2</div>
              <span>Sécurité</span>
            </div>
          </div>

          {error && (
            <div className="auth-error">
              <FiAlertCircle />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSignup} className="auth-form">
            {step === 1 && (
              <>
                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="firstName">Prénom *</label>
                    <div className="input-with-icon">
                      <div className="input-icon-slot" aria-hidden="true">
                        <FiUser className="input-icon" />
                      </div>
                      <input
                        id="firstName"
                        name="firstName"
                        type="text"
                        placeholder="Votre prénom"
                        value={formData.firstName}
                        onChange={handleChange}
                        required
                      />
                    </div>
                  </div>
                  <div className="form-group">
                    <label htmlFor="lastName">Nom *</label>
                    <div className="input-with-icon">
                      <div className="input-icon-slot" aria-hidden="true">
                        <FiUser className="input-icon" />
                      </div>
                      <input
                        id="lastName"
                        name="lastName"
                        type="text"
                        placeholder="Votre nom"
                        value={formData.lastName}
                        onChange={handleChange}
                        required
                      />
                    </div>
                  </div>
                </div>

                <div className="form-group">
                  <label htmlFor="email">Adresse email *</label>
                  <div className="input-with-icon">
                    <div className="input-icon-slot" aria-hidden="true">
                      <FiMail className="input-icon" />
                    </div>
                    <input
                      id="email"
                      name="email"
                      type="email"
                      placeholder="docteur@churochd.ma"
                      value={formData.email}
                      onChange={handleChange}
                      required
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label htmlFor="phone">Téléphone</label>
                  <div className="input-with-icon">
                    <div className="input-icon-slot" aria-hidden="true">
                      <FiPhone className="input-icon" />
                    </div>
                    <input
                      id="phone"
                      name="phone"
                      type="tel"
                      placeholder="+212 6XX XXX XXX"
                      value={formData.phone}
                      onChange={handleChange}
                    />
                  </div>
                </div>


                <div className="form-group">
                  <label htmlFor="specialty">Rôle / Spécialité</label>
                  <select
                    id="specialty"
                    name="specialty"
                    value={formData.specialty}
                    onChange={handleChange}
                  >
                    <option value="rhumatologue">Rhumatologue</option>
                    <option value="medecine-interne">Médecin Interniste</option>
                    <option value="infirmier">Infirmier(ère)</option>
                  </select>
                </div>
                <div className="form-group">
                  <label htmlFor="department">Département</label>
                  <input
                    id="department"
                    name="department"
                    type="text"
                    placeholder="Département"
                    value={formData.department}
                    onChange={handleChange}
                  />
                </div>


                <button 
                  type="button" 
                  className="submit-btn"
                  onClick={handleNextStep}
                >
                  Continuer
                </button>
              </>
            )}

            {step === 2 && (
              <>
                <div className="form-group">
                  <label htmlFor="password">Mot de passe *</label>
                  <div className="input-with-icon">
                    <div className="input-icon-slot" aria-hidden="true">
                      <FiLock className="input-icon" />
                    </div>
                    <input
                      id="password"
                      name="password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Minimum 8 caractères"
                      value={formData.password}
                      onChange={handleChange}
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
                  {formData.password && (
                    <div className="password-strength">
                      <div className="strength-bar">
                        <div 
                          className="strength-fill"
                          style={{ 
                            width: `${(passwordStrength.strength / 4) * 100}%`,
                            background: passwordStrength.color
                          }}
                        ></div>
                      </div>
                      <span style={{ color: passwordStrength.color }}>
                        {passwordStrength.label}
                      </span>
                    </div>
                  )}
                </div>

                <div className="form-group">
                  <label htmlFor="confirmPassword">Confirmer le mot de passe *</label>
                  <div className="input-with-icon">
                    <div className="input-icon-slot" aria-hidden="true">
                      <FiLock className="input-icon" />
                    </div>
                    <input
                      id="confirmPassword"
                      name="confirmPassword"
                      type={showConfirmPassword ? 'text' : 'password'}
                      placeholder="Répétez le mot de passe"
                      value={formData.confirmPassword}
                      onChange={handleChange}
                      required
                    />
                    <button 
                      type="button" 
                      className="toggle-password"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      aria-label={showConfirmPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                    >
                      {showConfirmPassword ? <FiEyeOff /> : <FiEye />}
                    </button>
                  </div>
                  {formData.confirmPassword && formData.password === formData.confirmPassword && (
                    <span className="password-match">
                      <FiCheckCircle /> Mots de passe identiques
                    </span>
                  )}
                </div>

                <div className="legal-acceptance-block">
                  <p className="legal-acceptance-intro">
                    Avant de créer votre compte, lisez et approuvez les documents suivants :
                  </p>
                  <div className={`legal-acceptance-row ${acceptedTerms ? 'is-approved' : ''}`}>
                    <span>Conditions d&apos;utilisation</span>
                    {acceptedTerms ? (
                      <span className="legal-approved-badge">
                        <FiCheckCircle /> Approuvé
                      </span>
                    ) : (
                      <button type="button" className="legal-read-btn" onClick={() => openLegalModal('terms')}>
                        Lire et approuver
                      </button>
                    )}
                  </div>
                  <div className={`legal-acceptance-row ${acceptedPrivacy ? 'is-approved' : ''}`}>
                    <span>Politique de confidentialité</span>
                    {acceptedPrivacy ? (
                      <span className="legal-approved-badge">
                        <FiCheckCircle /> Approuvé
                      </span>
                    ) : (
                      <button type="button" className="legal-read-btn" onClick={() => openLegalModal('privacy')}>
                        Lire et approuver
                      </button>
                    )}
                  </div>
                </div>

                <div className="form-buttons">
                  <button 
                    type="button" 
                    className="back-btn"
                    onClick={() => setStep(1)}
                  >
                    Retour
                  </button>
                  <button 
                    type="submit" 
                    className={`submit-btn ${isLoading ? 'loading' : ''}`}
                    disabled={isLoading || !acceptedTerms || !acceptedPrivacy}
                  >
                    {isLoading ? (
                      <span className="spinner"></span>
                    ) : (
                      'Créer mon compte'
                    )}
                  </button>
                </div>
              </>
            )}
          </form>

          <div className="auth-footer">
            <p>
              Déjà un compte ?{' '}
              <Link to="/">Se connecter</Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default SignupPage;
