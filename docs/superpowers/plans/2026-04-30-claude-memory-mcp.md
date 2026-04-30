# Claude Memory MCP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and deploy a central MCP server that indexes all Claude conversations and exposes them as searchable memory to every Claude interface.

**Architecture:** FastAPI server on Fly.io with SQLite (FTS5) + OpenAI embeddings for hybrid search. Two ingesters feed data: a PM2-managed watcher for Claude Code JSONL files, and a script for Anthropic data export ZIPs. MCP tools exposed via streamable HTTP transport using the `mcp` Python SDK.

**Tech Stack:** Python 3.12, FastAPI, SQLite/FTS5, OpenAI text-embedding-3-small, mcp SDK, numpy, Fly.io

**Spec:** `docs/superpowers/specs/2026-04-30-claude-memory-mcp-design.md`

---

## File Structure

```
claude-memory-mcp/
  Dockerfile          -- at project root (build context = project root)
  fly.toml            -- at project root
  server/
    __init__.py
    main.py           -- FastAPI app: auth middleware, /health, /ingest, mount MCP
    database.py        -- SQLite schema, CRUD (upsert_session, insert_messages, queries)
    embeddings.py      -- OpenAI API wrapper: batch embed, truncate, context-dump filter
    search.py          -- FTS5 keyword, cosine similarity, RRF fusion
    mcp_tools.py       -- FastMCP server with 4 tools
    requirements.txt
  ingesters/
    __init__.py
    sync_claude_code.py       -- JSONL watcher with offset tracking
    ingest_anthropic_export.py -- ZIP parser for claude.ai exports
    requirements.txt
  tests/
    conftest.py        -- shared fixtures (in-memory DB, mock OpenAI)
    test_database.py
    test_embeddings.py
    test_search.py
    test_api.py
    test_sync.py
  dev-requirements.txt -- pytest, pytest-asyncio, httpx
  ecosystem.config.js  -- PM2 config for watcher
```

---

### Task 1: Project scaffolding and dependencies

**Files:**
- Create: `server/requirements.txt`
- Create: `server/__init__.py`
- Create: `ingesters/requirements.txt`
- Create: `ingesters/__init__.py`
- Create: `dev-requirements.txt`
- Create: `tests/conftest.py`
- Create: `.gitignore`

- [ ] **Step 1: Create server requirements.txt**

```
fastapi==0.115.12
uvicorn[standard]==0.34.2
openai==1.82.0
numpy==2.2.5
slowapi==0.1.9
mcp[cli]>=1.9.0
```

- [ ] **Step 2: Create ingesters requirements.txt**

```
httpx==0.28.1
```

- [ ] **Step 3: Create dev-requirements.txt (test dependencies)**

```
pytest==8.3.5
pytest-asyncio==0.25.3
httpx==0.28.1
```

- [ ] **Step 4: Create .gitignore**

```
__pycache__/
*.pyc
.env
*.db
*.db-journal
.claude-memory-sync-state.json
.venv/
```

- [ ] **Step 5: Create empty __init__.py files**

Create `server/__init__.py` and `ingesters/__init__.py` (both empty).

- [ ] **Step 6: Create tests/conftest.py**

```python
import os
import pytest
from unittest.mock import AsyncMock, patch

os.environ.setdefault("API_KEY", "test-key")
os.environ.setdefault("OPENAI_API_KEY", "test-openai-key")
os.environ.setdefault("TESTING", "1")


@pytest.fixture
def db_path(tmp_path):
    return str(tmp_path / "test.db")


@pytest.fixture
def mock_openai():
    """Mock OpenAI embeddings API to return deterministic vectors."""
    async def fake_embed(texts):
        import numpy as np
        return [np.random.default_rng(hash(t) % 2**32).random(1536).astype("float32").tolist() for t in texts]

    with patch("server.embeddings.batch_embed", new_callable=AsyncMock, side_effect=fake_embed) as mock:
        yield mock
```

- [ ] **Step 7: Install dev dependencies**

Run: `cd C:/dev/claude-memory-mcp && pip install -r server/requirements.txt -r dev-requirements.txt`

- [ ] **Step 8: Commit**

```bash
git add server/requirements.txt server/__init__.py ingesters/requirements.txt ingesters/__init__.py dev-requirements.txt tests/conftest.py .gitignore
git commit -m "chore: project scaffolding and dependencies"
```

---

### Task 2: Database module

**Files:**
- Create: `server/database.py`
- Create: `tests/test_database.py`

- [ ] **Step 1: Write failing tests for database operations**

```python
# tests/test_database.py
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

    # Inserting same messages again should insert 0 new
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
    # Most recent first
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd C:/dev/claude-memory-mcp && python -m pytest tests/test_database.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'server.database'`

- [ ] **Step 3: Implement database.py**

```python
# server/database.py
import json
import sqlite3
import numpy as np
from datetime import datetime, timezone


class Database:
    def __init__(self, db_path: str):
        self._db_path = db_path
        self._conn = None
        self._init_db()

    def get_connection(self) -> sqlite3.Connection:
        if self._conn is None:
            self._conn = sqlite3.connect(self._db_path)
            self._conn.row_factory = sqlite3.Row
            self._conn.execute("PRAGMA journal_mode=WAL")
            self._conn.execute("PRAGMA foreign_keys=ON")
        return self._conn

    def _init_db(self):
        conn = self.get_connection()
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT UNIQUE NOT NULL,
                source TEXT NOT NULL,
                project TEXT,
                machine_name TEXT,
                cwd TEXT,
                git_branch TEXT,
                session_slug TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                metadata TEXT
            );

            CREATE TABLE IF NOT EXISTS messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT NOT NULL REFERENCES sessions(session_id),
                message_uuid TEXT NOT NULL,
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                timestamp TEXT NOT NULL,
                embedding BLOB,
                UNIQUE(session_id, message_uuid)
            );

            CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);
            CREATE INDEX IF NOT EXISTS idx_sessions_source ON sessions(source);
            CREATE INDEX IF NOT EXISTS idx_sessions_project ON sessions(project);
            CREATE INDEX IF NOT EXISTS idx_sessions_updated ON sessions(updated_at);
        """)
        # FTS5 table + triggers (idempotent via IF NOT EXISTS for table,
        # but triggers need try/except since SQLite has no IF NOT EXISTS for triggers)
        conn.execute("""
            CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
                content,
                content_rowid='id',
                content='messages'
            )
        """)
        for trigger_sql in [
            """CREATE TRIGGER messages_ai AFTER INSERT ON messages BEGIN
                INSERT INTO messages_fts(rowid, content) VALUES (new.id, new.content);
            END""",
            """CREATE TRIGGER messages_ad AFTER DELETE ON messages BEGIN
                INSERT INTO messages_fts(messages_fts, rowid, content) VALUES('delete', old.id, old.content);
            END""",
            """CREATE TRIGGER messages_au AFTER UPDATE ON messages BEGIN
                INSERT INTO messages_fts(messages_fts, rowid, content) VALUES('delete', old.id, old.content);
                INSERT INTO messages_fts(rowid, content) VALUES (new.id, new.content);
            END""",
        ]:
            try:
                conn.execute(trigger_sql)
            except sqlite3.OperationalError:
                pass  # trigger already exists
        conn.commit()

    def upsert_session(self, session_id: str, source: str, project: str = None,
                       machine_name: str = None, cwd: str = None, git_branch: str = None,
                       session_slug: str = None, metadata: dict = None):
        now = datetime.now(timezone.utc).isoformat()
        conn = self.get_connection()
        conn.execute("""
            INSERT INTO sessions (session_id, source, project, machine_name, cwd, git_branch, session_slug, created_at, updated_at, metadata)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(session_id) DO UPDATE SET
                project = COALESCE(excluded.project, sessions.project),
                machine_name = COALESCE(excluded.machine_name, sessions.machine_name),
                cwd = COALESCE(excluded.cwd, sessions.cwd),
                git_branch = COALESCE(excluded.git_branch, sessions.git_branch),
                session_slug = COALESCE(excluded.session_slug, sessions.session_slug),
                updated_at = excluded.updated_at,
                metadata = COALESCE(excluded.metadata, sessions.metadata)
        """, (session_id, source, project, machine_name, cwd, git_branch, session_slug,
              now, now, json.dumps(metadata) if metadata else None))
        conn.commit()

    def get_session(self, session_id: str) -> dict | None:
        conn = self.get_connection()
        row = conn.execute("SELECT * FROM sessions WHERE session_id = ?", (session_id,)).fetchone()
        return dict(row) if row else None

    def insert_messages(self, session_id: str, messages: list[dict]) -> int:
        conn = self.get_connection()
        inserted = 0
        for msg in messages:
            try:
                conn.execute("""
                    INSERT INTO messages (session_id, message_uuid, role, content, timestamp)
                    VALUES (?, ?, ?, ?, ?)
                """, (session_id, msg["message_uuid"], msg["role"], msg["content"], msg["timestamp"]))
                inserted += 1
            except sqlite3.IntegrityError:
                pass  # duplicate, skip
        conn.commit()
        return inserted

    def get_session_messages(self, session_id: str) -> list[dict]:
        conn = self.get_connection()
        rows = conn.execute(
            "SELECT message_uuid, role, content, timestamp FROM messages WHERE session_id = ? ORDER BY timestamp",
            (session_id,)
        ).fetchall()
        return [dict(r) for r in rows]

    def list_recent_sessions(self, limit: int = 20, source: str = None,
                             project: str = None, days: int = None) -> list[dict]:
        conn = self.get_connection()
        query = """
            SELECT s.session_id, s.source, s.project, s.machine_name, s.session_slug,
                   s.created_at, s.updated_at,
                   COUNT(m.id) as message_count,
                   MIN(m.timestamp) as first_message,
                   MAX(m.timestamp) as last_message
            FROM sessions s
            LEFT JOIN messages m ON s.session_id = m.session_id
            WHERE 1=1
        """
        params = []
        if source:
            query += " AND s.source = ?"
            params.append(source)
        if project:
            query += " AND s.project = ?"
            params.append(project)
        if days:
            query += " AND s.updated_at >= datetime('now', ?)"
            params.append(f"-{days} days")
        query += " GROUP BY s.session_id ORDER BY s.updated_at DESC LIMIT ?"
        params.append(limit)
        rows = conn.execute(query, params).fetchall()
        return [dict(r) for r in rows]

    def memory_stats(self) -> dict:
        conn = self.get_connection()
        total_sessions = conn.execute("SELECT COUNT(*) FROM sessions").fetchone()[0]
        total_messages = conn.execute("SELECT COUNT(*) FROM messages").fetchone()[0]
        by_source_rows = conn.execute(
            "SELECT source, COUNT(*) as cnt FROM sessions GROUP BY source"
        ).fetchall()
        by_source = {r[0]: r[1] for r in by_source_rows}
        by_project_rows = conn.execute(
            "SELECT project, COUNT(*) as cnt FROM sessions WHERE project IS NOT NULL GROUP BY project"
        ).fetchall()
        by_project = {r[0]: r[1] for r in by_project_rows}
        return {
            "total_sessions": total_sessions,
            "total_messages": total_messages,
            "by_source": by_source,
            "by_project": by_project,
        }

    def update_embedding(self, session_id: str, message_uuid: str, embedding_bytes: bytes):
        conn = self.get_connection()
        conn.execute(
            "UPDATE messages SET embedding = ? WHERE session_id = ? AND message_uuid = ?",
            (embedding_bytes, session_id, message_uuid)
        )
        conn.commit()

    def fts_search(self, query: str, limit: int = 20, source: str = None,
                   project: str = None, days: int = None) -> list[dict]:
        conn = self.get_connection()
        sql = """
            SELECT m.id, m.session_id, m.message_uuid, m.role, m.content, m.timestamp,
                   s.source, s.project,
                   rank
            FROM messages_fts fts
            JOIN messages m ON m.id = fts.rowid
            JOIN sessions s ON s.session_id = m.session_id
            WHERE messages_fts MATCH ?
        """
        params = [query]
        if source:
            sql += " AND s.source = ?"
            params.append(source)
        if project:
            sql += " AND s.project = ?"
            params.append(project)
        if days:
            sql += " AND m.timestamp >= datetime('now', ?)"
            params.append(f"-{days} days")
        sql += " ORDER BY rank LIMIT ?"
        params.append(limit)
        rows = conn.execute(sql, params).fetchall()
        return [dict(r) for r in rows]

    def get_all_embeddings(self, source: str = None, project: str = None,
                           days: int = None) -> tuple[list[int], np.ndarray]:
        conn = self.get_connection()
        sql = """
            SELECT m.id, m.embedding
            FROM messages m
            JOIN sessions s ON s.session_id = m.session_id
            WHERE m.embedding IS NOT NULL
        """
        params = []
        if source:
            sql += " AND s.source = ?"
            params.append(source)
        if project:
            sql += " AND s.project = ?"
            params.append(project)
        if days:
            sql += " AND m.timestamp >= datetime('now', ?)"
            params.append(f"-{days} days")
        rows = conn.execute(sql, params).fetchall()
        if not rows:
            return [], np.empty((0, 1536), dtype=np.float32)
        ids = [r[0] for r in rows]
        embeddings = np.array(
            [np.frombuffer(r[1], dtype=np.float32) for r in rows],
            dtype=np.float32
        )
        return ids, embeddings

    def get_messages_by_ids(self, message_ids: list[int]) -> list[dict]:
        conn = self.get_connection()
        placeholders = ",".join("?" * len(message_ids))
        rows = conn.execute(f"""
            SELECT m.id, m.session_id, m.message_uuid, m.role, m.content, m.timestamp,
                   s.source, s.project
            FROM messages m
            JOIN sessions s ON s.session_id = m.session_id
            WHERE m.id IN ({placeholders})
        """, message_ids).fetchall()
        return [dict(r) for r in rows]

    def get_messages_needing_embedding(self, session_id: str) -> list[dict]:
        conn = self.get_connection()
        rows = conn.execute("""
            SELECT message_uuid, content FROM messages
            WHERE session_id = ? AND embedding IS NULL
        """, (session_id,)).fetchall()
        return [dict(r) for r in rows]
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd C:/dev/claude-memory-mcp && python -m pytest tests/test_database.py -v`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add server/database.py tests/test_database.py
git commit -m "feat: database module with schema, CRUD, FTS5"
```

---

### Task 3: Embeddings module

**Files:**
- Create: `server/embeddings.py`
- Create: `tests/test_embeddings.py`

- [ ] **Step 1: Write failing tests**

```python
# tests/test_embeddings.py
from unittest.mock import AsyncMock, patch, MagicMock
import pytest
from server.embeddings import truncate_for_embedding, should_skip_embedding, batch_embed


def test_truncate_short_text():
    text = "hello world"
    result = truncate_for_embedding(text)
    assert result == text


def test_truncate_long_text():
    # 6000 tokens ~ 24000 chars (rough estimate: 1 token ~ 4 chars)
    text = "word " * 10000  # ~50000 chars
    result = truncate_for_embedding(text)
    assert len(result) <= 24000


def test_should_skip_embedding_short():
    assert should_skip_embedding("hello world") is False


def test_should_skip_embedding_context_dump():
    huge_text = "x" * 20001
    assert should_skip_embedding(huge_text) is True


def test_should_skip_embedding_at_boundary():
    text = "x" * 20000
    assert should_skip_embedding(text) is False


@pytest.mark.asyncio
async def test_batch_embed():
    mock_response = MagicMock()
    mock_response.data = [
        MagicMock(embedding=[0.1] * 1536),
        MagicMock(embedding=[0.2] * 1536),
    ]
    mock_client = MagicMock()
    mock_client.embeddings.create = AsyncMock(return_value=mock_response)

    with patch("server.embeddings._get_client", return_value=mock_client):
        results = await batch_embed(["hello", "world"])
        assert len(results) == 2
        assert len(results[0]) == 1536
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd C:/dev/claude-memory-mcp && python -m pytest tests/test_embeddings.py -v`
Expected: FAIL

- [ ] **Step 3: Implement embeddings.py**

```python
# server/embeddings.py
import os
from openai import AsyncOpenAI

_client = None
MODEL = "text-embedding-3-small"
MAX_EMBED_CHARS = 24000  # ~6000 tokens
CONTEXT_DUMP_THRESHOLD = 20000


def _get_client() -> AsyncOpenAI:
    global _client
    if _client is None:
        _client = AsyncOpenAI(api_key=os.environ["OPENAI_API_KEY"])
    return _client


def truncate_for_embedding(text: str) -> str:
    if len(text) <= MAX_EMBED_CHARS:
        return text
    return text[:MAX_EMBED_CHARS]


def should_skip_embedding(text: str) -> bool:
    return len(text) > CONTEXT_DUMP_THRESHOLD


async def batch_embed(texts: list[str]) -> list[list[float]]:
    if not texts:
        return []
    client = _get_client()
    # OpenAI supports up to 2048 inputs per batch
    all_embeddings = []
    for i in range(0, len(texts), 2048):
        batch = texts[i:i + 2048]
        response = await client.embeddings.create(model=MODEL, input=batch)
        all_embeddings.extend([d.embedding for d in response.data])
    return all_embeddings
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd C:/dev/claude-memory-mcp && python -m pytest tests/test_embeddings.py -v`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add server/embeddings.py tests/test_embeddings.py
git commit -m "feat: embeddings module with OpenAI API, truncation, batching"
```

---

### Task 4: Search module

**Files:**
- Create: `server/search.py`
- Create: `tests/test_search.py`

- [ ] **Step 1: Write failing tests**

```python
# tests/test_search.py
import numpy as np
from server.search import cosine_search, rrf_fuse


def test_cosine_search_basic():
    query = np.array([1.0, 0.0, 0.0], dtype=np.float32)
    embeddings = np.array([
        [1.0, 0.0, 0.0],  # identical to query
        [0.0, 1.0, 0.0],  # orthogonal
        [0.7, 0.7, 0.0],  # partial match
    ], dtype=np.float32)
    ids = [10, 20, 30]
    results = cosine_search(query, embeddings, ids, top_k=2)
    assert results[0][0] == 10  # most similar
    assert results[0][1] > 0.99
    assert results[1][0] == 30  # second


def test_cosine_search_empty():
    query = np.array([1.0, 0.0], dtype=np.float32)
    embeddings = np.empty((0, 2), dtype=np.float32)
    results = cosine_search(query, embeddings, [], top_k=5)
    assert results == []


def test_cosine_search_zero_vector():
    query = np.array([1.0, 0.0], dtype=np.float32)
    embeddings = np.array([[0.0, 0.0], [1.0, 0.0]], dtype=np.float32)
    ids = [1, 2]
    results = cosine_search(query, embeddings, ids, top_k=2)
    # Should not crash — zero vector gets near-zero similarity
    assert len(results) == 2


def test_rrf_fuse_combines():
    keyword = [(1, 0.9), (2, 0.8), (3, 0.7)]
    semantic = [(2, 0.95), (4, 0.85), (1, 0.75)]
    fused = rrf_fuse(keyword, semantic)
    # ID 2 appears in both — should rank highest
    assert fused[0][0] == 2
    # ID 1 also in both
    assert fused[1][0] == 1


def test_rrf_fuse_empty_inputs():
    assert rrf_fuse([], []) == []


def test_rrf_fuse_one_empty():
    keyword = [(1, 0.9), (2, 0.8)]
    fused = rrf_fuse(keyword, [])
    assert len(fused) == 2
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd C:/dev/claude-memory-mcp && python -m pytest tests/test_search.py -v`
Expected: FAIL

- [ ] **Step 3: Implement search.py**

```python
# server/search.py
import numpy as np


def cosine_search(query_embedding: np.ndarray, all_embeddings: np.ndarray,
                  all_ids: list[int], top_k: int = 20) -> list[tuple[int, float]]:
    if len(all_ids) == 0:
        return []
    query = np.asarray(query_embedding, dtype=np.float32)
    norms = np.linalg.norm(all_embeddings, axis=1) * np.linalg.norm(query) + 1e-10
    sims = all_embeddings @ query / norms
    k = min(top_k, len(all_ids))
    top_indices = np.argsort(sims)[-k:][::-1]
    return [(all_ids[i], float(sims[i])) for i in top_indices]


def rrf_fuse(keyword_results: list[tuple[int, float]],
             semantic_results: list[tuple[int, float]],
             k: int = 60) -> list[tuple[int, float]]:
    scores: dict[int, float] = {}
    for rank, (msg_id, _) in enumerate(keyword_results):
        scores[msg_id] = scores.get(msg_id, 0) + 1.0 / (k + rank + 1)
    for rank, (msg_id, _) in enumerate(semantic_results):
        scores[msg_id] = scores.get(msg_id, 0) + 1.0 / (k + rank + 1)
    return sorted(scores.items(), key=lambda x: x[1], reverse=True)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd C:/dev/claude-memory-mcp && python -m pytest tests/test_search.py -v`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add server/search.py tests/test_search.py
git commit -m "feat: search module with cosine similarity and RRF fusion"
```

---

### Task 5: MCP tools module

**Files:**
- Create: `server/mcp_tools.py`

- [ ] **Step 1: Implement mcp_tools.py**

Uses `mcp` SDK's `FastMCP` to define tools. The database and embedding functions are injected at startup.

```python
# server/mcp_tools.py
import json
import numpy as np
from mcp.server.fastmcp import FastMCP
from server.database import Database
from server.embeddings import batch_embed
from server.search import cosine_search, rrf_fuse

mcp = FastMCP("claude-memory")

# Database instance set at startup by main.py
_db: Database | None = None


def init_mcp(db: Database):
    global _db
    _db = db


@mcp.tool()
async def search_memory(query: str, limit: int = 10, source: str = "",
                        project: str = "", days: int = 0) -> str:
    """Search across all your Claude conversations by keyword and meaning.

    Args:
        query: What to search for
        limit: Max results to return (default 10)
        source: Filter by source — 'claude_code' or 'claude_ai' (optional)
        project: Filter by project slug, e.g. 'C--dev-AutoPipe' (optional)
        days: Only search messages from the last N days (optional, 0 = all time)
    """
    src = source or None
    proj = project or None
    d = days or None

    # Keyword search via FTS5
    try:
        keyword_results = _db.fts_search(query, limit=limit * 2, source=src, project=proj, days=d)
        keyword_pairs = [(r["id"], r["rank"]) for r in keyword_results]
    except Exception:
        keyword_pairs = []

    # Semantic search via embeddings
    query_emb = await batch_embed([query])
    ids, embeddings = _db.get_all_embeddings(source=src, project=proj, days=d)
    if len(ids) > 0:
        semantic_pairs = cosine_search(
            np.array(query_emb[0], dtype=np.float32),
            embeddings, ids, top_k=limit * 2
        )
    else:
        semantic_pairs = []

    # Fuse with RRF
    fused = rrf_fuse(keyword_pairs, semantic_pairs)[:limit]

    # Fetch full message data
    if not fused:
        return json.dumps({"results": [], "total": 0})
    msg_ids = [f[0] for f in fused]
    messages = _db.get_messages_by_ids(msg_ids)
    scores = {f[0]: f[1] for f in fused}

    results = []
    for msg in messages:
        results.append({
            "content": msg["content"][:2000],  # truncate for response
            "role": msg["role"],
            "session_id": msg["session_id"],
            "project": msg["project"],
            "source": msg["source"],
            "timestamp": msg["timestamp"],
            "score": scores.get(msg["id"], 0),
        })
    results.sort(key=lambda x: x["score"], reverse=True)
    return json.dumps({"results": results, "total": len(results)})


@mcp.tool()
async def get_session(session_id: str) -> str:
    """Retrieve a full conversation by session ID.

    Args:
        session_id: The UUID of the session to retrieve
    """
    session = _db.get_session(session_id)
    if not session:
        return json.dumps({"error": "Session not found"})
    messages = _db.get_session_messages(session_id)
    return json.dumps({
        "session": {
            "session_id": session["session_id"],
            "source": session["source"],
            "project": session["project"],
            "machine_name": session["machine_name"],
            "session_slug": session["session_slug"],
            "created_at": session["created_at"],
            "updated_at": session["updated_at"],
        },
        "messages": [
            {"role": m["role"], "content": m["content"][:5000], "timestamp": m["timestamp"]}
            for m in messages
        ],
    })


@mcp.tool()
async def list_recent_sessions(limit: int = 20, source: str = "",
                                project: str = "", days: int = 0) -> str:
    """List recent Claude sessions with summaries.

    Args:
        limit: Max sessions to return (default 20)
        source: Filter by 'claude_code' or 'claude_ai' (optional)
        project: Filter by project slug (optional)
        days: Only sessions from the last N days (optional, 0 = all time)
    """
    sessions = _db.list_recent_sessions(
        limit=limit,
        source=source or None,
        project=project or None,
        days=days or None,
    )
    return json.dumps({"sessions": sessions, "total": len(sessions)})


@mcp.tool()
async def memory_stats() -> str:
    """Get counts of indexed sessions and messages, grouped by source and project."""
    stats = _db.memory_stats()
    return json.dumps(stats)
```

- [ ] **Step 2: Commit**

```bash
git add server/mcp_tools.py
git commit -m "feat: MCP tools with search_memory, get_session, list_recent, stats"
```

---

### Task 6: FastAPI app with auth, ingest, and MCP mount

**Files:**
- Create: `server/main.py`
- Create: `tests/test_api.py`

- [ ] **Step 1: Write failing tests for API endpoints**

```python
# tests/test_api.py
import os
import json
import pytest
from unittest.mock import patch, AsyncMock

os.environ["API_KEY"] = "test-key"
os.environ["OPENAI_API_KEY"] = "test-openai-key"
os.environ["DATA_DIR"] = ""  # will be overridden per test


@pytest.fixture
def client(tmp_path):
    os.environ["DATA_DIR"] = str(tmp_path)
    # Must import after setting env vars
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

    # Verify via health
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd C:/dev/claude-memory-mcp && python -m pytest tests/test_api.py -v`
Expected: FAIL

- [ ] **Step 3: Implement main.py**

```python
# server/main.py
import os
import numpy as np
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from slowapi import Limiter
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from server.database import Database
from server.embeddings import batch_embed, truncate_for_embedding, should_skip_embedding
from server.mcp_tools import mcp, init_mcp

API_KEY = os.environ.get("API_KEY", "")
DATA_DIR = os.environ.get("DATA_DIR", "/data")

_db: Database | None = None

limiter = Limiter(key_func=get_remote_address)


class IngestMessage(BaseModel):
    uuid: str
    role: str
    content: str
    timestamp: str


class IngestRequest(BaseModel):
    source: str
    session_id: str
    project: str = None
    machine_name: str = None
    messages: list[IngestMessage] = []
    metadata: dict = None


async def embed_new_messages(db: Database, session_id: str):
    msgs = db.get_messages_needing_embedding(session_id)
    if not msgs:
        return
    to_embed = []
    uuid_map = []
    for m in msgs:
        if should_skip_embedding(m["content"]):
            continue
        to_embed.append(truncate_for_embedding(m["content"]))
        uuid_map.append(m["message_uuid"])
    if not to_embed:
        return
    embeddings = await batch_embed(to_embed)
    for message_uuid, emb in zip(uuid_map, embeddings):
        emb_bytes = np.array(emb, dtype=np.float32).tobytes()
        db.update_embedding(session_id, message_uuid, emb_bytes)


def create_app(db_path: str = None) -> FastAPI:
    global _db
    if db_path is None:
        db_path = os.path.join(DATA_DIR, "memory.db")
    _db = Database(db_path)
    init_mcp(_db)

    app = FastAPI(title="Claude Memory MCP")
    app.state.limiter = limiter

    @app.exception_handler(RateLimitExceeded)
    async def rate_limit_handler(request, exc):
        return JSONResponse(status_code=429, content={"detail": "Rate limit exceeded"})

    @app.middleware("http")
    async def auth_middleware(request: Request, call_next):
        # Skip auth for health
        if request.url.path in ("/health", "/docs", "/openapi.json"):
            return await call_next(request)
        # Check Bearer token
        auth = request.headers.get("Authorization", "")
        if not auth.startswith("Bearer ") or auth[7:] != API_KEY:
            return JSONResponse(status_code=401, content={"detail": "Invalid API key"})
        return await call_next(request)

    @app.get("/health")
    async def health():
        stats = _db.memory_stats()
        return {"ok": True, **stats}

    @app.post("/ingest")
    @limiter.limit("30/minute")
    async def ingest(request: Request, req: IngestRequest):
        metadata = req.metadata or {}
        _db.upsert_session(
            session_id=req.session_id,
            source=req.source,
            project=req.project,
            machine_name=req.machine_name,
            cwd=metadata.get("cwd"),
            git_branch=metadata.get("git_branch"),
            session_slug=metadata.get("session_slug"),
            metadata=metadata,
        )
        messages = [
            {
                "message_uuid": m.uuid,
                "role": m.role,
                "content": m.content,
                "timestamp": m.timestamp,
            }
            for m in req.messages
        ]
        inserted = _db.insert_messages(req.session_id, messages)

        # Embed new messages
        if inserted > 0:
            await embed_new_messages(_db, req.session_id)

        return {"ok": True, "session_id": req.session_id, "messages_inserted": inserted}

    # Mount MCP at /mcp
    mcp_app = mcp.streamable_http_app()
    app.mount("/mcp", mcp_app)

    return app


# Entry point for uvicorn — guarded so tests don't trigger it on import
if os.environ.get("TESTING") != "1":
    app = create_app()
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd C:/dev/claude-memory-mcp && python -m pytest tests/test_api.py -v`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add server/main.py tests/test_api.py
git commit -m "feat: FastAPI app with auth, /health, /ingest, MCP mount"
```

---

### Task 7: Deployment files (Dockerfile + fly.toml)

**Files:**
- Create: `Dockerfile` (project root)
- Create: `fly.toml` (project root)

- [ ] **Step 1: Create Dockerfile at project root**

```dockerfile
FROM python:3.12-slim

WORKDIR /app
COPY server/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY server/ ./server/

EXPOSE 8080
CMD ["uvicorn", "server.main:create_app", "--factory", "--host", "0.0.0.0", "--port", "8080"]
```

Note: Uses `--factory` flag so uvicorn calls `create_app()` instead of importing a module-level `app`. This avoids the guarded `if TESTING` check entirely.

- [ ] **Step 2: Create fly.toml at project root**

```toml
app = "owen-claude-memory"
primary_region = "lax"

[build]
  dockerfile = "Dockerfile"

[env]
  DATA_DIR = "/data"

[http_service]
  internal_port = 8080
  force_https = true
  auto_stop_machines = "stop"
  auto_start_machines = true
  min_machines_running = 1

[mounts]
  source = "memory_data"
  destination = "/data"

[[vm]]
  memory = "512mb"
  cpu_kind = "shared"
  cpus = 1
```

Note: `min_machines_running = 1` keeps the server warm, avoiding MCP timeout on cold starts.

- [ ] **Step 3: Commit**

```bash
git add Dockerfile fly.toml
git commit -m "chore: add Dockerfile and fly.toml for Fly.io deployment"
```

---

### Task 8: Deploy to Fly.io

- [ ] **Step 1: Generate API key**

```bash
python -c "import secrets; print(secrets.token_urlsafe(32))"
```

Save the output — used for `API_KEY` secret and client configs.

- [ ] **Step 2: Create Fly app and volume**

```bash
cd C:/dev/claude-memory-mcp
"C:/Users/Owen/.fly/bin/flyctl.exe" apps create owen-claude-memory --machines
"C:/Users/Owen/.fly/bin/flyctl.exe" volumes create memory_data --size 1 --region lax -a owen-claude-memory
```

- [ ] **Step 3: Set secrets**

```bash
"C:/Users/Owen/.fly/bin/flyctl.exe" secrets set API_KEY=<generated-key> -a owen-claude-memory
"C:/Users/Owen/.fly/bin/flyctl.exe" secrets set OPENAI_API_KEY=<your-openai-key> -a owen-claude-memory
```

The OpenAI key is already in `.claude.json` at line 976. Use the same key.

- [ ] **Step 4: Deploy**

```bash
cd C:/dev/claude-memory-mcp
"C:/Users/Owen/.fly/bin/flyctl.exe" deploy -a owen-claude-memory
```

- [ ] **Step 5: Verify health endpoint**

```bash
curl https://owen-claude-memory.fly.dev/health
```

Expected: `{"ok":true,"total_sessions":0,"total_messages":0,"by_source":{},"by_project":{}}`

- [ ] **Step 6: Commit any deployment adjustments**

---

### Task 9: Claude Code watcher ingester

**Files:**
- Create: `ingesters/sync_claude_code.py`
- Create: `tests/test_sync.py`

- [ ] **Step 1: Write failing tests for JSONL parsing**

```python
# tests/test_sync.py
import json
import os
import pytest
from ingesters.sync_claude_code import extract_content, parse_jsonl_entry, should_include_entry


def make_entry(type_="user", role="user", content="hello", uuid="u1", timestamp="2026-04-30T10:00:00Z"):
    entry = {
        "type": type_,
        "uuid": uuid,
        "timestamp": timestamp,
        "sessionId": "s1",
        "message": {
            "role": role,
            "content": content,
        },
    }
    return entry


def test_should_include_user():
    assert should_include_entry(make_entry(type_="user")) is True


def test_should_include_assistant():
    assert should_include_entry(make_entry(type_="assistant", role="assistant")) is True


def test_should_exclude_progress():
    assert should_include_entry(make_entry(type_="progress")) is False


def test_extract_content_string():
    assert extract_content("hello world") == "hello world"


def test_extract_content_array_text_only():
    content = [
        {"type": "text", "text": "hello "},
        {"type": "text", "text": "world"},
    ]
    assert extract_content(content) == "hello world"


def test_extract_content_array_skip_tool_use():
    content = [
        {"type": "text", "text": "thinking..."},
        {"type": "tool_use", "id": "t1", "name": "Bash", "input": {}},
    ]
    assert extract_content(content) == "thinking..."


def test_extract_content_array_skip_thinking():
    content = [
        {"type": "thinking", "thinking": "hmm"},
        {"type": "text", "text": "answer"},
    ]
    assert extract_content(content) == "answer"


def test_extract_content_thinking_only():
    content = [{"type": "thinking", "thinking": "hmm"}]
    assert extract_content(content) == ""


def test_extract_content_tool_result():
    content = [{"type": "tool_result", "tool_use_id": "t1", "content": "output"}]
    assert extract_content(content) == ""


def test_parse_jsonl_entry_valid():
    entry = make_entry()
    result = parse_jsonl_entry(entry)
    assert result is not None
    assert result["uuid"] == "u1"
    assert result["role"] == "user"
    assert result["content"] == "hello"


def test_parse_jsonl_entry_empty_content():
    entry = make_entry(content=[{"type": "thinking", "thinking": "..."}])
    result = parse_jsonl_entry(entry)
    assert result is None  # skip empty


def test_parse_jsonl_entry_progress():
    entry = make_entry(type_="progress")
    result = parse_jsonl_entry(entry)
    assert result is None
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd C:/dev/claude-memory-mcp && python -m pytest tests/test_sync.py -v`
Expected: FAIL

- [ ] **Step 3: Implement sync_claude_code.py**

```python
# ingesters/sync_claude_code.py
"""
Claude Code session watcher.
Scans ~/.claude/projects/ for JSONL session files,
extracts user/assistant messages, and POSTs to the Memory MCP server.

Usage:
  python sync_claude_code.py              # one-shot sync
  python sync_claude_code.py --watch      # continuous 60s polling

Environment variables:
  MEMORY_SERVER_URL  - e.g. https://owen-claude-memory.fly.dev
  API_KEY            - Bearer token for /ingest
  CLAUDE_PROJECTS_DIR - override ~/.claude/projects (optional)
"""
import argparse
import json
import os
import platform
import time
import glob
import httpx


def get_default_projects_dir() -> str:
    home = os.path.expanduser("~")
    return os.path.join(home, ".claude", "projects")


def should_include_entry(entry: dict) -> bool:
    return entry.get("type") in ("user", "assistant")


def extract_content(content) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        texts = []
        for block in content:
            if isinstance(block, dict) and block.get("type") == "text":
                texts.append(block.get("text", ""))
        return "".join(texts)
    return ""


def parse_jsonl_entry(entry: dict) -> dict | None:
    if not should_include_entry(entry):
        return None
    message = entry.get("message", {})
    content = extract_content(message.get("content", ""))
    if not content.strip():
        return None
    return {
        "uuid": entry.get("uuid", ""),
        "role": message.get("role", "unknown"),
        "content": content,
        "timestamp": entry.get("timestamp", ""),
    }


def parse_session_file(filepath: str, offset: int = 0) -> tuple[list[dict], dict, int]:
    """Parse a JSONL file from offset. Returns (messages, metadata, new_offset)."""
    messages = []
    metadata = {}
    with open(filepath, "r", encoding="utf-8") as f:
        f.seek(offset)
        data = f.read()
        new_offset = offset + len(data.encode("utf-8"))

    for line in data.strip().split("\n"):
        if not line.strip():
            continue
        try:
            entry = json.loads(line)
        except json.JSONDecodeError:
            continue

        # Extract metadata from first valid entry
        if not metadata and entry.get("sessionId"):
            metadata = {
                "session_id": entry.get("sessionId", ""),
                "cwd": entry.get("cwd", ""),
                "git_branch": entry.get("gitBranch", ""),
                "session_slug": entry.get("slug", ""),
            }

        parsed = parse_jsonl_entry(entry)
        if parsed:
            messages.append(parsed)

    return messages, metadata, new_offset


def load_state(state_path: str) -> dict:
    if os.path.exists(state_path):
        with open(state_path, "r") as f:
            return json.load(f)
    return {}


def save_state(state_path: str, state: dict):
    with open(state_path, "w") as f:
        json.dump(state, f, indent=2)


def find_session_files(projects_dir: str) -> list[str]:
    """Find all .jsonl session files, including subagent files."""
    patterns = [
        os.path.join(projects_dir, "*", "*.jsonl"),
        os.path.join(projects_dir, "*", "*", "subagents", "*.jsonl"),
    ]
    files = []
    for pattern in patterns:
        files.extend(glob.glob(pattern))
    return files


def sync_once(projects_dir: str, server_url: str, api_key: str, state_path: str):
    state = load_state(state_path)
    files = find_session_files(projects_dir)
    machine_name = platform.node()

    for filepath in files:
        file_key = filepath.replace("\\", "/")
        file_size = os.path.getsize(filepath)
        last_offset = state.get(file_key, 0)

        if file_size <= last_offset:
            continue  # no new data

        # Derive project from directory structure
        rel = os.path.relpath(filepath, projects_dir)
        parts = rel.replace("\\", "/").split("/")
        project_slug = parts[0] if parts else "unknown"

        # Determine session_id from filename
        basename = os.path.basename(filepath)
        session_id = basename.replace(".jsonl", "")
        # For subagent files, prefix with parent session
        if "subagents" in filepath.replace("\\", "/"):
            parent_session = parts[1] if len(parts) > 2 else ""
            session_id = f"{parent_session}/sub/{session_id}"

        messages, metadata, new_offset = parse_session_file(filepath, last_offset)

        if messages:
            payload = {
                "source": "claude_code",
                "session_id": metadata.get("session_id", session_id),
                "project": project_slug,
                "machine_name": machine_name,
                "messages": [
                    {"uuid": m["uuid"], "role": m["role"], "content": m["content"], "timestamp": m["timestamp"]}
                    for m in messages
                ],
                "metadata": {
                    "cwd": metadata.get("cwd", ""),
                    "git_branch": metadata.get("git_branch", ""),
                    "session_slug": metadata.get("session_slug", ""),
                },
            }
            try:
                r = httpx.post(
                    f"{server_url}/ingest",
                    json=payload,
                    headers={"Authorization": f"Bearer {api_key}"},
                    timeout=30,
                )
                if r.status_code == 200:
                    state[file_key] = new_offset
                    print(f"  Synced {len(messages)} msgs from {basename}")
                else:
                    print(f"  Failed {basename}: {r.status_code} {r.text[:200]}")
            except Exception as e:
                print(f"  Error syncing {basename}: {e}")
        else:
            # No messages but still advance offset
            state[file_key] = new_offset

    save_state(state_path, state)


def main():
    parser = argparse.ArgumentParser(description="Sync Claude Code sessions to Memory MCP")
    parser.add_argument("--watch", action="store_true", help="Poll every 60 seconds")
    parser.add_argument("--interval", type=int, default=60, help="Poll interval in seconds")
    args = parser.parse_args()

    server_url = os.environ.get("MEMORY_SERVER_URL", "").rstrip("/")
    api_key = os.environ.get("API_KEY", "")
    projects_dir = os.environ.get("CLAUDE_PROJECTS_DIR", get_default_projects_dir())
    state_path = os.path.join(os.path.expanduser("~"), ".claude-memory-sync-state.json")

    if not server_url:
        print("ERROR: MEMORY_SERVER_URL not set")
        return
    if not api_key:
        print("ERROR: API_KEY not set")
        return

    print(f"Projects dir: {projects_dir}")
    print(f"Server: {server_url}")
    print(f"State file: {state_path}")

    if args.watch:
        print(f"Watching every {args.interval}s... (Ctrl+C to stop)")
        while True:
            print(f"\n[{time.strftime('%H:%M:%S')}] Scanning...")
            sync_once(projects_dir, server_url, api_key, state_path)
            time.sleep(args.interval)
    else:
        sync_once(projects_dir, server_url, api_key, state_path)
        print("Done.")


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd C:/dev/claude-memory-mcp && python -m pytest tests/test_sync.py -v`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add ingesters/sync_claude_code.py tests/test_sync.py
git commit -m "feat: Claude Code JSONL watcher with offset tracking"
```

---

### Task 10: Anthropic export ingester

**Files:**
- Create: `ingesters/ingest_anthropic_export.py`

- [ ] **Step 1: Implement ingest_anthropic_export.py**

```python
# ingesters/ingest_anthropic_export.py
"""
Parse an Anthropic data export ZIP and upload conversations to the Memory MCP server.

Usage:
  python ingest_anthropic_export.py ~/Downloads/data-export.zip

Environment variables:
  MEMORY_SERVER_URL  - e.g. https://owen-claude-memory.fly.dev
  API_KEY            - Bearer token for /ingest
"""
import argparse
import hashlib
import json
import os
import zipfile
import httpx


def stable_uuid(session_id: str, index: int) -> str:
    """Generate a stable message UUID from session_id + index."""
    return hashlib.sha256(f"{session_id}:{index}".encode()).hexdigest()[:32]


def discover_conversations(zf: zipfile.ZipFile) -> list[str]:
    """Walk the ZIP and find JSON files that look like conversations."""
    candidates = []
    for name in zf.namelist():
        if name.endswith(".json") and not name.startswith("__MACOSX"):
            candidates.append(name)
    return candidates


def parse_conversation(data: dict, filename: str) -> dict | None:
    """Try to extract a conversation from a JSON object.
    The Anthropic export format may vary; this tries common shapes."""

    # Try common field names for the conversation UUID
    session_id = (
        data.get("uuid") or
        data.get("conversation_id") or
        data.get("id") or
        os.path.splitext(os.path.basename(filename))[0]
    )

    # Try common field names for messages
    raw_messages = (
        data.get("chat_messages") or
        data.get("messages") or
        data.get("conversation") or
        []
    )

    if not raw_messages or not isinstance(raw_messages, list):
        return None

    messages = []
    for i, msg in enumerate(raw_messages):
        role = msg.get("sender") or msg.get("role") or "unknown"
        # Normalize role names
        if role in ("human", "user"):
            role = "user"
        elif role in ("assistant", "ai"):
            role = "assistant"
        else:
            continue  # skip system messages etc.

        # Extract text content
        content = ""
        if isinstance(msg.get("content"), str):
            content = msg["content"]
        elif isinstance(msg.get("content"), list):
            content = " ".join(
                block.get("text", "") for block in msg["content"]
                if isinstance(block, dict) and block.get("type") == "text"
            )
        elif isinstance(msg.get("text"), str):
            content = msg["text"]

        if not content.strip():
            continue

        timestamp = msg.get("created_at") or msg.get("timestamp") or ""

        messages.append({
            "uuid": stable_uuid(session_id, i),
            "role": role,
            "content": content,
            "timestamp": timestamp,
        })

    if not messages:
        return None

    return {
        "source": "claude_ai",
        "session_id": session_id,
        "project": None,
        "machine_name": None,
        "messages": messages,
        "metadata": {
            "export_filename": filename,
            "name": data.get("name") or data.get("title") or "",
        },
    }


def ingest_zip(zip_path: str, server_url: str, api_key: str):
    print(f"Opening {zip_path}...")
    with zipfile.ZipFile(zip_path, "r") as zf:
        candidates = discover_conversations(zf)
        print(f"Found {len(candidates)} JSON files in ZIP")

        ingested = 0
        skipped = 0
        for name in candidates:
            try:
                raw = zf.read(name)
                data = json.loads(raw)
            except (json.JSONDecodeError, KeyError):
                skipped += 1
                continue

            conversation = parse_conversation(data, name)
            if not conversation:
                skipped += 1
                continue

            try:
                r = httpx.post(
                    f"{server_url}/ingest",
                    json=conversation,
                    headers={"Authorization": f"Bearer {api_key}"},
                    timeout=60,
                )
                if r.status_code == 200:
                    result = r.json()
                    print(f"  {name}: {result.get('messages_inserted', 0)} msgs")
                    ingested += 1
                else:
                    print(f"  {name}: FAILED {r.status_code}")
            except Exception as e:
                print(f"  {name}: ERROR {e}")

        print(f"\nDone. Ingested: {ingested}, Skipped: {skipped}")


def main():
    parser = argparse.ArgumentParser(description="Ingest Anthropic data export to Memory MCP")
    parser.add_argument("zip_path", help="Path to the Anthropic data export ZIP")
    args = parser.parse_args()

    server_url = os.environ.get("MEMORY_SERVER_URL", "").rstrip("/")
    api_key = os.environ.get("API_KEY", "")

    if not server_url:
        print("ERROR: MEMORY_SERVER_URL not set")
        return
    if not api_key:
        print("ERROR: API_KEY not set")
        return

    ingest_zip(args.zip_path, server_url, api_key)


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Commit**

```bash
git add ingesters/ingest_anthropic_export.py
git commit -m "feat: Anthropic data export ZIP ingester"
```

---

### Task 11: Connect clients

- [ ] **Step 1: Add Memory MCP server to global .claude.json**

Add to the `mcpServers` object in `C:\Users\Owen\.claude.json`:

```json
{
  "memory": {
    "type": "http",
    "url": "https://owen-claude-memory.fly.dev/mcp",
    "headers": {
      "Authorization": "Bearer <API_KEY>"
    }
  }
}
```

- [ ] **Step 2: Create PM2 ecosystem config**

Create `C:/dev/claude-memory-mcp/ecosystem.config.js`:

```javascript
module.exports = {
  apps: [{
    name: "claude-memory-sync",
    script: "ingesters/sync_claude_code.py",
    interpreter: "python",
    args: "--watch",
    cwd: "C:/dev/claude-memory-mcp",
    env: {
      MEMORY_SERVER_URL: "https://owen-claude-memory.fly.dev",
      API_KEY: "<your-api-key>"
    }
  }]
};
```

- [ ] **Step 3: Start the watcher via PM2**

```bash
cd C:/dev/claude-memory-mcp
pm2 start ecosystem.config.js
pm2 save
```

- [ ] **Step 3: Connect claude.ai**

In claude.ai: Settings > Integrations > Add custom connector
- URL: `https://owen-claude-memory.fly.dev/mcp`
- Auth: Bearer token with the same API_KEY

- [ ] **Step 4: Test end-to-end**

From Claude Code, ask: "Search my memory for AutoPipe"
From claude.ai, ask: "What Claude Code sessions have I had recently?"

- [ ] **Step 5: Commit final adjustments**

```bash
git add -A
git commit -m "chore: client configuration and watcher setup"
```

---

### Task 12: Run all tests and verify

- [ ] **Step 1: Run full test suite**

```bash
cd C:/dev/claude-memory-mcp
python -m pytest tests/ -v
```

Expected: All tests pass.

- [ ] **Step 3: Final commit**

```bash
git add -A
git commit -m "test: full test suite passing"
```
