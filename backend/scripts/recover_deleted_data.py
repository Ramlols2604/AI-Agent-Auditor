#!/usr/bin/env python3
"""
Recover sessions (and optionally events) carved from SQLite freelist pages.

After DELETE, row bytes often remain in local.db until VACUUM overwrites them.
Run with API stopped or on a copy of the database:

  cp db/local.db db/local.db.work
  python scripts/recover_deleted_data.py --db db/local.db.work --apply

  # Then swap or merge into live db:
  python scripts/recover_deleted_data.py --db db/local.db --apply
"""

from __future__ import annotations

import argparse
import re
import sqlite3
import sys
from pathlib import Path

SESSION_RE = re.compile(
    rb"([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})"
    rb"([a-zA-Z][a-zA-Z0-9_-]{2,80}?)"
    rb"(gpt-[\w.-]+|claude-[\w.-]+|gemini-[\w.-]+|http-[\w.-]+)"
    rb"(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?)",
)

EVENT_RE = re.compile(
    rb"([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})"
    rb"([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})"
    rb"(\d{1,6})",
)


def carve_sessions(blob: bytes) -> dict[str, dict]:
    found: dict[str, dict] = {}
    for m in SESSION_RE.finditer(blob):
        sid = m.group(1).decode("ascii")
        agent = m.group(2).decode("utf-8", errors="ignore").strip("-_")
        model = m.group(3).decode("ascii")
        started = m.group(4).decode("ascii")
        if not agent or len(agent) > 80:
            continue
        if sid in found:
            continue
        found[sid] = {
            "id": sid,
            "agent_name": agent,
            "model_used": model,
            "started_at": started if started.endswith("Z") else f"{started}Z",
            "status": "active",
        }
    return found


def carve_events(blob: bytes, known_sessions: set[str]) -> dict[str, dict]:
    found: dict[str, dict] = {}
    for m in EVENT_RE.finditer(blob):
        eid = m.group(1).decode("ascii")
        sid = m.group(2).decode("ascii")
        seq = int(m.group(3))
        if sid not in known_sessions:
            continue
        if eid in found:
            continue
        if seq > 500_000:
            continue
        found[eid] = {"id": eid, "session_id": sid, "sequence_num": seq}
    return found


def apply_events(conn: sqlite3.Connection, events: dict[str, dict]) -> int:
    inserted = 0
    for row in events.values():
        cur = conn.execute(
            """
            INSERT OR IGNORE INTO events (
              id, session_id, sequence_num, prompt, response, model,
              input_tokens, output_tokens, cost_usd, latency_ms, timestamp
            )
            VALUES (?, ?, ?, ?, ?, ?, 0, 0, 0.0, 0, datetime('now'))
            """,
            (
                row["id"],
                row["session_id"],
                row["sequence_num"],
                "(recovered — content not restored)",
                "(recovered)",
                "recovered",
            ),
        )
        if cur.rowcount:
            inserted += 1
    conn.commit()
    return inserted


def apply_sessions(conn: sqlite3.Connection, sessions: dict[str, dict], dry_run: bool) -> int:
    before = conn.execute("SELECT COUNT(*) FROM sessions").fetchone()[0]
    inserted = 0
    for row in sessions.values():
        cur = conn.execute(
            """
            INSERT OR IGNORE INTO sessions (id, agent_name, model_used, started_at, status)
            VALUES (?, ?, ?, ?, ?)
            """,
            (row["id"], row["agent_name"], row["model_used"], row["started_at"], row["status"]),
        )
        if cur.rowcount:
            inserted += 1
    if not dry_run:
        conn.commit()
    after = conn.execute("SELECT COUNT(*) FROM sessions").fetchone()[0]
    print(f"Sessions: {before} -> {after} (+{inserted} inserted, {len(sessions)} carved)")
    return inserted


def rollup_sessions(conn: sqlite3.Connection) -> None:
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
    conn.commit()


def main() -> int:
    parser = argparse.ArgumentParser(description="Carve deleted rows from SQLite file bytes.")
    parser.add_argument("--db", default="db/local.db", help="Path to local.db")
    parser.add_argument("--apply", action="store_true", help="Write recovered rows into DB")
    parser.add_argument("--skip-events", action="store_true", help="Only recover sessions")
    parser.add_argument(
        "--exclude-middleware",
        action="store_true",
        help="Skip middleware-capture sessions (noise from API polling / hot reload)",
    )
    args = parser.parse_args()

    db_path = Path(args.db)
    if not db_path.is_file():
        print(f"Missing database: {db_path}", file=sys.stderr)
        return 1

    print(f"Reading {db_path} ({db_path.stat().st_size / 1e6:.1f} MB)…")
    blob = db_path.read_bytes()
    sessions = carve_sessions(blob)
    if args.exclude_middleware:
        sessions = {k: v for k, v in sessions.items() if v["agent_name"] != "middleware-capture"}
    print(f"Carved {len(sessions)} unique sessions from file bytes")

    agents: dict[str, int] = {}
    for s in sessions.values():
        agents[s["agent_name"]] = agents.get(s["agent_name"], 0) + 1
    top = sorted(agents.items(), key=lambda x: -x[1])[:12]
    print("Top agent_name counts:", top)

    if not args.apply:
        print("Dry run only. Re-run with --apply to insert into the database.")
        return 0

    conn = sqlite3.connect(db_path)
    try:
        apply_sessions(conn, sessions, dry_run=False)
        if not args.skip_events:
            events = carve_events(blob, set(sessions.keys()))
            print(f"Carved {len(events)} event id/session/seq tuples (partial recovery)")
            ev_inserted = apply_events(conn, events)
            print(f"Inserted {ev_inserted} placeholder events (prompt/response text not recoverable from freelist scan)")
        rollup_sessions(conn)
        print("Note: Re-run seed scripts if you need full prompt/response content for benchmark sessions.")
    finally:
        conn.close()

    print("Done. Restart the API and refresh the dashboard.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
