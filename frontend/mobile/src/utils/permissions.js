import AsyncStorage from '@react-native-async-storage/async-storage';

export const ROLE_NURSE = 'infirmier';

export async function getStoredUser() {
  try {
    const raw = await AsyncStorage.getItem('user');
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export async function isNurse() {
  const user = await getStoredUser();
  return user?.role === ROLE_NURSE && !user?.is_admin;
}

export async function canDeleteClinicalRecords() {
  const user = await getStoredUser();
  if (user?.is_admin) return true;
  return user?.role !== ROLE_NURSE;
}
