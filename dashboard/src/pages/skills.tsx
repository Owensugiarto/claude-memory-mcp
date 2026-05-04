import { useState, useEffect } from 'react';
import { Icon } from '../components/ui/icon';
import { MdSurface, renderMd } from '../components/ui/md-surface';
import { api } from '../lib/api';

const SKILLS_DATA = [
  { name: 'github-issue-triage.md', title: 'GitHub issue triage', tokens: 1240, used: '12 today', updated: '2d ago', tags: ['github', 'triage'] },
  { name: 'postgres-explain.md', title: 'Postgres EXPLAIN reader', tokens: 820, used: '4 today', updated: '1d ago', tags: ['postgres'] },
  { name: 'stripe-webhook-debug.md', title: 'Stripe webhook debug', tokens: 1610, used: '8 today', updated: '4h ago', tags: ['stripe'] },
  { name: 'linear-cycle-rollup.md', title: 'Linear cycle rollup', tokens: 940, used: '\u2014', updated: '5d ago', tags: ['linear'] },
  { name: 'slack-incident-summary.md', title: 'Slack incident summary', tokens: 720, used: '1 today', updated: '8h ago', tags: ['slack', 'incident'] },
  { name: 'fs-repo-survey.md', title: 'Repo survey', tokens: 1180, used: '\u2014', updated: '2w ago', tags: ['fs'] },
  { name: 'sentry-error-clustering.md', title: 'Sentry error clustering', tokens: 1040, used: '2 today', updated: '1d ago', tags: ['sentry'] },
  { name: 'release-notes-writer.md', title: 'Release notes writer', tokens: 880, used: '\u2014', updated: '1w ago', tags: ['docs'] },
  { name: 'csv-to-postgres.md', title: 'CSV to Postgres', tokens: 690, used: '\u2014', updated: '3w ago', tags: ['postgres', 'etl'] },
  { name: 'code-review-checklist.md', title: 'Code review checklist', tokens: 540, used: '16 today', updated: '12h ago', tags: ['review'] },
];

const SAMPLE_SKILL = `# GitHub issue triage

Classify incoming GitHub issues, apply labels, and assign an owner. Designed to run as a background skill triggered when a new issue is opened.

## Inputs

- \`owner\` \u2014 repository owner
- \`repo\` \u2014 repository name
- \`issue_number\` \u2014 the issue to triage

## Behavior

When invoked, this skill:

- Reads the issue body and any attached logs.
- Searches existing **open and closed** issues for duplicates using the issue title and the first 200 characters of the body.
- If a duplicate is found with confidence > 0.85, it comments with a link and closes the new issue.
- Otherwise, it applies labels from the table below and assigns the owner from \`CODEOWNERS\` for the most-touched path mentioned.

## Label rules

- Anything mentioning \`crash\`, \`panic\`, or \`segfault\` \u2192 \`bug\`, \`p1\`
- Anything in \`/docs/\` only \u2192 \`docs\`
- New endpoints or props \u2192 \`enhancement\`

## Available tools

\`\`\`
github.tools.list_issues
github.tools.get_issue
github.tools.update_issue
github.tools.create_comment
github.resources.codeowners
\`\`\`

## Notes

Avoid closing issues opened by maintainers \u2014 they sometimes file known dupes intentionally to track a regression.`;

export function Skills() {
  const [sel, setSel] = useState(0);
  const [filter, setFilter] = useState('');
  const [_data, setData] = useState<unknown>(null);

  useEffect(() => {
    api.skills().then(setData).catch(() => {});
  }, []);

  const s = SKILLS_DATA[sel];
  const filtered = filter
    ? SKILLS_DATA.filter(
        (sk) =>
          sk.name.toLowerCase().includes(filter.toLowerCase()) ||
          sk.title.toLowerCase().includes(filter.toLowerCase()) ||
          sk.tags.some((t) => t.toLowerCase().includes(filter.toLowerCase()))
      )
    : SKILLS_DATA;

  return (
    <div className="content" style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '14px 22px' }}>
      {/* Header */}
      <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 className="t-h1" style={{ margin: 0 }}>Skills</h1>
          <div className="t-small fg-2" style={{ marginTop: 4 }}>
            Reusable instructions injected into a chat's system prompt. <span className="mono">14 files &middot; 11,860 tokens</span>
          </div>
        </div>
        <div className="row gap-3">
          <button className="btn"><Icon name="external" size={13} />Open folder</button>
          <button className="btn btn-primary"><Icon name="plus" size={13} />New skill</button>
        </div>
      </div>

      {/* List + Detail */}
      <div style={{ display: 'grid', gridTemplateColumns: '380px 1fr', gap: 14, minHeight: 580 }}>
        {/* Skill list */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div className="card-pad" style={{ borderBottom: '1px solid var(--color-border-0)', padding: 10 }}>
            <div style={{ position: 'relative' }}>
              <Icon name="search" size={13} style={{ position: 'absolute', left: 8, top: 7, color: 'var(--color-fg-2)' }} />
              <input
                className="input"
                placeholder="Filter skills..."
                style={{ width: '100%', paddingLeft: 26 }}
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              />
            </div>
          </div>
          <div style={{ overflow: 'auto', flex: 1 }}>
            {filtered.map((it, i) => {
              const realIdx = SKILLS_DATA.indexOf(it);
              return (
                <div
                  key={i}
                  onClick={() => setSel(realIdx)}
                  style={{
                    padding: '10px 12px',
                    borderBottom: '1px solid var(--color-border-0)',
                    background: sel === realIdx ? 'var(--color-bg-2)' : 'transparent',
                    borderLeft: sel === realIdx ? '2px solid var(--accent)' : '2px solid transparent',
                    cursor: 'pointer',
                  }}
                >
                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <span className="t-mono" style={{ color: 'var(--color-fg-0)' }}>{it.name}</span>
                    <span className="t-mono-sm fg-2">{it.tokens}t</span>
                  </div>
                  <div className="t-small fg-1" style={{ marginTop: 2 }}>{it.title}</div>
                  <div className="row gap-3" style={{ marginTop: 6 }}>
                    {it.tags.map((t) => (
                      <span key={t} className="badge">{t}</span>
                    ))}
                    <span className="t-mono-sm fg-2" style={{ marginLeft: 'auto' }}>{it.updated}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Skill detail */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
          <div className="row card-pad" style={{ borderBottom: '1px solid var(--color-border-0)', justifyContent: 'space-between' }}>
            <div>
              <div className="t-eyebrow">Skill &middot; {s.name}</div>
              <div className="t-h2 mono" style={{ marginTop: 4, fontWeight: 500 }}>{s.title}</div>
            </div>
            <div className="row gap-3">
              <span className="badge">{s.tokens} tokens</span>
              <button className="btn btn-sm"><Icon name="copy" size={11} />Copy</button>
              <button className="btn btn-sm"><Icon name="code" size={11} />Edit</button>
            </div>
          </div>
          <div style={{ padding: '20px 28px', overflow: 'auto', flex: 1 }}>
            <MdSurface>{renderMd(SAMPLE_SKILL)}</MdSurface>
          </div>
        </div>
      </div>
    </div>
  );
}
