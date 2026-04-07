from typing import Dict

from fastapi import APIRouter, HTTPException

from models.session import SessionCreateRequest, SessionResponse

router = APIRouter(prefix="/sessions", tags=["sessions"])

# Temporary in-memory store for this PR scope.
_SESSIONS: Dict[str, SessionResponse] = {}


@router.post("", response_model=SessionResponse)
async def create_session(payload: SessionCreateRequest) -> SessionResponse:
    session = SessionResponse(
        agent_name=payload.agent_name,
        model_used=payload.model_used,
    )
    _SESSIONS[session.id] = session
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