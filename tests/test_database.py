import json
from server.database import Database


def test_init_creates_tables(db_path):
    db = Database(db_path)
    conn = db.get_connection()
    tables = conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table'"
    ).fetchall()
    table_names = {r[0] for r in tables}
    assert "sessions" in table_names
    assert "messages" in table_names
    assert "messages_fts" in table_names


def test_upsert_session_insert(db_path):
    db = Database(db_path)
    db.upsert_session(
        session_id="s1",
        source="claude_code",
        project="C--dev-Test",
        machine_name="PC-A",
        cwd="/dev/test",
        git_branch="main",
        session_slug="happy-fox",
        metadata={"extra": "data"},
    )
    row = db.get_session("s1")
    assert row is not None
    assert row["source"] == "claude_code"
    assert row["project"] == "C--dev-Test"
    assert row["session_slug"] == "happy-fox"


def test_upsert_session_update(db_path):
    db = Database(db_path)
    db.upsert_session(session_id="s1", source="claude_code")
    db.upsert_session(session_id="s1", source="claude_code", project="updated")
    row = db.get_session("s1")
    assert row["project"] == "updated"


def test_insert_messages_and_dedup(db_path):
    db = Database(db_path)
    db.upsert_session(session_id="s1", source="claude_code")
    messages = [
        {"message_uuid": "m1", "role": "user", "content": "hello", "timestamp": "2026-04-30T10:00:00Z"},
        {"message_uuid": "m2", "role": "assistant", "content": "hi there", "timestamp": "2026-04-30T10:00:01Z"},
    ]
    inserted = db.insert_messages("s1", messages)
    assert inserted == 2
    inserted2 = db.insert_messages("s1", messages)
    assert inserted2 == 0


def test_get_session_messages(db_path):
    db = Database(db_path)
    db.upsert_session(session_id="s1", source="claude_code")
    db.insert_messages("s1", [
        {"message_uuid": "m1", "role": "user", "content": "hello", "timestamp": "2026-04-30T10:00:00Z"},
        {"message_uuid": "m2", "role": "assistant", "content": "hi", "timestamp": "2026-04-30T10:00:01Z"},
    ])
    msgs = db.get_session_messages("s1")
    assert len(msgs) == 2
    assert msgs[0]["role"] == "user"
    assert msgs[1]["role"] == "assistant"


def test_list_recent_sessions(db_path):
    db = Database(db_path)
    db.upsert_session(session_id="s1", source="claude_code", project="proj-a")
    db.upsert_session(session_id="s2", source="claude_ai", project="proj-b")
    db.insert_messages("s1", [
        {"message_uuid": "m1", "role": "user", "content": "a", "timestamp": "2026-04-30T10:00:00Z"},
    ])
    db.insert_messages("s2", [
        {"message_uuid": "m2", "role": "user", "content": "b", "timestamp": "2026-04-30T11:00:00Z"},
    ])
    sessions = db.list_recent_sessions(limit=10)
    assert len(sessions) == 2
    assert sessions[0]["session_id"] == "s2"


def test_list_recent_sessions_filter_source(db_path):
    db = Database(db_path)
    db.upsert_session(session_id="s1", source="claude_code")
    db.upsert_session(session_id="s2", source="claude_ai")
    sessions = db.list_recent_sessions(source="claude_code")
    assert len(sessions) == 1
    assert sessions[0]["session_id"] == "s1"


def test_memory_stats(db_path):
    db = Database(db_path)
    db.upsert_session(session_id="s1", source="claude_code", project="proj-a")
    db.insert_messages("s1", [
        {"message_uuid": "m1", "role": "user", "content": "hello", "timestamp": "2026-04-30T10:00:00Z"},
    ])
    stats = db.memory_stats()
    assert stats["total_sessions"] == 1
    assert stats["total_messages"] == 1
    assert stats["by_source"]["claude_code"] == 1


def test_update_embedding(db_path):
    db = Database(db_path)
    db.upsert_session(session_id="s1", source="claude_code")
    db.insert_messages("s1", [
        {"message_uuid": "m1", "role": "user", "content": "hello", "timestamp": "2026-04-30T10:00:00Z"},
    ])
    import numpy as np
    embedding = np.zeros(1536, dtype=np.float32)
    db.update_embedding("s1", "m1", embedding.tobytes())
    row = db.get_connection().execute(
        "SELECT embedding FROM messages WHERE message_uuid='m1'"
    ).fetchone()
    assert row[0] is not None
    assert len(row[0]) == 1536 * 4


def test_fts_search(db_path):
    db = Database(db_path)
    db.upsert_session(session_id="s1", source="claude_code")
    db.insert_messages("s1", [
        {"message_uuid": "m1", "role": "user", "content": "how to configure nginx reverse proxy", "timestamp": "2026-04-30T10:00:00Z"},
        {"message_uuid": "m2", "role": "user", "content": "python list comprehension examples", "timestamp": "2026-04-30T10:00:01Z"},
    ])
    results = db.fts_search("nginx", limit=10)
    assert len(results) >= 1
    assert results[0]["message_uuid"] == "m1"


def test_get_all_embeddings(db_path):
    db = Database(db_path)
    db.upsert_session(session_id="s1", source="claude_code")
    db.insert_messages("s1", [
        {"message_uuid": "m1", "role": "user", "content": "hello", "timestamp": "2026-04-30T10:00:00Z"},
    ])
    import numpy as np
    emb = np.ones(1536, dtype=np.float32)
    db.update_embedding("s1", "m1", emb.tobytes())
    ids, embeddings = db.get_all_embeddings()
    assert len(ids) == 1
    assert embeddings.shape == (1, 1536)
