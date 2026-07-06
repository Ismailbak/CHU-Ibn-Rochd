"""Recover French text when UTF-8 bytes were stored with the wrong encoding."""

from __future__ import annotations

MOJIBAKE_MARKERS = ("Ã", "Â", "â€", "├", "⌐", "╢", "ï»¿", "\ufffd")

# UTF-8 C3 xx sequences corrupted to "├" + a Latin-1-ish second character (MySQL dump / import issue).
_BOX_DRAWING_REPLACEMENTS: dict[str, str] = {
    "├®": "é",
    "├©": "é",
    "├⌐": "é",
    "├¿": "è",
    "├ª": "ê",
    "├«": "ë",
    "├¢": "â",
    "├£": "ù",
    "├¹": "ù",
    "├»": "û",
    "├³": "ó",
    "├´": "ô",
    "├§": "ç",
    "├Â": "ö",
    "├¶": "ö",
    "├¤": "ä",
    "├¼": "ü",
    "├Ç": "À",
    "├É": "É",
    "├È": "È",
    "├Ê": "Ê",
    "├Ë": "Ë",
    "├Ô": "Ô",
    "├Ù": "Ù",
    "├Û": "Û",
    "├Î": "Î",
    "├Ï": "Ï",
    "├Ö": "Ö",
    "├Ü": "Ü",
    "├à": "à",
    "├á": "á",
    "├â": "â",
    "├ä": "ä",
    "├å": "å",
    "├æ": "æ",
    "├ç": "ç",
    "├è": "è",
    "├é": "é",
    "├ê": "ê",
    "├ë": "ë",
    "├ì": "ì",
    "├í": "í",
    "├î": "î",
    "├ï": "ï",
    "├ñ": "ñ",
    "├ò": "ò",
    "├ó": "ó",
    "├ô": "ô",
    "├õ": "õ",
    "├ö": "ö",
    "├ù": "ù",
    "├ú": "ú",
    "├û": "û",
    "├ü": "ü",
    "├ý": "ý",
    "├ÿ": "ÿ",
}


def looks_like_mojibake(text: str) -> bool:
    return any(marker in text for marker in MOJIBAKE_MARKERS)


def _apply_box_drawing_fixes(text: str) -> str:
    for bad, good in sorted(_BOX_DRAWING_REPLACEMENTS.items(), key=lambda item: -len(item[0])):
        text = text.replace(bad, good)
    return text


def repair_utf8_mojibake(text: str | None) -> str | None:
    """Try to recover French accents from common UTF-8 / Latin-1 / CP437 mojibake."""
    if text is None:
        return None
    if not isinstance(text, str):
        text = str(text)
    if not text:
        return text

    replaced = _apply_box_drawing_fixes(text)
    if not looks_like_mojibake(text) and replaced == text:
        return text

    candidates = {text, replaced}
    for base in (text, replaced):
        for encoding in ("latin1", "cp1252", "cp437"):
            try:
                candidates.add(base.encode(encoding).decode("utf-8"))
            except (UnicodeDecodeError, UnicodeEncodeError):
                continue

    def score(value: str) -> tuple[int, int]:
        bad = sum(value.count(marker) for marker in MOJIBAKE_MARKERS)
        good = sum(value.count(ch) for ch in "éèêëàâùûôîçÉÈÊËÀÂÙÛÔÎÇöäü")
        return (-bad, good)

    return max(candidates, key=score)
