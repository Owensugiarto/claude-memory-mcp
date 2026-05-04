import { useState, useEffect } from 'react';
import { Icon } from '../components/ui/icon';
import { api } from '../lib/api';

const TOOLS_MOCK = [
  { name: 'create_issue', desc: 'Create a new issue in a GitHub repository', calls: '1,204', p95: '184ms', err: '0.0%' },
  { name: 'list_issues', desc: 'List issues filtered by state, label, assignee', calls: '892', p95: '118ms', err: '0.0%' },
  { name: 'search_repositories', desc: 'Search public and private repositories', calls: '418', p95: '240ms', err: '0.2%' },
  { name: 'get_pull_request', desc: 'Fetch a single PR by number, with diff', calls: '362', p95: '318ms', err: '0.1%' },
  { name: 'create_pull_request', desc: 'Open a PR from a head branch into base', calls: '201', p95: '402ms', err: '0.5%' },
  { name: 'merge_pull_request', desc: 'Merge an open PR using merge, squash, or rebase', calls: '84', p95: '612ms', err: '1.2%' },
  { name: 'list_commits', desc: 'List commits on a branch with author and message', calls: '302', p95: '92ms', err: '0.0%' },
  { name: 'get_file_contents', desc: 'Read file at a specific ref from a repo', calls: '642', p95: '78ms', err: '0.1%' },
  { name: 'create_or_update_file', desc: 'Write or update a file at a path', calls: '118', p95: '286ms', err: '0.8%' },
  { name: 'fork_repository', desc: 'Fork a repository into the authenticated user', calls: '12', p95: '1.4s', err: '0.0%' },
  { name: 'list_branches', desc: 'List branches in a repository', calls: '204', p95: '62ms', err: '0.0%' },
  { name: 'create_branch', desc: 'Create a branch from a source ref', calls: '76', p95: '108ms', err: '0.0%' },
];

const RECENT_CALLS = [
  ['12s ago', 'claude-cli', "owner='vercel', repo='next.js', title='RFC: app dir caching'", '200', '184ms', 'success'],
  ['1m ago', 'playground', "owner='aria', repo='mcp-console', title='Add k6 load harness'", '200', '212ms', 'success'],
  ['2m ago', 'claude-desktop', "owner='openai', repo='evals', title='Add eval for tool args'", '200', '168ms', 'success'],
  ['4m ago', 'claude-cli', "owner='', repo='next.js', title='...'", '400', '12ms', 'error'],
  ['6m ago', 'claude-desktop', "owner='aria', repo='dotfiles', title='nvim: lazy-load lspc...'", '200', '194ms', 'success'],
];

const INPUT_SCHEMA = `{
  "type": "object",
  "required": ["owner", "repo", "title"],
  "properties": {
    "owner":  { "type": "string", "description": "Repository owner" },
    "repo":   { "type": "string", "description": "Repository name" },
    "title":  { "type": "string", "minLength": 1 },
    "body":   { "type": "string" },
    "labels": { "type": "array", "items": { "type": "string" } },
    "assignees": { "type": "array", "items": { "type": "string" } }
  }
}`;

const TABS: [string, string, string | null][] = [
  ['tools', 'Tools', '32'],
  ['resources', 'Resources', '14'],
  ['prompts', 'Prompts', '6'],
  ['env', 'Environment', null],
  ['activity', 'Activity', null],
];

export function ServerDetail() {
  const [activeTab, setTab] = useState('tools');
  const [selected, setSelected] = useState(2);
  const [filter, setFilter] = useState('');
  const [_data, setData] = useState<unknown>(null);

  useEffect(() => {
    api.server('github-mcp').then(setData).catch(() => {});
  }, []);

  const tools = TOOLS_MOCK;
  const filteredTools = filter
    ? tools.filter(t => t.name.toLowerCase().includes(filter.toLowerCase()) || t.desc.toLowerCase().includes(filter.toLowerCase()))
    : tools;
  const tool = tools[selected];

  return (
    <div className="content" style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '14px 22px' }}>
      {/* Server header */}
      <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div className="col" style={{ gap: 6 }}>
          <div className="row gap-3">
            <span className="dot dot-success" />
            <h1 className="t-h1 mono" style={{ margin: 0, fontWeight: 500 }}>github-mcp</h1>
            <span className="badge">stdio</span>
            <span className="badge badge-success">healthy</span>
          </div>
          <div className="t-small fg-2 mono">
            v1.4.2 &middot; pid 28471 &middot; uptime 6d 14h &middot; github.com/modelcontextprotocol/servers
          </div>
        </div>
        <div className="row gap-3">
          <button className="btn"><Icon name="logs" size={13} />Logs</button>
          <button className="btn"><Icon name="refresh" size={13} />Restart</button>
          <button className="btn btn-primary"><Icon name="play" size={13} />Open in playground</button>
        </div>
      </div>

      {/* Tabs */}
      <div className="row" style={{ borderBottom: '1px solid var(--color-border-0)', gap: 0 }}>
        {TABS.map(([id, label, n]) => (
          <div
            key={id}
            onClick={() => setTab(id)}
            style={{
              padding: '10px 14px',
              fontSize: 12.5,
              cursor: 'pointer',
              color: activeTab === id ? 'var(--color-fg-0)' : 'var(--color-fg-1)',
              borderBottom: activeTab === id ? '1.5px solid var(--accent)' : '1.5px solid transparent',
              marginBottom: -1,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            {label}
            {n && <span className="t-mono-sm fg-2">{n}</span>}
          </div>
        ))}
      </div>

      {/* Tool browser */}
      <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: 14, minHeight: 540 }}>
        {/* Tool list */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div className="card-pad" style={{ borderBottom: '1px solid var(--color-border-0)', padding: 10 }}>
            <div style={{ position: 'relative' }}>
              <Icon name="search" size={13} style={{ position: 'absolute', left: 8, top: 7, color: 'var(--color-fg-2)' }} />
              <input
                className="input"
                placeholder="Filter tools..."
                style={{ width: '100%', paddingLeft: 26 }}
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              />
            </div>
          </div>
          <div style={{ overflow: 'auto', flex: 1 }}>
            {filteredTools.map((t, i) => {
              const realIdx = tools.indexOf(t);
              return (
                <div
                  key={i}
                  onClick={() => setSelected(realIdx)}
                  style={{
                    padding: '8px 12px',
                    borderBottom: '1px solid var(--color-border-0)',
                    background: selected === realIdx ? 'var(--color-bg-2)' : 'transparent',
                    borderLeft: selected === realIdx ? '2px solid var(--accent)' : '2px solid transparent',
                    cursor: 'pointer',
                  }}
                >
                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <span className="t-mono" style={{ color: 'var(--color-fg-0)' }}>{t.name}</span>
                    <span className="t-mono-sm fg-2">{t.calls}</span>
                  </div>
                  <div className="t-small fg-2" style={{ marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.desc}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Tool detail */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
          <div className="card-pad" style={{ borderBottom: '1px solid var(--color-border-0)' }}>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <div>
                <div className="t-eyebrow">Tool</div>
                <div className="t-h1 mono" style={{ marginTop: 4, fontWeight: 500 }}>{tool.name}</div>
                <div className="t-small fg-1" style={{ marginTop: 4, maxWidth: 560 }}>{tool.desc}.</div>
              </div>
              <button className="btn btn-primary"><Icon name="play" size={12} />Try it</button>
            </div>
            <div className="row gap-5" style={{ marginTop: 14 }}>
              <div><div className="t-eyebrow">Calls &middot; 1h</div><div className="t-mono" style={{ marginTop: 3 }}>{tool.calls}</div></div>
              <div><div className="t-eyebrow">P95</div><div className="t-mono" style={{ marginTop: 3 }}>{tool.p95}</div></div>
              <div><div className="t-eyebrow">Errors</div><div className="t-mono" style={{ marginTop: 3 }}>{tool.err}</div></div>
              <div><div className="t-eyebrow">Auth scope</div><div className="t-mono" style={{ marginTop: 3 }}>repo, issues:write</div></div>
            </div>
          </div>

          <div style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 14, overflow: 'auto' }}>
            {/* Input schema */}
            <div>
              <div className="t-h3" style={{ marginBottom: 8 }}>Input schema</div>
              <pre
                className="mono"
                style={{
                  margin: 0,
                  padding: 14,
                  background: 'var(--color-bg-0)',
                  border: '1px solid var(--color-border-0)',
                  borderRadius: 'var(--r-md)',
                  fontSize: 11.5,
                  lineHeight: 1.6,
                  overflow: 'auto',
                  color: 'var(--color-fg-1)',
                }}
              >
                {INPUT_SCHEMA}
              </pre>
            </div>

            {/* Recent calls */}
            <div>
              <div className="t-h3" style={{ marginBottom: 8 }}>Recent calls</div>
              <table className="tbl">
                <thead>
                  <tr>
                    <th style={{ width: 24 }}></th>
                    <th>Time</th>
                    <th>Caller</th>
                    <th>Args preview</th>
                    <th>Status</th>
                    <th>Latency</th>
                  </tr>
                </thead>
                <tbody>
                  {RECENT_CALLS.map((r, i) => (
                    <tr key={i}>
                      <td><span className={`dot dot-${r[5]}`} /></td>
                      <td className="mono fg-1">{r[0]}</td>
                      <td className="mono">{r[1]}</td>
                      <td className="mono fg-1" style={{ maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r[2]}</td>
                      <td><span className={`badge ${r[3] === '200' ? 'badge-success' : 'badge-error'}`}>{r[3]}</span></td>
                      <td className="mono">{r[4]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
