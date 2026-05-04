/* ── API Response Types ── */

export interface DashboardStats {
  requests: number;
  p95: number;
  errorRate: number;
  activeSessions: number;
}

export interface ActivityItem {
  dot: 'success' | 'warning' | 'error' | 'idle';
  title: string;
  meta: string;
  time: string;
  server: string;
}

export interface ServerRow {
  name: string;
  transport: string;
  tools: string;
  resources: string;
  requests: string;
  p95: string;
  errors: string;
  lastCall: string;
  status: 'success' | 'warning' | 'error' | 'idle';
}

export interface DashboardResponse {
  stats: DashboardStats;
  activity: ActivityItem[];
  servers: ServerRow[];
}

export interface ServerInfo {
  id: string;
  name: string;
  transport: string;
  status: 'success' | 'warning' | 'error' | 'idle';
  version: string;
  pid: number;
  uptime: string;
  url: string;
}

export interface ToolInfo {
  name: string;
  desc: string;
  calls: string;
  p95: string;
  err: string;
}

export interface ServerDetailResponse {
  server: ServerInfo;
  tools: ToolInfo[];
  resources: unknown[];
  prompts: unknown[];
}

export interface ServersResponse {
  servers: ServerRow[];
}

export interface TraceRow {
  time: string;
  level: 'info' | 'warn' | 'error';
  server: string;
  tool: string;
  status: number;
  dur: string;
  caller: string;
}

export interface TracesResponse {
  traces: TraceRow[];
  total: number;
}

export interface TraceDetailResponse {
  trace: TraceRow;
  spans: SpanInfo[];
  args: string;
}

export interface SpanInfo {
  name: string;
  start: number;
  dur: number;
  color: string;
}

export interface TraceParams {
  server?: string;
  level?: string;
  status?: string;
  limit?: string;
}

export interface SessionInfo {
  id: string;
  started: string;
  chats: number;
  in: number;
  out: number;
  cached: number;
  cost: string;
  model: string;
}

export interface ChatInfo {
  id: string;
  title: string;
  turns: number;
  in: number;
  out: number;
  ctxPct: number;
  started: string;
  server: string;
}

export interface UsageResponse {
  stats: {
    tokensToday: number;
    contextPct: number;
    activeSessions: number;
    costToday: string;
  };
  sessions: SessionInfo[];
  chats: ChatInfo[];
  models: ModelUsage[];
}

export interface ModelUsage {
  name: string;
  tok: number;
  cost: string;
  color: string;
}

export interface SkillInfo {
  name: string;
  title: string;
  tokens: number;
  used: string;
  updated: string;
  tags: string[];
}

export interface SkillsResponse {
  skills: SkillInfo[];
}

export interface SkillDetailResponse {
  skill: SkillInfo;
  content: string;
}

export interface MemoryFileInfo {
  name: string;
  title: string;
  tokens: number;
  kind: 'global' | 'scoped';
  scope?: string;
  updated: string;
}

export interface MemoryFilesResponse {
  files: MemoryFileInfo[];
}

export interface MemoryFileDetailResponse {
  file: MemoryFileInfo;
  content: string;
}

export interface LogInfo {
  name: string;
  title: string;
  turns: number;
  tokens: number;
  started: string;
  model: string;
}

export interface SessionsResponse {
  sessions: LogInfo[];
}

export interface SessionDetailResponse {
  session: LogInfo;
  content: string;
}

export interface SessionParams {
  limit?: string;
  offset?: string;
}

export interface SearchResponse {
  results: Array<{
    type: string;
    name: string;
    title: string;
    snippet: string;
  }>;
}

export type PageId =
  | 'overview'
  | 'servers'
  | 'traces'
  | 'usage'
  | 'skills'
  | 'memories'
  | 'sessions'
  | 'search';

export interface AccentConfig {
  default: string;
  hover: string;
  dim: string;
  fg: string;
  swatch: string;
}

export type AccentName = 'cobalt' | 'lime' | 'amber' | 'magenta' | 'emerald';
export type DensityName = 'compact' | 'medium' | 'roomy';
