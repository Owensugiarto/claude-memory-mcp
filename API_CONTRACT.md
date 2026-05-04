# MCP Console — REST API Contract

Base URL: `https://owen-claude-memory.fly.dev`
Auth: `Authorization: Bearer <API_KEY>` (all /api/* routes)
Dashboard proxy: Vercel Edge Function at `/api/proxy` forwards to Fly.io

## Existing endpoints (unchanged)

- `GET /health` — public, returns `{ ok, total_sessions, total_messages, by_source, by_project }`
- `POST /ingest` — auth'd, ingests session messages
- `POST /` — MCP JSON-RPC (existing 4 tools remain)

## New REST endpoints for dashboard

### Servers

**GET /api/servers**
```json
{
  "servers": [
    {
      "id": "github-mcp",
      "name": "github-mcp",
      "transport": "stdio",
      "command": "npx @modelcontextprotocol/server-github",
      "status": "connected",
      "tool_count": 32,
      "resource_count": 14,
      "last_seen": "2026-05-04T14:32:08Z",
      "uptime_seconds": 561600,
      "version": "1.4.2"
    }
  ],
  "total": 12
}
```

**GET /api/servers/:id**
```json
{
  "server": { ... },
  "tools": [
    {
      "name": "create_issue",
      "description": "Create a new issue in a GitHub repository",
      "input_schema": { "type": "object", ... }
    }
  ],
  "resources": [
    { "name": "repos", "uri": "github://repos", "description": "..." }
  ]
}
```

### Traces

**GET /api/traces?limit=50&server=&level=&status=**
```json
{
  "traces": [
    {
      "id": "trace_a14ef0b9",
      "timestamp": "2026-05-04T14:32:08.412Z",
      "level": "info",
      "server": "github-mcp",
      "tool": "create_issue",
      "status": 200,
      "duration_ms": 214,
      "caller": "claude-cli",
      "session_id": "ssn_4f9a21",
      "args_preview": "owner='vercel', repo='next.js'",
      "response_preview": "Created issue #284"
    }
  ],
  "total": 14832
}
```

**GET /api/traces/:id**
```json
{
  "trace": { ... },
  "args": { "owner": "vercel", "repo": "next.js", "title": "..." },
  "response": { "content": [...], "isError": false },
  "spans": [
    { "name": "validate", "start_ms": 0, "duration_ms": 4 },
    { "name": "auth", "start_ms": 4, "duration_ms": 8 },
    { "name": "tool_exec", "start_ms": 12, "duration_ms": 168 }
  ]
}
```

### Skills

**GET /api/skills**
```json
{
  "skills": [
    {
      "name": "github-issue-triage.md",
      "title": "GitHub issue triage",
      "tokens": 1240,
      "tags": ["github", "triage"],
      "updated_at": "2026-05-02T10:00:00Z",
      "description": "Classify, label, and route incoming issues."
    }
  ],
  "total": 14,
  "total_tokens": 11860
}
```

**GET /api/skills/:name**
```json
{
  "skill": { "name": "...", "title": "...", ... },
  "content": "# GitHub issue triage\n\nClassify incoming..."
}
```

### Memory Files

**GET /api/memory-files**
```json
{
  "files": [
    {
      "name": "user-prefs.md",
      "title": "User preferences",
      "tokens": 280,
      "kind": "global",
      "scope": null,
      "updated_at": "2026-05-04T14:22:00Z",
      "description": "Prefers TypeScript, 2-space indent..."
    }
  ],
  "total": 32,
  "total_tokens": 4380
}
```

**GET /api/memory-files/:name**
```json
{
  "file": { "name": "...", "title": "...", ... },
  "content": "# User preferences\n\n..."
}
```

### Usage

**GET /api/usage?period=today**
```json
{
  "tokens": {
    "input": 92410,
    "output": 14820,
    "cached": 184200,
    "total": 291430
  },
  "sessions": {
    "active": 3,
    "total_today": 5
  },
  "by_model": [
    { "model": "claude-sonnet-4.5", "tokens": 268420, "cost_cents": 296 }
  ],
  "by_session": [
    {
      "session_id": "ssn_4f9a21",
      "started": "2026-05-04T14:02:00Z",
      "messages": 8,
      "input_tokens": 92410,
      "output_tokens": 14820,
      "model": "sonnet-4.5"
    }
  ],
  "timeseries": [
    { "timestamp": "2026-05-04T14:00:00Z", "input": 8200, "output": 1800, "cached": 14000 }
  ]
}
```

### Sessions (enhanced from existing)

**GET /api/sessions?limit=20&source=&project=&days=**
Same as `list_recent_sessions` MCP tool but as REST.

**GET /api/sessions/:id**
Same as `get_session` MCP tool but as REST.

### Search

**GET /api/search?q=&limit=10&source=&project=&days=**
Same as `search_memory` MCP tool but as REST.

### Dashboard Stats

**GET /api/dashboard**
Aggregated dashboard overview:
```json
{
  "stats": {
    "total_sessions": 83,
    "total_messages": 4210,
    "servers_connected": 12,
    "active_sessions": 3
  },
  "recent_activity": [
    {
      "type": "tool_call",
      "server": "github-mcp",
      "tool": "create_issue",
      "status": 200,
      "duration_ms": 312,
      "timestamp": "2026-05-04T14:32:08Z"
    }
  ],
  "traffic": {
    "requests_1h": 14832,
    "p95_ms": 218,
    "error_rate": 0.42
  }
}
```
