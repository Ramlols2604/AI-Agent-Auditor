"""Rate limit checks for API and refresh (list/poll) endpoints."""

from __future__ import annotations

import os

from services.redis_client import increment_window, is_rate_limit_enabled

WINDOW_SECONDS = 60


def _int_env(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, str(default)))
    except ValueError:
        return default


def api_limit_per_minute() -> int:
    return _int_env("API_RATE_LIMIT_PER_MIN", 120)


def refresh_limit_per_minute() -> int:
    return _int_env("REFRESH_RATE_LIMIT_PER_MIN", 120)


def audit_limit_per_minute() -> int:
    return _int_env("AUDIT_RATE_LIMIT_PER_MIN", 15)


def is_refresh_route(method: str, path: str) -> bool:
    if method != "GET":
        return False
    if path in ("/sessions", "/flags"):
        return True
    if path.startswith("/flags/") and path.count("/") == 2:
        return True
    if path.endswith("/events") and path.startswith("/sessions/"):
        return True
    return False


def is_audit_route(method: str, path: str) -> bool:
    return path.startswith("/audit/")


def check_rate_limit(client_id: str, method: str, path: str) -> tuple[bool, int, str]:
    """
    Returns (allowed, retry_after_seconds, limit_type).
    """
    if not is_rate_limit_enabled():
        return True, 0, ""

    if is_audit_route(method, path):
        limit = audit_limit_per_minute()
        key = f"rl:audit:{client_id}"
        kind = "audit"
    elif is_refresh_route(method, path):
        limit = refresh_limit_per_minute()
        normalized = path.split("?")[0]
        # Bucket list/poll reads so /sessions + /flags share one budget per client.
        if normalized in ("/sessions", "/flags"):
            key = f"rl:refresh:{client_id}:list"
        else:
            key = f"rl:refresh:{client_id}:{normalized}"
        kind = "refresh"
    else:
        limit = api_limit_per_minute()
        key = f"rl:api:{client_id}"
        kind = "api"

    count = increment_window(key, WINDOW_SECONDS)
    if count > limit:
        return False, WINDOW_SECONDS, kind
    return True, 0, kind
