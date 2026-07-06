import { ROLE_NURSE } from './permissions';

function getLastName(user) {
  return (user.last_name || user.lastName || '').trim();
}

function getCivilTitle(user) {
  const gender = (user.gender || user.sexe || '').toString().toLowerCase();
  if (['f', 'female', 'femme', 'feminin', 'féminin'].includes(gender)) return 'Mme.';
  if (['m', 'male', 'homme', 'masculin'].includes(gender)) return 'M.';
  return 'M./Mme.';
}

/** Display name shown in the welcome subtitle (after "Bonjour,"). */
export function getWelcomeDisplayName(user = {}) {
  if (user.is_admin || user.role === 'admin') {
    return 'Admin';
  }

  if (user.role === ROLE_NURSE || user.specialty === ROLE_NURSE) {
    const lastName = getLastName(user);
    if (lastName) {
      return `${getCivilTitle(user)} ${lastName}`;
    }
    return user.first_name || user.firstName || user.username || 'Infirmier(ère)';
  }

  if (user.specialty === 'medecine-interne' && getLastName(user)) {
    return `Dr. ${getLastName(user)}`;
  }

  return user.username || user.name || user.email || 'Docteur';
}

/** Profile header name (Mon Profil, avatar area). */
export function getProfileDisplayName(user = {}) {
  if (user.is_admin || user.role === 'admin') {
    return 'Admin';
  }

  if (user.role === ROLE_NURSE || user.specialty === ROLE_NURSE) {
    const lastName = getLastName(user);
    if (lastName) {
      return `${getCivilTitle(user)} ${lastName}`;
    }
    return user.first_name || user.firstName || user.username || 'Infirmier(ère)';
  }

  const lastName = getLastName(user);
  if (lastName && (user.role === 'doctor' || user.role === 'medecin' || user.specialty)) {
    return `Dr. ${lastName}`;
  }

  if (user.specialty === 'medecine-interne' && lastName) {
    return `Dr. ${lastName}`;
  }

  return user.first_name || user.firstName || user.username || user.email || 'Utilisateur';
}

/** Short badge on profile avatar (Dr, Inf, Adm). */
export function getProfileBadge(user = {}) {
  if (user.is_admin || user.role === 'admin') return 'Adm';
  if (user.role === ROLE_NURSE || user.specialty === ROLE_NURSE) return 'Inf';
  if (user.role === 'doctor' || user.role === 'medecin') return 'Dr';
  if (user.specialty && user.specialty !== ROLE_NURSE) return 'Dr';
  return null;
}

/** Whether the short admin greeting is used (no "- Bienvenue" suffix). */
export function isAdminWelcome(user = {}) {
  return Boolean(user.is_admin || user.role === 'admin');
}
