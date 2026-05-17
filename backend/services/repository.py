import json
import sqlite3
from pathlib import Path
from typing import Any
import uuid
from datetime import datetime, timezone
from services.costs import calculate_cost

DB_PATH = Path(__file__).resolve().parents[1] / "db" / "local.db"
SCHEMA_PATH = Path(__file__).resolve().parents[1] / "db" / "schema.sql"


def _get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with _get_conn() as conn:
        conn.executescript(SCHEMA_PATH.read_text())
        _ensure_cost_columns(conn)
        _ensure_event_count_column(conn)
        _backfill_event_costs(conn)
        _backfill_session_rollups(conn)


def _has_column(conn: sqlite3.Connection, table: str, column: str) -> bool:
    rows = conn.execute(f"PRAGMA table_info({table})").fetchall()
    return any(r["name"] == column for r in rows)


def _ensure_cost_columns(conn: sqlite3.Connection) -> None:
    if not _has_column(conn, "sessions", "total_cost_usd"):
        conn.execute("ALTER TABLE sessions ADD COLUMN total_cost_usd REAL DEFAULT 0.0")
    if not _has_column(conn, "events", "cost_usd"):
        conn.execute("ALTER TABLE events ADD COLUMN cost_usd REAL DEFAULT 0.0")


def _ensure_event_count_column(conn: sqlite3.Connection) -> None:
    if not _has_column(conn, "sessions", "event_count"):
        conn.execute("ALTER TABLE sessions ADD COLUMN event_count INTEGER NOT NULL DEFAULT 0")


def _backfill_event_costs(conn: sqlite3.Connection) -> None:
    if not _has_column(conn, "events", "cost_usd"):
        return
    rows = conn.execute(
        """
        SELECT id, model, input_tokens, output_tokens
        FROM events
        WHERE (COALESCE(input_tokens, 0) > 0 OR COALESCE(output_tokens, 0) > 0)
          AND COALESCE(cost_usd, 0.0) = 0.0
        """
    ).fetchall()
    for row in rows:
        cost = calculate_cost(
            str(row["model"] or "default"),
            int(row["input_tokens"] or 0),
            int(row["output_tokens"] or 0),
        )
        conn.execute("UPDATE events SET cost_usd = ? WHERE id = ?", (cost, row["id"]))


def _backfill_session_rollups(conn: sqlite3.Connection) -> None:
    if not _has_column(conn, "sessions", "event_count"):
        return
    conn.execute(
        """
        UPDATE sessions
        SET event_count = (
            SELECT COUNT(*) FROM events WHERE events.session_id = sessions.id
        )
        """
    )
    conn.execute(
        """
        UPDATE sessions
        SET total_tokens = COALESCE((
            SELECT SUM(COALESCE(input_tokens, 0) + COALESCE(output_tokens, 0))
            FROM events WHERE events.session_id = sessions.id
        ), 0)
        """
    )
    conn.execute(
        """
        UPDATE sessions
        SET total_cost_usd = COALESCE((
            SELECT SUM(COALESCE(cost_usd, 0.0))
            FROM events WHERE events.session_id = sessions.id
        ), 0.0)
        """
    )


def create_session(agent_name: str, model_used: str | None, session_id: str, started_at: str, status: str) -> dict:
    with _get_conn() as conn:
        conn.execute(
            """
            INSERT INTO sessions (id, agent_name, model_used, started_at, status)
            VALUES (?, ?, ?, ?, ?)
            """,
            (session_id, agent_name, model_used, started_at, status),
        )
    return get_session(session_id)


def list_sessions() -> list[dict]:
    with _get_conn() as conn:
        rows = conn.execute(
            """
            SELECT id, agent_name, model_used, started_at, ended_at,
                   total_tokens, total_cost_usd, event_count, flag_count, compliance_score, status
            FROM sessions
            ORDER BY started_at DESC
            """
        ).fetchall()
    return [dict(r) for r in rows]


def get_session(session_id: str) -> dict | None:
    with _get_conn() as conn:
        row = conn.execute(
            """
            SELECT id, agent_name, model_used, started_at, ended_at,
                   total_tokens, total_cost_usd, event_count, flag_count, compliance_score, status
            FROM sessions
            WHERE id = ?
            """,
            (session_id,),
        ).fetchone()
    return dict(row) if row else None


def create_event(event: dict[str, Any]) -> dict:
    event_cost = calculate_cost(
        str(event.get("model") or "default"),
        int(event.get("input_tokens", 0) or 0),
        int(event.get("output_tokens", 0) or 0),
    )
    with _get_conn() as conn:
        conn.execute(
            """
            INSERT INTO events (
                id, session_id, sequence_num, prompt, response, model,
                input_tokens, output_tokens, latency_ms, timestamp, raw_json, cost_usd
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                event["id"],
                event["session_id"],
                event["sequence_num"],
                event["prompt"],
                event["response"],
                event["model"],
                event["input_tokens"],
                event["output_tokens"],
                event["latency_ms"],
                event["timestamp"],
                json.dumps(event.get("raw_json", {})),
                event_cost,
            ),
        )
        token_delta = int(event.get("input_tokens", 0) or 0) + int(event.get("output_tokens", 0) or 0)
        conn.execute(
            """
            UPDATE sessions
            SET total_cost_usd = COALESCE(total_cost_usd, 0.0) + ?,
                event_count = COALESCE(event_count, 0) + 1,
                total_tokens = COALESCE(total_tokens, 0) + ?
            WHERE id = ?
            """,
            (event_cost, token_delta, event["session_id"]),
        )
    event["cost_usd"] = event_cost
    return event


def list_events_for_session(session_id: str) -> list[dict]:
    with _get_conn() as conn:
        rows = conn.execute(
            """
            SELECT id, session_id, sequence_num, prompt, response, model,
                   input_tokens, output_tokens, latency_ms, timestamp, raw_json, cost_usd
            FROM events
            WHERE session_id = ?
            ORDER BY sequence_num ASC
            """,
            (session_id,),
        ).fetchall()

    out: list[dict] = []
    for row in rows:
        item = dict(row)
        item["raw_json"] = json.loads(item["raw_json"]) if item["raw_json"] else {}
        out.append(item)
    return out


def get_events(session_id: str) -> list[dict]:
    return list_events_for_session(session_id)


def clear_all_data() -> None:
    with _get_conn() as conn:
        conn.execute("DELETE FROM events")
        conn.execute("DELETE FROM sessions")
        conn.execute("DELETE FROM flags")
        conn.execute("DELETE FROM audit_results")

def create_flag(
    event_id: str,
    session_id: str,
    flag_type: str,
    severity: str,
    description: str,
    agent_verdict: dict | None = None,
) -> dict:
    flag_id = str(uuid.uuid4())
    created_at = datetime.now(timezone.utc).isoformat()
    with _get_conn() as conn:
        conn.execute(
            """
            INSERT INTO flags (
                id, event_id, session_id, flag_type, severity,
                description, agent_verdict, resolved, created_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                flag_id,
                event_id,
                session_id,
                flag_type,
                severity,
                description,
                json.dumps(agent_verdict or {}),
                0,
                created_at,
            ),
        )
        conn.execute(
            """
            UPDATE sessions
            SET flag_count = COALESCE(flag_count, 0) + 1
            WHERE id = ?
            """,
            (session_id,),
        )
    return get_flag(flag_id)


def get_flag(flag_id: str) -> dict | None:
    with _get_conn() as conn:
        row = conn.execute(
            """
            SELECT id, event_id, session_id, flag_type, severity,
                   description, agent_verdict, resolved, created_at
            FROM flags
            WHERE id = ?
            """,
            (flag_id,),
        ).fetchone()
    if not row:
        return None
    item = dict(row)
    item["agent_verdict"] = json.loads(item["agent_verdict"]) if item["agent_verdict"] else {}
    item["resolved"] = bool(item["resolved"])
    return item

def list_flags() -> list[dict]:
    with _get_conn() as conn:
        rows = conn.execute(
            """
            SELECT id, event_id, session_id, flag_type, severity,
                   description, agent_verdict, resolved, created_at
            FROM flags
            ORDER BY created_at DESC
            LIMIT 100
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
        cursor = conn.execute(
            "UPDATE flags SET resolved = ? WHERE id = ?",
            (1 if resolved else 0, flag_id),
        )
        if cursor.rowcount == 0:
            return None
    return get_flag(flag_id)
