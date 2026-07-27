// Build-time feature flags. Set them when building, e.g.
//   REACT_APP_AI_ASSISTANT_ENABLED=false REACT_APP_API_URL=/api npm run build
// Keep these in sync with the backend flags in backend/app/core/config.py.

const FALSY = ['false', '0', 'off', 'no'];

function readFlag(value, fallback = true) {
  if (value === undefined || value === null || value === '') return fallback;
  return !FALSY.includes(String(value).trim().toLowerCase());
}

export const AI_ASSISTANT_ENABLED = readFlag(process.env.REACT_APP_AI_ASSISTANT_ENABLED);
