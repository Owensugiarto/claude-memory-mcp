import json
import os
import secrets
import time
import numpy as np
from contextlib import asynccontextmanager
from typing import Optional
from fastapi import FastAPI, Request, Form, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, RedirectResponse
from pydantic import BaseModel
from slowapi import Limiter
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from server.database import Database
from server.embeddings import batch_embed, truncate_for_embedding, should_skip_embedding
from server.search import cosine_search, rrf_fuse
from server.mcp_tools import mcp, init_mcp

API_KEY = os.environ.get("API_KEY", "")
DATA_DIR = os.environ.get("DATA_DIR", "/data")

# OAuth2 temporary auth codes (code -> {redirect_uri, expires})
_auth_codes: dict[str, dict] = {}

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
    project: str | None = None
    machine_name: str | None = None
    messages: list[IngestMessage] = []
    metadata: dict | None = None


class ServerSyncItem(BaseModel):
    id: str
    name: str
    transport: str
    command: str | None = None
    url: str | None = None
    status: str = "unknown"
    tool_count: int = 0
    resource_count: int = 0
    version: str | None = None
    last_seen: str | None = None
    uptime_seconds: int = 0
    config_json: str | None = None
    tools: list[dict] = []


class ServerSyncRequest(BaseModel):
    servers: list[ServerSyncItem]


class SkillSyncItem(BaseModel):
    name: str
    title: str | None = None
    content: str = ""
    tokens: int = 0
    tags: list[str] | None = None
    description: str | None = None


class SkillSyncRequest(BaseModel):
    skills: list[SkillSyncItem]


class MemoryFileSyncItem(BaseModel):
    name: str
    title: str | None = None
    content: str = ""
    tokens: int = 0
    kind: str = "global"
    scope: str | None = None
    description: str | None = None


class MemoryFileSyncRequest(BaseModel):
    files: list[MemoryFileSyncItem]


class TraceIngestItem(BaseModel):
    id: str
    timestamp: str
    level: str = "info"
    server_id: str | None = None
    tool: str | None = None
    status: int | None = None
    duration_ms: int | None = None
    caller: str | None = None
    session_id: str | None = None
    args_json: str | None = None
    response_json: str | None = None
    spans_json: str | None = None
    args_preview: str | None = None
    response_preview: str | None = None


class TraceIngestRequest(BaseModel):
    traces: list[TraceIngestItem]


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

    # Build MCP starlette app — this initializes session_manager
    mcp_starlette = mcp.streamable_http_app()

    @asynccontextmanager
    async def lifespan(app):
        # MCP session manager needs run() for its task group.
        # Mounted sub-apps don't get their lifespan called reliably,
        # so we manage it here in FastAPI's lifespan.
        async with mcp.session_manager.run():
            yield

    app = FastAPI(title="Claude Memory MCP", lifespan=lifespan)
    app.state.limiter = limiter

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.exception_handler(RateLimitExceeded)
    async def rate_limit_handler(request, exc):
        return JSONResponse(status_code=429, content={"detail": "Rate limit exceeded"})

    @app.middleware("http")
    async def auth_middleware(request: Request, call_next):
        open_paths = ("/health", "/docs", "/openapi.json", "/authorize", "/token",
                      "/.well-known/oauth-authorization-server",
                      "/.well-known/oauth-protected-resource")
        if request.url.path in open_paths:
            return await call_next(request)
        auth = request.headers.get("Authorization", "")
        if not auth.startswith("Bearer ") or auth[7:] != API_KEY:
            return JSONResponse(status_code=401, content={"detail": "Invalid API key"})
        return await call_next(request)

    # --- OAuth2 endpoints ---

    @app.get("/.well-known/oauth-authorization-server")
    async def oauth_metadata(request: Request):
        base = "https://owen-claude-memory.fly.dev"
        return {
            "issuer": base,
            "authorization_endpoint": f"{base}/authorize",
            "token_endpoint": f"{base}/token",
            "response_types_supported": ["code"],
            "grant_types_supported": ["authorization_code"],
            "code_challenge_methods_supported": ["S256"],
        }

    @app.get("/.well-known/oauth-protected-resource")
    async def oauth_protected_resource(request: Request):
        base = "https://owen-claude-memory.fly.dev"
        return {
            "resource": base,
            "authorization_servers": [base],
        }

    @app.get("/authorize")
    async def oauth_authorize(
        response_type: str = "",
        client_id: str = "",
        redirect_uri: str = "",
        code_challenge: str = "",
        code_challenge_method: str = "",
        state: str = "",
        resource: str = "",
    ):
        code = secrets.token_urlsafe(32)
        _auth_codes[code] = {
            "redirect_uri": redirect_uri,
            "expires": time.time() + 300,
        }
        now = time.time()
        expired = [k for k, v in _auth_codes.items() if v["expires"] < now]
        for k in expired:
            del _auth_codes[k]
        return RedirectResponse(
            url=f"{redirect_uri}?code={code}&state={state}",
            status_code=302,
        )

    @app.post("/token")
    async def oauth_token_post(
        grant_type: str = Form(""),
        code: str = Form(""),
        redirect_uri: str = Form(""),
        client_id: str = Form(""),
        code_verifier: str = Form(""),
    ):
        if grant_type == "authorization_code" and code in _auth_codes:
            entry = _auth_codes.pop(code)
            if time.time() < entry["expires"]:
                return {
                    "access_token": API_KEY,
                    "token_type": "Bearer",
                    "expires_in": 86400 * 365,
                }
        return JSONResponse(status_code=400, content={"error": "invalid_grant"})

    @app.get("/token")
    async def oauth_token_get(
        grant_type: str = Query(""),
        code: str = Query(""),
        redirect_uri: str = Query(""),
        client_id: str = Query(""),
        code_verifier: str = Query(""),
    ):
        if grant_type == "authorization_code" and code in _auth_codes:
            entry = _auth_codes.pop(code)
            if time.time() < entry["expires"]:
                return {
                    "access_token": API_KEY,
                    "token_type": "Bearer",
                    "expires_in": 86400 * 365,
                }
        return JSONResponse(status_code=400, content={"error": "invalid_grant"})

    # --- App endpoints ---

    @app.get("/health")
    async def health():
        stats = _db.memory_stats()
        return {"ok": True, **stats}

    @app.post("/ingest")
    @limiter.limit("120/minute")
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

        if inserted > 0:
            try:
                await embed_new_messages(_db, req.session_id)
            except Exception as e:
                print(f"Embedding failed (non-fatal): {e}")

        return {"ok": True, "session_id": req.session_id, "messages_inserted": inserted}

    # --- REST API endpoints for MCP Console dashboard ---

    @app.get("/api/servers")
    async def api_list_servers():
        servers = _db.list_servers()
        return {"servers": servers, "total": len(servers)}

    @app.get("/api/servers/{server_id}")
    async def api_get_server(server_id: str):
        server = _db.get_server(server_id)
        if not server:
            return JSONResponse(status_code=404, content={"detail": "Server not found"})
        tools = server.pop("tools", [])
        # Parse input_schema from JSON string back to dict for each tool
        for t in tools:
            if t.get("input_schema") and isinstance(t["input_schema"], str):
                try:
                    t["input_schema"] = json.loads(t["input_schema"])
                except (json.JSONDecodeError, TypeError):
                    pass
        return {"server": server, "tools": tools, "resources": []}

    @app.post("/api/servers/sync")
    async def api_sync_servers(req: ServerSyncRequest):
        for s in req.servers:
            _db.upsert_server(
                id=s.id, name=s.name, transport=s.transport, command=s.command,
                url=s.url, status=s.status, tool_count=s.tool_count,
                resource_count=s.resource_count, version=s.version,
                last_seen=s.last_seen, uptime_seconds=s.uptime_seconds,
                config_json=s.config_json,
            )
            if s.tools:
                _db.upsert_server_tools(s.id, s.tools)
        return {"ok": True, "synced": len(req.servers)}

    @app.get("/api/traces")
    async def api_list_traces(
        limit: int = Query(50, ge=1, le=500),
        server: str = Query(None),
        level: str = Query(None),
        status: Optional[int] = Query(None),
    ):
        result = _db.list_traces(limit=limit, server=server, level=level, status=status)
        # Rename server_id -> server in trace dicts for API contract
        traces = []
        for t in result["traces"]:
            t_dict = dict(t) if not isinstance(t, dict) else t
            t_dict["server"] = t_dict.pop("server_id", None)
            traces.append(t_dict)
        return {"traces": traces, "total": result["total"]}

    @app.get("/api/traces/{trace_id}")
    async def api_get_trace(trace_id: str):
        trace = _db.get_trace(trace_id)
        if not trace:
            return JSONResponse(status_code=404, content={"detail": "Trace not found"})
        # Parse JSON fields
        args = None
        if trace.get("args_json"):
            try:
                args = json.loads(trace["args_json"])
            except (json.JSONDecodeError, TypeError):
                args = trace["args_json"]
        response = None
        if trace.get("response_json"):
            try:
                response = json.loads(trace["response_json"])
            except (json.JSONDecodeError, TypeError):
                response = trace["response_json"]
        spans = []
        if trace.get("spans_json"):
            try:
                spans = json.loads(trace["spans_json"])
            except (json.JSONDecodeError, TypeError):
                spans = []
        # Build trace summary (rename server_id -> server)
        trace_summary = {
            "id": trace["id"],
            "timestamp": trace["timestamp"],
            "level": trace["level"],
            "server": trace.get("server_id"),
            "tool": trace.get("tool"),
            "status": trace.get("status"),
            "duration_ms": trace.get("duration_ms"),
            "caller": trace.get("caller"),
            "session_id": trace.get("session_id"),
            "args_preview": trace.get("args_preview"),
            "response_preview": trace.get("response_preview"),
        }
        return {"trace": trace_summary, "args": args, "response": response, "spans": spans}

    @app.post("/api/traces/ingest")
    async def api_ingest_traces(req: TraceIngestRequest):
        inserted = 0
        for t in req.traces:
            _db.insert_trace(
                id=t.id, timestamp=t.timestamp, level=t.level, server_id=t.server_id,
                tool=t.tool, status=t.status, duration_ms=t.duration_ms, caller=t.caller,
                session_id=t.session_id, args_json=t.args_json, response_json=t.response_json,
                spans_json=t.spans_json, args_preview=t.args_preview,
                response_preview=t.response_preview,
            )
            inserted += 1
        return {"ok": True, "inserted": inserted}

    @app.get("/api/skills")
    async def api_list_skills():
        skills = _db.list_skills()
        total_tokens = sum(s.get("tokens", 0) for s in skills)
        return {"skills": skills, "total": len(skills), "total_tokens": total_tokens}

    @app.get("/api/skills/{name:path}")
    async def api_get_skill(name: str):
        skill = _db.get_skill(name)
        if not skill:
            return JSONResponse(status_code=404, content={"detail": "Skill not found"})
        content = skill.pop("content", "")
        return {"skill": skill, "content": content}

    @app.post("/api/skills/sync")
    async def api_sync_skills(req: SkillSyncRequest):
        for s in req.skills:
            _db.upsert_skill(
                name=s.name, title=s.title, content=s.content,
                tokens=s.tokens, tags=s.tags, description=s.description,
            )
        return {"ok": True, "synced": len(req.skills)}

    @app.get("/api/memory-files")
    async def api_list_memory_files():
        files = _db.list_memory_files()
        total_tokens = sum(f.get("tokens", 0) for f in files)
        return {"files": files, "total": len(files), "total_tokens": total_tokens}

    @app.get("/api/memory-files/{name:path}")
    async def api_get_memory_file(name: str):
        mf = _db.get_memory_file(name)
        if not mf:
            return JSONResponse(status_code=404, content={"detail": "Memory file not found"})
        content = mf.pop("content", "")
        return {"file": mf, "content": content}

    @app.post("/api/memory-files/sync")
    async def api_sync_memory_files(req: MemoryFileSyncRequest):
        for f in req.files:
            _db.upsert_memory_file(
                name=f.name, title=f.title, content=f.content,
                tokens=f.tokens, kind=f.kind, scope=f.scope, description=f.description,
            )
        return {"ok": True, "synced": len(req.files)}

    @app.get("/api/usage")
    async def api_usage(period: str = Query("today")):
        return _db.usage_stats(period=period)

    @app.get("/api/sessions")
    async def api_list_sessions(
        limit: int = Query(20, ge=1, le=100),
        source: str = Query(None),
        project: str = Query(None),
        days: Optional[int] = Query(None),
    ):
        sessions = _db.list_recent_sessions(
            limit=limit, source=source, project=project, days=days,
        )
        return {"sessions": sessions, "total": len(sessions)}

    @app.get("/api/sessions/{session_id}")
    async def api_get_session(session_id: str):
        session = _db.get_session(session_id)
        if not session:
            return JSONResponse(status_code=404, content={"detail": "Session not found"})
        messages = _db.get_session_messages(session_id)
        return {
            "session": {
                "session_id": session["session_id"],
                "source": session["source"],
                "project": session["project"],
                "machine_name": session["machine_name"],
                "session_slug": session.get("session_slug"),
                "created_at": session["created_at"],
                "updated_at": session["updated_at"],
            },
            "messages": [
                {"role": m["role"], "content": m["content"][:5000], "timestamp": m["timestamp"]}
                for m in messages
            ],
        }

    @app.get("/api/search")
    async def api_search(
        q: str = Query(""),
        limit: int = Query(10, ge=1, le=100),
        source: str = Query(None),
        project: str = Query(None),
        days: Optional[int] = Query(None),
    ):
        if not q:
            return {"results": [], "total": 0}

        # Keyword search via FTS5
        try:
            keyword_results = _db.fts_search(q, limit=limit * 2, source=source, project=project, days=days)
            keyword_pairs = [(r["id"], r["rank"]) for r in keyword_results]
        except Exception:
            keyword_pairs = []

        # Semantic search via embeddings (non-fatal)
        semantic_pairs = []
        try:
            query_emb = await batch_embed([q])
            ids, embeddings = _db.get_all_embeddings(source=source, project=project, days=days)
            if len(ids) > 0:
                semantic_pairs = cosine_search(
                    np.array(query_emb[0], dtype=np.float32),
                    embeddings, ids, top_k=limit * 2
                )
        except Exception:
            pass

        fused = rrf_fuse(keyword_pairs, semantic_pairs)[:limit]

        if not fused:
            return {"results": [], "total": 0}

        msg_ids = [f[0] for f in fused]
        messages = _db.get_messages_by_ids(msg_ids)
        scores = {f[0]: f[1] for f in fused}

        results = []
        for msg in messages:
            results.append({
                "content": msg["content"][:2000],
                "role": msg["role"],
                "session_id": msg["session_id"],
                "project": msg["project"],
                "source": msg["source"],
                "timestamp": msg["timestamp"],
                "score": scores.get(msg["id"], 0),
            })
        results.sort(key=lambda x: x["score"], reverse=True)
        return {"results": results, "total": len(results)}

    @app.get("/api/dashboard")
    async def api_dashboard():
        # Aggregated stats
        mem_stats = _db.memory_stats()

        # Count connected servers
        servers = _db.list_servers()
        servers_connected = sum(1 for s in servers if s.get("status") == "connected")

        # Active sessions (updated in last hour)
        conn = _db.get_connection()
        active_sessions = conn.execute(
            "SELECT COUNT(*) FROM sessions WHERE updated_at >= datetime('now', '-1 hour')"
        ).fetchone()[0]

        # Recent traces as activity
        trace_result = _db.list_traces(limit=10)
        recent_activity = []
        for t in trace_result["traces"]:
            t_dict = dict(t) if not isinstance(t, dict) else t
            recent_activity.append({
                "type": "tool_call",
                "server": t_dict.get("server_id"),
                "tool": t_dict.get("tool"),
                "status": t_dict.get("status"),
                "duration_ms": t_dict.get("duration_ms"),
                "timestamp": t_dict.get("timestamp"),
            })

        # Traffic stats from traces in last hour
        traces_1h = conn.execute(
            "SELECT COUNT(*) FROM traces WHERE timestamp >= datetime('now', '-1 hour')"
        ).fetchone()[0]

        p95_row = conn.execute("""
            SELECT duration_ms FROM traces
            WHERE timestamp >= datetime('now', '-1 hour') AND duration_ms IS NOT NULL
            ORDER BY duration_ms DESC
            LIMIT 1 OFFSET (
                SELECT CAST(COUNT(*) * 0.05 AS INTEGER) FROM traces
                WHERE timestamp >= datetime('now', '-1 hour') AND duration_ms IS NOT NULL
            )
        """).fetchone()
        p95_ms = p95_row[0] if p95_row else 0

        error_count = conn.execute(
            "SELECT COUNT(*) FROM traces WHERE timestamp >= datetime('now', '-1 hour') AND status >= 400"
        ).fetchone()[0]
        error_rate = round((error_count / traces_1h * 100) if traces_1h > 0 else 0, 2)

        return {
            "stats": {
                "total_sessions": mem_stats["total_sessions"],
                "total_messages": mem_stats["total_messages"],
                "servers_connected": servers_connected,
                "active_sessions": active_sessions,
            },
            "recent_activity": recent_activity,
            "traffic": {
                "requests_1h": traces_1h,
                "p95_ms": p95_ms,
                "error_rate": error_rate,
            },
        }

    # --- MCP mount ---
    # Add MCP routes directly to FastAPI's router (not as a mounted sub-app).
    # This ensures the session_manager lifecycle is managed by FastAPI's lifespan
    # instead of the sub-app's lifespan which doesn't fire when mounted.
    for route in mcp_starlette.routes:
        app.routes.append(route)

    return app


# Entry point for uvicorn — guarded so tests don't trigger it on import
if os.environ.get("TESTING") != "1":
    app = create_app()
