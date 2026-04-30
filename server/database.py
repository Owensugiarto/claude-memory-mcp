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
