from datetime import datetime, timezone


def build_report_payload(session_id: str) -> dict:
    return {
        "session_id": session_id,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "format": "pdf-placeholder",
        "status": "ready",
        "summary": {
            "verdict": "FLAGGED",
            "overall_score": 83.25,
        },
    }