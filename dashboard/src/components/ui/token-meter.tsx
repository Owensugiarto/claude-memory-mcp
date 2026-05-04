import { useState } from 'react';
import { Icon } from './icon';
import { fmtK } from '../../lib/utils';

interface TokenMeterProps {
  used?: number;
  window?: number;
}

export function TokenMeter({ used = 142318, window: ctx = 200000 }: TokenMeterProps) {
  const [open, setOpen] = useState(false);
  const pct = Math.min(100, (used / ctx) * 100);
  const tone = pct > 85 ? 'var(--color-error)' : pct > 70 ? 'var(--color-warning)' : 'var(--accent)';

  const segs = [
    { label: 'System', tokens: 4820, color: 'var(--color-fg-2)' },
    { label: 'Skills', tokens: 18420, color: 'var(--color-info)' },
    { label: 'Memories', tokens: 9210, color: 'oklch(0.78 0.16 155)' },
    { label: 'Tool defs', tokens: 22480, color: 'var(--color-warning)' },
    { label: 'Messages', tokens: 87388, color: 'var(--accent)' },
  ];

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(!open)}
        className="btn"
        style={{ height: 28, padding: '0 10px', gap: 8 }}
        title="Context window"
      >
        <span className="t-mono-sm" style={{ color: 'var(--color-fg-1)' }}>
          <span style={{ color: 'var(--color-fg-0)' }}>{fmtK(used)}</span>
          <span style={{ color: 'var(--color-fg-2)' }}> / {fmtK(ctx)}</span>
        </span>
        <div
          style={{
            width: 56,
            height: 4,
            background: 'var(--color-bg-3)',
            borderRadius: 2,
            overflow: 'hidden',
          }}
        >
          <div style={{ width: `${pct}%`, height: '100%', background: tone }} />
        </div>
        <span className="t-mono-sm" style={{ color: tone, minWidth: 28, textAlign: 'right' }}>
          {pct.toFixed(0)}%
        </span>
      </button>

      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 50 }} />
          <div
            className="card"
            style={{
              position: 'absolute',
              right: 0,
              top: 36,
              width: 320,
              zIndex: 51,
              background: 'var(--color-bg-2)',
              borderColor: 'var(--color-border-1)',
              boxShadow: '0 18px 40px -12px rgb(0 0 0 / 0.6)',
            }}
          >
            <div className="card-pad" style={{ borderBottom: '1px solid var(--color-border-0)', padding: '12px 14px' }}>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <span className="t-eyebrow">Context window</span>
                <span className="t-mono-sm" style={{ color: tone }}>
                  {pct.toFixed(1)}%
                </span>
              </div>
              <div className="row" style={{ marginTop: 8, alignItems: 'baseline', gap: 6 }}>
                <span className="t-h1 mono" style={{ fontWeight: 500 }}>
                  {used.toLocaleString()}
                </span>
                <span className="t-mono-sm fg-2">/ {ctx.toLocaleString()} tokens</span>
              </div>
              <div
                style={{
                  display: 'flex',
                  height: 6,
                  marginTop: 12,
                  borderRadius: 3,
                  overflow: 'hidden',
                  background: 'var(--color-bg-0)',
                }}
              >
                {segs.map((s, i) => (
                  <div key={i} style={{ flex: s.tokens, background: s.color }} />
                ))}
                <div style={{ flex: ctx - used, background: 'transparent' }} />
              </div>
            </div>
            <div style={{ padding: '8px 14px 12px' }}>
              {segs.map((s, i) => (
                <div key={i} className="row" style={{ padding: '5px 0', justifyContent: 'space-between' }}>
                  <span className="row gap-3">
                    <span className="dot" style={{ background: s.color }} />
                    <span className="t-small fg-1">{s.label}</span>
                  </span>
                  <span className="t-mono-sm" style={{ color: 'var(--color-fg-0)' }}>
                    {s.tokens.toLocaleString()}
                  </span>
                </div>
              ))}
              <div className="divider" style={{ margin: '8px 0' }} />
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <span className="t-small fg-2">Remaining</span>
                <span className="t-mono-sm fg-1">{(ctx - used).toLocaleString()}</span>
              </div>
            </div>
            <div
              className="row"
              style={{
                padding: '10px 14px',
                borderTop: '1px solid var(--color-border-0)',
                justifyContent: 'space-between',
              }}
            >
              <span className="t-mono-sm fg-2">claude-sonnet-4.5</span>
              <span className="t-mono-sm" style={{ color: 'var(--accent)', cursor: 'pointer' }}>
                View usage <Icon name="arrow-up-right" size={10} />
              </span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
