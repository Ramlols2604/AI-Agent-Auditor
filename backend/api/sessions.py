from typing import Dict

from fastapi import APIRouter, HTTPException

from models.event import CapturedEventCreateRequest, CapturedEventResponse
from models.session import SessionCreateRequest, SessionResponse

router = APIRouter(prefix="/sessions", tags=["sessions"])

# Temporary in-memory stores for this PR scope.
_SESSIONS: Dict[str, SessionResponse] = {}
_SESSION_EVENTS: Dict[str, list[CapturedEventResponse]] = {}


@router.post("", response_model=SessionResponse)
async def create_session(payload: SessionCreateRequest) -> SessionResponse:
    session = SessionResponse(
        agent_name=payload.agent_name,
        model_used=payload.model_used,
    )
    _SESSIONS[session.id] = session
    _SESSION_EVENTS[session.id] = []
    return session


@router.get("", response_model=list[SessionResponse])
async def list_sessions() -> list[SessionResponse]:
    return list(_SESSIONS.values())


@router.get("/{session_id}", response_model=SessionResponse)
async def get_session(session_id: str) -> SessionResponse:
    session = _SESSIONS.get(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")
    return session


@router.post("/{session_id}/events", response_model=CapturedEventResponse)
async def create_session_event(
    session_id: str,
    payload: CapturedEventCreateRequest,
) -> CapturedEventResponse:
    if session_id not in _SESSIONS:
        raise HTTPException(status_code=404, detail="Session not found")

    event = CapturedEventResponse(
        session_id=session_id,
        sequence_num=payload.sequence_num,
        prompt=payload.prompt,
        response=payload.response,
        model=payload.model,
        input_tokens=payload.input_tokens,
        output_tokens=payload.output_tokens,
        latency_ms=payload.latency_ms,
        timestamp=payload.timestamp,
        raw_json=payload.raw_json,
    )

    _SESSION_EVENTS.setdefault(session_id, []).append(event)
    return event