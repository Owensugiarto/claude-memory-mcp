import type { AccentName, DensityName } from '../lib/types';

const ACCENTS: Record<AccentName, { swatch: string }> = {
  cobalt: { swatch: '#4d8aff' },
  lime: { swatch: '#a3e635' },
  amber: { swatch: '#fbbf24' },
  magenta: { swatch: '#e879f9' },
  emerald: { swatch: '#34d399' },
};

interface SettingsPopoverProps {
  accent: AccentName;
  onAccent: (name: AccentName) => void;
  density: DensityName;
  onDensity: (name: DensityName) => void;
  onClose: () => void;
}

export function SettingsPopover({ accent, onAccent, density, onDensity, onClose }: SettingsPopoverProps) {
  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 99 }} />
      <div className="settings-popover">
        <div className="t-eyebrow" style={{ marginBottom: 10 }}>
          Accent
        </div>
        <div className="row gap-3" style={{ marginBottom: 14 }}>
          {(Object.keys(ACCENTS) as AccentName[]).map((k) => (
            <div
              key={k}
              className={`swatch${accent === k ? ' active' : ''}`}
              style={{ background: ACCENTS[k].swatch }}
              onClick={() => onAccent(k)}
              title={k}
            />
          ))}
        </div>
        <div className="t-eyebrow" style={{ marginBottom: 10 }}>
          Density
        </div>
        <div className="row gap-3">
          {(['compact', 'medium', 'roomy'] as DensityName[]).map((d) => (
            <button
              key={d}
              className="btn btn-sm"
              style={{
                background: density === d ? 'var(--color-bg-3)' : 'transparent',
                borderColor: density === d ? 'var(--color-border-2)' : 'var(--color-border-1)',
                textTransform: 'capitalize',
              }}
              onClick={() => onDensity(d)}
            >
              {d}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
