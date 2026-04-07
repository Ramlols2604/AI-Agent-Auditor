# backend/models/session.py
from datetime import datetime
from typing import Literal
from uuid import uuid4

from pydantic import BaseModel, Field


SessionStatus = Literal["active", "complete", "error"]


class SessionCreateRequest(BaseModel):
    agent_name: str = Field(min_length=1, max_length=120)
    model_used: str | None = Field(default=None, max_length=120)


class SessionResponse(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid4()))
    agent_name: str
    model_used: str | None = None
    started_at: datetime = Field(default_factory=datetime.utcnow)
    ended_at: datetime | None = None
    total_tokens: int = Field(default=0, ge=0)
    total_cost_usd: float = Field(default=0.0, ge=0.0)
    flag_count: int = Field(default=0, ge=0)
    compliance_score: float | None = Field(default=None, ge=0.0, le=100.0)
    status: SessionStatus = "active"