"""Platform settings persisted as JSON (admin settings page)."""

from __future__ import annotations

import json
import os
from typing import Any, Dict

SETTINGS_FILE = os.path.join(os.path.dirname(os.path.dirname(__file__)), "platform_settings.json")

DEFAULT_SETTINGS: Dict[str, Any] = {
    "platformName": "RhumatoAI",
    "notifications": True,
    "maintenanceMode": False,
    "emailAlerts": True,
    "sessionTimeout": 30,
}

MAINTENANCE_MESSAGE = (
    "L'application est actuellement en maintenance. "
    "Seuls les administrateurs peuvent y accéder. "
    "Veuillez réessayer plus tard."
)


def load_settings() -> Dict[str, Any]:
    if os.path.exists(SETTINGS_FILE):
        try:
            with open(SETTINGS_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
            if isinstance(data, dict):
                merged = DEFAULT_SETTINGS.copy()
                merged.update(data)
                # Branding is fixed; drop removed settings keys
                merged["platformName"] = DEFAULT_SETTINGS["platformName"]
                merged.pop("backupFrequency", None)
                return merged
        except (OSError, json.JSONDecodeError):
            pass
    return DEFAULT_SETTINGS.copy()


def save_settings(data: Dict[str, Any]) -> Dict[str, Any]:
    merged = DEFAULT_SETTINGS.copy()
    if isinstance(data, dict):
        # Ignore removed / non-configurable keys from older clients
        for key, value in data.items():
            if key in ("backupFrequency",):
                continue
            merged[key] = value
    # Platform name is fixed branding — never overwrite from the admin form.
    merged["platformName"] = DEFAULT_SETTINGS["platformName"]
    merged.pop("backupFrequency", None)
    try:
        merged["sessionTimeout"] = max(5, min(240, int(merged.get("sessionTimeout", 30))))
    except (TypeError, ValueError):
        merged["sessionTimeout"] = 30
    with open(SETTINGS_FILE, "w", encoding="utf-8") as f:
        json.dump(merged, f, ensure_ascii=False, indent=2)
    return merged


def is_maintenance_mode() -> bool:
    return bool(load_settings().get("maintenanceMode"))


def get_session_timeout_minutes() -> int:
    """Inactivity logout delay in minutes (clamped)."""
    raw = load_settings().get("sessionTimeout", 30)
    try:
        minutes = int(raw)
    except (TypeError, ValueError):
        minutes = 30
    return max(5, min(240, minutes))
