"""Redis connection with in-memory fallback for rate limiting."""

from __future__ import annotations

import logging
import os
import time
from typing import Any

logger = logging.getLogger(__name__)

_redis_client: Any = None
_redis_checked = False
_use_memory = True
_memory_store: dict[str, tuple[int, float]] = {}


def redis_url() -> str:
    return os.getenv("REDIS_URL", "redis://127.0.0.1:6379/0")


def is_rate_limit_enabled() -> bool:
    return os.getenv("RATE_LIMIT_ENABLED", "true").lower() in {"1", "true", "yes", "on"}


def get_redis():
    """Return Redis client or None if unavailable."""
    global _redis_client, _redis_checked, _use_memory
    if _redis_checked:
        return _redis_client
    _redis_checked = True
    if not is_rate_limit_enabled():
        _use_memory = True
        return None
    try:
        import redis  # type: ignore

        client = redis.from_url(redis_url(), decode_responses=True, socket_connect_timeout=1.5)
        client.ping()
        _redis_client = client
        _use_memory = False
        logger.info("Rate limiting: using Redis at %s", redis_url())
    except Exception as exc:
        _redis_client = None
        _use_memory = True
        logger.warning("Rate limiting: Redis unavailable (%s), using in-memory fallback", exc)
    return _redis_client


def redis_status() -> dict[str, Any]:
    client = get_redis()
    return {
        "enabled": is_rate_limit_enabled(),
        "backend": "redis" if client is not None else "memory",
        "url": redis_url() if client is not None else None,
    }


def increment_window(key: str, window_seconds: int) -> int:
    """Increment counter for key; return count in current window."""
    client = get_redis()
    if client is not None:
        pipe = client.pipeline()
        pipe.incr(key)
        pipe.expire(key, window_seconds, nx=True)
        count, _ = pipe.execute()
        return int(count)

    now = time.time()
    bucket = int(now // window_seconds)
    mem_key = f"{key}:{bucket}"
    entry = _memory_store.get(mem_key)
    if entry is None or entry[1] != bucket:
        _memory_store[mem_key] = (1, bucket)
        return 1
    new_count = entry[0] + 1
    _memory_store[mem_key] = (new_count, bucket)
    # prune old buckets occasionally
    if len(_memory_store) > 5000:
        cutoff = bucket - 2
        for k in list(_memory_store.keys()):
            if _memory_store[k][1] < cutoff:
                del _memory_store[k]
    return new_count
