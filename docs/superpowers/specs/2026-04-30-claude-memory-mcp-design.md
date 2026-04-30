# Claude Memory MCP — Design Spec

## Problem

Claude sessions are isolated. A conversation in Claude Code on PC A, a chat on claude.ai from a phone, and another Claude Code session on PC B have no shared memory. The user must re-explain context every time.

## Solution

A central MCP server that indexes all Claude conversations and exposes them as searchable memory to every Claude interface.

## Architecture

```
Claude Code (PC A, B, ...)          claude.ai (web/desktop/iOS)
        |                                    |
   JSONL watcher (PM2)              Anthropic data export ZIP
   polls every 60s                  (manual, weekly)
        |                                    |
        +-----> POST /ingest <---------------+
                     |
              +------+------+
              |             |
         SQLite DB     OpenAI API
         (FTS5)        (embeddings)
              |             |
              +------+------+
                     |
              MCP tools via /mcp
              (Bearer auth)
                     |
         +----------+-----------+
         |                      |
    Claude Code             claude.ai
    (.claude.json)          (custom connector)
```

## Server

### Tech Stack

- **Runtime**: Python 3.12+, FastAPI, uvicorn
- **Database**: SQLite with FTS5 (on Fly volume at `/data/memory.db`)
- **Embeddings**: OpenAI `text-embedding-3-small` (1536-d) via API
- **Search**: Hybrid keyword (FTS5) + semantic (cosine similarity), fused with Reciprocal Rank Fusion
- **Auth**: Single Bearer token on all endpoints except `GET /health`
- **Deployment**: Fly.io, single machine, 512MB RAM, 1GB volume
- **Rate limiting**: `slowapi` middleware on `/ingest` (protects OpenAI spend if token leaks)

### Endpoints

#### `GET /health` (unauthenticated)
Returns `{"ok": true, "sessions": <count>, "messages": <count>, "sessions_by_source": {...}}`.
No Bearer token required — allows monitoring and load balancer health checks.

#### `POST /ingest`
Accepts session data. Idempotent — uses session_id as dedup key (upserts).

Request body:
```json
{
  "source": "claude_code" | "claude_ai",
  "session_id": "uuid",
  "project": "C--dev-AutoPipe",
  "machine_name": "OWEN-PC",
  "messages": [
    {"uuid": "msg-uuid-1", "role": "user", "content": "...", "timestamp": "ISO8601"},
    {"uuid": "msg-uuid-2", "role": "assistant", "content": "...", "timestamp": "ISO8601"}
  ],
  "metadata": {
    "cwd": "C:/dev/AutoPipe",
    "git_branch": "main",
    "session_slug": "pure-soaring-harp"
  }
}
```

Processing:
1. Upsert into `sessions` table
2. Insert new messages into `messages` table (dedup on `session_id + message_uuid`)
3. Truncate message content to first 6,000 tokens for embedding; store full text in DB
4. Batch-embed messages via OpenAI API (up to 2048 inputs per call)
5. FTS5 index auto-updated via triggers

#### `POST /mcp`
MCP protocol endpoint. Exposes 4 tools:

**`search_memory(query: str, limit: int = 10, source?: str, project?: str, days?: int)`**
- Runs FTS5 keyword search and cosine similarity search in parallel
- Fuses results with Reciprocal Rank Fusion (k=60)
- Returns top-N results with: message content, role, session_id, project, source, timestamp, relevance score

**`get_session(session_id: str)`**
- Returns full conversation: all messages in order, plus session metadata (source, project, machine, timestamps)

**`list_recent_sessions(limit: int = 20, source?: str, project?: str, days?: int)`**
- Returns session summaries: session_id, source, project, machine_name, message_count, first/last message timestamps
- Ordered by most recent activity

**`memory_stats()`**
- Returns counts grouped by source, project, and date range

### Database Schema

```sql
CREATE TABLE sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT UNIQUE NOT NULL,
    source TEXT NOT NULL,          -- 'claude_code' or 'claude_ai'
    project TEXT,                  -- cwd-slug directory name, e.g. 'C--dev-AutoPipe'
    machine_name TEXT,
    cwd TEXT,
    git_branch TEXT,
    session_slug TEXT,             -- human-readable slug from JSONL, e.g. 'pure-soaring-harp'
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    metadata TEXT                  -- JSON blob for extra fields
);

CREATE TABLE messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL REFERENCES sessions(session_id),
    message_uuid TEXT NOT NULL,    -- unique uuid from JSONL entry
    role TEXT NOT NULL,            -- 'user' or 'assistant'
    content TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    embedding BLOB,               -- 1536-d float32 vector (6144 bytes)
    UNIQUE(session_id, message_uuid)
);

-- FTS5 external content table with sync triggers
CREATE VIRTUAL TABLE messages_fts USING fts5(
    content,
    content_rowid='id',
    content='messages'
);

-- Triggers to keep FTS5 in sync with messages table
CREATE TRIGGER messages_ai AFTER INSERT ON messages BEGIN
    INSERT INTO messages_fts(rowid, content) VALUES (new.id, new.content);
END;
CREATE TRIGGER messages_ad AFTER DELETE ON messages BEGIN
    INSERT INTO messages_fts(messages_fts, rowid, content) VALUES('delete', old.id, old.content);
END;
CREATE TRIGGER messages_au AFTER UPDATE ON messages BEGIN
    INSERT INTO messages_fts(messages_fts, rowid, content) VALUES('delete', old.id, old.content);
    INSERT INTO messages_fts(rowid, content) VALUES (new.id, new.content);
END;

CREATE INDEX idx_messages_session ON messages(session_id);
CREATE INDEX idx_sessions_source ON sessions(source);
CREATE INDEX idx_sessions_project ON sessions(project);
CREATE INDEX idx_sessions_updated ON sessions(updated_at);
```

### Embedding Strategy

- Use OpenAI `text-embedding-3-small` (1536 dimensions)
- **Truncation**: Messages longer than 6,000 tokens are truncated to 6,000 tokens for embedding only. Full text is always stored in SQLite for FTS and retrieval.
- **Context dump filtering**: User messages longer than 20,000 characters (system prompts, CLAUDE.md, pasted tool output) are skipped for embedding but still stored for FTS.
- **Batching**: Use OpenAI batch embedding API (up to 2048 inputs per call) to minimize API round-trips.
- Store as raw float32 bytes in the `embedding` BLOB column
- On search: embed the query, load embeddings from SQLite, compute cosine similarity via numpy
- Cost: ~$0.02 per 1M tokens. A typical session has ~5k tokens = $0.0001 per session.

### Cosine Search Implementation

```python
import numpy as np

def cosine_search(query_embedding, all_embeddings, all_ids, top_k=20):
    """all_embeddings: (N, 1536) float32 array"""
    query = np.array(query_embedding, dtype=np.float32)
    norms = np.linalg.norm(all_embeddings, axis=1) * np.linalg.norm(query) + 1e-10
    sims = all_embeddings @ query / norms
    top_indices = np.argsort(sims)[-top_k:][::-1]
    return [(all_ids[i], float(sims[i])) for i in top_indices]
```

At personal scale (~100k messages, ~600MB embeddings), brute-force cosine is fine. If scale grows beyond what fits in 512MB RAM, migrate to `sqlite-vec` extension for disk-based vector search.

### Reciprocal Rank Fusion

```python
def rrf_fuse(keyword_results, semantic_results, k=60):
    scores = {}
    for rank, (msg_id, _) in enumerate(keyword_results):
        scores[msg_id] = scores.get(msg_id, 0) + 1.0 / (k + rank + 1)
    for rank, (msg_id, _) in enumerate(semantic_results):
        scores[msg_id] = scores.get(msg_id, 0) + 1.0 / (k + rank + 1)
    return sorted(scores.items(), key=lambda x: x[1], reverse=True)
```

## Ingesters

### Claude Code Watcher (`sync_claude_code.py`)

Runs on each machine. Managed by PM2.

**Behavior:**
1. Scans `~/.claude/projects/<cwd-slug>/<session-uuid>.jsonl` where `<cwd-slug>` is the path-encoded directory name (e.g. `C--dev-AutoPipe` for `C:\dev\AutoPipe`)
2. Maintains a state file (`~/.claude-memory-sync-state.json`) tracking last-synced byte offset per file
3. For each file with new data:
   - Reads new JSONL lines from the saved offset
   - Filters to `type: "user"` and `type: "assistant"` entries only (skips `progress`, `tool_result`, and any other types)
   - Extracts: `message.role`, `message.content` (text blocks only), `timestamp`, `sessionId`, `uuid`
   - Extracts session metadata from first entry: `cwd`, `gitBranch`, `slug` (stored as `session_slug`)
   - The `project` field is derived from the cwd-slug directory name, NOT from the JSONL `slug` field
   - Batches messages and POSTs to `/ingest`
   - Updates offset in state file
4. In `--watch` mode: repeats every 60 seconds
5. Includes subagent JSONL files in `<session-uuid>/subagents/`

**Message content extraction:**
- For `message.content` that is a string: use directly
- For `message.content` that is an array: concatenate all `type: "text"` blocks. Skip `tool_use`, `tool_result`, and `thinking` blocks.
- Skip messages where extracted content is empty (e.g. assistant entries that contain only a `thinking` block with no `text` block)

**Config via environment variables:**
- `MEMORY_SERVER_URL` — Fly.io server URL
- `API_KEY` — Bearer token
- `CLAUDE_PROJECTS_DIR` — override for `~/.claude/projects` (default: auto-detect)

### Anthropic Export Ingester (`ingest_anthropic_export.py`)

One-off or weekly script.

**Behavior:**
1. Opens the ZIP file from Anthropic data export
2. Looks for conversation JSON files (typically at `conversations/<uuid>.json` inside the ZIP)
3. For each conversation:
   - Extracts conversation UUID as session_id
   - Extracts messages with role, content, timestamp
   - Generates a stable message UUID from `hash(session_id + index)` since claude.ai export may not include message UUIDs
   - POSTs to `/ingest` with `source: "claude_ai"`
4. Idempotent: existing sessions are updated via upsert, not duplicated

**Note:** The exact internal structure of the Anthropic data export ZIP may vary. The ingester should be written to discover conversation files by walking the ZIP contents and looking for JSON files with a `chat_messages` or similar array field. Logging should report the discovered structure on first run.

## Deployment

### Fly.io Setup

```
server/
  main.py          -- FastAPI app
  database.py      -- SQLite setup, queries
  embeddings.py    -- OpenAI embedding calls
  mcp_tools.py     -- MCP tool definitions
  search.py        -- FTS5 + cosine + RRF
  requirements.txt
  Dockerfile
  fly.toml
```

**fly.toml:**
- App name: `owen-claude-memory`
- Region: `lax` (closest to LA)
- VM: `shared-cpu-1x`, 512MB RAM
- Volume mount: `/data`
- Internal port: 8080

**Secrets:**
- `API_KEY` — Bearer auth token
- `OPENAI_API_KEY` — for embeddings

**Dockerfile:**
- Python 3.12-slim base
- Install requirements (fastapi, uvicorn, openai, numpy, slowapi)
- No ML model download needed (using OpenAI API)

### Client Configuration

**Claude Code** (global `~/.claude.json`):
```json
{
  "mcpServers": {
    "memory": {
      "type": "http",
      "url": "https://owen-claude-memory.fly.dev/mcp",
      "headers": {
        "Authorization": "Bearer <API_KEY>"
      }
    }
  }
}
```

**claude.ai** (all devices):
Settings > Integrations > Add custom connector
- URL: `https://owen-claude-memory.fly.dev/mcp`
- Auth: Bearer token

### Backup

Daily SQLite backup via a simple script on the Fly machine:
```bash
sqlite3 /data/memory.db ".backup /data/memory-backup.db"
```
Triggered by Fly machine cron or a scheduled `fly ssh console` command.

### Migration Strategy

v1 migration strategy: blow away the database and re-ingest from source JSONL files and export ZIPs. The ingesters are idempotent, so a full re-ingest is always safe. Schema changes that require migration should be handled by adding a version check in `database.py` that drops and recreates tables if needed.

## Security

- Single API key gates all access (ingest + MCP tools). `GET /health` is the only unauthenticated endpoint.
- HTTPS enforced by Fly.io
- Rate limiting via `slowapi` on `/ingest` to protect OpenAI spend if token leaks
- No PII beyond conversation content (which is the user's own data)
- API key rotation: `fly secrets set API_KEY=<new-key>`, then update all ingesters and connectors
- OpenAI API key stored as Fly secret, never exposed to clients

## Limitations

- **claude.ai chats are not real-time.** They land when you re-run the export ingester. Weekly is practical; live isn't possible without browser automation.
- **Claude Code freshness depends on the watcher.** 60-second polling means up to 60s staleness. If PM2 isn't running, sessions don't sync.
- **Cosine search scales with message count.** At ~100k messages the embeddings are ~600MB. The 512MB VM handles typical personal scale; if it grows beyond that, switch to `sqlite-vec` for disk-based vector search.
- **No deletion sync.** Deleted chats in claude.ai remain in the memory index. By design.
- **Single region.** Server runs in `lax` only. Latency from other locations is ~50-150ms per MCP call.

## File Structure

```
claude-memory-mcp/
  server/
    main.py
    database.py
    embeddings.py
    mcp_tools.py
    search.py
    requirements.txt
    Dockerfile
    fly.toml
  ingesters/
    sync_claude_code.py
    ingest_anthropic_export.py
    requirements.txt
  docs/
    superpowers/
      specs/
        2026-04-30-claude-memory-mcp-design.md
```
