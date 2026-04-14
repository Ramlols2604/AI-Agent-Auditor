from datetime import datetime, timezone

from services import repository


def build_report_payload(session_id: str) -> dict:
    session = repository.get_session(session_id)
    if session is None:
        return {
            "session_id": session_id,
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "status": "not_found",
            "summary": {
                "verdict": "UNKNOWN",
                "overall_score": None,
                "flags_total": 0,
                "flags_resolved": 0,
                "events_total": 0,
            },
        }

    events = repository.list_events_for_session(session_id)
    flags = repository.list_flags_for_session(session_id)

    flags_total = len(flags)
    flags_resolved = sum(1 for flag in flags if flag.get("resolved"))
    overall_score = session.get("compliance_score")

    if flags_total == 0:
        verdict = "SAFE"
    elif flags_resolved == flags_total:
        verdict = "RESOLVED"
    else:
        verdict = "FLAGGED"

    return {
        "session_id": session_id,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "format": "pdf-placeholder",
        "status": "ready",
        "summary": {
            "verdict": verdict,
            "overall_score": overall_score,
            "flags_total": flags_total,
            "flags_resolved": flags_resolved,
            "events_total": len(events),
        },
    }
