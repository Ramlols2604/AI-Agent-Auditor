import json
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from typing import Any

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request


def _safe_post_json(auditor_url: str, path: str, payload: dict) -> dict | None:
    url = f"{auditor_url.rstrip('/')}{path}"
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url=url,
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=3) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, json.JSONDecodeError):
        return None


class AuditCaptureMiddleware(BaseHTTPMiddleware):
    """
    Lightweight request-level capture middleware.
    This is a stub: captures API request metadata and posts it as an event.
    Never raises to caller if auditing fails.
    """

    def __init__(self, app: Any, auditor_url: str, session_id: str | None = None) -> None:
        super().__init__(app)
        self._auditor_url = auditor_url.rstrip("/")
        self._session_id = session_id

    async def dispatch(self, request: Request, call_next):
        started = time.perf_counter()
        response = await call_next(request)
        latency_ms = int((time.perf_counter() - started) * 1000)

        try:
            session_id = self._session_id
            if not session_id:
                # Create an internal session lazily if not provided.
                created = _safe_post_json(
                    self._auditor_url,
                    "/sessions",
                    {"agent_name": "middleware-capture", "model_used": "http-request"},
                )
                session_id = created.get("id") if created else None
                self._session_id = session_id

            if session_id:
                _safe_post_json(
                    self._auditor_url,
                    f"/sessions/{session_id}/events",
                    {
                        "sequence_num": 1,
                        "prompt": f"{request.method} {request.url.path}",
                        "response": f"status={response.status_code}",
                        "model": "http-middleware",
                        "input_tokens": 0,
                        "output_tokens": 0,
                        "latency_ms": latency_ms,
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                        "raw_json": {
                            "query": str(request.url.query),
                            "client": request.client.host if request.client else None,
                        },
                    },
                )
        except Exception:
            # Must never break main request flow.
            pass

        return response