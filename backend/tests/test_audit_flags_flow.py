from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from api.audit import router as audit_router
from api.flags import router as flags_router
from api.health import router as health_router
from api.sessions import router as sessions_router
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
    return TestClient(app)


def test_session_event_audit_flag_resolve_flow(client: TestClient) -> None:
    session_resp = client.post(
        "/sessions",
        json={"agent_name": "status-check", "model_used": "gpt-4o"},
    )
    assert session_resp.status_code == 200
    session_id = session_resp.json()["id"]

    event_resp = client.post(
        f"/sessions/{session_id}/events",
        json={
            "sequence_num": 1,
            "prompt": "hello",
            "response": "hi",
            "model": "gpt-4o",
            "input_tokens": 1,
            "output_tokens": 1,
            "latency_ms": 10,
            "raw_json": {},
        },
    )
    assert event_resp.status_code == 200

    audit_resp = client.post("/audit/generate", json={"session_id": session_id})
    assert audit_resp.status_code == 200
    audit_payload = audit_resp.json()
    assert audit_payload["flag_created"] is True
    flag_id = audit_payload["flag_id"]

    flags_before_resolve = client.get(f"/flags/{session_id}")
    assert flags_before_resolve.status_code == 200
    before_items = flags_before_resolve.json()
    assert len(before_items) == 1
    assert before_items[0]["id"] == flag_id
    assert before_items[0]["resolved"] is False

    resolve_resp = client.post(f"/flags/{flag_id}/resolve", json={"resolved": True})
    assert resolve_resp.status_code == 200
    assert resolve_resp.json()["resolved"] is True

    flags_after_resolve = client.get(f"/flags/{session_id}")
    assert flags_after_resolve.status_code == 200
    after_items = flags_after_resolve.json()
    assert len(after_items) == 1
    assert after_items[0]["id"] == flag_id
    assert after_items[0]["resolved"] is True


def test_resolve_missing_flag_returns_404(client: TestClient) -> None:
    missing_resp = client.post("/flags/not-a-real-id/resolve", json={"resolved": True})
    assert missing_resp.status_code == 404
    assert missing_resp.json()["detail"] == "Flag not found"
