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
            self._conn = sqlite3.connect(self._db_path, check_same_thread=False)
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

            CREATE TABLE IF NOT EXISTS mcp_servers (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                transport TEXT NOT NULL,
                command TEXT,
                url TEXT,
                status TEXT DEFAULT 'unknown',
                tool_count INTEGER DEFAULT 0,
                resource_count INTEGER DEFAULT 0,
                version TEXT,
                last_seen TEXT,
                uptime_seconds INTEGER DEFAULT 0,
                config_json TEXT,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS server_tools (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                server_id TEXT NOT NULL REFERENCES mcp_servers(id),
                name TEXT NOT NULL,
                description TEXT,
                input_schema TEXT,
                UNIQUE(server_id, name)
            );

            CREATE TABLE IF NOT EXISTS traces (
                id TEXT PRIMARY KEY,
                timestamp TEXT NOT NULL,
                level TEXT DEFAULT 'info',
                server_id TEXT,
                tool TEXT,
                status INTEGER,
                duration_ms INTEGER,
                caller TEXT,
                session_id TEXT,
                args_json TEXT,
                response_json TEXT,
                spans_json TEXT,
                args_preview TEXT,
                response_preview TEXT
            );
            CREATE INDEX IF NOT EXISTS idx_traces_timestamp ON traces(timestamp DESC);
            CREATE INDEX IF NOT EXISTS idx_traces_server ON traces(server_id);

            CREATE TABLE IF NOT EXISTS skills (
                name TEXT PRIMARY KEY,
                title TEXT,
                content TEXT NOT NULL,
                tokens INTEGER DEFAULT 0,
                tags TEXT,
                description TEXT,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS memory_files (
                name TEXT PRIMARY KEY,
                title TEXT,
                content TEXT NOT NULL,
                tokens INTEGER DEFAULT 0,
                kind TEXT DEFAULT 'global',
                scope TEXT,
                description TEXT,
                updated_at TEXT NOT NULL
            );
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

    # --- MCP Servers ---

    def list_servers(self) -> list[dict]:
        conn = self.get_connection()
        rows = conn.execute("SELECT * FROM mcp_servers ORDER BY name").fetchall()
        return [dict(r) for r in rows]

    def get_server(self, server_id: str) -> dict | None:
        conn = self.get_connection()
        row = conn.execute("SELECT * FROM mcp_servers WHERE id = ?", (server_id,)).fetchone()
        if not row:
            return None
        server = dict(row)
        tools = conn.execute(
            "SELECT name, description, input_schema FROM server_tools WHERE server_id = ?",
            (server_id,)
        ).fetchall()
        server["tools"] = [dict(t) for t in tools]
        return server

    def upsert_server(self, id: str, name: str, transport: str, command: str = None,
                      url: str = None, status: str = "unknown", tool_count: int = 0,
                      resource_count: int = 0, version: str = None, last_seen: str = None,
                      uptime_seconds: int = 0, config_json: str = None):
        now = datetime.now(timezone.utc).isoformat()
        conn = self.get_connection()
        conn.execute("""
            INSERT INTO mcp_servers (id, name, transport, command, url, status, tool_count,
                                     resource_count, version, last_seen, uptime_seconds, config_json, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                name = excluded.name,
                transport = excluded.transport,
                command = COALESCE(excluded.command, mcp_servers.command),
                url = COALESCE(excluded.url, mcp_servers.url),
                status = excluded.status,
                tool_count = excluded.tool_count,
                resource_count = excluded.resource_count,
                version = COALESCE(excluded.version, mcp_servers.version),
                last_seen = COALESCE(excluded.last_seen, mcp_servers.last_seen),
                uptime_seconds = excluded.uptime_seconds,
                config_json = COALESCE(excluded.config_json, mcp_servers.config_json),
                updated_at = excluded.updated_at
        """, (id, name, transport, command, url, status, tool_count, resource_count,
              version, last_seen, uptime_seconds, config_json, now))
        conn.commit()

    def upsert_server_tools(self, server_id: str, tools: list[dict]):
        conn = self.get_connection()
        conn.execute("DELETE FROM server_tools WHERE server_id = ?", (server_id,))
        for tool in tools:
            conn.execute("""
                INSERT INTO server_tools (server_id, name, description, input_schema)
                VALUES (?, ?, ?, ?)
            """, (server_id, tool["name"], tool.get("description"),
                  json.dumps(tool["input_schema"]) if tool.get("input_schema") else None))
        conn.commit()

    # --- Traces ---

    def list_traces(self, limit: int = 50, server: str = None,
                    level: str = None, status: int = None) -> list[dict]:
        conn = self.get_connection()
        query = "SELECT id, timestamp, level, server_id, tool, status, duration_ms, caller, session_id, args_preview, response_preview FROM traces WHERE 1=1"
        params = []
        if server:
            query += " AND server_id = ?"
            params.append(server)
        if level:
            query += " AND level = ?"
            params.append(level)
        if status is not None:
            query += " AND status = ?"
            params.append(status)
        query += " ORDER BY timestamp DESC LIMIT ?"
        params.append(limit)
        rows = conn.execute(query, params).fetchall()
        total = conn.execute("SELECT COUNT(*) FROM traces").fetchone()[0]
        return {"traces": [dict(r) for r in rows], "total": total}

    def get_trace(self, trace_id: str) -> dict | None:
        conn = self.get_connection()
        row = conn.execute("SELECT * FROM traces WHERE id = ?", (trace_id,)).fetchone()
        return dict(row) if row else None

    def insert_trace(self, id: str, timestamp: str, level: str = "info",
                     server_id: str = None, tool: str = None, status: int = None,
                     duration_ms: int = None, caller: str = None, session_id: str = None,
                     args_json: str = None, response_json: str = None,
                     spans_json: str = None, args_preview: str = None,
                     response_preview: str = None):
        conn = self.get_connection()
        try:
            conn.execute("""
                INSERT INTO traces (id, timestamp, level, server_id, tool, status, duration_ms,
                                    caller, session_id, args_json, response_json, spans_json,
                                    args_preview, response_preview)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (id, timestamp, level, server_id, tool, status, duration_ms, caller,
                  session_id, args_json, response_json, spans_json, args_preview, response_preview))
            conn.commit()
        except sqlite3.IntegrityError:
            pass  # duplicate trace, skip

    # --- Skills ---

    def list_skills(self) -> list[dict]:
        conn = self.get_connection()
        rows = conn.execute(
            "SELECT name, title, tokens, tags, description, updated_at FROM skills ORDER BY name"
        ).fetchall()
        results = []
        for r in rows:
            d = dict(r)
            if d.get("tags"):
                try:
                    d["tags"] = json.loads(d["tags"])
                except (json.JSONDecodeError, TypeError):
                    pass
            results.append(d)
        return results

    def get_skill(self, name: str) -> dict | None:
        conn = self.get_connection()
        row = conn.execute("SELECT * FROM skills WHERE name = ?", (name,)).fetchone()
        if not row:
            return None
        d = dict(row)
        if d.get("tags"):
            try:
                d["tags"] = json.loads(d["tags"])
            except (json.JSONDecodeError, TypeError):
                pass
        return d

    def upsert_skill(self, name: str, title: str = None, content: str = "",
                     tokens: int = 0, tags: list = None, description: str = None):
        now = datetime.now(timezone.utc).isoformat()
        conn = self.get_connection()
        tags_json = json.dumps(tags) if tags else None
        conn.execute("""
            INSERT INTO skills (name, title, content, tokens, tags, description, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(name) DO UPDATE SET
                title = COALESCE(excluded.title, skills.title),
                content = excluded.content,
                tokens = excluded.tokens,
                tags = COALESCE(excluded.tags, skills.tags),
                description = COALESCE(excluded.description, skills.description),
                updated_at = excluded.updated_at
        """, (name, title, content, tokens, tags_json, description, now))
        conn.commit()

    # --- Memory Files ---

    def list_memory_files(self) -> list[dict]:
        conn = self.get_connection()
        rows = conn.execute(
            "SELECT name, title, tokens, kind, scope, description, updated_at FROM memory_files ORDER BY name"
        ).fetchall()
        return [dict(r) for r in rows]

    def get_memory_file(self, name: str) -> dict | None:
        conn = self.get_connection()
        row = conn.execute("SELECT * FROM memory_files WHERE name = ?", (name,)).fetchone()
        return dict(row) if row else None

    def upsert_memory_file(self, name: str, title: str = None, content: str = "",
                           tokens: int = 0, kind: str = "global", scope: str = None,
                           description: str = None):
        now = datetime.now(timezone.utc).isoformat()
        conn = self.get_connection()
        conn.execute("""
            INSERT INTO memory_files (name, title, content, tokens, kind, scope, description, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(name) DO UPDATE SET
                title = COALESCE(excluded.title, memory_files.title),
                content = excluded.content,
                tokens = excluded.tokens,
                kind = excluded.kind,
                scope = COALESCE(excluded.scope, memory_files.scope),
                description = COALESCE(excluded.description, memory_files.description),
                updated_at = excluded.updated_at
        """, (name, title, content, tokens, kind, scope, description, now))
        conn.commit()

    # --- Usage Stats ---

    def usage_stats(self, period: str = "today") -> dict:
        conn = self.get_connection()

        # Determine time filter
        if period == "today":
            time_filter = "date(m.timestamp) = date('now')"
        elif period == "week":
            time_filter = "m.timestamp >= datetime('now', '-7 days')"
        elif period == "month":
            time_filter = "m.timestamp >= datetime('now', '-30 days')"
        else:
            time_filter = "1=1"

        # Estimate tokens from message content (len/4 approximation)
        rows = conn.execute(f"""
            SELECT m.role, SUM(LENGTH(m.content)) as total_chars, COUNT(*) as msg_count
            FROM messages m
            WHERE {time_filter}
            GROUP BY m.role
        """).fetchall()

        input_chars = 0
        output_chars = 0
        for r in rows:
            if r["role"] in ("user", "human"):
                input_chars += r["total_chars"] or 0
            elif r["role"] in ("assistant",):
                output_chars += r["total_chars"] or 0

        input_tokens = input_chars // 4
        output_tokens = output_chars // 4
        cached_tokens = input_tokens * 2  # rough estimate
        total_tokens = input_tokens + output_tokens + cached_tokens

        # Session counts
        if period == "today":
            session_time_filter = "date(s.updated_at) = date('now')"
        elif period == "week":
            session_time_filter = "s.updated_at >= datetime('now', '-7 days')"
        elif period == "month":
            session_time_filter = "s.updated_at >= datetime('now', '-30 days')"
        else:
            session_time_filter = "1=1"

        total_period_sessions = conn.execute(
            f"SELECT COUNT(*) FROM sessions s WHERE {session_time_filter}"
        ).fetchone()[0]

        # Active = sessions updated in the last hour
        active_sessions = conn.execute(
            "SELECT COUNT(*) FROM sessions WHERE updated_at >= datetime('now', '-1 hour')"
        ).fetchone()[0]

        # Per-session breakdown
        session_rows = conn.execute(f"""
            SELECT s.session_id, s.created_at as started, COUNT(m.id) as messages,
                   SUM(CASE WHEN m.role IN ('user', 'human') THEN LENGTH(m.content) ELSE 0 END) as input_chars,
                   SUM(CASE WHEN m.role = 'assistant' THEN LENGTH(m.content) ELSE 0 END) as output_chars
            FROM sessions s
            LEFT JOIN messages m ON s.session_id = m.session_id
            WHERE {session_time_filter}
            GROUP BY s.session_id
            ORDER BY s.updated_at DESC
            LIMIT 20
        """).fetchall()

        by_session = []
        for sr in session_rows:
            by_session.append({
                "session_id": sr["session_id"],
                "started": sr["started"],
                "messages": sr["messages"],
                "input_tokens": (sr["input_chars"] or 0) // 4,
                "output_tokens": (sr["output_chars"] or 0) // 4,
                "model": "unknown",
            })

        # Hourly timeseries for the period
        if period == "today":
            ts_filter = "date(m.timestamp) = date('now')"
        elif period == "week":
            ts_filter = "m.timestamp >= datetime('now', '-7 days')"
        else:
            ts_filter = "m.timestamp >= datetime('now', '-30 days')"

        ts_rows = conn.execute(f"""
            SELECT strftime('%Y-%m-%dT%H:00:00Z', m.timestamp) as ts_hour,
                   SUM(CASE WHEN m.role IN ('user', 'human') THEN LENGTH(m.content) ELSE 0 END) as input_chars,
                   SUM(CASE WHEN m.role = 'assistant' THEN LENGTH(m.content) ELSE 0 END) as output_chars
            FROM messages m
            WHERE {ts_filter}
            GROUP BY ts_hour
            ORDER BY ts_hour
        """).fetchall()

        timeseries = []
        for tr in ts_rows:
            inp = (tr["input_chars"] or 0) // 4
            out = (tr["output_chars"] or 0) // 4
            timeseries.append({
                "timestamp": tr["ts_hour"],
                "input": inp,
                "output": out,
                "cached": inp * 2,
            })

        return {
            "tokens": {
                "input": input_tokens,
                "output": output_tokens,
                "cached": cached_tokens,
                "total": total_tokens,
            },
            "sessions": {
                "active": active_sessions,
                "total_today": total_period_sessions,
            },
            "by_model": [],
            "by_session": by_session,
            "timeseries": timeseries,
        }
