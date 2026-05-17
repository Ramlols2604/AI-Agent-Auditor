from fastapi import APIRouter, HTTPException, Query

from models.event import CapturedEventCreateRequest, CapturedEventResponse
from models.session import SessionCreateRequest, SessionDetailResponse, SessionResponse
from services import repository
from services.costs import calculate_cost

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
async def list_sessions(
    exclude_noise: bool = Query(default=True, description="Hide middleware-capture noise sessions"),
) -> list[SessionResponse]:
    rows = repository.list_sessions(exclude_noise=exclude_noise)
    return [SessionResponse(**r) for r in rows]


@router.get("/{session_id}", response_model=SessionDetailResponse)
async def get_session(session_id: str) -> SessionDetailResponse:
    row = repository.get_session(session_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Session not found")
    events = repository.list_events_for_session(session_id)
    event_costs = [float(e.get("cost_usd", 0.0) or 0.0) for e in events]
    return SessionDetailResponse(**row, event_costs=event_costs)


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
        cost_usd=calculate_cost(
            payload.model or "default",
            payload.input_tokens or 0,
            payload.output_tokens or 0,
        ),
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


@router.delete("")
async def clear_all_sessions() -> dict:
    repository.clear_all_data()
    return {"cleared": True}


def session_exists(session_id: str) -> bool:
    return repository.get_session(session_id) is not None


def get_session_events(session_id: str) -> list[CapturedEventResponse]:
    rows = repository.list_events_for_session(session_id)
    return [CapturedEventResponse(**r) for r in rows]