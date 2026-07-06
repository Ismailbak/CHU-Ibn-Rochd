import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  FiActivity,
  FiMail,
  FiArrowLeft,
  FiAlertCircle,
  FiCheckCircle,
  FiKey,
  FiUser,
} from 'react-icons/fi';
import { requestPasswordReset, formatApiError } from '../../api/api';
import './LoginPage.css';

function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    try {
      const res = await requestPasswordReset(email.trim());
      setSuccessMessage(res.data?.message || 'Demande enregistrée.');
      setSubmitted(true);
    } catch (err) {
      setError(formatApiError(err, 'Impossible d\'envoyer la demande. Réessayez plus tard.'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-branding">
        <div className="branding-content">
          <div className="brand-logo">
            <FiActivity />
            <span>RhumatoAI</span>
          </div>
          <h1>Récupération de compte</h1>
          <p>
            RhumatoAI est hébergé en local au CHU Ibn Rochd. La réinitialisation du mot de
            passe est assurée par un administrateur ou un référent technique, après vérification
            de votre identité.
          </p>
          <div className="brand-features">
            <div className="feature-item">
              <div className="feature-icon">🔐</div>
              <div>
                <h4>Sécurité renforcée</h4>
                <p>Pas de lien automatique par e-mail</p>
              </div>
            </div>
            <div className="feature-item">
              <div className="feature-icon">👤</div>
              <div>
                <h4>Validation humaine</h4>
                <p>Contrôle par l&apos;administrateur</p>
              </div>
            </div>
          </div>
        </div>
        <div className="branding-footer">
          <p>© 2026 RhumatoAI - Tous droits réservés</p>
        </div>
      </div>

      <div className="auth-form-container">
        <div className="auth-form-wrapper">
          <Link to="/" className="forgot-back-link">
            <FiArrowLeft /> Retour à la connexion
          </Link>

          <div className="auth-header">
            <h2>Mot de passe oublié</h2>
            <p>
              Indiquez l&apos;adresse e-mail associée à votre compte professionnel. Nous
              enregistrerons votre demande pour qu&apos;un administrateur puisse la traiter.
            </p>
          </div>

          {error && (
            <div className="auth-error">
              <FiAlertCircle />
              <span>{error}</span>
            </div>
          )}

          {submitted ? (
            <div className="forgot-success">
              <FiCheckCircle className="forgot-success-icon" />
              <p>{successMessage}</p>
              <div className="forgot-steps">
                <h3>Étapes suivantes</h3>
                <ol>
                  <li>
                    <FiUser /> Un administrateur RhumatoAI traitera votre demande (délai
                    habituel : sous 24 h ouvrées).
                  </li>
                  <li>
                    <FiKey /> Vous recevrez un mot de passe temporaire ou une procédure de
                    réinitialisation par un canal interne sécurisé.
                  </li>
                  <li>
                    Connectez-vous puis modifiez votre mot de passe dans{' '}
                    <strong>Profil → Sécurité</strong>.
                  </li>
                </ol>
              </div>
              <div className="forgot-contacts">
                <h3>Besoin d&apos;aide urgente ?</h3>
                <ul>
                  <li>
                    Samy Housbane —{' '}
                    <a href="mailto:s.housbane@gmail.com">s.housbane@gmail.com</a>
                  </li>
                  <li>
                    Ismail Bakraoui —{' '}
                    <a href="mailto:ismail.bakraoui0@gmail.com">ismail.bakraoui0@gmail.com</a>
                  </li>
                </ul>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="auth-form">
              <div className="form-group">
                <label htmlFor="forgot-email">Adresse email professionnelle</label>
                <div className="input-with-icon">
                  <div className="input-icon-slot" aria-hidden="true">
                    <FiMail className="input-icon" />
                  </div>
                  <input
                    id="forgot-email"
                    type="email"
                    placeholder="docteur@churochd.ma"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                  />
                </div>
              </div>

              <button
                type="submit"
                className={`submit-btn ${isLoading ? 'loading' : ''}`}
                disabled={isLoading}
              >
                {isLoading ? <span className="spinner" /> : 'Envoyer la demande'}
              </button>
            </form>
          )}

          {!submitted && (
            <div className="forgot-info">
              <p>
                <strong>Remarque :</strong> aucun lien de réinitialisation n&apos;est envoyé
                automatiquement par e-mail (infrastructure locale). Vous pouvez aussi contacter
                directement un référent :
              </p>
              <ul>
                <li>
                  Samy Housbane —{' '}
                  <a href="mailto:s.housbane@gmail.com">s.housbane@gmail.com</a>
                </li>
                <li>
                  Ismail Bakraoui —{' '}
                  <a href="mailto:ismail.bakraoui0@gmail.com">ismail.bakraoui0@gmail.com</a>
                </li>
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default ForgotPasswordPage;
