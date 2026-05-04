interface IconProps {
  name: string;
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}

export function Icon({ name, size = 16, className = '', style = {} }: IconProps) {
  const p = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.5,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    className,
    style,
  };

  const icons: Record<string, React.ReactNode> = {
    grid: (
      <svg {...p}>
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </svg>
    ),
    server: (
      <svg {...p}>
        <rect x="3" y="4" width="18" height="7" rx="1.5" />
        <rect x="3" y="13" width="18" height="7" rx="1.5" />
        <circle cx="7" cy="7.5" r="0.6" fill="currentColor" />
        <circle cx="7" cy="16.5" r="0.6" fill="currentColor" />
      </svg>
    ),
    wrench: (
      <svg {...p}>
        <path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18v3h3l6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4 2.5-2.5z" />
      </svg>
    ),
    play: (
      <svg {...p}>
        <path d="M6 4l14 8-14 8V4z" />
      </svg>
    ),
    logs: (
      <svg {...p}>
        <path d="M4 6h16M4 12h10M4 18h14" />
      </svg>
    ),
    key: (
      <svg {...p}>
        <circle cx="8" cy="14" r="4" />
        <path d="M11 11l9-9" />
        <path d="M17 5l3 3" />
        <path d="M14 8l3 3" />
      </svg>
    ),
    settings: (
      <svg {...p}>
        <circle cx="12" cy="12" r="3" />
        <path d="M19 12a7 7 0 0 0-.1-1l2-1.5-2-3.4-2.3.9a7 7 0 0 0-1.7-1L14.5 3h-5l-.4 2.5a7 7 0 0 0-1.7 1l-2.3-.9-2 3.4L5.1 11a7 7 0 0 0 0 2l-2 1.5 2 3.4 2.3-.9a7 7 0 0 0 1.7 1l.4 2.5h5l.4-2.5a7 7 0 0 0 1.7-1l2.3.9 2-3.4-2-1.5c0-.3.1-.6.1-1z" />
      </svg>
    ),
    search: (
      <svg {...p}>
        <circle cx="11" cy="11" r="7" />
        <path d="M21 21l-4.3-4.3" />
      </svg>
    ),
    bell: (
      <svg {...p}>
        <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9z" />
        <path d="M10 21a2 2 0 0 0 4 0" />
      </svg>
    ),
    'chevron-right': (
      <svg {...p}>
        <path d="M9 6l6 6-6 6" />
      </svg>
    ),
    'chevron-down': (
      <svg {...p}>
        <path d="M6 9l6 6 6-6" />
      </svg>
    ),
    plus: (
      <svg {...p}>
        <path d="M12 5v14M5 12h14" />
      </svg>
    ),
    filter: (
      <svg {...p}>
        <path d="M3 5h18l-7 9v6l-4-2v-4L3 5z" />
      </svg>
    ),
    refresh: (
      <svg {...p}>
        <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
        <path d="M21 3v5h-5" />
        <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
        <path d="M3 21v-5h5" />
      </svg>
    ),
    'arrow-up-right': (
      <svg {...p}>
        <path d="M7 17L17 7" />
        <path d="M8 7h9v9" />
      </svg>
    ),
    globe: (
      <svg {...p}>
        <circle cx="12" cy="12" r="9" />
        <path d="M3 12h18" />
        <path d="M12 3a14 14 0 0 1 0 18" />
        <path d="M12 3a14 14 0 0 0 0 18" />
      </svg>
    ),
    code: (
      <svg {...p}>
        <path d="M8 6l-5 6 5 6" />
        <path d="M16 6l5 6-5 6" />
        <path d="M14 4l-4 16" />
      </svg>
    ),
    database: (
      <svg {...p}>
        <ellipse cx="12" cy="5" rx="8" ry="3" />
        <path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5" />
        <path d="M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" />
      </svg>
    ),
    'circle-help': (
      <svg {...p}>
        <circle cx="12" cy="12" r="9" />
        <path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 1-1 1.7" />
        <circle cx="12" cy="17" r="0.6" fill="currentColor" />
      </svg>
    ),
    'circle-check': (
      <svg {...p}>
        <circle cx="12" cy="12" r="9" />
        <path d="M8 12l3 3 5-6" />
      </svg>
    ),
    x: (
      <svg {...p}>
        <path d="M5 5l14 14M19 5L5 19" />
      </svg>
    ),
    copy: (
      <svg {...p}>
        <rect x="8" y="8" width="12" height="12" rx="2" />
        <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
      </svg>
    ),
    external: (
      <svg {...p}>
        <path d="M14 4h6v6" />
        <path d="M20 4l-9 9" />
        <path d="M19 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h5" />
      </svg>
    ),
    send: (
      <svg {...p}>
        <path d="M22 2L11 13" />
        <path d="M22 2l-7 20-4-9-9-4 20-7z" />
      </svg>
    ),
    clock: (
      <svg {...p}>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </svg>
    ),
    'filter-funnel': (
      <svg {...p}>
        <path d="M4 4h16l-6 8v6l-4 2v-8L4 4z" />
      </svg>
    ),
    alert: (
      <svg {...p}>
        <path d="M12 3l10 18H2L12 3z" />
        <path d="M12 10v5" />
        <circle cx="12" cy="18" r="0.6" fill="currentColor" />
      </svg>
    ),
  };

  return <>{icons[name] || null}</>;
}
