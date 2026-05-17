"""Stream audit committee progress as Server-Sent Events."""

from __future__ import annotations

import asyncio
import json
from collections.abc import AsyncGenerator
from typing import Any

from services.analyzer import generate_audit_result

AGENT_ORDER = ("hallucination", "safety", "cost", "compliance")
AGENT_STEP_DELAY_SEC = 0.55


def _sse_data(payload: dict[str, Any]) -> str:
    return f"data: {json.dumps(payload, default=str)}\n\n"


def _sse_named(event: str, payload: dict[str, Any]) -> str:
    return f"event: {event}\ndata: {json.dumps(payload, default=str)}\n\n"


async def stream_audit_sse(
    session_id: str,
    result_holder: list[dict[str, Any]] | None = None,
) -> AsyncGenerator[str, None]:
    """Run audit once, emit staged progress, optionally store raw result in result_holder."""
    yield _sse_data({"type": "audit_start", "session_id": session_id})

    result = await generate_audit_result(session_id)
    if result_holder is not None:
        result_holder.append(result)

    scores = result.get("scores") or {}
    agent_results = result.get("agent_results") or {}

    for agent in AGENT_ORDER:
        await asyncio.sleep(AGENT_STEP_DELAY_SEC)
        agent_payload = agent_results.get(agent) or {}
        score = float(agent_payload.get("score", scores.get(agent, 0)))
        flagged = score < 70 or str(agent_payload.get("verdict", "SAFE")).upper() != "SAFE"
        summary = agent_payload.get("summary") or (
            f"{agent.replace('_', ' ').title()} score below threshold"
            if flagged
            else "No anomalies detected"
        )
        yield _sse_data(
            {
                "type": "agent_result",
                "data": {
                    "agent_type": agent,
                    "score": score,
                    "flagged": flagged,
                    "flag_created": flagged,
                    "finding": summary,
                    "summary": summary,
                    "findings": agent_payload.get("findings", []),
                    "resolution_steps": agent_payload.get("resolution_steps", []),
                },
            }
        )

    await asyncio.sleep(0.25)
    verdict_payload = {
        "type": "verdict",
        "data": {
            "verdict": result.get("verdict"),
            "overall_score": result.get("overall_score"),
            "session_id": session_id,
        },
    }
    yield _sse_named("verdict", verdict_payload)
    yield _sse_data(verdict_payload)

    yield _sse_named("complete", {"status": "complete", "session_id": session_id})
    yield _sse_data(
        {
            "type": "complete",
            "status": "complete",
            "data": {
                "verdict": result.get("verdict"),
                "overall_score": result.get("overall_score"),
                "scores": scores,
            },
        }
    )
