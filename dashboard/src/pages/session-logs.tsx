import { useState, useEffect } from 'react';
import { Icon } from '../components/ui/icon';
import { MdSurface, renderMd } from '../components/ui/md-surface';
import { api } from '../lib/api';

const LOGS_DATA = [
  { name: '2026-05-04--debug-stripe-webhook.md', title: 'Debug stripe webhook signature mismatch', turns: 14, tokens: 28420, started: '14:32', model: 'sonnet-4.5' },
  { name: '2026-05-04--refactor-pg-helper.md', title: 'Refactor Postgres query helper', turns: 9, tokens: 18210, started: '14:18', model: 'sonnet-4.5' },
  { name: '2026-05-04--add-replay-feature.md', title: 'Add request replay from logs', turns: 22, tokens: 41200, started: '13:51', model: 'sonnet-4.5' },
  { name: '2026-05-04--triage-linear-401.md', title: 'Triage 401s from linear', turns: 6, tokens: 12420, started: '13:22', model: 'haiku-4.5' },
  { name: '2026-05-04--pg-events-index.md', title: 'Index strategy for events table', turns: 17, tokens: 38210, started: '12:48', model: 'sonnet-4.5' },
  { name: '2026-05-03--metrics-rollup.md', title: 'Generate weekly metrics rollup', turns: 8, tokens: 19420, started: 'Yesterday', model: 'sonnet-4.5' },
  { name: '2026-05-03--release-notes-v0.4.md', title: 'Release notes for v0.4', turns: 5, tokens: 11200, started: 'Yesterday', model: 'sonnet-4.5' },
  { name: '2026-05-02--obs-rollup.md', title: 'Observability rollup', turns: 12, tokens: 24800, started: 'May 2', model: 'sonnet-4.5' },
];

const SAMPLE_LOG = `# Debug stripe webhook signature mismatch

**Session** \`ssn_4f9a21\` \u00b7 **Started** 2026-05-04 14:32 \u00b7 **Model** claude-sonnet-4.5 \u00b7 **Turns** 14

## Context

- Skill: \`stripe-webhook-debug\`
- Memory: \`stripe-account.md\`, \`user-prefs.md\`
- Server: \`stripe-mcp\` (v1.4.2, http+sse)

## Transcript

### user \u00b7 14:32:08

We're getting webhook signature mismatch on \`/billing/webhook\` since the deploy. Help me figure out what changed.

### assistant \u00b7 14:32:14

Walking through the obvious culprits first. Reading the recent deploys and the webhook config.

\`\`\`
\u2192 stripe.tools.list_webhook_endpoints
\u2190 200 \u00b7 184ms \u00b7 3 endpoints
\`\`\`

### assistant \u00b7 14:32:24

The endpoint signing secret rotated 6 minutes before your deploy went out. The deploy is reading the old secret from the previous env snapshot.

### user \u00b7 14:33:01

How do you know that?

### assistant \u00b7 14:33:06

Pulled the secret's \`created_at\` from Stripe and compared to your deploy timestamp:

- Secret rotated: **14:21:18 UTC**
- Deploy started: **14:27:42 UTC**
- Failures begin: **14:27:55 UTC**

The secret in your env file is from before 14:21. Update \`STRIPE_WEBHOOK_SECRET\` and redeploy.`;

export function SessionLogs() {
  const [sel, setSel] = useState(0);
  const [_data, setData] = useState<unknown>(null);

  useEffect(() => {
    api.sessions().then(setData).catch(() => {});
  }, []);

  const l = LOGS_DATA[sel];

  return (
    <div className="content" style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '14px 22px' }}>
      {/* Header */}
      <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 className="t-h1" style={{ margin: 0 }}>Logs</h1>
          <div className="t-small fg-2" style={{ marginTop: 4 }}>
            Session transcripts written as markdown. <span className="mono">186 files &middot; 412k tokens</span>
          </div>
        </div>
        <div className="row gap-3">
          <button className="btn"><Icon name="clock" size={13} />Today<Icon name="chevron-down" size={12} /></button>
          <button className="btn"><Icon name="external" size={13} />Open folder</button>
        </div>
      </div>

      {/* List + Detail */}
      <div style={{ display: 'grid', gridTemplateColumns: '380px 1fr', gap: 14, minHeight: 580 }}>
        {/* Log list */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ overflow: 'auto', flex: 1 }}>
            {LOGS_DATA.map((it, i) => (
              <div
                key={i}
                onClick={() => setSel(i)}
                style={{
                  padding: '10px 12px',
                  borderBottom: '1px solid var(--color-border-0)',
                  background: sel === i ? 'var(--color-bg-2)' : 'transparent',
                  borderLeft: sel === i ? '2px solid var(--accent)' : '2px solid transparent',
                  cursor: 'pointer',
                }}
              >
                <div className="t-mono-sm fg-2">{it.name}</div>
                <div className="t-small" style={{ marginTop: 3, color: 'var(--color-fg-0)' }}>{it.title}</div>
                <div className="row gap-3" style={{ marginTop: 6 }}>
                  <span className="badge">{it.model}</span>
                  <span className="t-mono-sm fg-1">{it.turns} turns</span>
                  <span className="t-mono-sm fg-2" style={{ marginLeft: 'auto' }}>
                    {it.tokens.toLocaleString()}t &middot; {it.started}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Log detail */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
          <div className="row card-pad" style={{ borderBottom: '1px solid var(--color-border-0)', justifyContent: 'space-between' }}>
            <div>
              <div className="t-eyebrow">Log &middot; {l.name}</div>
              <div className="t-h2" style={{ marginTop: 4 }}>{l.title}</div>
            </div>
            <div className="row gap-3">
              <span className="badge">{l.tokens.toLocaleString()} tokens</span>
              <span className="badge">{l.turns} turns</span>
              <button className="btn btn-sm"><Icon name="copy" size={11} />Copy</button>
              <button className="btn btn-sm"><Icon name="play" size={11} />Replay</button>
            </div>
          </div>
          <div style={{ padding: '20px 28px', overflow: 'auto', flex: 1 }}>
            <MdSurface>{renderMd(SAMPLE_LOG)}</MdSurface>
          </div>
        </div>
      </div>
    </div>
  );
}
