from pydantic import BaseModel, Field
from fastapi import APIRouter

from services.analyzer import generate_audit_result

router = APIRouter(prefix="/audit", tags=["audit"])


class AuditGenerateRequest(BaseModel):
    session_id: str = Field(min_length=1)


@router.post("/generate")
async def generate_audit(payload: AuditGenerateRequest) -> dict:
    return await generate_audit_result(payload.session_id)