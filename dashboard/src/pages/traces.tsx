import { useState, useEffect } from 'react';
import { Icon } from '../components/ui/icon';
import { api } from '../lib/api';

const ROWS_MOCK = [
  { time: '14:32:08.412', level: 'info' as const, server: 'github-mcp', tool: 'create_issue', status: 200, dur: '214ms', caller: 'playground' },
  { time: '14:32:01.880', level: 'info' as const, server: 'postgres-prod', tool: 'query', status: 200, dur: '62ms', caller: 'claude-cli' },
  { time: '14:31:54.220', level: 'error' as const, server: 'linear-mcp', tool: 'update_issue', status: 401, dur: '8ms', caller: 'claude-desktop' },
  { time: '14:31:52.014', level: 'info' as const, server: 'stripe-mcp', tool: 'list_customers', status: 200, dur: '410ms', caller: 'claude-desktop' },
  { time: '14:31:48.778', level: 'warn' as const, server: 'fs-local', tool: 'read_file', status: 429, dur: '2ms', caller: 'claude-cli' },
  { time: '14:31:42.108', level: 'info' as const, server: 'github-mcp', tool: 'list_issues', status: 200, dur: '118ms', caller: 'claude-cli' },
  { time: '14:31:40.560', level: 'info' as const, server: 'slack-mcp', tool: 'post_message', status: 200, dur: '198ms', caller: 'claude-desktop' },
  { time: '14:31:38.012', level: 'info' as const, server: 'github-mcp', tool: 'search_repositories', status: 200, dur: '240ms', caller: 'playground' },
  { time: '14:31:34.998', level: 'info' as const, server: 'postgres-prod', tool: 'query', status: 200, dur: '84ms', caller: 'claude-cli' },
  { time: '14:31:30.114', level: 'info' as const, server: 'github-mcp', tool: 'get_file_contents', status: 200, dur: '78ms', caller: 'claude-desktop' },
  { time: '14:31:24.882', level: 'error' as const, server: 'linear-mcp', tool: 'update_issue', status: 401, dur: '9ms', caller: 'claude-desktop' },
  { time: '14:31:18.330', level: 'info' as const, server: 'sentry-mcp', tool: 'list_issues', status: 200, dur: '220ms', caller: 'claude-cli' },
  { time: '14:31:11.408', level: 'info' as const, server: 'filesystem', tool: 'list_directory', status: 200, dur: '8ms', caller: 'claude-desktop' },
  { time: '14:31:04.992', level: 'info' as const, server: 'github-mcp', tool: 'list_commits', status: 200, dur: '92ms', caller: 'claude-cli' },
  { time: '14:30:58.110', level: 'warn' as const, server: 'fs-local', tool: 'read_file', status: 429, dur: '2ms', caller: 'claude-cli' },
  { time: '14:30:52.408', level: 'info' as const, server: 'stripe-mcp', tool: 'list_charges', status: 200, dur: '302ms', caller: 'claude-desktop' },
  { time: '14:30:48.014', level: 'info' as const, server: 'github-mcp', tool: 'create_issue', status: 200, dur: '184ms', caller: 'claude-cli' },
  { time: '14:30:42.880', level: 'info' as const, server: 'postgres-prod', tool: 'query', status: 200, dur: '62ms', caller: 'claude-cli' },
];

function levelColor(l: string): string {
  if (l === 'error') return 'var(--color-error)';
  if (l === 'warn') return 'var(--color-warning)';
  return 'var(--color-info)';
}

function getSpans(sel: typeof ROWS_MOCK[0]) {
  const isError = sel.status === 401;
  return [
    { name: 'client.send', start: 0, dur: 4, color: 'var(--color-fg-2)' },
    { name: 'validate', start: 4, dur: 6, color: 'var(--color-fg-2)' },
    { name: 'auth.refresh_token', start: 10, dur: 8, color: 'var(--color-info)' },
    { name: `http.POST /repos/.../issues`, start: 18, dur: isError ? 10 : 168, color: isError ? 'var(--color-error)' : 'var(--accent)' },
    ...(!isError ? [{ name: 'serialize', start: 186, dur: 22, color: 'var(--color-fg-2)' }] : []),
  ].filter(s => s.dur > 0);
}

function getArgs(sel: typeof ROWS_MOCK[0]): string {
  if (sel.tool === 'update_issue') return `{
  "id": "ISS-2841",
  "state": "completed",
  "assigneeId": "u_aria"
}`;
  if (sel.tool === 'create_issue') return `{
  "owner": "aria",
  "repo": "mcp-console",
  "title": "Add request replay from logs",
  "labels": ["enhancement", "playground"]
}`;
  return `{
  "query": "SELECT id, email FROM users WHERE created_at > $1 LIMIT 50",
  "params": ["2026-04-29T00:00:00Z"]
}`;
}

export function Traces() {
  const [selected, setSelected] = useState(2);
  const [_data, setData] = useState<unknown>(null);

  useEffect(() => {
    api.traces().then(setData).catch(() => {});
  }, []);

  const rows = ROWS_MOCK;
  const sel = rows[selected];
  const spans = getSpans(sel);

  return (
    <div className="content" style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '14px 22px' }}>
      {/* Header */}
      <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 className="t-h1" style={{ margin: 0 }}>Traces</h1>
          <div className="t-small fg-2" style={{ marginTop: 4 }}>
            Live tail across 12 servers &middot; <span className="mono">14,832 events</span> in the last hour
          </div>
        </div>
        <div className="row gap-3">
          <button className="btn"><Icon name="clock" size={13} />Last 1h<Icon name="chevron-down" size={12} /></button>
          <button className="btn"><span className="dot dot-success" style={{ marginRight: 2 }} />Tailing</button>
          <button className="btn"><Icon name="copy" size={13} />Export</button>
        </div>
      </div>

      {/* Filter bar */}
      <div className="card" style={{ padding: 8, display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        <span className="row gap-2 t-mono-sm fg-2" style={{ paddingLeft: 6 }}>
          <Icon name="filter-funnel" size={12} />Filter
        </span>
        <span className="badge badge-accent">server: github-mcp <Icon name="x" size={10} style={{ marginLeft: 2, opacity: 0.7 }} /></span>
        <span className="badge">level: error,warn <Icon name="x" size={10} style={{ marginLeft: 2, opacity: 0.5 }} /></span>
        <span className="badge">status: != 200 <Icon name="x" size={10} style={{ marginLeft: 2, opacity: 0.5 }} /></span>
        <input className="input" placeholder="status:401 server:linear-mcp tool:update_issue" style={{ flex: 1, marginLeft: 4, minWidth: 200 }} />
      </div>

      {/* Log list + detail */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 14, minHeight: 540 }}>
        {/* Log list */}
        <div className="card" style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div
            className="row"
            style={{
              padding: '8px 12px',
              borderBottom: '1px solid var(--color-border-0)',
              fontFamily: 'var(--font-mono)',
              fontSize: 10.5,
              color: 'var(--color-fg-2)',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              gap: 12,
            }}
          >
            <span style={{ width: 90 }}>Time</span>
            <span style={{ width: 44 }}>Lvl</span>
            <span style={{ width: 130 }}>Server</span>
            <span style={{ flex: 1 }}>Tool</span>
            <span style={{ width: 50, textAlign: 'right' }}>Status</span>
            <span style={{ width: 60, textAlign: 'right' }}>Dur</span>
          </div>
          <div style={{ overflow: 'auto', flex: 1 }}>
            {rows.map((r, i) => (
              <div
                key={i}
                onClick={() => setSelected(i)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '6px 12px',
                  borderBottom: '1px solid var(--color-border-0)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 11.5,
                  background: selected === i ? 'var(--color-bg-2)' : 'transparent',
                  borderLeft: selected === i ? '2px solid var(--accent)' : '2px solid transparent',
                  cursor: 'pointer',
                }}
              >
                <span style={{ width: 90, color: 'var(--color-fg-2)' }}>{r.time}</span>
                <span style={{ width: 44, color: levelColor(r.level), textTransform: 'uppercase', fontSize: 10 }}>{r.level}</span>
                <span style={{ width: 130, color: 'var(--color-fg-1)' }}>{r.server}</span>
                <span style={{ flex: 1, color: 'var(--color-fg-0)' }}>{r.tool}</span>
                <span style={{ width: 50, textAlign: 'right', color: r.status >= 400 ? 'var(--color-error)' : 'var(--color-success)' }}>{r.status}</span>
                <span style={{ width: 60, textAlign: 'right', color: 'var(--color-fg-1)' }}>{r.dur}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Trace detail */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
          <div className="row card-pad" style={{ borderBottom: '1px solid var(--color-border-0)', justifyContent: 'space-between' }}>
            <div>
              <div className="t-eyebrow">Trace</div>
              <div className="t-h2 mono" style={{ marginTop: 4, fontWeight: 500 }}>{sel.server} &middot; {sel.tool}</div>
              <div className="t-mono-sm fg-2" style={{ marginTop: 4 }}>trace_a14ef0b9 &middot; {sel.time} &middot; from {sel.caller}</div>
            </div>
            <span className={`badge ${sel.status >= 400 ? 'badge-error' : 'badge-success'}`}>
              {sel.status} {sel.status === 401 ? 'Unauthorized' : sel.status === 429 ? 'Too Many' : 'OK'}
            </span>
          </div>
          <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 14, overflow: 'auto' }}>
            {/* Spans waterfall */}
            <div>
              <div className="t-eyebrow" style={{ marginBottom: 8 }}>Spans</div>
              <div className="col gap-3">
                {spans.map((s, i) => (
                  <div key={i} className="row gap-3" style={{ alignItems: 'center' }}>
                    <div className="t-mono-sm fg-1" style={{ width: 180, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.name}</div>
                    <div style={{ flex: 1, height: 14, background: 'var(--color-bg-0)', borderRadius: 3, position: 'relative' }}>
                      <div style={{ position: 'absolute', left: `${(s.start / 220) * 100}%`, width: `${(Math.max(s.dur, 2) / 220) * 100}%`, height: '100%', background: s.color, borderRadius: 2 }} />
                    </div>
                    <div className="t-mono-sm" style={{ width: 56, textAlign: 'right', color: 'var(--color-fg-0)' }}>{s.dur === 0 ? '\u2014' : `${s.dur}ms`}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Error callout */}
            {sel.status === 401 && (
              <div className="card" style={{ padding: 12, background: 'color-mix(in oklch, var(--color-error) 6%, transparent)', borderColor: 'color-mix(in oklch, var(--color-error) 28%, transparent)' }}>
                <div className="row gap-3" style={{ alignItems: 'flex-start' }}>
                  <Icon name="alert" size={14} style={{ color: 'var(--color-error)', marginTop: 2 }} />
                  <div>
                    <div className="t-h3" style={{ color: 'var(--color-fg-0)' }}>Token rejected by upstream</div>
                    <div className="t-small fg-1" style={{ marginTop: 4 }}>
                      Linear returned <span className="mono">401</span>. The stored API key likely expired or was rotated. Update credentials and replay this request.
                    </div>
                    <div className="row gap-3" style={{ marginTop: 10 }}>
                      <button className="btn btn-sm"><Icon name="key" size={11} />Update credentials</button>
                      <button className="btn btn-sm"><Icon name="refresh" size={11} />Replay</button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Arguments */}
            <div>
              <div className="t-eyebrow" style={{ marginBottom: 6 }}>Arguments</div>
              <pre
                className="mono"
                style={{
                  margin: 0,
                  padding: 12,
                  background: 'var(--color-bg-0)',
                  border: '1px solid var(--color-border-0)',
                  borderRadius: 'var(--r-md)',
                  fontSize: 11,
                  lineHeight: 1.6,
                  color: 'var(--color-fg-1)',
                  overflow: 'auto',
                }}
              >
                {getArgs(sel)}
              </pre>
            </div>

            {/* Actions */}
            <div className="row gap-3">
              <button className="btn btn-sm"><Icon name="play" size={11} />Replay in playground</button>
              <button className="btn btn-sm"><Icon name="copy" size={11} />Copy as cURL</button>
              <button className="btn btn-sm"><Icon name="external" size={11} />Open server</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
