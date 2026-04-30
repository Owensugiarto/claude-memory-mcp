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
        if request.url.path in ("/health", "/docs", "/openapi.json"):
            return await call_next(request)
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

        if inserted > 0:
            try:
                await embed_new_messages(_db, req.session_id)
            except Exception as e:
                print(f"Embedding failed (non-fatal): {e}")

        return {"ok": True, "session_id": req.session_id, "messages_inserted": inserted}

    # Mount MCP at /mcp
    mcp_app = mcp.streamable_http_app()
    app.mount("/mcp", mcp_app)

    return app


# Entry point for uvicorn — guarded so tests don't trigger it on import
if os.environ.get("TESTING") != "1":
    app = create_app()
