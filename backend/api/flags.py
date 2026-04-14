from fastapi import APIRouter, HTTPException

from models.flag import FlagResponse, ResolveFlagRequest
from services import repository

router = APIRouter(prefix="/flags", tags=["flags"])


@router.get("", response_model=list[FlagResponse])
async def list_flags() -> list[FlagResponse]:
    return [FlagResponse(**row) for row in repository.list_flags()]


@router.get("/{session_id}", response_model=list[FlagResponse])
async def list_flags_for_session(session_id: str) -> list[FlagResponse]:
    return [FlagResponse(**row) for row in repository.list_flags_for_session(session_id)]


@router.post("/{flag_id}/resolve", response_model=FlagResponse)
async def resolve_flag(flag_id: str, payload: ResolveFlagRequest) -> FlagResponse:
    updated = repository.resolve_flag(flag_id, payload.resolved)
    if updated is None:
        raise HTTPException(status_code=404, detail="Flag not found")
    return FlagResponse(**updated)
