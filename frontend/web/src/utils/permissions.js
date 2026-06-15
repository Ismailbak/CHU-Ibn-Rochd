export const ROLE_NURSE = 'infirmier';

export function getStoredUser() {
  try {
    return JSON.parse(localStorage.getItem('user') || '{}');
  } catch {
    return {};
  }
}

export function isNurse(user = getStoredUser()) {
  return user?.role === ROLE_NURSE && !user?.is_admin;
}

/** Nurses cannot delete patients or medical acts; appointment cancel remains allowed. */
export function canDeleteClinicalRecords(user = getStoredUser()) {
  if (user?.is_admin) return true;
  return user?.role !== ROLE_NURSE;
}

export function specialtyToRole(specialty) {
  if (specialty === ROLE_NURSE) return ROLE_NURSE;
  return 'doctor';
}
