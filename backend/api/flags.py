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

def list_flags() -> list[dict]:
    with _get_conn() as conn:
        rows = conn.execute(
            """
            SELECT id, event_id, session_id, flag_type, severity,
                   description, agent_verdict, resolved, created_at
            FROM flags
            ORDER BY created_at DESC
            """
        ).fetchall()

    out: list[dict] = []
    for row in rows:
        item = dict(row)
        item["agent_verdict"] = json.loads(item["agent_verdict"]) if item["agent_verdict"] else {}
        item["resolved"] = bool(item["resolved"])
        out.append(item)
    return out


def list_flags_for_session(session_id: str) -> list[dict]:
    with _get_conn() as conn:
        rows = conn.execute(
            """
            SELECT id, event_id, session_id, flag_type, severity,
                   description, agent_verdict, resolved, created_at
            FROM flags
            WHERE session_id = ?
            ORDER BY created_at DESC
            """,
            (session_id,),
        ).fetchall()

    out: list[dict] = []
    for row in rows:
        item = dict(row)
        item["agent_verdict"] = json.loads(item["agent_verdict"]) if item["agent_verdict"] else {}
        item["resolved"] = bool(item["resolved"])
        out.append(item)
    return out


def resolve_flag(flag_id: str, resolved: bool) -> dict | None:
    with _get_conn() as conn:
        conn.execute(
            "UPDATE flags SET resolved = ? WHERE id = ?",
            (1 if resolved else 0, flag_id),
        )
    return get_flag(flag_id)