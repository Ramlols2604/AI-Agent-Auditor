from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from services.analyzer import generate_audit_result
from services.report import build_report_payload

router = APIRouter(prefix="/audit", tags=["audit"])


class AuditGenerateRequest(BaseModel):
    session_id: str = Field(min_length=1)


@router.post("/generate")
async def generate_audit(payload: AuditGenerateRequest) -> dict:
    return await generate_audit_result(payload.session_id)


@router.get("/report/{session_id}")
async def get_audit_report(session_id: str) -> dict:
    if not session_id.strip():
        raise HTTPException(status_code=400, detail="Invalid session id")
    return build_report_payload(session_id)