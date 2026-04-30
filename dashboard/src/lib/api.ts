import type {
  HealthResponse,
  MemoryStats,
  SearchResponse,
  SessionListResponse,
  SessionResponse,
  McpRequest,
  McpResponse,
  SearchFilters,
} from "./types";

const PROXY_URL = "/api/mcp";
const HEALTH_URL = "/api/health";

let mcpSessionId: string | null = null;
let requestId = 0;
let initPromise: Promise<void> | null = null;

function nextId(): number {
  return ++requestId;
}

async function mcpRaw(body: McpRequest): Promise<McpResponse> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
  };
  if (mcpSessionId) {
    headers["Mcp-Session"] = mcpSessionId;
  }

  const res = await fetch(PROXY_URL, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`MCP request failed: ${res.status} ${res.statusText}`);
  }

  const sessionHeader = res.headers.get("Mcp-Session");
  if (sessionHeader) {
    mcpSessionId = sessionHeader;
  }

  const contentType = res.headers.get("content-type") || "";

  if (contentType.includes("text/event-stream")) {
    const text = await res.text();
    const lines = text.split("\n");
    let lastData: McpResponse | null = null;
    for (const line of lines) {
      if (line.startsWith("data: ")) {
        try {
          lastData = JSON.parse(line.slice(6));
        } catch {
          // skip malformed lines
        }
      }
    }
    if (!lastData) throw new Error("No data in SSE response");
    return lastData;
  }

  return res.json();
}

async function initialize(): Promise<void> {
  const initRes = await mcpRaw({
    jsonrpc: "2.0",
    id: nextId(),
    method: "initialize",
    params: {
      protocolVersion: "2025-03-26",
      capabilities: {},
      clientInfo: { name: "mem0-dashboard", version: "1.0.0" },
    },
  });

  if (initRes.error) {
    throw new Error(`MCP init failed: ${initRes.error.message}`);
  }

  await mcpRaw({
    jsonrpc: "2.0",
    method: "notifications/initialized",
  });
}

async function ensureInitialized(): Promise<void> {
  if (mcpSessionId) return;
  if (!initPromise) {
    initPromise = initialize().catch((err) => {
      initPromise = null;
      throw err;
    });
  }
  await initPromise;
}

async function callTool<T>(name: string, args: Record<string, unknown> = {}, retried = false): Promise<T> {
  await ensureInitialized();

  try {
    const res = await mcpRaw({
      jsonrpc: "2.0",
      id: nextId(),
      method: "tools/call",
      params: { name, arguments: args },
    });

    if (res.error) {
      throw new Error(`Tool ${name} failed: ${res.error.message}`);
    }

    const textContent = res.result?.content?.find((c) => c.type === "text");
    if (!textContent) {
      throw new Error(`Tool ${name} returned no text content`);
    }

    return JSON.parse(textContent.text) as T;
  } catch (err) {
    // Session expired or server error — reset and retry once
    if (!retried) {
      resetSession();
      return callTool<T>(name, args, true);
    }
    throw err;
  }
}

// === Public API ===

export async function getHealth(): Promise<HealthResponse> {
  const res = await fetch(HEALTH_URL);
  if (!res.ok) throw new Error(`Health check failed: ${res.status}`);
  return res.json();
}

export async function searchMemory(filters: SearchFilters): Promise<SearchResponse> {
  const args: Record<string, unknown> = { query: filters.query };
  if (filters.source) args.source = filters.source;
  if (filters.project) args.project = filters.project;
  if (filters.days) args.days = filters.days;
  if (filters.limit) args.limit = filters.limit;
  return callTool<SearchResponse>("search_memory", args);
}

export async function getSession(sessionId: string): Promise<SessionResponse> {
  return callTool<SessionResponse>("get_session", { session_id: sessionId });
}

export async function listRecentSessions(
  limit = 20,
  source?: string,
  project?: string,
  days?: number
): Promise<SessionListResponse> {
  const args: Record<string, unknown> = { limit };
  if (source) args.source = source;
  if (project) args.project = project;
  if (days) args.days = days;
  return callTool<SessionListResponse>("list_recent_sessions", args);
}

export async function getMemoryStats(): Promise<MemoryStats> {
  return callTool<MemoryStats>("memory_stats");
}

export function resetSession(): void {
  mcpSessionId = null;
  initPromise = null;
  requestId = 0;
}
