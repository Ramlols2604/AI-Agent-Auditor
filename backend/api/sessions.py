from fastapi import APIRouter, HTTPException

from models.event import CapturedEventCreateRequest, CapturedEventResponse
from models.session import SessionCreateRequest, SessionResponse
from services import repository

router = APIRouter(prefix="/sessions", tags=["sessions"])


@router.post("", response_model=SessionResponse)
async def create_session(payload: SessionCreateRequest) -> SessionResponse:
    session = SessionResponse(
        agent_name=payload.agent_name,
        model_used=payload.model_used,
    )
    row = repository.create_session(
        agent_name=session.agent_name,
        model_used=session.model_used,
        session_id=session.id,
        started_at=session.started_at.isoformat(),
        status=session.status,
    )
    return SessionResponse(**row)


@router.get("", response_model=list[SessionResponse])
async def list_sessions() -> list[SessionResponse]:
    rows = repository.list_sessions()
    return [SessionResponse(**r) for r in rows]


@router.get("/{session_id}", response_model=SessionResponse)
async def get_session(session_id: str) -> SessionResponse:
    row = repository.get_session(session_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Session not found")
    return SessionResponse(**row)


@router.post("/{session_id}/events", response_model=CapturedEventResponse)
async def create_session_event(
    session_id: str,
    payload: CapturedEventCreateRequest,
) -> CapturedEventResponse:
    if repository.get_session(session_id) is None:
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
    repository.create_event(event.model_dump())
    return event


@router.get("/{session_id}/events", response_model=list[CapturedEventResponse])
async def list_session_events(session_id: str) -> list[CapturedEventResponse]:
    if repository.get_session(session_id) is None:
        raise HTTPException(status_code=404, detail="Session not found")
    rows = repository.list_events_for_session(session_id)
    return [CapturedEventResponse(**r) for r in rows]


def session_exists(session_id: str) -> bool:
    return repository.get_session(session_id) is not None


def get_session_events(session_id: str) -> list[CapturedEventResponse]:
    rows = repository.list_events_for_session(session_id)
    return [CapturedEventResponse(**r) for r in rows]