import type {
  DashboardResponse,
  ServersResponse,
  ServerDetailResponse,
  TracesResponse,
  TraceDetailResponse,
  TraceParams,
  SkillsResponse,
  SkillDetailResponse,
  MemoryFilesResponse,
  MemoryFileDetailResponse,
  UsageResponse,
  SessionsResponse,
  SessionDetailResponse,
  SessionParams,
  SearchResponse,
} from './types';

const BASE = '/api/proxy';

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  return res.json();
}

export const api = {
  dashboard: () => apiFetch<DashboardResponse>('/dashboard'),
  servers: () => apiFetch<ServersResponse>('/servers'),
  server: (id: string) => apiFetch<ServerDetailResponse>(`/servers/${id}`),
  traces: (params?: TraceParams) => {
    const qs = params ? `?${new URLSearchParams(params as Record<string, string>)}` : '';
    return apiFetch<TracesResponse>(`/traces${qs}`);
  },
  trace: (id: string) => apiFetch<TraceDetailResponse>(`/traces/${id}`),
  skills: () => apiFetch<SkillsResponse>('/skills'),
  skill: (name: string) => apiFetch<SkillDetailResponse>(`/skills/${name}`),
  memoryFiles: () => apiFetch<MemoryFilesResponse>('/memory-files'),
  memoryFile: (name: string) => apiFetch<MemoryFileDetailResponse>(`/memory-files/${name}`),
  usage: (period?: string) => apiFetch<UsageResponse>(`/usage?period=${period || 'today'}`),
  sessions: (params?: SessionParams) => {
    const qs = params ? `?${new URLSearchParams(params as Record<string, string>)}` : '';
    return apiFetch<SessionsResponse>(`/sessions${qs}`);
  },
  session: (id: string) => apiFetch<SessionDetailResponse>(`/sessions/${id}`),
  search: (q: string) => apiFetch<SearchResponse>(`/search?q=${encodeURIComponent(q)}`),
};
