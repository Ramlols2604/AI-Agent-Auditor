from datetime import datetime, timezone


async def generate_audit_result(session_id: str) -> dict:
    # Deterministic placeholder scores for scaffold phase.
    hallucination = 82.0
    safety = 91.0
    cost = 76.0
    compliance = 84.0
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
        "mode": "skeleton",
    }