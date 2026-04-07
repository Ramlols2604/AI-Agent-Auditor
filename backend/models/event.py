# backend/models/event.py
from datetime import datetime
from uuid import uuid4

from pydantic import BaseModel, Field


class CapturedEventCreateRequest(BaseModel):
    sequence_num: int = Field(ge=0)
    prompt: str
    response: str
    model: str = Field(min_length=1, max_length=120)
    input_tokens: int = Field(default=0, ge=0)
    output_tokens: int = Field(default=0, ge=0)
    latency_ms: int = Field(default=0, ge=0)
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    raw_json: dict = Field(default_factory=dict)


class CapturedEventResponse(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid4()))
    session_id: str
    sequence_num: int
    prompt: str
    response: str
    model: str
    input_tokens: int
    output_tokens: int
    latency_ms: int
    timestamp: datetime
    raw_json: dict