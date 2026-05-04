/** Seeded PRNG for deterministic mock data */
export function seeded(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

/** Generate a series of random data points */
export function series(n: number, base: number, amp: number, seed: number): number[] {
  const r = seeded(seed);
  const out: number[] = [];
  let v = base;
  for (let i = 0; i < n; i++) {
    v += (r() - 0.5) * amp;
    v = Math.max(base * 0.4, Math.min(base * 1.7, v));
    out.push(Math.round(v));
  }
  return out;
}

/** Format relative time */
export function formatRelativeTime(date: Date | string): string {
  const now = Date.now();
  const then = typeof date === 'string' ? new Date(date).getTime() : date.getTime();
  const diff = now - then;
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/** Estimate tokens from a string */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/** Format number with commas */
export function fmt(n: number): string {
  return n.toLocaleString();
}

/** Format large numbers with k suffix */
export function fmtK(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
  return String(n);
}

/** Clamp a number between min and max */
export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/** Join CSS class names, filtering out falsy values */
export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ');
}
