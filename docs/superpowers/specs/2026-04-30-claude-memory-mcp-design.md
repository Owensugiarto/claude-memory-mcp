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
- **Auth**: Single Bearer token on all endpoints
- **Deployment**: Fly.io, single machine, 256MB RAM, 1GB volume

### Endpoints

#### `GET /health`
Returns `{"ok": true, "sessions": <count>, "messages": <count>, "sessions_by_source": {...}}`.

#### `POST /ingest`
Accepts session data. Idempotent — uses session_id as dedup key (upserts).

Request body:
```json
{
  "source": "claude_code" | "claude_ai",
  "session_id": "uuid",
  "project": "project-slug",
  "machine_name": "OWEN-PC",
  "messages": [
    {"role": "user", "content": "...", "timestamp": "ISO8601"},
    {"role": "assistant", "content": "...", "timestamp": "ISO8601"}
  ],
  "metadata": {
    "cwd": "C:/dev/AutoPipe",
    "git_branch": "main",
    "slug": "pure-soaring-harp"
  }
}
```

Processing:
1. Upsert into `sessions` table
2. Insert new messages into `messages` table
3. Generate OpenAI embeddings for each message content
4. Update FTS5 index

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
    project TEXT,                  -- project slug
    machine_name TEXT,
    cwd TEXT,
    git_branch TEXT,
    slug TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    metadata TEXT                  -- JSON blob for extra fields
);

CREATE TABLE messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL REFERENCES sessions(session_id),
    role TEXT NOT NULL,            -- 'user' or 'assistant'
    content TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    embedding BLOB,               -- 1536-d float32 vector (6144 bytes)
    UNIQUE(session_id, timestamp, role)
);

CREATE VIRTUAL TABLE messages_fts USING fts5(
    content,
    content_rowid='id',
    content='messages'
);

CREATE INDEX idx_messages_session ON messages(session_id);
CREATE INDEX idx_sessions_source ON sessions(source);
CREATE INDEX idx_sessions_project ON sessions(project);
CREATE INDEX idx_sessions_updated ON sessions(updated_at);
```

### Embedding Strategy

- Use OpenAI `text-embedding-3-small` (1536 dimensions)
- Embed each message's content individually
- Store as raw float32 bytes in the `embedding` BLOB column
- On search: embed the query, compute cosine similarity against all stored embeddings
- For scale (~100k messages): load all embeddings into numpy array, vectorized cosine. Fine for personal use.
- Cost: ~$0.02 per 1M tokens. A typical session has ~5k tokens = $0.0001 per session.

### Cosine Search Implementation

```python
import numpy as np

def cosine_search(query_embedding, all_embeddings, all_ids, top_k=20):
    """all_embeddings: (N, 1536) float32 array"""
    query = np.array(query_embedding, dtype=np.float32)
    sims = all_embeddings @ query / (
        np.linalg.norm(all_embeddings, axis=1) * np.linalg.norm(query)
    )
    top_indices = np.argsort(sims)[-top_k:][::-1]
    return [(all_ids[i], float(sims[i])) for i in top_indices]
```

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
1. Scans `~/.claude/projects/<slug>/<session-uuid>.jsonl`
2. Maintains a state file (`~/.claude-memory-sync-state.json`) tracking last-synced byte offset per file
3. For each file with new data:
   - Reads new JSONL lines from the saved offset
   - Filters to `type: "user"` and `type: "assistant"` entries only (skips progress, tool_result)
   - Extracts: `message.role`, `message.content` (text blocks only), `timestamp`, `sessionId`
   - Extracts session metadata from first entry: `cwd`, `gitBranch`, `slug`
   - Batches messages and POSTs to `/ingest`
   - Updates offset in state file
4. In `--watch` mode: repeats every 60 seconds
5. Includes subagent JSONL files in `<session-uuid>/subagents/`

**Message content extraction:**
- For `message.content` that is a string: use directly
- For `message.content` that is an array: concatenate all `type: "text"` blocks, skip `tool_use` and `tool_result` blocks
- Skip messages where extracted content is empty

**Config via environment variables:**
- `MEMORY_SERVER_URL` — Fly.io server URL
- `API_KEY` — Bearer token
- `CLAUDE_PROJECTS_DIR` — override for `~/.claude/projects` (default: auto-detect)

### Anthropic Export Ingester (`ingest_anthropic_export.py`)

One-off or weekly script.

**Behavior:**
1. Opens the ZIP file from Anthropic data export
2. Parses the JSON conversation files inside
3. For each conversation:
   - Extracts conversation UUID as session_id
   - Extracts messages with role, content, timestamp
   - POSTs to `/ingest` with `source: "claude_ai"`
4. Idempotent: existing sessions are updated, not duplicated

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
- VM: `shared-cpu-1x`, 256MB RAM
- Volume mount: `/data`
- Internal port: 8080

**Secrets:**
- `API_KEY` — Bearer auth token
- `OPENAI_API_KEY` — for embeddings

**Dockerfile:**
- Python 3.12-slim base
- Install requirements (fastapi, uvicorn, openai, numpy)
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

## Security

- Single API key gates all access (ingest + MCP tools)
- HTTPS enforced by Fly.io
- No PII beyond conversation content (which is the user's own data)
- API key rotation: `fly secrets set API_KEY=<new-key>`, then update all ingesters and connectors
- OpenAI API key stored as Fly secret, never exposed to clients

## Limitations

- **claude.ai chats are not real-time.** They land when you re-run the export ingester. Weekly is practical; live isn't possible without browser automation.
- **Claude Code freshness depends on the watcher.** 60-second polling means up to 60s staleness. If PM2 isn't running, sessions don't sync.
- **Cosine search loads all vectors per query.** Fine for personal scale (~100k messages = ~600MB embeddings in RAM). At larger scale, add `sqlite-vec` or pgvector.
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
