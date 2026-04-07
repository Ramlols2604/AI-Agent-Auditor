import json
import sqlite3
from pathlib import Path
from typing import Any

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
                   total_tokens, total_cost_usd, flag_count, compliance_score, status
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
                   total_tokens, total_cost_usd, flag_count, compliance_score, status
            FROM sessions
            WHERE id = ?
            """,
            (session_id,),
        ).fetchone()
    return dict(row) if row else None


def create_event(event: dict[str, Any]) -> dict:
    with _get_conn() as conn:
        conn.execute(
            """
            INSERT INTO events (
                id, session_id, sequence_num, prompt, response, model,
                input_tokens, output_tokens, latency_ms, timestamp, raw_json
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
            ),
        )
    return event


def list_events_for_session(session_id: str) -> list[dict]:
    with _get_conn() as conn:
        rows = conn.execute(
            """
            SELECT id, session_id, sequence_num, prompt, response, model,
                   input_tokens, output_tokens, latency_ms, timestamp, raw_json
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