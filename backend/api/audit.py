from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from services.analyzer import generate_audit_result
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


@router.post("/generate")
async def generate_audit(payload: AuditGenerateRequest) -> dict:
    session = repository.get_session(payload.session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")

    result = await generate_audit_result(payload.session_id)

    # Create a synthetic flag when verdict is not SAFE.
    if result.get("verdict") != "SAFE":
        events = repository.list_events_for_session(payload.session_id)
        latest_event_id = events[-1]["id"] if events else "no-event"
        overall = float(result.get("overall_score", 0.0))
        severity = _severity_from_score(overall)

        flag = repository.create_flag(
            event_id=latest_event_id,
            session_id=payload.session_id,
            flag_type="compliance",
            severity=severity,
            description=f"Automated audit verdict: {result.get('verdict')}",
            agent_verdict=result,
        )
        result["flag_created"] = True
        result["flag_id"] = flag["id"]
    else:
        result["flag_created"] = False

    return result


@router.get("/report/{session_id}")
async def get_audit_report(session_id: str) -> dict:
    if not session_id.strip():
        raise HTTPException(status_code=400, detail="Invalid session id")
    return build_report_payload(session_id)