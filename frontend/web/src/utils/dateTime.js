/** Date/time helpers for Morocco (Africa/Casablanca, UTC+1, no DST). */

export const MOROCCO_TIMEZONE = 'Africa/Casablanca';
export const MOROCCO_LOCALE = 'fr-FR';
const MOROCCO_OFFSET = '+01:00';

/**
 * Parse API datetimes. Naive values (no Z/offset) are treated as Morocco wall clock.
 */
export function parseApiDateTime(value) {
  if (!value) return new Date();
  const raw = String(value).trim().replace(' ', 'T');
  if (/[zZ]|[+-]\d{2}:?\d{2}$/.test(raw)) {
    return new Date(raw);
  }

  const match = raw.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2}))?)?/
  );
  if (match) {
    const [, y, mo, d, h = '00', mi = '00', s = '00'] = match;
    return new Date(`${y}-${mo}-${d}T${h}:${mi}:${s}${MOROCCO_OFFSET}`);
  }

  return new Date(raw);
}

/** YYYY-MM-DD in Morocco timezone (for grouping keys). */
export function getMoroccoDateKey(value = new Date()) {
  const date = value instanceof Date ? value : parseApiDateTime(value);
  return new Intl.DateTimeFormat('fr-CA', {
    timeZone: MOROCCO_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/** HH:mm (24h) in Morocco timezone. */
export function formatMoroccoTime(value) {
  const date = parseApiDateTime(value);
  return new Intl.DateTimeFormat(MOROCCO_LOCALE, {
    timeZone: MOROCCO_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

/** Aujourd'hui / Hier / long French date for notification groups. */
export function formatMoroccoGroupDate(dateKey) {
  const todayKey = getMoroccoDateKey(new Date());
  if (dateKey === todayKey) return "Aujourd'hui";

  const todayNoon = parseApiDateTime(`${todayKey}T12:00:00${MOROCCO_OFFSET}`);
  const yesterdayKey = getMoroccoDateKey(new Date(todayNoon.getTime() - 86400000));
  if (dateKey === yesterdayKey) return 'Hier';

  const [year, month, day] = dateKey.split('-').map(Number);
  const noon = new Date(
    `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T12:00:00${MOROCCO_OFFSET}`
  );
  return new Intl.DateTimeFormat(MOROCCO_LOCALE, {
    timeZone: MOROCCO_TIMEZONE,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(noon);
}
