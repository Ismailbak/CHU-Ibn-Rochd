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

  if (user.role === ROLE_NURSE) {
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

/** Whether the short admin greeting is used (no "- Bienvenue" suffix). */
export function isAdminWelcome(user = {}) {
  return Boolean(user.is_admin || user.role === 'admin');
}
