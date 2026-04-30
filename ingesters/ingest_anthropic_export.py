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
