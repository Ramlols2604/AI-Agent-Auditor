import asyncio
import json
from typing import AsyncGenerator

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from api.sessions import get_session_events, session_exists

router = APIRouter(prefix="/stream", tags=["stream"])


async def _event_generator(session_id: str) -> AsyncGenerator[str, None]:
    cursor = 0

    # Initial event so clients know stream connected.
    yield f"data: {json.dumps({'type': 'session_start', 'session_id': session_id})}\n\n"

    while True:
        events = get_session_events(session_id)

        while cursor < len(events):
            event = events[cursor]
            payload = {
                "type": "event_captured",
                "session_id": session_id,
                "event": event.model_dump(),
            }
            yield f"data: {json.dumps(payload)}\n\n"
            cursor += 1

        # Heartbeat keeps SSE alive.
        yield f"data: {json.dumps({'type': 'heartbeat', 'session_id': session_id})}\n\n"
        await asyncio.sleep(2)


@router.get("/{session_id}")
async def stream_session(session_id: str) -> StreamingResponse:
    if not session_exists(session_id):
        raise HTTPException(status_code=404, detail="Session not found")

    return StreamingResponse(
        _event_generator(session_id),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        },
    )