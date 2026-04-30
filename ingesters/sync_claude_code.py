"""
Claude Code session watcher.
Scans ~/.claude/projects/ for JSONL session files,
extracts user/assistant messages, and POSTs to the Memory MCP server.

Usage:
  python sync_claude_code.py              # one-shot sync
  python sync_claude_code.py --watch      # continuous 60s polling

Environment variables:
  MEMORY_SERVER_URL  - e.g. https://owen-claude-memory.fly.dev
  API_KEY            - Bearer token for /ingest
  CLAUDE_PROJECTS_DIR - override ~/.claude/projects (optional)
"""
import argparse
import json
import os
import platform
import time
import glob
import httpx


def get_default_projects_dir() -> str:
    home = os.path.expanduser("~")
    return os.path.join(home, ".claude", "projects")


def should_include_entry(entry: dict) -> bool:
    return entry.get("type") in ("user", "assistant")


def extract_content(content) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        texts = []
        for block in content:
            if isinstance(block, dict) and block.get("type") == "text":
                texts.append(block.get("text", ""))
        return "".join(texts)
    return ""


def parse_jsonl_entry(entry: dict) -> dict | None:
    if not should_include_entry(entry):
        return None
    message = entry.get("message", {})
    content = extract_content(message.get("content", ""))
    if not content.strip():
        return None
    return {
        "uuid": entry.get("uuid", ""),
        "role": message.get("role", "unknown"),
        "content": content,
        "timestamp": entry.get("timestamp", ""),
    }


def parse_session_file(filepath: str, offset: int = 0) -> tuple[list[dict], dict, int]:
    """Parse a JSONL file from offset. Returns (messages, metadata, new_offset)."""
    messages = []
    metadata = {}
    with open(filepath, "r", encoding="utf-8") as f:
        f.seek(offset)
        data = f.read()
        new_offset = offset + len(data.encode("utf-8"))

    for line in data.strip().split("\n"):
        if not line.strip():
            continue
        try:
            entry = json.loads(line)
        except json.JSONDecodeError:
            continue

        # Extract metadata from first valid entry
        if not metadata and entry.get("sessionId"):
            metadata = {
                "session_id": entry.get("sessionId", ""),
                "cwd": entry.get("cwd", ""),
                "git_branch": entry.get("gitBranch", ""),
                "session_slug": entry.get("slug", ""),
            }

        parsed = parse_jsonl_entry(entry)
        if parsed:
            messages.append(parsed)

    return messages, metadata, new_offset


def load_state(state_path: str) -> dict:
    if os.path.exists(state_path):
        with open(state_path, "r") as f:
            return json.load(f)
    return {}


def save_state(state_path: str, state: dict):
    with open(state_path, "w") as f:
        json.dump(state, f, indent=2)


def find_session_files(projects_dir: str) -> list[str]:
    """Find all .jsonl session files, including subagent files."""
    patterns = [
        os.path.join(projects_dir, "*", "*.jsonl"),
        os.path.join(projects_dir, "*", "*", "subagents", "*.jsonl"),
    ]
    files = []
    for pattern in patterns:
        files.extend(glob.glob(pattern))
    return files


def sync_once(projects_dir: str, server_url: str, api_key: str, state_path: str):
    state = load_state(state_path)
    files = find_session_files(projects_dir)
    machine_name = platform.node()

    for filepath in files:
        file_key = filepath.replace("\\", "/")
        file_size = os.path.getsize(filepath)
        last_offset = state.get(file_key, 0)

        if file_size <= last_offset:
            continue  # no new data

        # Derive project from directory structure
        rel = os.path.relpath(filepath, projects_dir)
        parts = rel.replace("\\", "/").split("/")
        project_slug = parts[0] if parts else "unknown"

        # Determine session_id from filename
        basename = os.path.basename(filepath)
        session_id = basename.replace(".jsonl", "")
        # For subagent files, prefix with parent session
        if "subagents" in filepath.replace("\\", "/"):
            parent_session = parts[1] if len(parts) > 2 else ""
            session_id = f"{parent_session}/sub/{session_id}"

        messages, metadata, new_offset = parse_session_file(filepath, last_offset)

        if messages:
            payload = {
                "source": "claude_code",
                "session_id": metadata.get("session_id", session_id),
                "project": project_slug,
                "machine_name": machine_name,
                "messages": [
                    {"uuid": m["uuid"], "role": m["role"], "content": m["content"], "timestamp": m["timestamp"]}
                    for m in messages
                ],
                "metadata": {
                    "cwd": metadata.get("cwd", ""),
                    "git_branch": metadata.get("git_branch", ""),
                    "session_slug": metadata.get("session_slug", ""),
                },
            }
            try:
                r = httpx.post(
                    f"{server_url}/ingest",
                    json=payload,
                    headers={"Authorization": f"Bearer {api_key}"},
                    timeout=30,
                )
                if r.status_code == 200:
                    state[file_key] = new_offset
                    print(f"  Synced {len(messages)} msgs from {basename}")
                else:
                    print(f"  Failed {basename}: {r.status_code} {r.text[:200]}")
            except Exception as e:
                print(f"  Error syncing {basename}: {e}")
        else:
            # No messages but still advance offset
            state[file_key] = new_offset

    save_state(state_path, state)


def main():
    parser = argparse.ArgumentParser(description="Sync Claude Code sessions to Memory MCP")
    parser.add_argument("--watch", action="store_true", help="Poll every 60 seconds")
    parser.add_argument("--interval", type=int, default=60, help="Poll interval in seconds")
    args = parser.parse_args()

    server_url = os.environ.get("MEMORY_SERVER_URL", "").rstrip("/")
    api_key = os.environ.get("API_KEY", "")
    projects_dir = os.environ.get("CLAUDE_PROJECTS_DIR", get_default_projects_dir())
    state_path = os.path.join(os.path.expanduser("~"), ".claude-memory-sync-state.json")

    if not server_url:
        print("ERROR: MEMORY_SERVER_URL not set")
        return
    if not api_key:
        print("ERROR: API_KEY not set")
        return

    print(f"Projects dir: {projects_dir}")
    print(f"Server: {server_url}")
    print(f"State file: {state_path}")

    if args.watch:
        print(f"Watching every {args.interval}s... (Ctrl+C to stop)")
        while True:
            print(f"\n[{time.strftime('%H:%M:%S')}] Scanning...")
            sync_once(projects_dir, server_url, api_key, state_path)
            time.sleep(args.interval)
    else:
        sync_once(projects_dir, server_url, api_key, state_path)
        print("Done.")


if __name__ == "__main__":
    main()
