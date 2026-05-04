import { useState, useEffect, useCallback } from 'react';
import { Icon } from '../components/ui/icon';
import { MdSurface } from '../components/ui/md-surface';

interface Session {
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

interface Message {
  role: string;
  content: string;
  timestamp: string;
}

interface SessionDetail {
  session: {
    session_id: string;
    source: string;
    project: string | null;
    machine_name: string | null;
    session_slug: string | null;
    created_at: string;
    updated_at: string;
  };
  messages: Message[];
}

const BASE = '/api/proxy';

async function fetchSessions(source?: string, project?: string, limit = 50): Promise<Session[]> {
  const params = new URLSearchParams();
  params.set('limit', String(limit));
  if (source) params.set('source', source);
  if (project) params.set('project', project);
  const res = await fetch(`${BASE}/sessions?${params}`);
  if (!res.ok) return [];
  const data = await res.json();
  return data.sessions || [];
}

async function fetchSession(id: string): Promise<SessionDetail | null> {
  const res = await fetch(`${BASE}/sessions/${encodeURIComponent(id)}`);
  if (!res.ok) return null;
  return res.json();
}

function formatTime(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffDays === 0) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function sourceLabel(src: string): string {
  if (src === 'claude_code') return 'Claude Code';
  if (src === 'claude_ai') return 'Claude.ai';
  return src;
}

function sourceBadgeClass(src: string): string {
  if (src === 'claude_code') return 'badge badge-accent';
  if (src === 'claude_ai') return 'badge badge-success';
  return 'badge';
}

function extractTitle(messages: Message[], slug: string | null): string {
  if (slug) return slug.replace(/-/g, ' ').replace(/^\w/, c => c.toUpperCase());
  // Try to get first user message as title
  const first = messages.find(m => m.role === 'user' || m.role === 'human');
  if (first) {
    const text = first.content.slice(0, 120).split('\n')[0];
    return text || 'Untitled session';
  }
  return 'Untitled session';
}

function MessageBubble({ msg }: { msg: Message }) {
  const isUser = msg.role === 'user' || msg.role === 'human';
  const time = msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '';

  return (
    <div style={{ padding: '14px 0', borderBottom: '1px solid var(--color-border-0)' }}>
      <div className="row gap-3" style={{ marginBottom: 8 }}>
        <span className="t-mono-sm" style={{
          color: isUser ? 'var(--accent)' : 'var(--color-fg-1)',
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
        }}>
          {isUser ? 'Human' : 'Assistant'}
        </span>
        {time && <span className="t-mono-sm fg-2">{time}</span>}
      </div>
      <div style={{
        color: 'var(--color-fg-1)',
        fontSize: 13,
        lineHeight: 1.65,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        maxHeight: isUser ? undefined : 600,
        overflow: isUser ? undefined : 'auto',
      }}>
        {msg.content.length > 3000 ? msg.content.slice(0, 3000) + '\n\n[...truncated]' : msg.content}
      </div>
    </div>
  );
}

export function SessionLogs() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<SessionDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [sourceFilter, setSourceFilter] = useState<string>('');
  const [projectFilter, setProjectFilter] = useState<string>('');

  // Load sessions
  const loadSessions = useCallback(async () => {
    setLoading(true);
    const data = await fetchSessions(sourceFilter || undefined, projectFilter || undefined);
    setSessions(data);
    setLoading(false);
    if (data.length > 0 && !selectedId) {
      setSelectedId(data[0].session_id);
    }
  }, [sourceFilter, projectFilter]);

  useEffect(() => { loadSessions(); }, [loadSessions]);

  // Load session detail
  useEffect(() => {
    if (!selectedId) { setDetail(null); return; }
    setDetailLoading(true);
    fetchSession(selectedId).then(d => {
      setDetail(d);
      setDetailLoading(false);
    });
  }, [selectedId]);

  // Get unique projects for filter
  const projects = [...new Set(sessions.map(s => s.project).filter(Boolean))] as string[];

  return (
    <div className="content" style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '14px 22px' }}>
      {/* Header */}
      <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 className="t-h1" style={{ margin: 0 }}>Sessions</h1>
          <div className="t-small fg-2" style={{ marginTop: 4 }}>
            Browse conversations across Claude Code, claude.ai, and more.
            {sessions.length > 0 && <span className="mono"> {sessions.length} sessions loaded</span>}
          </div>
        </div>
        <div className="row gap-3">
          <button className="btn" onClick={loadSessions}><Icon name="refresh" size={13} />Refresh</button>
        </div>
      </div>

      {/* Source filter pills */}
      <div className="row gap-3" style={{ flexWrap: 'wrap' }}>
        {['', 'claude_code', 'claude_ai'].map(src => (
          <button
            key={src}
            className="btn btn-sm"
            style={{
              background: sourceFilter === src ? 'var(--color-bg-3)' : undefined,
              borderColor: sourceFilter === src ? 'var(--accent)' : undefined,
              color: sourceFilter === src ? 'var(--color-fg-0)' : undefined,
            }}
            onClick={() => setSourceFilter(src)}
          >
            {src === '' ? 'All' : sourceLabel(src)}
          </button>
        ))}
        {projects.length > 0 && (
          <select
            className="input"
            style={{ height: 24, fontSize: 11, padding: '0 8px' }}
            value={projectFilter}
            onChange={e => setProjectFilter(e.target.value)}
          >
            <option value="">All projects</option>
            {projects.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        )}
      </div>

      {/* Main split */}
      <div style={{ display: 'grid', gridTemplateColumns: '380px 1fr', gap: 14, minHeight: 580 }}>
        {/* Session list */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ overflow: 'auto', flex: 1 }}>
            {loading ? (
              <div style={{ padding: 20, textAlign: 'center' }} className="fg-2 t-small">Loading sessions...</div>
            ) : sessions.length === 0 ? (
              <div style={{ padding: 20, textAlign: 'center' }} className="fg-2 t-small">
                No sessions found. Make sure the syncer is running.
              </div>
            ) : (
              sessions.map((s) => (
                <div
                  key={s.session_id}
                  onClick={() => setSelectedId(s.session_id)}
                  style={{
                    padding: '10px 12px',
                    borderBottom: '1px solid var(--color-border-0)',
                    background: selectedId === s.session_id ? 'var(--color-bg-2)' : 'transparent',
                    borderLeft: selectedId === s.session_id ? '2px solid var(--accent)' : '2px solid transparent',
                    cursor: 'pointer',
                  }}
                >
                  <div className="row" style={{ justifyContent: 'space-between', gap: 8 }}>
                    <span className={sourceBadgeClass(s.source)}>{sourceLabel(s.source)}</span>
                    <span className="t-mono-sm fg-2">{formatTime(s.updated_at)}</span>
                  </div>
                  <div className="t-small" style={{ marginTop: 4, color: 'var(--color-fg-0)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {s.session_slug || s.project || s.session_id.slice(0, 20)}
                  </div>
                  <div className="row gap-3" style={{ marginTop: 4 }}>
                    {s.project && <span className="t-mono-sm fg-2">{s.project}</span>}
                    <span className="t-mono-sm fg-2" style={{ marginLeft: 'auto' }}>
                      {s.message_count} msgs
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Conversation viewer */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
          {!selectedId ? (
            <div style={{ padding: 40, textAlign: 'center' }} className="fg-2 t-small">
              Select a session to view the conversation
            </div>
          ) : detailLoading ? (
            <div style={{ padding: 40, textAlign: 'center' }} className="fg-2 t-small">
              Loading conversation...
            </div>
          ) : detail ? (
            <>
              <div className="row card-pad" style={{ borderBottom: '1px solid var(--color-border-0)', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                <div>
                  <div className="t-eyebrow">
                    {sourceLabel(detail.session.source)}
                    {detail.session.project && <> &middot; {detail.session.project}</>}
                  </div>
                  <div className="t-h2" style={{ marginTop: 4 }}>
                    {detail.messages.length > 0
                      ? extractTitle(detail.messages, detail.session.session_slug)
                      : 'Empty session'}
                  </div>
                  <div className="t-mono-sm fg-2" style={{ marginTop: 4 }}>
                    {detail.session.session_id.slice(0, 24)}
                    {detail.session.machine_name && <> &middot; {detail.session.machine_name}</>}
                    &middot; {new Date(detail.session.created_at).toLocaleDateString()}
                  </div>
                </div>
                <div className="row gap-3">
                  <span className="badge">{detail.messages.length} messages</span>
                  <span className={sourceBadgeClass(detail.session.source)}>
                    {sourceLabel(detail.session.source)}
                  </span>
                </div>
              </div>
              <div style={{ padding: '8px 24px 24px', overflow: 'auto', flex: 1 }}>
                {detail.messages.length === 0 ? (
                  <div className="fg-2 t-small" style={{ padding: 20 }}>No messages in this session.</div>
                ) : (
                  detail.messages.map((msg, i) => (
                    <MessageBubble key={i} msg={msg} />
                  ))
                )}
              </div>
            </>
          ) : (
            <div style={{ padding: 40, textAlign: 'center' }} className="fg-2 t-small">
              Failed to load session
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
