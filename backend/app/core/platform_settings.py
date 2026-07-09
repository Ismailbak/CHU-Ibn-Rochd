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
    "backupFrequency": "quotidien",
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
                return merged
        except (OSError, json.JSONDecodeError):
            pass
    return DEFAULT_SETTINGS.copy()


def save_settings(data: Dict[str, Any]) -> Dict[str, Any]:
    merged = DEFAULT_SETTINGS.copy()
    if isinstance(data, dict):
        merged.update(data)
    with open(SETTINGS_FILE, "w", encoding="utf-8") as f:
        json.dump(merged, f, ensure_ascii=False, indent=2)
    return merged


def is_maintenance_mode() -> bool:
    return bool(load_settings().get("maintenanceMode"))
