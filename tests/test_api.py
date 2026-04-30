import os
import json
import pytest
from unittest.mock import patch, AsyncMock

os.environ["API_KEY"] = "test-key"
os.environ["OPENAI_API_KEY"] = "test-openai-key"
os.environ["DATA_DIR"] = ""


@pytest.fixture
def client(tmp_path):
    os.environ["DATA_DIR"] = str(tmp_path)
    from server.main import create_app
    from fastapi.testclient import TestClient
    app = create_app(str(tmp_path / "test.db"))
    return TestClient(app)


def test_health_no_auth(client):
    r = client.get("/health")
    assert r.status_code == 200
    data = r.json()
    assert data["ok"] is True
    assert data["total_sessions"] == 0


def test_ingest_requires_auth(client):
    r = client.post("/ingest", json={})
    assert r.status_code == 401


def test_ingest_wrong_key(client):
    r = client.post("/ingest", json={}, headers={"Authorization": "Bearer wrong"})
    assert r.status_code == 401


def test_ingest_success(client):
    payload = {
        "source": "claude_code",
        "session_id": "test-session-1",
        "project": "C--dev-Test",
        "machine_name": "PC-A",
        "messages": [
            {"uuid": "m1", "role": "user", "content": "hello", "timestamp": "2026-04-30T10:00:00Z"},
            {"uuid": "m2", "role": "assistant", "content": "hi there", "timestamp": "2026-04-30T10:00:01Z"},
        ],
        "metadata": {"cwd": "/dev/test", "git_branch": "main", "session_slug": "happy-fox"},
    }
    with patch("server.main.embed_new_messages", new_callable=AsyncMock):
        r = client.post("/ingest", json=payload, headers={"Authorization": "Bearer test-key"})
    assert r.status_code == 200
    data = r.json()
    assert data["messages_inserted"] == 2

    r2 = client.get("/health")
    assert r2.json()["total_sessions"] == 1


def test_ingest_idempotent(client):
    payload = {
        "source": "claude_code",
        "session_id": "test-session-1",
        "messages": [
            {"uuid": "m1", "role": "user", "content": "hello", "timestamp": "2026-04-30T10:00:00Z"},
        ],
    }
    with patch("server.main.embed_new_messages", new_callable=AsyncMock):
        client.post("/ingest", json=payload, headers={"Authorization": "Bearer test-key"})
        r = client.post("/ingest", json=payload, headers={"Authorization": "Bearer test-key"})
    assert r.json()["messages_inserted"] == 0
