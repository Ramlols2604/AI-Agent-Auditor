# backend/api/health.py
from fastapi import APIRouter

from services.redis_client import redis_status

router = APIRouter(tags=["health"])


@router.get("/health")
async def health() -> dict:
    rl = redis_status()
    return {
        "status": "ok",
        "rate_limit": rl,
    }