import { useMemo, useState, useEffect } from 'react';
import { Icon } from '../components/ui/icon';
import { StatCard } from '../components/ui/stat-card';
import { LineChart } from '../components/ui/line-chart';
import { series } from '../lib/utils';
import { api } from '../lib/api';

const SESSIONS_MOCK = [
  { id: 'ssn_4f9a21', started: '14:02', chats: 8, in: 92410, out: 14820, cached: 184200, cost: '$0.84', model: 'sonnet-4.5' },
  { id: 'ssn_4f9a18', started: '13:11', chats: 5, in: 41210, out: 6280, cached: 88400, cost: '$0.42', model: 'sonnet-4.5' },
  { id: 'ssn_4f9a04', started: '11:48', chats: 12, in: 138420, out: 22140, cached: 244800, cost: '$1.28', model: 'sonnet-4.5' },
  { id: 'ssn_4f99e2', started: '10:22', chats: 3, in: 18420, out: 2840, cached: 32200, cost: '$0.18', model: 'haiku-4.5' },
  { id: 'ssn_4f99c1', started: '09:14', chats: 6, in: 62100, out: 9420, cached: 110400, cost: '$0.62', model: 'sonnet-4.5' },
];

const CHATS_MOCK = [
  { id: 'cht_82e1', title: 'Debug stripe webhook signature mismatch', turns: 14, in: 28420, out: 4820, ctxPct: 71, started: '14:32', server: 'stripe-mcp' },
  { id: 'cht_82d9', title: 'Refactor Postgres query helper to use prepared', turns: 9, in: 18210, out: 3120, ctxPct: 44, started: '14:18', server: 'postgres-prod' },
  { id: 'cht_82d4', title: 'Add request replay from logs', turns: 22, in: 41200, out: 6210, ctxPct: 89, started: '13:51', server: 'github-mcp' },
  { id: 'cht_82c8', title: 'Triage 401s from linear', turns: 6, in: 12420, out: 1820, ctxPct: 16, started: '13:22', server: 'linear-mcp' },
  { id: 'cht_82b1', title: 'Index strategy for events table', turns: 17, in: 38210, out: 5840, ctxPct: 62, started: '12:48', server: 'postgres-prod' },
  { id: 'cht_82a4', title: 'Generate weekly metrics rollup', turns: 8, in: 19420, out: 2920, ctxPct: 32, started: '12:14', server: 'postgres-prod' },
];

const MODELS_MOCK = [
  { name: 'claude-sonnet-4.5', tok: 268420, cost: '$2.96', color: 'var(--accent)' },
  { name: 'claude-haiku-4.5', tok: 38420, cost: '$0.32', color: 'var(--color-info)' },
  { name: 'claude-opus-4', tok: 5640, cost: '$0.06', color: 'var(--color-warning)' },
];

export function Usage() {
  const [scope, setScope] = useState<'session' | 'chat'>('session');
  const [_data, setData] = useState<unknown>(null);

  useEffect(() => {
    api.usage().then(setData).catch(() => {});
  }, []);

  const inputS = useMemo(() => series(48, 8200, 4500, 21), []);
  const outputS = useMemo(() => series(48, 1800, 1200, 22), []);
  const cacheS = useMemo(() => series(48, 14000, 6000, 23), []);

  return (
    <div className="content" style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '14px 22px' }}>
      {/* Header */}
      <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 className="t-h1" style={{ margin: 0 }}>Usage</h1>
          <div className="t-small fg-2" style={{ marginTop: 4 }}>
            Tokens, context, and cost \u2014 across every session and chat in this workspace.
          </div>
        </div>
        <div className="row gap-3">
          <button className="btn"><Icon name="filter" size={13} />Today<Icon name="chevron-down" size={12} /></button>
          <button className="btn"><Icon name="copy" size={13} />Export CSV</button>
        </div>
      </div>

      {/* Stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 'var(--gap-grid)' }}>
        <StatCard label="Tokens \u00b7 today" value="312,480" unit="tok" sub="92.4k in \u00b7 14.8k out \u00b7 205k cached" spark={inputS} tone="var(--accent)" />
        <StatCard label="Context \u00b7 current" value="71" unit="%" sub="142,318 / 200,000 tokens" spark={cacheS} tone="var(--color-warning)" />
        <StatCard label="Active sessions" value="3" sub="across 4 chats" spark={outputS} />
        <StatCard label="Cost \u00b7 today" value="$3.34" sub="$0.84 last hour" spark={inputS} />
      </div>

      {/* Token throughput + By model */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 'var(--gap-grid)' }}>
        <div className="card">
          <div className="row card-pad" style={{ borderBottom: '1px solid var(--color-border-0)', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <div className="row gap-4">
              <span className="t-h2">Token throughput</span>
              <div className="row gap-4" style={{ marginLeft: 12 }}>
                <span className="row gap-2 t-mono-sm fg-1"><span className="dot" style={{ background: 'var(--accent)' }} />Input</span>
                <span className="row gap-2 t-mono-sm fg-1"><span className="dot" style={{ background: 'var(--color-info)' }} />Output</span>
                <span className="row gap-2 t-mono-sm fg-1"><span className="dot" style={{ background: 'var(--color-warning)' }} />Cache hits</span>
              </div>
            </div>
            <div className="row gap-3">
              <button className="btn btn-sm">1h</button>
              <button className="btn btn-sm" style={{ background: 'var(--color-bg-3)', borderColor: 'var(--color-border-2)' }}>24h</button>
              <button className="btn btn-sm">7d</button>
            </div>
          </div>
          <div style={{ padding: '10px 8px 4px' }}>
            <LineChart
              width={620}
              height={220}
              series={[
                { color: 'var(--accent)', data: inputS },
                { color: 'var(--color-info)', data: outputS },
                { color: 'var(--color-warning)', data: cacheS },
              ]}
            />
          </div>
        </div>

        {/* By model */}
        <div className="card">
          <div className="row card-pad" style={{ borderBottom: '1px solid var(--color-border-0)', justifyContent: 'space-between' }}>
            <span className="t-h2">By model</span>
            <span className="t-mono-sm fg-2">today</span>
          </div>
          <div style={{ padding: '10px 16px 14px' }}>
            {MODELS_MOCK.map((m, i) => (
              <div key={i} style={{ padding: '10px 0', borderBottom: i < 2 ? '1px solid var(--color-border-0)' : 'none' }}>
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <span className="t-mono">{m.name}</span>
                  <span className="t-mono-sm fg-1">{m.cost}</span>
                </div>
                <div className="row" style={{ marginTop: 6, gap: 10, alignItems: 'center' }}>
                  <div style={{ flex: 1, height: 6, background: 'var(--color-bg-0)', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ width: `${(m.tok / 280000) * 100}%`, height: '100%', background: m.color }} />
                  </div>
                  <span className="t-mono-sm fg-2" style={{ width: 70, textAlign: 'right' }}>{m.tok.toLocaleString()}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Sessions / Chats table */}
      <div className="card">
        <div className="row card-pad" style={{ borderBottom: '1px solid var(--color-border-0)', justifyContent: 'space-between' }}>
          <div className="row gap-4">
            <span className="t-h2">{scope === 'session' ? 'Sessions' : 'Chats'}</span>
            <div className="row" style={{ background: 'var(--color-bg-0)', border: '1px solid var(--color-border-0)', borderRadius: 6, padding: 2 }}>
              {(['session', 'chat'] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setScope(s)}
                  className="btn btn-sm"
                  style={{
                    height: 22,
                    border: 'none',
                    background: scope === s ? 'var(--color-bg-2)' : 'transparent',
                    color: scope === s ? 'var(--color-fg-0)' : 'var(--color-fg-1)',
                    textTransform: 'capitalize',
                  }}
                >
                  {s}s
                </button>
              ))}
            </div>
          </div>
          <button className="btn btn-sm"><Icon name="filter" size={12} />Filter</button>
        </div>
        <div style={{ overflowX: 'auto' }}>
          {scope === 'session' ? (
            <table className="tbl">
              <thead>
                <tr>
                  <th>Session</th>
                  <th>Started</th>
                  <th>Chats</th>
                  <th>Model</th>
                  <th>Input</th>
                  <th>Output</th>
                  <th>Cached</th>
                  <th>Cost</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {SESSIONS_MOCK.map((s, i) => (
                  <tr key={i}>
                    <td className="mono" style={{ color: 'var(--color-fg-0)' }}>{s.id}</td>
                    <td className="mono fg-1">{s.started}</td>
                    <td className="mono fg-1">{s.chats}</td>
                    <td><span className="badge">{s.model}</span></td>
                    <td className="mono">{s.in.toLocaleString()}</td>
                    <td className="mono">{s.out.toLocaleString()}</td>
                    <td className="mono fg-1">{s.cached.toLocaleString()}</td>
                    <td className="mono" style={{ color: 'var(--accent)' }}>{s.cost}</td>
                    <td><Icon name="chevron-right" size={14} style={{ color: 'var(--color-fg-2)' }} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <table className="tbl">
              <thead>
                <tr>
                  <th>Chat</th>
                  <th>Server</th>
                  <th>Turns</th>
                  <th>Input</th>
                  <th>Output</th>
                  <th style={{ width: 200 }}>Context</th>
                  <th>Started</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {CHATS_MOCK.map((c, i) => {
                  const tone = c.ctxPct > 85 ? 'var(--color-error)' : c.ctxPct > 70 ? 'var(--color-warning)' : 'var(--accent)';
                  return (
                    <tr key={i}>
                      <td>
                        <div className="col">
                          <span style={{ color: 'var(--color-fg-0)' }}>{c.title}</span>
                          <span className="t-mono-sm fg-2">{c.id}</span>
                        </div>
                      </td>
                      <td className="mono fg-1">{c.server}</td>
                      <td className="mono fg-1">{c.turns}</td>
                      <td className="mono">{c.in.toLocaleString()}</td>
                      <td className="mono">{c.out.toLocaleString()}</td>
                      <td>
                        <div className="row gap-3" style={{ alignItems: 'center' }}>
                          <div style={{ flex: 1, height: 4, background: 'var(--color-bg-0)', borderRadius: 2, overflow: 'hidden' }}>
                            <div style={{ width: `${c.ctxPct}%`, height: '100%', background: tone }} />
                          </div>
                          <span className="t-mono-sm" style={{ color: tone, width: 32, textAlign: 'right' }}>{c.ctxPct}%</span>
                        </div>
                      </td>
                      <td className="mono fg-1">{c.started}</td>
                      <td><Icon name="chevron-right" size={14} style={{ color: 'var(--color-fg-2)' }} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
