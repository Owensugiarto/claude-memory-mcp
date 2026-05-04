"""
MCP Console sync — syncs MCP server configs, skills, memory files,
and extracts tool-call traces from session JSONL files.

Runs alongside sync_claude_code.py. Called from the same PM2 process
or independently.

Usage:
  python sync_console.py              # one-shot sync
  python sync_console.py --watch      # continuous 60s polling

Environment variables:
  MEMORY_SERVER_URL  - e.g. https://owen-claude-memory.fly.dev
  API_KEY            - Bearer token
"""
import argparse
import hashlib
import json
import os
import re
import time
import glob
import httpx

CLAUDE_DIR = os.path.join(os.path.expanduser("~"), ".claude")
STATE_FILE = os.path.join(os.path.expanduser("~"), ".claude-console-sync-state.json")


def load_state(path: str) -> dict:
    if os.path.exists(path):
        with open(path, "r") as f:
            return json.load(f)
    return {}


def save_state(path: str, state: dict):
    with open(path, "w") as f:
        json.dump(state, f, indent=2)


def estimate_tokens(text: str) -> int:
    return max(1, len(text) // 4)


def extract_title_from_md(content: str) -> str:
    for line in content.split("\n"):
        line = line.strip()
        if line.startswith("# "):
            return line[2:].strip()
    return ""


def extract_frontmatter(content: str) -> dict:
    if not content.startswith("---"):
        return {}
    end = content.find("---", 3)
    if end < 0:
        return {}
    fm = content[3:end].strip()
    result = {}
    for line in fm.split("\n"):
        if ":" in line:
            k, v = line.split(":", 1)
            result[k.strip()] = v.strip()
    return result


# ── Sync MCP servers from settings ─────────────────────────────────

def sync_servers(server_url: str, api_key: str, state: dict) -> dict:
    settings_paths = [
        os.path.join(CLAUDE_DIR, "settings.json"),
        os.path.join(CLAUDE_DIR, "settings.local.json"),
    ]

    servers = []
    for sp in settings_paths:
        if not os.path.exists(sp):
            continue
        try:
            with open(sp, "r", encoding="utf-8") as f:
                settings = json.load(f)
        except (json.JSONDecodeError, OSError):
            continue

        mcp_servers = settings.get("mcpServers", {})
        for name, cfg in mcp_servers.items():
            transport = "stdio"
            command = ""
            url = ""
            if "command" in cfg:
                command = cfg["command"]
                if isinstance(cfg.get("args"), list):
                    command += " " + " ".join(cfg["args"])
            if "url" in cfg:
                transport = "http+sse"
                url = cfg["url"]

            servers.append({
                "id": name,
                "name": name,
                "transport": transport,
                "command": command,
                "url": url,
                "status": "connected",
                "tool_count": 0,
                "resource_count": 0,
                "version": "",
                "config_json": json.dumps(cfg),
            })

    if not servers:
        return state

    content_hash = hashlib.md5(json.dumps(servers, sort_keys=True).encode()).hexdigest()
    if state.get("servers_hash") == content_hash:
        return state

    try:
        r = httpx.post(
            f"{server_url}/api/servers/sync",
            json={"servers": servers},
            headers={"Authorization": f"Bearer {api_key}"},
            timeout=30,
        )
        if r.status_code == 200:
            state["servers_hash"] = content_hash
            print(f"  Synced {len(servers)} MCP servers")
        else:
            print(f"  Failed servers sync: {r.status_code} {r.text[:200]}")
    except Exception as e:
        print(f"  Error syncing servers: {e}")

    return state


# ── Sync skills ────────────────────────────────────────────────────

def find_skill_files() -> list[str]:
    patterns = [
        os.path.join(CLAUDE_DIR, "skills", "**", "*.md"),
        os.path.join(CLAUDE_DIR, "skills", "**", "SKILL.md"),
    ]
    files = set()
    for pattern in patterns:
        files.update(glob.glob(pattern, recursive=True))
    return sorted(files)


def sync_skills(server_url: str, api_key: str, state: dict) -> dict:
    files = find_skill_files()
    skills = []

    for filepath in files:
        try:
            with open(filepath, "r", encoding="utf-8") as f:
                content = f.read()
        except (OSError, UnicodeDecodeError):
            continue

        rel = os.path.relpath(filepath, os.path.join(CLAUDE_DIR, "skills"))
        name = rel.replace("\\", "/")
        fm = extract_frontmatter(content)
        title = fm.get("name", "") or fm.get("title", "") or extract_title_from_md(content) or name

        # Extract tags from directory name
        parts = name.split("/")
        tags = [parts[0]] if len(parts) > 1 else []

        # Get description from frontmatter
        desc = fm.get("description", "")

        skills.append({
            "name": name,
            "title": title,
            "content": content,
            "tokens": estimate_tokens(content),
            "tags": json.dumps(tags),
            "description": desc[:500],
        })

    if not skills:
        return state

    content_hash = hashlib.md5(
        json.dumps([(s["name"], s["tokens"]) for s in skills], sort_keys=True).encode()
    ).hexdigest()
    if state.get("skills_hash") == content_hash:
        return state

    try:
        r = httpx.post(
            f"{server_url}/api/skills/sync",
            json={"skills": skills},
            headers={"Authorization": f"Bearer {api_key}"},
            timeout=60,
        )
        if r.status_code == 200:
            state["skills_hash"] = content_hash
            print(f"  Synced {len(skills)} skills")
        else:
            print(f"  Failed skills sync: {r.status_code} {r.text[:200]}")
    except Exception as e:
        print(f"  Error syncing skills: {e}")

    return state


# ── Sync memory files ──────────────────────────────────────────────

def find_memory_files() -> list[str]:
    memory_dir = os.path.join(CLAUDE_DIR, "memory")
    if not os.path.exists(memory_dir):
        return []
    return sorted(glob.glob(os.path.join(memory_dir, "*.md")))


def sync_memory_files(server_url: str, api_key: str, state: dict) -> dict:
    files = find_memory_files()
    memory_items = []

    for filepath in files:
        try:
            with open(filepath, "r", encoding="utf-8") as f:
                content = f.read()
        except (OSError, UnicodeDecodeError):
            continue

        name = os.path.basename(filepath)
        if name == "MEMORY.md":
            continue  # skip the index file

        fm = extract_frontmatter(content)
        title = fm.get("name", "") or extract_title_from_md(content) or name
        kind = fm.get("type", "global")
        desc = fm.get("description", "")

        # Determine scope from filename pattern
        scope = None
        if kind == "scoped" or name.startswith("project_"):
            scope = name.replace(".md", "").replace("project_", "")

        memory_items.append({
            "name": name,
            "title": title,
            "content": content,
            "tokens": estimate_tokens(content),
            "kind": kind if kind in ("global", "scoped", "user", "feedback", "project", "reference") else "global",
            "scope": scope,
            "description": desc[:500],
        })

    if not memory_items:
        return state

    content_hash = hashlib.md5(
        json.dumps([(m["name"], m["tokens"]) for m in memory_items], sort_keys=True).encode()
    ).hexdigest()
    if state.get("memories_hash") == content_hash:
        return state

    try:
        r = httpx.post(
            f"{server_url}/api/memory-files/sync",
            json={"files": memory_items},
            headers={"Authorization": f"Bearer {api_key}"},
            timeout=60,
        )
        if r.status_code == 200:
            state["memories_hash"] = content_hash
            print(f"  Synced {len(memory_items)} memory files")
        else:
            print(f"  Failed memory sync: {r.status_code} {r.text[:200]}")
    except Exception as e:
        print(f"  Error syncing memories: {e}")

    return state


# ── Extract traces from session JSONL ──────────────────────────────

def extract_traces_from_jsonl(filepath: str, offset: int) -> tuple[list[dict], int]:
    """Extract tool_use/tool_result pairs as traces from JSONL."""
    traces = []
    try:
        with open(filepath, "r", encoding="utf-8") as f:
            f.seek(offset)
            data = f.read()
            new_offset = offset + len(data.encode("utf-8"))
    except (OSError, UnicodeDecodeError):
        return [], offset

    entries = []
    for line in data.strip().split("\n"):
        if not line.strip():
            continue
        try:
            entries.append(json.loads(line))
        except json.JSONDecodeError:
            continue

    # Find tool_use blocks in assistant messages
    for entry in entries:
        if entry.get("type") != "assistant":
            continue
        message = entry.get("message", {})
        content = message.get("content", [])
        if not isinstance(content, list):
            continue

        session_id = entry.get("sessionId", "")
        timestamp = entry.get("timestamp", "")

        for block in content:
            if not isinstance(block, dict):
                continue
            if block.get("type") != "tool_use":
                continue

            tool_use_id = block.get("id", "")
            tool_name = block.get("name", "")
            args = block.get("input", {})

            # Derive server from tool name prefix (e.g., "mcp__github__create_issue" → "github")
            server_id = ""
            if tool_name.startswith("mcp__"):
                parts = tool_name.split("__")
                if len(parts) >= 3:
                    server_id = parts[1]
                    tool_name = "__".join(parts[2:])

            # Generate a stable trace ID
            trace_id = hashlib.md5(f"{session_id}:{tool_use_id}:{timestamp}".encode()).hexdigest()[:16]

            args_str = json.dumps(args)
            args_preview = args_str[:200] if len(args_str) > 200 else args_str

            traces.append({
                "id": f"trace_{trace_id}",
                "timestamp": timestamp,
                "level": "info",
                "server_id": server_id,
                "tool": tool_name,
                "status": 200,  # default, updated if we find tool_result
                "duration_ms": 0,
                "caller": "claude-code",
                "session_id": session_id,
                "args_json": args_str[:10000],
                "response_json": "",
                "spans_json": "[]",
                "args_preview": args_preview,
                "response_preview": "",
            })

    # Match tool_result blocks to update status/response
    for entry in entries:
        if entry.get("type") != "user":
            continue
        message = entry.get("message", {})
        content = message.get("content", [])
        if not isinstance(content, list):
            continue

        for block in content:
            if not isinstance(block, dict):
                continue
            if block.get("type") != "tool_result":
                continue

            tool_use_id = block.get("tool_use_id", "")
            is_error = block.get("is_error", False)
            result_content = block.get("content", "")
            if isinstance(result_content, list):
                result_content = " ".join(
                    b.get("text", "") for b in result_content if isinstance(b, dict) and b.get("type") == "text"
                )

            # Find matching trace by tool_use_id
            for trace in traces:
                if tool_use_id in trace["id"] or tool_use_id in trace.get("args_json", ""):
                    trace["status"] = 500 if is_error else 200
                    trace["response_preview"] = str(result_content)[:200]
                    trace["response_json"] = str(result_content)[:10000]
                    if is_error:
                        trace["level"] = "error"
                    break

    return traces, new_offset


def sync_traces(server_url: str, api_key: str, state: dict) -> dict:
    projects_dir = os.path.join(CLAUDE_DIR, "projects")
    if not os.path.exists(projects_dir):
        return state

    trace_offsets = state.get("trace_offsets", {})
    all_traces = []

    patterns = [
        os.path.join(projects_dir, "*", "*.jsonl"),
        os.path.join(projects_dir, "*", "*", "subagents", "*.jsonl"),
    ]
    files = []
    for pattern in patterns:
        files.extend(glob.glob(pattern))

    for filepath in files:
        file_key = filepath.replace("\\", "/")
        file_size = os.path.getsize(filepath)
        last_offset = trace_offsets.get(file_key, 0)

        if file_size <= last_offset:
            continue

        traces, new_offset = extract_traces_from_jsonl(filepath, last_offset)
        if traces:
            all_traces.extend(traces)
        trace_offsets[file_key] = new_offset

    state["trace_offsets"] = trace_offsets

    if not all_traces:
        return state

    # Batch upload traces (max 200 at a time)
    for i in range(0, len(all_traces), 200):
        batch = all_traces[i:i + 200]
        try:
            r = httpx.post(
                f"{server_url}/api/traces/ingest",
                json={"traces": batch},
                headers={"Authorization": f"Bearer {api_key}"},
                timeout=30,
            )
            if r.status_code == 200:
                print(f"  Synced {len(batch)} traces")
            else:
                print(f"  Failed traces ingest: {r.status_code} {r.text[:200]}")
        except Exception as e:
            print(f"  Error syncing traces: {e}")

    return state


# ── Main ───────────────────────────────────────────────────────────

def sync_all(server_url: str, api_key: str):
    state = load_state(STATE_FILE)
    state = sync_servers(server_url, api_key, state)
    state = sync_skills(server_url, api_key, state)
    state = sync_memory_files(server_url, api_key, state)
    state = sync_traces(server_url, api_key, state)
    save_state(STATE_FILE, state)


def main():
    parser = argparse.ArgumentParser(description="Sync MCP Console data to Memory MCP server")
    parser.add_argument("--watch", action="store_true", help="Poll every 60 seconds")
    parser.add_argument("--interval", type=int, default=60, help="Poll interval in seconds")
    args = parser.parse_args()

    server_url = os.environ.get("MEMORY_SERVER_URL", "").rstrip("/")
    api_key = os.environ.get("API_KEY", "")

    if not server_url:
        print("ERROR: MEMORY_SERVER_URL not set")
        return
    if not api_key:
        print("ERROR: API_KEY not set")
        return

    print(f"Server: {server_url}")
    print(f"State file: {STATE_FILE}")

    if args.watch:
        print(f"Watching every {args.interval}s... (Ctrl+C to stop)")
        while True:
            print(f"\n[{time.strftime('%H:%M:%S')}] Console sync...")
            sync_all(server_url, api_key)
            time.sleep(args.interval)
    else:
        sync_all(server_url, api_key)
        print("Done.")


if __name__ == "__main__":
    main()
