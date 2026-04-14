import threading
import time
import uuid
from datetime import datetime, timezone
from typing import Any

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

from services import repository


class AuditCaptureMiddleware(BaseHTTPMiddleware):
    """
    Request-level capture middleware.
    - Creates one middleware session lazily.
    - Reuses same session for all requests.
    - Emits incrementing sequence_num values.
    - Never breaks main request flow.
    """

    def __init__(self, app: Any, session_id: str | None = None) -> None:
        super().__init__(app)
        self._session_id = session_id
        self._sequence = 0
        self._lock = threading.Lock()

    def _next_sequence(self) -> int:
        with self._lock:
            self._sequence += 1
            return self._sequence

    def _ensure_session(self) -> str | None:
        if self._session_id:
            return self._session_id

        with self._lock:
            if self._session_id:
                return self._session_id

            created = repository.create_session(
                agent_name="middleware-capture",
                model_used="http-request",
                session_id=str(uuid.uuid4()),
                started_at=datetime.now(timezone.utc).isoformat(),
                status="active",
            )
            self._session_id = created.get("id") if created else None
            return self._session_id

    async def dispatch(self, request: Request, call_next):
        started = time.perf_counter()
        response = await call_next(request)
        latency_ms = int((time.perf_counter() - started) * 1000)

        try:
            session_id = self._ensure_session()
            if session_id:
                repository.create_event(
                    {
                        "id": str(uuid.uuid4()),
                        "session_id": session_id,
                        "sequence_num": self._next_sequence(),
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
                    }
                )
        except Exception:
            pass

        return response