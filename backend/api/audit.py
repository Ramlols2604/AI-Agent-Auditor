import json
from typing import Any

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from services.analyzer import generate_audit_result
from services.audit_stream import stream_audit_sse
from services.flag_builder import create_flags_from_audit, first_flag_raised_event, severity_from_score
from services.report import build_report_payload
from services import repository

router = APIRouter(prefix="/audit", tags=["audit"])


class AuditGenerateRequest(BaseModel):
    session_id: str = Field(min_length=1)


def _severity_from_score(overall_score: float) -> str:
    if overall_score < 50:
        return "critical"
    if overall_score < 70:
        return "high"
    if overall_score < 85:
        return "medium"
    return "low"


def _apply_flag_side_effects(session_id: str, result: dict[str, Any]) -> dict[str, Any]:
    flag_ids = create_flags_from_audit(session_id, result)
    result["flag_created"] = len(flag_ids) > 0
    result["flag_id"] = flag_ids[0] if flag_ids else None
    result["flag_ids"] = flag_ids
    return result


def _normalize_audit_response(session_id: str, result: dict[str, Any]) -> dict[str, Any]:
    raw_scores = result.get("scores", {}) if isinstance(result.get("scores"), dict) else {}
    agent_scores = {
        "hallucination": int(round(float(raw_scores.get("hallucination", 0)))),
        "safety": int(round(float(raw_scores.get("safety", 0)))),
        "cost": int(round(float(raw_scores.get("cost", 0)))),
        "compliance": int(round(float(raw_scores.get("compliance", 0)))),
    }
    return {
        "verdict": str(result.get("verdict", "UNKNOWN")),
        "overall_score": int(round(float(result.get("overall_score", 0)))),
        "flag_created": bool(result.get("flag_created", False)),
        "status": "complete",
        "agent_scores": agent_scores,
        "scores": agent_scores,
        "session_id": session_id,
        "mode": result.get("mode"),
        "generated_at": result.get("generated_at"),
        "event_count": result.get("event_count"),
        "flag_id": result.get("flag_id"),
    }


@router.get("/live/{session_id}")
async def audit_live_stream(session_id: str) -> StreamingResponse:
    """SSE stream that runs the 4-agent audit and emits progress events."""
    if not session_id.strip():
        raise HTTPException(status_code=400, detail="Invalid session id")
    if repository.get_session(session_id) is None:
        raise HTTPException(status_code=404, detail="Session not found")

    async def event_generator():
        result_holder: list[dict[str, Any]] = []
        try:
            async for frame in stream_audit_sse(session_id, result_holder):
                yield frame

            if not result_holder:
                return

            result = _apply_flag_side_effects(session_id, result_holder[0])
            flag_event = first_flag_raised_event(result, result.get("flag_ids") or [])
            if flag_event:
                yield (
                    "data: "
                    + json.dumps(
                        {
                            "type": "flag_raised",
                            "data": flag_event,
                        }
                    )
                    + "\n\n"
                )

            normalized = _normalize_audit_response(session_id, result)
            yield f"data: {json.dumps({'type': 'audit_result', 'data': normalized})}\n\n"
        except Exception as exc:
            yield f"data: {json.dumps({'type': 'error', 'message': str(exc)})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/generate")
async def generate_audit(payload: AuditGenerateRequest) -> dict:
    session = repository.get_session(payload.session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")

    result = await generate_audit_result(payload.session_id)
    result = _apply_flag_side_effects(payload.session_id, result)
    return _normalize_audit_response(payload.session_id, result)


@router.get("/report/{session_id}")
async def get_audit_report(session_id: str) -> dict:
    if not session_id.strip():
        raise HTTPException(status_code=400, detail="Invalid session id")
    return build_report_payload(session_id)
