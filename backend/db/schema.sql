-- backend/db/schema.sql
-- SQLite-first schema; Snowflake can map JSON text columns to VARIANT.
-- All primary keys are UUID strings.

CREATE TABLE IF NOT EXISTS sessions (
  id                TEXT PRIMARY KEY,
  agent_name        TEXT NOT NULL,
  model_used        TEXT,
  started_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ended_at          TIMESTAMP,
  total_tokens      INTEGER NOT NULL DEFAULT 0,
  total_cost_usd    REAL NOT NULL DEFAULT 0.0,
  flag_count        INTEGER NOT NULL DEFAULT 0,
  compliance_score  REAL,
  status            TEXT NOT NULL DEFAULT 'active',
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS events (
  id                TEXT PRIMARY KEY,
  session_id        TEXT NOT NULL,
  sequence_num      INTEGER NOT NULL,
  prompt            TEXT,
  response          TEXT,
  model             TEXT,
  input_tokens      INTEGER NOT NULL DEFAULT 0,
  output_tokens     INTEGER NOT NULL DEFAULT 0,
  latency_ms        INTEGER NOT NULL DEFAULT 0,
  timestamp         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  raw_json          TEXT,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (session_id) REFERENCES sessions(id)
);

CREATE TABLE IF NOT EXISTS flags (
  id                TEXT PRIMARY KEY,
  event_id          TEXT NOT NULL,
  session_id        TEXT NOT NULL,
  flag_type         TEXT NOT NULL,
  severity          TEXT NOT NULL,
  description       TEXT NOT NULL,
  agent_verdict     TEXT,
  resolved          INTEGER NOT NULL DEFAULT 0,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (event_id) REFERENCES events(id),
  FOREIGN KEY (session_id) REFERENCES sessions(id)
);

CREATE TABLE IF NOT EXISTS audit_results (
  id                  TEXT PRIMARY KEY,
  event_id            TEXT NOT NULL,
  hallucination_score REAL,
  safety_score        REAL,
  cost_score          REAL,
  compliance_score    REAL,
  overall_score       REAL,
  verdict             TEXT NOT NULL,
  dissent_score       REAL,
  agent_outputs       TEXT,
  created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (event_id) REFERENCES events(id)
);

CREATE INDEX IF NOT EXISTS idx_events_session_id ON events(session_id);
CREATE INDEX IF NOT EXISTS idx_flags_session_id ON flags(session_id);
CREATE INDEX IF NOT EXISTS idx_flags_event_id ON flags(event_id);
CREATE INDEX IF NOT EXISTS idx_audit_results_event_id ON audit_results(event_id);