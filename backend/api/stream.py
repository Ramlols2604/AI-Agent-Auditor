import asyncio
import json
import time
from typing import AsyncGenerator

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from api.sessions import get_session_events, session_exists

router = APIRouter(prefix="/stream", tags=["stream"])


async def _event_generator(session_id: str) -> AsyncGenerator[str, None]:
    cursor = 0
    last_meaningful_event_at = time.monotonic()

    # Initial event so clients know stream connected.
    yield f"data: {json.dumps({'type': 'session_start', 'session_id': session_id})}\n\n"

    while True:
        events = get_session_events(session_id)

        while cursor < len(events):
            event = events[cursor]
            raw_json = event.raw_json if isinstance(event.raw_json, dict) else {}
            event_type = str(raw_json.get("type", "")).lower()
            payload = {
                "type": "event_captured",
                "session_id": session_id,
                # Use JSON mode so datetime fields are serialized to strings.
                "event": event.model_dump(mode="json"),
            }
            yield f"data: {json.dumps(payload, default=str)}\n\n"
            cursor += 1

            if str(getattr(event, "model", "")).lower() != "http-middleware":
                last_meaningful_event_at = time.monotonic()

            # Emit terminal complete signal as soon as verdict/complete is observed.
            if event_type in {"verdict", "complete"}:
                yield "event: complete\ndata: " + json.dumps({"status": "complete"}) + "\n\n"
                return

        # Close stream after prolonged inactivity so clients receive completion.
        if time.monotonic() - last_meaningful_event_at >= 30:
            yield "event: complete\ndata: " + json.dumps({"status": "complete"}) + "\n\n"
            return

        # Heartbeat keeps SSE alive while audit is still active.
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