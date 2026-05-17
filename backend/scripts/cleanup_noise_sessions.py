#!/usr/bin/env python3
"""
Remove middleware-capture noise sessions and related rows from local.db.

Stop the API before running on the live database, or use a copy:

  cd backend
  python scripts/cleanup_noise_sessions.py --dry-run
  python scripts/cleanup_noise_sessions.py --apply
  python scripts/cleanup_noise_sessions.py --apply --vacuum
"""

from __future__ import annotations

import argparse
import sqlite3
import sys
from pathlib import Path

NOISE_AGENT_NAMES = ("middleware-capture",)
DEFAULT_DB = Path(__file__).resolve().parents[1] / "db" / "local.db"


def _count(conn: sqlite3.Connection, sql: str, params: tuple) -> int:
    row = conn.execute(sql, params).fetchone()
    return int(row[0]) if row else 0


def purge_noise(conn: sqlite3.Connection, *, apply: bool) -> dict[str, int]:
    placeholders = ",".join("?" for _ in NOISE_AGENT_NAMES)
    session_filter = f"session_id IN (SELECT id FROM sessions WHERE agent_name IN ({placeholders}))"
    event_filter = f"event_id IN (SELECT id FROM events WHERE {session_filter})"

    stats = {
        "sessions": _count(
            conn,
            f"SELECT COUNT(*) FROM sessions WHERE agent_name IN ({placeholders})",
            NOISE_AGENT_NAMES,
        ),
        "events": _count(
            conn,
            f"SELECT COUNT(*) FROM events WHERE {session_filter}",
            NOISE_AGENT_NAMES,
        ),
        "flags": _count(
            conn,
            f"SELECT COUNT(*) FROM flags WHERE {session_filter}",
            NOISE_AGENT_NAMES,
        ),
        "audit_results": _count(
            conn,
            f"SELECT COUNT(*) FROM audit_results WHERE {event_filter}",
            NOISE_AGENT_NAMES,
        ),
    }

    if not apply:
        return stats

    conn.execute(f"DELETE FROM audit_results WHERE {event_filter}", NOISE_AGENT_NAMES)
    conn.execute(f"DELETE FROM flags WHERE {session_filter}", NOISE_AGENT_NAMES)
    conn.execute(f"DELETE FROM events WHERE {session_filter}", NOISE_AGENT_NAMES)
    conn.execute(
        f"DELETE FROM sessions WHERE agent_name IN ({placeholders})",
        NOISE_AGENT_NAMES,
    )
    return stats


def main() -> int:
    parser = argparse.ArgumentParser(description="Delete middleware-capture noise from SQLite")
    parser.add_argument("--db", type=Path, default=DEFAULT_DB, help="Path to local.db")
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Perform deletion (default is dry-run)",
    )
    parser.add_argument(
        "--vacuum",
        action="store_true",
        help="Run VACUUM after deletion to reclaim disk space",
    )
    args = parser.parse_args()

    if not args.db.is_file():
        print(f"Database not found: {args.db}", file=sys.stderr)
        return 1

    conn = sqlite3.connect(args.db)
    try:
        mode = "APPLY" if args.apply else "DRY-RUN"
        print(f"[{mode}] {args.db}")
        stats = purge_noise(conn, apply=args.apply)
        if args.apply:
            conn.commit()
            if args.vacuum:
                conn.execute("VACUUM")
        for key, value in stats.items():
            print(f"  {key}: {value}")
        if not args.apply and any(stats.values()):
            print("\nRe-run with --apply to delete these rows.")
    finally:
        conn.close()

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
