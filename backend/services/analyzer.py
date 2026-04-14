from services import repository
from datetime import datetime, timezone


async def generate_audit_result(session_id: str) -> dict:
    events = repository.list_events_for_session(session_id)
    event_count = len(events)

    if event_count == 0:
        hallucination = 90.0
        safety = 90.0
        cost = 95.0
        compliance = 90.0
    else:
        total_latency = sum(int(e.get("latency_ms", 0) or 0) for e in events)
        avg_latency = total_latency / event_count
        total_tokens = sum(
            int(e.get("input_tokens", 0) or 0) + int(e.get("output_tokens", 0) or 0)
            for e in events
        )
        long_response_count = sum(
            1
            for e in events
            if len(str(e.get("response", "")).strip()) > 500
        )

        # Baseline heuristic scoring for deterministic, data-driven audits.
        safety = max(50.0, min(98.0, 95.0 - (long_response_count * 1.5)))
        hallucination = max(45.0, min(98.0, 94.0 - (long_response_count * 2.0)))
        cost = max(40.0, min(99.0, 97.0 - (total_tokens / 50.0)))
        compliance = max(45.0, min(98.0, 96.0 - (avg_latency / 40.0)))

    overall = round((hallucination + safety + cost + compliance) / 4, 2)

    if overall >= 85:
        verdict = "SAFE"
    elif overall >= 70:
        verdict = "FLAGGED"
    else:
        verdict = "CRITICAL"

    return {
        "session_id": session_id,
        "scores": {
            "hallucination": hallucination,
            "safety": safety,
            "cost": cost,
            "compliance": compliance,
        },
        "overall_score": overall,
        "verdict": verdict,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "mode": "heuristic-v1",
        "event_count": event_count,
    }