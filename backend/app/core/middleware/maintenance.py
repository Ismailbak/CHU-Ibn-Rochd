"""Block non-admin API access while platform maintenance mode is enabled."""

from __future__ import annotations

from jose import JWTError, jwt
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

from app.core.config import settings
from app.core.database import SessionLocal
from app.core.platform_settings import MAINTENANCE_MESSAGE, is_maintenance_mode
from app.auth.service import get_user_by_username

# Paths always allowed during maintenance (no auth / public)
_ALWAYS_ALLOW_PREFIXES = (
    "/health",
    "/docs",
    "/openapi.json",
    "/redoc",
    "/uploads",
)

_ALWAYS_ALLOW_EXACT = {
    "/",
    "/api/auth/login",
    "/api/auth/forgot-password",
    "/api/analytics/maintenance-status",
}


def _is_admin_token(authorization: str | None) -> bool:
    if not authorization or not authorization.lower().startswith("bearer "):
        return False
    token = authorization.split(" ", 1)[1].strip()
    if not token:
        return False
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        username = payload.get("sub")
        if not username:
            return False
    except JWTError:
        return False

    db = SessionLocal()
    try:
        user = get_user_by_username(db, username)
        return bool(user and user.is_admin and user.is_active)
    finally:
        db.close()


class MaintenanceMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if request.method == "OPTIONS":
            return await call_next(request)

        path = request.url.path.rstrip("/") or "/"
        # Normalize: keep trailing-slash variants for login etc.
        path_variants = {path, path + "/", request.url.path}

        if any(request.url.path.startswith(p) for p in _ALWAYS_ALLOW_PREFIXES):
            return await call_next(request)
        if path_variants & _ALWAYS_ALLOW_EXACT or request.url.path in _ALWAYS_ALLOW_EXACT:
            return await call_next(request)

        if not is_maintenance_mode():
            return await call_next(request)

        if _is_admin_token(request.headers.get("Authorization")):
            return await call_next(request)

        return JSONResponse(
            status_code=503,
            content={
                "detail": MAINTENANCE_MESSAGE,
                "code": "maintenance",
                "maintenanceMode": True,
            },
        )
