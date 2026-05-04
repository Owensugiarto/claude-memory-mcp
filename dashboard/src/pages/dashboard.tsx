import { useMemo, useState, useEffect } from 'react';
import { Icon } from '../components/ui/icon';
import { StatCard } from '../components/ui/stat-card';
import { Sparkline } from '../components/ui/sparkline';
import { LineChart } from '../components/ui/line-chart';
import { series } from '../lib/utils';
import { api } from '../lib/api';
import type { PageId } from '../lib/types';

interface DashboardProps {
  onNav: (page: PageId) => void;
}

const ACTIVITY_MOCK = [
  { dot: 'success' as const, title: 'github.tools.create_issue', meta: '200 \u00b7 312ms', time: '12s ago', server: 'github-mcp' },
  { dot: 'success' as const, title: 'postgres.tools.query', meta: '200 \u00b7 84ms', time: '41s ago', server: 'pg-prod' },
  { dot: 'warning' as const, title: 'fs.tools.read_file', meta: 'rate limited', time: '1m ago', server: 'fs-local' },
  { dot: 'success' as const, title: 'stripe.tools.list_customers', meta: '200 \u00b7 410ms', time: '2m ago', server: 'stripe-mcp' },
  { dot: 'error' as const, title: 'linear.tools.update_issue', meta: '401 unauthorized', time: '3m ago', server: 'linear-mcp' },
  { dot: 'success' as const, title: 'slack.tools.post_message', meta: '200 \u00b7 198ms', time: '4m ago', server: 'slack-mcp' },
  { dot: 'success' as const, title: 'github.resources.list_repos', meta: '200 \u00b7 244ms', time: '5m ago', server: 'github-mcp' },
];

const SERVERS_MOCK = [
  ['github-mcp', 'stdio', '32', '14', '4,210', '184ms', '0.1%', '2s ago', 'success'],
  ['postgres-prod', 'http+sse', '18', '8', '3,894', '62ms', '0.0%', '5s ago', 'success'],
  ['stripe-mcp', 'http+sse', '26', '11', '1,772', '410ms', '0.3%', '12s ago', 'success'],
  ['slack-mcp', 'stdio', '9', '3', '1,203', '198ms', '0.2%', '1m ago', 'success'],
  ['linear-mcp', 'http+sse', '14', '5', '928', '302ms', '2.1%', '3m ago', 'error'],
  ['fs-local', 'stdio', '6', '\u2014', '642', '12ms', '0.0%', '1m ago', 'warning'],
  ['filesystem', 'stdio', '8', '\u2014', '418', '8ms', '0.0%', '8s ago', 'success'],
  ['sentry-mcp', 'http+sse', '11', '4', '302', '220ms', '0.0%', '30s ago', 'success'],
];

export function Dashboard({ onNav }: DashboardProps) {
  const [_data, setData] = useState<unknown>(null);

  useEffect(() => {
    api.dashboard().then(setData).catch(() => {});
  }, []);

  const cpuS = useMemo(() => series(40, 35, 18, 11), []);
  const memS = useMemo(() => series(40, 62, 12, 22), []);
  const reqS = useMemo(() => series(40, 480, 220, 33), []);
  const errS = useMemo(() => series(40, 1.2, 1.5, 44), []);
  const reqL = useMemo(() => series(80, 480, 240, 7), []);
  const p95L = useMemo(() => series(80, 220, 80, 8), []);
  const errL = useMemo(() => series(80, 12, 18, 9), []);

  return (
    <div className="content" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* Header */}
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 className="t-h1" style={{ margin: 0 }}>Overview</h1>
          <div className="t-small fg-2" style={{ marginTop: 4 }}>
            12 servers connected &middot; last sync <span className="mono">14:32:08</span>
          </div>
        </div>
        <div className="row gap-3">
          <button className="btn"><Icon name="refresh" size={13} />Refresh</button>
          <button className="btn"><Icon name="filter" size={13} />Last 1h<Icon name="chevron-down" size={12} /></button>
          <button className="btn btn-primary"><Icon name="plus" size={13} />Connect server</button>
        </div>
      </div>

      {/* Stat Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 'var(--gap-grid)' }}>
        <StatCard label="Requests \u00b7 1h" value="14,832" unit="req" spark={reqS} tone="var(--accent)" />
        <StatCard label="P95 latency" value="218" unit="ms" spark={memS} />
        <StatCard label="Error rate" value="0.42" unit="%" spark={errS} />
        <StatCard label="Active sessions" value="47" spark={cpuS} />
      </div>

      {/* Traffic + Activity */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 'var(--gap-grid)', minWidth: 0 }}>
        {/* Traffic chart */}
        <div className="card">
          <div className="row card-pad" style={{ justifyContent: 'space-between', borderBottom: '1px solid var(--color-border-0)', flexWrap: 'wrap', gap: 8 }}>
            <div className="row gap-4">
              <span className="t-h2">Traffic</span>
              <div className="row gap-4" style={{ marginLeft: 12 }}>
                <span className="row gap-2 t-mono-sm fg-1"><span className="dot" style={{ background: 'var(--accent)' }} />Requests</span>
                <span className="row gap-2 t-mono-sm fg-1"><span className="dot" style={{ background: 'var(--color-info)' }} />P95 (ms)</span>
                <span className="row gap-2 t-mono-sm fg-1"><span className="dot" style={{ background: 'var(--color-error)' }} />Errors</span>
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
              width={640}
              height={240}
              series={[
                { color: 'var(--accent)', data: reqL },
                { color: 'var(--color-info)', data: p95L },
                { color: 'var(--color-error)', data: errL },
              ]}
            />
          </div>
        </div>

        {/* Activity feed */}
        <div className="card">
          <div className="row card-pad" style={{ justifyContent: 'space-between', borderBottom: '1px solid var(--color-border-0)' }}>
            <span className="t-h2">Recent activity</span>
            <span className="t-mono-sm fg-1" style={{ cursor: 'pointer' }}>View all &rarr;</span>
          </div>
          <div style={{ padding: '4px 0' }}>
            {ACTIVITY_MOCK.map((it, i) => (
              <div key={i} className="row" style={{ padding: '8px 16px', gap: 10, borderBottom: i < 6 ? '1px solid var(--color-border-0)' : 'none' }}>
                <span className={`dot dot-${it.dot}`} />
                <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
                  <span className="t-mono" style={{ color: 'var(--color-fg-0)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.title}</span>
                  <span className="t-mono-sm fg-2">{it.server} &middot; {it.meta}</span>
                </div>
                <span className="t-mono-sm fg-2">{it.time}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Connected servers table */}
      <div className="card">
        <div className="row card-pad" style={{ justifyContent: 'space-between', borderBottom: '1px solid var(--color-border-0)' }}>
          <div className="row gap-4"><span className="t-h2">Connected servers</span><span className="badge">12</span></div>
          <div className="row gap-3">
            <button className="btn btn-sm"><Icon name="filter" size={12} />Filter</button>
            <button className="btn btn-sm"><Icon name="plus" size={12} />Add</button>
          </div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="tbl">
            <thead>
              <tr>
                <th style={{ width: 28 }}></th>
                <th>Name</th>
                <th>Transport</th>
                <th>Tools</th>
                <th>Resources</th>
                <th>Req &middot; 1h</th>
                <th>P95</th>
                <th>Errors</th>
                <th>Last call</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {SERVERS_MOCK.map((r, i) => (
                <tr key={i} style={{ cursor: 'pointer' }} onClick={() => onNav('servers')}>
                  <td><span className={`dot dot-${r[8]}`} /></td>
                  <td className="mono" style={{ color: 'var(--color-fg-0)' }}>{r[0]}</td>
                  <td><span className="badge">{r[1]}</span></td>
                  <td className="mono fg-1">{r[2]}</td>
                  <td className="mono fg-1">{r[3]}</td>
                  <td className="mono">{r[4]}</td>
                  <td className="mono">{r[5]}</td>
                  <td className="mono" style={{ color: r[6] === '2.1%' ? 'var(--color-error)' : 'var(--color-fg-0)' }}>{r[6]}</td>
                  <td className="mono fg-2">{r[7]}</td>
                  <td><Icon name="chevron-right" size={14} style={{ color: 'var(--color-fg-2)' }} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
