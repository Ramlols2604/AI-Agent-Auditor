from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from api.audit import router as audit_router
from api.flags import router as flags_router
from api.health import router as health_router
from api.sessions import router as sessions_router
from sdk.middleware import AuditCaptureMiddleware
from services import repository


@pytest.fixture()
def client(tmp_path: Path) -> TestClient:
    repository.DB_PATH = tmp_path / "test.db"
    repository.SCHEMA_PATH = Path(__file__).resolve().parents[1] / "db" / "schema.sql"
    repository.init_db()

    app = FastAPI()
    app.include_router(health_router)
    app.include_router(sessions_router)
    app.include_router(flags_router)
    app.include_router(audit_router)
    app.add_middleware(AuditCaptureMiddleware)
    return TestClient(app)


def _create_session_and_event(client: TestClient, risky: bool = False) -> str:
    session_resp = client.post(
        "/sessions",
        json={"agent_name": "status-check", "model_used": "gpt-4o"},
    )
    assert session_resp.status_code == 200
    session_id = session_resp.json()["id"]

    response_text = "hi"
    input_tokens = 2
    output_tokens = 3
    latency_ms = 15
    if risky:
        response_text = "r" * 700
        input_tokens = 3000
        output_tokens = 2000
        latency_ms = 4000

    event_resp = client.post(
        f"/sessions/{session_id}/events",
        json={
            "sequence_num": 1,
            "prompt": "hello",
            "response": response_text,
            "model": "gpt-4o",
            "input_tokens": input_tokens,
            "output_tokens": output_tokens,
            "latency_ms": latency_ms,
            "raw_json": {},
        },
    )
    assert event_resp.status_code == 200
    return session_id


def test_audit_flow_and_resolve_persistence(client: TestClient) -> None:
    session_id = _create_session_and_event(client, risky=True)

    audit_resp = client.post("/audit/generate", json={"session_id": session_id})
    assert audit_resp.status_code == 200
    audit_payload = audit_resp.json()
    assert audit_payload["mode"] == "heuristic-v1"
    assert audit_payload["event_count"] >= 1
    assert audit_payload["flag_created"] is True
    flag_id = audit_payload["flag_id"]

    resolve_resp = client.post(f"/flags/{flag_id}/resolve", json={"resolved": True})
    assert resolve_resp.status_code == 200
    assert resolve_resp.json()["resolved"] is True

    flags_resp = client.get(f"/flags/{session_id}")
    assert flags_resp.status_code == 200
    flags = flags_resp.json()
    assert any(f["id"] == flag_id and f["resolved"] is True for f in flags)


def test_report_contract_is_json_summary(client: TestClient) -> None:
    session_id = _create_session_and_event(client)
    client.post("/audit/generate", json={"session_id": session_id})

    report_resp = client.get(f"/audit/report/{session_id}")
    assert report_resp.status_code == 200
    payload = report_resp.json()
    assert payload["format"] == "json-summary"
    assert payload["status"] == "ready"
    assert "summary" in payload
    assert "flags_total" in payload["summary"]


def test_middleware_creates_capture_session_and_events(client: TestClient) -> None:
    # Trigger middleware capture on regular API calls.
    health_resp = client.get("/health")
    assert health_resp.status_code == 200
    client.get("/health")

    sessions = repository.list_sessions()
    middleware_sessions = [s for s in sessions if s["agent_name"] == "middleware-capture"]
    assert middleware_sessions

    middleware_session_id = middleware_sessions[0]["id"]
    events = repository.list_events_for_session(middleware_session_id)
    assert len(events) >= 2
    sequence_values = [e["sequence_num"] for e in events]
    assert sequence_values == sorted(sequence_values)
