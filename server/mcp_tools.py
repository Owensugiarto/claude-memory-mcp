import json
import numpy as np
from mcp.server.fastmcp import FastMCP
from server.database import Database
from server.embeddings import batch_embed
from server.search import cosine_search, rrf_fuse

mcp = FastMCP("claude-memory", streamable_http_path="/")

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
            "content": msg["content"][:2000],
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
