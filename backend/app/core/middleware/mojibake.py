"""Repair mojibake in JSON API responses before they reach the frontend."""

from __future__ import annotations

import json

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response, StreamingResponse

from app.core.utils.text_encoding import repair_deep


class MojibakeRepairMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)

        if response.status_code >= 400:
            return response
        if isinstance(response, StreamingResponse):
            return response

        content_type = response.headers.get("content-type", "")
        if "json" not in content_type.lower():
            return response

        body = b""
        async for chunk in response.body_iterator:
            body += chunk

        try:
            payload = json.loads(body)
        except (json.JSONDecodeError, UnicodeDecodeError):
            return Response(
                content=body,
                status_code=response.status_code,
                headers=dict(response.headers),
                media_type=response.media_type,
            )

        repaired = repair_deep(payload)
        headers = {
            key: value
            for key, value in response.headers.items()
            if key.lower() not in ("content-length", "content-type")
        }
        return JSONResponse(content=repaired, status_code=response.status_code, headers=headers)
