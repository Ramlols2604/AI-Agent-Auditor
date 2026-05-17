"""HTTP middleware for Redis-backed rate limiting."""

from __future__ import annotations

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

from services.rate_limit import check_rate_limit


class RateLimitMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        client_host = request.client.host if request.client else "unknown"
        forwarded = request.headers.get("x-forwarded-for")
        client_id = forwarded.split(",")[0].strip() if forwarded else client_host

        allowed, retry_after, kind = check_rate_limit(client_id, request.method, request.url.path)
        if not allowed:
            return JSONResponse(
                status_code=429,
                content={
                    "detail": f"Rate limit exceeded ({kind}). Slow down and retry.",
                    "limit_type": kind,
                    "retry_after_seconds": retry_after,
                },
                headers={
                    "Retry-After": str(retry_after),
                    "X-RateLimit-Type": kind,
                },
            )

        response = await call_next(request)
        if kind:
            response.headers["X-RateLimit-Type"] = kind
        return response
