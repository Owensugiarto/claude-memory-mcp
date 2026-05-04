import { Icon } from './icon';
import { Sparkline } from './sparkline';

interface StatCardProps {
  label: string;
  value: string;
  unit?: string;
  sub?: string;
  spark: number[];
  tone?: string;
}

export function StatCard({ label, value, unit, sub, spark, tone = 'default' }: StatCardProps) {
  return (
    <div className="card card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span className="t-eyebrow">{label}</span>
        <Icon name="arrow-up-right" size={12} style={{ color: 'var(--color-fg-2)' }} />
      </div>
      <div className="row" style={{ alignItems: 'baseline', gap: 6 }}>
        <span className="t-display mono" style={{ fontWeight: 500 }}>{value}</span>
        {unit && <span className="t-mono fg-2">{unit}</span>}
      </div>
      {sub && <span className="t-mono-sm fg-2">{sub}</span>}
      <Sparkline
        data={spark}
        width={220}
        height={28}
        color={tone === 'default' ? 'var(--color-fg-1)' : tone}
      />
    </div>
  );
}
