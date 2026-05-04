interface SeriesItem {
  color: string;
  data: number[];
}

interface LineChartProps {
  series: SeriesItem[];
  width?: number;
  height?: number;
  padding?: { t: number; r: number; b: number; l: number };
}

export function LineChart({
  series: s,
  width = 600,
  height = 220,
  padding = { t: 12, r: 12, b: 22, l: 32 },
}: LineChartProps) {
  const iW = width - padding.l - padding.r;
  const iH = height - padding.t - padding.b;
  const max = Math.max(...s.flatMap((x) => x.data)) * 1.1;
  const range = max || 1;
  const xStep = iW / (s[0].data.length - 1);

  const path = (d: number[]) =>
    d
      .map(
        (v, i) =>
          `${i === 0 ? 'M' : 'L'}${(padding.l + i * xStep).toFixed(1)},${(padding.t + iH - (v / range) * iH).toFixed(1)}`
      )
      .join(' ');

  return (
    <svg
      width="100%"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="xMidYMid meet"
      style={{ display: 'block' }}
    >
      {Array.from({ length: 5 }).map((_, i) => {
        const y = padding.t + (iH / 4) * i;
        const v = max - (range / 4) * i;
        return (
          <g key={i}>
            <line x1={padding.l} y1={y} x2={padding.l + iW} y2={y} stroke="var(--color-border-0)" strokeWidth="1" />
            <text
              x={padding.l - 6}
              y={y + 3}
              fontSize="9.5"
              fontFamily="var(--font-mono)"
              fill="var(--color-fg-2)"
              textAnchor="end"
            >
              {Math.round(v)}
            </text>
          </g>
        );
      })}
      {Array.from({ length: 6 }).map((_, i) => (
        <text
          key={i}
          x={padding.l + (iW / 5) * i}
          y={height - 6}
          fontSize="9.5"
          fontFamily="var(--font-mono)"
          fill="var(--color-fg-2)"
          textAnchor="middle"
        >
          {`T-${(5 - i) * 10}m`}
        </text>
      ))}
      {s.map((l, i) => (
        <path
          key={i}
          d={path(l.data)}
          fill="none"
          stroke={l.color}
          strokeWidth="1.4"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      ))}
    </svg>
  );
}
