from datetime import datetime
from typing import Literal
from uuid import uuid4

from pydantic import BaseModel, Field

FlagType = Literal["hallucination", "safety", "cost", "compliance"]
Severity = Literal["critical", "high", "medium", "low"]


class FlagResponse(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid4()))
    event_id: str
    session_id: str
    flag_type: FlagType
    severity: Severity
    description: str = Field(min_length=1)
    agent_verdict: dict = Field(default_factory=dict)
    resolved: bool = False
    created_at: datetime = Field(default_factory=datetime.utcnow)


class ResolveFlagRequest(BaseModel):
    resolved: bool = True