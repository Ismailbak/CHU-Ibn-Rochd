"""Recover French text when UTF-8 bytes were stored with the wrong encoding."""

from __future__ import annotations

MOJIBAKE_MARKERS = ("Ã", "Â", "â€", "├", "⌐", "╢", "ï»¿", "\ufffd")


def looks_like_mojibake(text: str) -> bool:
    return any(marker in text for marker in MOJIBAKE_MARKERS)


def repair_utf8_mojibake(text: str | None) -> str | None:
    """Try to recover French accents from common UTF-8 / Latin-1 / CP437 mojibake."""
    if text is None:
        return None
    if not isinstance(text, str):
        text = str(text)
    if not text or not looks_like_mojibake(text):
        return text

    candidates = [text]
    for encoding in ("latin1", "cp1252", "cp437"):
        try:
            repaired = text.encode(encoding).decode("utf-8")
        except (UnicodeDecodeError, UnicodeEncodeError):
            continue
        if repaired not in candidates:
            candidates.append(repaired)

    def score(value: str) -> tuple[int, int]:
        bad = sum(value.count(marker) for marker in MOJIBAKE_MARKERS)
        good = sum(value.count(ch) for ch in "éèêëàâùûôîçÉÈÊËÀÂÙÛÔÎÇöäü")
        return (-bad, good)

    return max(candidates, key=score)
