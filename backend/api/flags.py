from fastapi import APIRouter, HTTPException

from models.flag import FlagResponse, ResolveFlagRequest

router = APIRouter(prefix="/flags", tags=["flags"])

# Temporary in-memory store for this PR scope.
_FLAGS: dict[str, FlagResponse] = {}


@router.get("", response_model=list[FlagResponse])
async def list_flags() -> list[FlagResponse]:
    return list(_FLAGS.values())


@router.get("/{session_id}", response_model=list[FlagResponse])
async def list_flags_for_session(session_id: str) -> list[FlagResponse]:
    return [flag for flag in _FLAGS.values() if flag.session_id == session_id]


@router.post("/{flag_id}/resolve", response_model=FlagResponse)
async def resolve_flag(flag_id: str, payload: ResolveFlagRequest) -> FlagResponse:
    flag = _FLAGS.get(flag_id)
    if flag is None:
        raise HTTPException(status_code=404, detail="Flag not found")

    updated = flag.model_copy(update={"resolved": payload.resolved})
    _FLAGS[flag_id] = updated
    return updated