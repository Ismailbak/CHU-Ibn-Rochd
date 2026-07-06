/**
 * Recover French accents when UTF-8 text was stored/read with the wrong encoding.
 * Mirrors backend/app/core/utils/text_encoding.py
 */

const MOJIBAKE_MARKERS = ['Ã', 'Â', 'â€', '├', '⌐', '╢', 'ï»¿', '\ufffd'];

const SKIP_REPAIR_KEYS = new Set([
  'access_token',
  'token',
  'hashed_password',
  'query_hash',
  'file_path',
  'profile_picture',
  'mime_type',
]);

const BOX_DRAWING_REPLACEMENTS = {
  '├®': 'é',
  '├©': 'é',
  '├⌐': 'é',
  '├¿': 'è',
  '├ª': 'ê',
  '├«': 'ë',
  '├¢': 'â',
  '├£': 'ù',
  '├¹': 'ù',
  '├»': 'û',
  '├³': 'ó',
  '├´': 'ô',
  '├§': 'ç',
  '├Â': 'ö',
  '├¶': 'ö',
  '├¤': 'ä',
  '├¼': 'ü',
  '├Ç': 'À',
  '├É': 'É',
  '├È': 'È',
  '├Ê': 'Ê',
  '├Ë': 'Ë',
  '├Ô': 'Ô',
  '├Ù': 'Ù',
  '├Û': 'Û',
  '├Î': 'Î',
  '├Ï': 'Ï',
  '├Ö': 'Ö',
  '├Ü': 'Ü',
  '├à': 'à',
  '├á': 'á',
  '├â': 'â',
  '├ä': 'ä',
  '├å': 'å',
  '├æ': 'æ',
  '├ç': 'ç',
  '├è': 'è',
  '├é': 'é',
  '├ê': 'ê',
  '├ë': 'ë',
  '├ì': 'ì',
  '├í': 'í',
  '├î': 'î',
  '├ï': 'ï',
  '├ñ': 'ñ',
  '├ò': 'ò',
  '├ó': 'ó',
  '├ô': 'ô',
  '├õ': 'õ',
  '├ö': 'ö',
  '├ù': 'ù',
  '├ú': 'ú',
  '├û': 'û',
  '├ü': 'ü',
  '├ý': 'ý',
  '├ÿ': 'ÿ',
};

const GOOD_CHARS = 'éèêëàâùûôîçÉÈÊËÀÂÙÛÔÎÇöäü';

function looksLikeMojibake(text) {
  return MOJIBAKE_MARKERS.some((marker) => text.includes(marker));
}

function applyBoxDrawingFixes(text) {
  let result = text;
  Object.entries(BOX_DRAWING_REPLACEMENTS)
    .sort((a, b) => b[0].length - a[0].length)
    .forEach(([bad, good]) => {
      result = result.split(bad).join(good);
    });
  return result;
}

function latin1ToUtf8(text) {
  const bytes = Uint8Array.from(text, (char) => char.charCodeAt(0) & 0xff);
  return new TextDecoder('utf-8').decode(bytes);
}

function scoreText(value) {
  const bad = MOJIBAKE_MARKERS.reduce((sum, marker) => sum + (value.split(marker).length - 1), 0);
  const good = [...GOOD_CHARS].reduce((sum, ch) => sum + (value.split(ch).length - 1), 0);
  return [-bad, good];
}

export function repairUtf8Mojibake(text) {
  if (text == null || typeof text !== 'string' || !text) return text;

  const replaced = applyBoxDrawingFixes(text);
  if (!looksLikeMojibake(text) && replaced === text) return text;

  const candidates = new Set([text, replaced]);
  for (const base of [text, replaced]) {
    try {
      candidates.add(latin1ToUtf8(base));
    } catch {
      /* ignore decode errors */
    }
  }

  return [...candidates].sort((a, b) => {
    const scoreA = scoreText(a);
    const scoreB = scoreText(b);
    if (scoreA[0] !== scoreB[0]) return scoreB[0] - scoreA[0];
    return scoreB[1] - scoreA[1];
  })[0];
}

export function repairText(text) {
  return repairUtf8Mojibake(text);
}

export function repairDeep(value, key = null) {
  if (typeof value === 'string') {
    return repairText(value);
  }
  if (Array.isArray(value)) {
    return value.map((item) => repairDeep(item));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [
        k,
        SKIP_REPAIR_KEYS.has(k) ? v : repairDeep(v, k),
      ])
    );
  }
  return value;
}
