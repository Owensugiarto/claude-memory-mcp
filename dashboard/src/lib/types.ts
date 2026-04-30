// === API Response Types ===

export interface HealthResponse {
  ok: boolean;
  total_sessions: number;
  total_messages: number;
  by_source: Record<string, number>;
  by_project: Record<string, number>;
}

export interface MemoryStats {
  total_sessions: number;
  total_messages: number;
  by_source: Record<string, number>;
  by_project: Record<string, number>;
}

export interface SearchResult {
  content: string;
  role: string;
  session_id: string;
  project: string | null;
  source: string;
  timestamp: string;
  score: number;
}

export interface SearchResponse {
  results: SearchResult[];
  total: number;
}

export interface SessionSummary {
  session_id: string;
  source: string;
  project: string | null;
  machine_name: string | null;
  session_slug: string | null;
  created_at: string;
  updated_at: string;
  message_count: number;
  first_message: string | null;
  last_message: string | null;
}

export interface SessionListResponse {
  sessions: SessionSummary[];
  total: number;
}

export interface SessionMessage {
  role: string;
  content: string;
  timestamp: string;
}

export interface SessionDetail {
  session_id: string;
  source: string;
  project: string | null;
  machine_name: string | null;
  session_slug: string | null;
  created_at: string;
  updated_at: string;
}

export interface SessionResponse {
  session: SessionDetail;
  messages: SessionMessage[];
}

// === MCP Protocol Types ===

export interface McpRequest {
  jsonrpc: "2.0";
  id?: number;
  method: string;
  params?: Record<string, unknown>;
}

export interface McpToolContent {
  type: "text";
  text: string;
}

export interface McpResponse {
  jsonrpc: "2.0";
  id?: number;
  result?: {
    content?: McpToolContent[];
    protocolVersion?: string;
    capabilities?: Record<string, unknown>;
    serverInfo?: { name: string; version: string };
  };
  error?: {
    code: number;
    message: string;
  };
}

// === UI Types ===

export type Source = "claude_code" | "claude_ai";

export interface SearchFilters {
  query: string;
  source?: Source | "";
  project?: string;
  days?: number;
  limit?: number;
}
