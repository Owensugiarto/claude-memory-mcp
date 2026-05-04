import { useState, useEffect } from 'react';
import { Icon } from '../components/ui/icon';
import { MdSurface, renderMd } from '../components/ui/md-surface';
import { api } from '../lib/api';

const MEMORIES_DATA = [
  { name: 'user-prefs.md', title: 'User preferences', tokens: 280, kind: 'global' as const, scope: undefined, updated: '10m ago' },
  { name: 'stripe-account.md', title: 'Stripe account context', tokens: 410, kind: 'scoped' as const, scope: 'stripe-mcp', updated: '2h ago' },
  { name: 'postgres-schemas.md', title: 'Postgres schema notes', tokens: 1820, kind: 'scoped' as const, scope: 'postgres-prod', updated: '1d ago' },
  { name: 'team-members.md', title: 'Team & owners', tokens: 320, kind: 'global' as const, scope: undefined, updated: '3d ago' },
  { name: 'github-conventions.md', title: 'GitHub conventions', tokens: 540, kind: 'scoped' as const, scope: 'github-mcp', updated: '5d ago' },
  { name: 'incident-runbook.md', title: 'Incident runbook references', tokens: 690, kind: 'global' as const, scope: undefined, updated: '1w ago' },
  { name: 'voice.md', title: 'Voice & tone', tokens: 180, kind: 'global' as const, scope: undefined, updated: '2w ago' },
  { name: 'ignore-paths.md', title: 'Ignore paths', tokens: 140, kind: 'global' as const, scope: undefined, updated: '1m ago' },
];

const SAMPLE_MEMORY = `# User preferences

Personal context that travels with every chat in this workspace.

## Coding

- TypeScript over JavaScript wherever possible.
- 2-space indent, single quotes, trailing commas.
- Prefer \`async/await\` over \`.then()\` chains.

## Communication

- Write in plain language. Don't pad with caveats.
- Show diffs, not full files, when proposing changes.
- Don't apologize for tool errors \u2014 just describe what happened and the next step.

## Things I never want

- Emoji in code comments.
- Marketing words like "seamless," "powerful," "delightful."
- Files larger than 400 lines without a good reason.`;

export function Memories() {
  const [sel, setSel] = useState(0);
  const [_data, setData] = useState<unknown>(null);

  useEffect(() => {
    api.memoryFiles().then(setData).catch(() => {});
  }, []);

  const m = MEMORIES_DATA[sel];

  return (
    <div className="content" style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '14px 22px' }}>
      {/* Header */}
      <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 className="t-h1" style={{ margin: 0 }}>Memories</h1>
          <div className="t-small fg-2" style={{ marginTop: 4 }}>
            Persistent context loaded into every relevant chat. <span className="mono">32 files &middot; 4,380 tokens</span>
          </div>
        </div>
        <div className="row gap-3">
          <button className="btn"><Icon name="filter" size={13} />Scope<Icon name="chevron-down" size={12} /></button>
          <button className="btn btn-primary"><Icon name="plus" size={13} />New memory</button>
        </div>
      </div>

      {/* List + Detail */}
      <div style={{ display: 'grid', gridTemplateColumns: '380px 1fr', gap: 14, minHeight: 580 }}>
        {/* Memory list */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ overflow: 'auto', flex: 1 }}>
            {MEMORIES_DATA.map((it, i) => (
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
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <span className="t-mono" style={{ color: 'var(--color-fg-0)' }}>{it.name}</span>
                  <span className="t-mono-sm fg-2">{it.tokens}t</span>
                </div>
                <div className="t-small fg-1" style={{ marginTop: 2 }}>{it.title}</div>
                <div className="row gap-3" style={{ marginTop: 6 }}>
                  {it.kind === 'global' ? (
                    <span className="badge badge-accent">global</span>
                  ) : (
                    <span className="badge">scope: {it.scope}</span>
                  )}
                  <span className="t-mono-sm fg-2" style={{ marginLeft: 'auto' }}>{it.updated}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Memory detail */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
          <div className="row card-pad" style={{ borderBottom: '1px solid var(--color-border-0)', justifyContent: 'space-between' }}>
            <div>
              <div className="t-eyebrow">Memory &middot; {m.name}</div>
              <div className="t-h2 mono" style={{ marginTop: 4, fontWeight: 500 }}>{m.title}</div>
            </div>
            <div className="row gap-3">
              <span className="badge">{m.tokens} tokens</span>
              {m.kind === 'global' ? (
                <span className="badge badge-accent">global</span>
              ) : (
                <span className="badge">scope: {m.scope}</span>
              )}
              <button className="btn btn-sm"><Icon name="code" size={11} />Edit</button>
            </div>
          </div>
          <div style={{ padding: '20px 28px', overflow: 'auto', flex: 1 }}>
            <MdSurface>{renderMd(SAMPLE_MEMORY)}</MdSurface>
          </div>
        </div>
      </div>
    </div>
  );
}
