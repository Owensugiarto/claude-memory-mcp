import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getHealth,
  searchMemory,
  getSession,
  listRecentSessions,
  getMemoryStats,
  resetSession,
} from "../api";

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

function mcpResponse(result: unknown, sessionId?: string) {
  const headers = new Headers({ "content-type": "application/json" });
  if (sessionId) headers.set("Mcp-Session", sessionId);
  return {
    ok: true,
    status: 200,
    headers,
    json: () => Promise.resolve({ jsonrpc: "2.0", id: 1, result }),
    text: () =>
      Promise.resolve(JSON.stringify({ jsonrpc: "2.0", id: 1, result })),
  };
}

function toolResponse(data: unknown, sessionId?: string) {
  return mcpResponse(
    { content: [{ type: "text", text: JSON.stringify(data) }] },
    sessionId
  );
}

beforeEach(() => {
  mockFetch.mockReset();
  resetSession();
});

describe("getHealth", () => {
  it("fetches /api/health and returns JSON", async () => {
    const payload = { ok: true, total_sessions: 5, total_messages: 100, by_source: {}, by_project: {} };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(payload),
    });

    const result = await getHealth();
    expect(result).toEqual(payload);
    expect(mockFetch).toHaveBeenCalledWith("/api/health");
  });

  it("throws on non-ok response", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });
    await expect(getHealth()).rejects.toThrow("Health check failed: 500");
  });
});

describe("MCP initialization", () => {
  it("sends initialize then notifications/initialized before first tool call", async () => {
    // initialize response
    mockFetch.mockResolvedValueOnce(
      mcpResponse(
        { protocolVersion: "2025-03-26", capabilities: {}, serverInfo: { name: "mem0", version: "1.0" } },
        "sess-abc"
      )
    );
    // initialized notification
    mockFetch.mockResolvedValueOnce(mcpResponse(undefined));
    // tool call
    mockFetch.mockResolvedValueOnce(
      toolResponse({ total_sessions: 1, total_messages: 2, by_source: {}, by_project: {} })
    );

    await getMemoryStats();

    // First call: initialize
    const initCall = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(initCall.method).toBe("initialize");
    expect(initCall.params.clientInfo.name).toBe("mem0-dashboard");

    // Second call: notifications/initialized
    const notifCall = JSON.parse(mockFetch.mock.calls[1][1].body);
    expect(notifCall.method).toBe("notifications/initialized");

    // Third call: actual tool
    const toolCall = JSON.parse(mockFetch.mock.calls[2][1].body);
    expect(toolCall.method).toBe("tools/call");
    expect(toolCall.params.name).toBe("memory_stats");
  });

  it("reuses session after init (no re-initialize)", async () => {
    // init
    mockFetch.mockResolvedValueOnce(mcpResponse({}, "sess-1"));
    // initialized notif
    mockFetch.mockResolvedValueOnce(mcpResponse(undefined));
    // first tool call
    mockFetch.mockResolvedValueOnce(toolResponse({ total_sessions: 0, total_messages: 0, by_source: {}, by_project: {} }));
    // second tool call
    mockFetch.mockResolvedValueOnce(toolResponse({ results: [], total: 0 }));

    await getMemoryStats();
    await searchMemory({ query: "test" });

    // Should be 4 calls total (init, notif, tool1, tool2) — no second init
    expect(mockFetch).toHaveBeenCalledTimes(4);
  });
});

describe("searchMemory", () => {
  function setupInit() {
    mockFetch.mockResolvedValueOnce(mcpResponse({}, "s1"));
    mockFetch.mockResolvedValueOnce(mcpResponse(undefined));
  }

  it("sends correct JSON-RPC format with all filters", async () => {
    setupInit();
    mockFetch.mockResolvedValueOnce(toolResponse({ results: [], total: 0 }));

    await searchMemory({ query: "hello", source: "claude_code", project: "test", days: 7, limit: 10 });

    const body = JSON.parse(mockFetch.mock.calls[2][1].body);
    expect(body.jsonrpc).toBe("2.0");
    expect(body.method).toBe("tools/call");
    expect(body.params.name).toBe("search_memory");
    expect(body.params.arguments).toEqual({
      query: "hello",
      source: "claude_code",
      project: "test",
      days: 7,
      limit: 10,
    });
  });

  it("omits undefined optional filters", async () => {
    setupInit();
    mockFetch.mockResolvedValueOnce(toolResponse({ results: [], total: 0 }));

    await searchMemory({ query: "test" });

    const body = JSON.parse(mockFetch.mock.calls[2][1].body);
    expect(body.params.arguments).toEqual({ query: "test" });
  });
});

describe("getSession", () => {
  function setupInit() {
    mockFetch.mockResolvedValueOnce(mcpResponse({}, "s1"));
    mockFetch.mockResolvedValueOnce(mcpResponse(undefined));
  }

  it("passes session_id argument", async () => {
    setupInit();
    const sessionData = {
      session: { session_id: "abc", source: "claude_code", project: null, machine_name: null, session_slug: null, created_at: "", updated_at: "" },
      messages: [],
    };
    mockFetch.mockResolvedValueOnce(toolResponse(sessionData));

    const result = await getSession("abc");
    expect(result.session.session_id).toBe("abc");

    const body = JSON.parse(mockFetch.mock.calls[2][1].body);
    expect(body.params.arguments).toEqual({ session_id: "abc" });
  });
});

describe("listRecentSessions", () => {
  function setupInit() {
    mockFetch.mockResolvedValueOnce(mcpResponse({}, "s1"));
    mockFetch.mockResolvedValueOnce(mcpResponse(undefined));
  }

  it("defaults limit to 20", async () => {
    setupInit();
    mockFetch.mockResolvedValueOnce(toolResponse({ sessions: [], total: 0 }));

    await listRecentSessions();

    const body = JSON.parse(mockFetch.mock.calls[2][1].body);
    expect(body.params.arguments).toEqual({ limit: 20 });
  });

  it("passes optional source, project, days", async () => {
    setupInit();
    mockFetch.mockResolvedValueOnce(toolResponse({ sessions: [], total: 0 }));

    await listRecentSessions(10, "claude_ai", "myproj", 30);

    const body = JSON.parse(mockFetch.mock.calls[2][1].body);
    expect(body.params.arguments).toEqual({
      limit: 10,
      source: "claude_ai",
      project: "myproj",
      days: 30,
    });
  });
});

describe("resetSession", () => {
  it("forces re-initialization on next call", async () => {
    // First init cycle
    mockFetch.mockResolvedValueOnce(mcpResponse({}, "s1"));
    mockFetch.mockResolvedValueOnce(mcpResponse(undefined));
    mockFetch.mockResolvedValueOnce(toolResponse({ total_sessions: 0, total_messages: 0, by_source: {}, by_project: {} }));

    await getMemoryStats();
    resetSession();

    // Second init cycle after reset
    mockFetch.mockResolvedValueOnce(mcpResponse({}, "s2"));
    mockFetch.mockResolvedValueOnce(mcpResponse(undefined));
    mockFetch.mockResolvedValueOnce(toolResponse({ total_sessions: 0, total_messages: 0, by_source: {}, by_project: {} }));

    await getMemoryStats();

    // 6 total: init1 + notif1 + tool1 + init2 + notif2 + tool2
    expect(mockFetch).toHaveBeenCalledTimes(6);
  });
});

describe("SSE response handling", () => {
  it("parses last data line from text/event-stream response", async () => {
    const sseHeaders = new Headers({
      "content-type": "text/event-stream",
    });
    sseHeaders.set("Mcp-Session", "sse-sess");

    const sseBody = `event: message\ndata: ${JSON.stringify({ jsonrpc: "2.0", id: 1, result: { protocolVersion: "2025-03-26" } })}\n\n`;

    // init — return as SSE
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: sseHeaders,
      text: () => Promise.resolve(sseBody),
    });
    // notif
    mockFetch.mockResolvedValueOnce(mcpResponse(undefined));
    // tool call
    mockFetch.mockResolvedValueOnce(toolResponse({ total_sessions: 5, total_messages: 10, by_source: {}, by_project: {} }));

    const stats = await getMemoryStats();
    expect(stats.total_sessions).toBe(5);
  });
});

describe("error handling", () => {
  function setupInit() {
    mockFetch.mockResolvedValueOnce(mcpResponse({}, "s1"));
    mockFetch.mockResolvedValueOnce(mcpResponse(undefined));
  }

  it("throws on MCP error response after retry", async () => {
    // callTool retries once on error (resets session + re-inits), so we need mocks for both attempts
    // Attempt 1: init + notif + tool-error
    setupInit();
    mockFetch.mockResolvedValueOnce({
      ok: true,
      headers: new Headers({ "content-type": "application/json" }),
      json: () => Promise.resolve({ jsonrpc: "2.0", id: 3, error: { code: -32600, message: "Bad request" } }),
    });
    // Attempt 2 (retry): init + notif + tool-error again
    setupInit();
    mockFetch.mockResolvedValueOnce({
      ok: true,
      headers: new Headers({ "content-type": "application/json" }),
      json: () => Promise.resolve({ jsonrpc: "2.0", id: 4, error: { code: -32600, message: "Bad request" } }),
    });

    await expect(getMemoryStats()).rejects.toThrow("Tool memory_stats failed: Bad request");
  });

  it("throws on HTTP error after retry", async () => {
    // Attempt 1: init + notif + HTTP error
    setupInit();
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 503,
      statusText: "Service Unavailable",
      headers: new Headers(),
    });
    // Attempt 2 (retry): init + notif + HTTP error again
    setupInit();
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 503,
      statusText: "Service Unavailable",
      headers: new Headers(),
    });

    await expect(getMemoryStats()).rejects.toThrow("MCP request failed: 503");
  });
});
