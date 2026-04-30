import os
import secrets
import time
import numpy as np
from fastapi import FastAPI, Request, Form, Query
from fastapi.responses import JSONResponse, RedirectResponse
from pydantic import BaseModel
from slowapi import Limiter
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from server.database import Database
from server.embeddings import batch_embed, truncate_for_embedding, should_skip_embedding
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
        # OAuth2, discovery, and health endpoints are unauthenticated
        open_paths = ("/health", "/docs", "/openapi.json", "/authorize", "/token",
                      "/.well-known/oauth-authorization-server",
                      "/.well-known/oauth-protected-resource")
        if request.url.path in open_paths:
            return await call_next(request)
        auth = request.headers.get("Authorization", "")
        if not auth.startswith("Bearer ") or auth[7:] != API_KEY:
            return JSONResponse(status_code=401, content={"detail": "Invalid API key"})
        return await call_next(request)

    # --- OAuth2 endpoints for claude.ai custom connector ---

    @app.get("/.well-known/oauth-authorization-server")
    async def oauth_metadata(request: Request):
        """RFC 8414 OAuth server metadata for MCP client discovery."""
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
        """RFC 9470 protected resource metadata."""
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
    ):
        """OAuth2 authorize endpoint. Generates a code and redirects back."""
        code = secrets.token_urlsafe(32)
        _auth_codes[code] = {
            "redirect_uri": redirect_uri,
            "expires": time.time() + 300,
        }
        # Clean expired codes
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
        """OAuth2 token exchange via POST (standard)."""
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
        """OAuth2 token exchange via GET (some clients use this)."""
        if grant_type == "authorization_code" and code in _auth_codes:
            entry = _auth_codes.pop(code)
            if time.time() < entry["expires"]:
                return {
                    "access_token": API_KEY,
                    "token_type": "Bearer",
                    "expires_in": 86400 * 365,
                }
        return JSONResponse(status_code=400, content={"error": "invalid_grant"})

    # --- End OAuth2 ---

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

    # Mount MCP at root with path="/" so POST / works for claude.ai
    # Also mount at /mcp for Claude Code
    mcp_app = mcp.streamable_http_app()
    app.mount("/mcp", mcp_app)
    mcp_app_root = mcp.streamable_http_app(path="/")
    app.mount("/", mcp_app_root)

    return app


# Entry point for uvicorn — guarded so tests don't trigger it on import
if os.environ.get("TESTING") != "1":
    app = create_app()
