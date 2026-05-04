import { useState, useEffect } from 'react';
import { AppShell } from './components/layout/app-shell';
import { SettingsPopover } from './components/settings-popover';
import { Dashboard } from './pages/dashboard';
import { ServerDetail } from './pages/server-detail';
import { Traces } from './pages/traces';
import { Usage } from './pages/usage';
import { Skills } from './pages/skills';
import { Memories } from './pages/memories';
import { SessionLogs } from './pages/session-logs';
import type { PageId, AccentName, DensityName } from './lib/types';

const ACCENTS: Record<AccentName, { default: string; hover: string; dim: string; fg: string }> = {
  cobalt:  { default: 'oklch(0.72 0.19 250)', hover: 'oklch(0.78 0.19 250)', dim: 'oklch(0.45 0.14 250 / 0.18)', fg: '#0a0a0c' },
  lime:    { default: 'oklch(0.88 0.22 130)', hover: 'oklch(0.93 0.22 130)', dim: 'oklch(0.50 0.15 130 / 0.18)', fg: '#0a0a0c' },
  amber:   { default: 'oklch(0.82 0.17 70)',  hover: 'oklch(0.88 0.17 70)',  dim: 'oklch(0.50 0.13 70 / 0.18)',  fg: '#0a0a0c' },
  magenta: { default: 'oklch(0.72 0.22 340)', hover: 'oklch(0.78 0.22 340)', dim: 'oklch(0.45 0.14 340 / 0.18)', fg: '#0a0a0c' },
  emerald: { default: 'oklch(0.78 0.16 155)', hover: 'oklch(0.84 0.16 155)', dim: 'oklch(0.45 0.12 155 / 0.18)', fg: '#0a0a0c' },
};

const SCREENS: Record<PageId, { crumbs: string[] }> = {
  overview: { crumbs: ['workspace', 'default', 'overview'] },
  servers:  { crumbs: ['workspace', 'default', 'servers', 'github-mcp'] },
  traces:   { crumbs: ['workspace', 'default', 'traces'] },
  usage:    { crumbs: ['workspace', 'default', 'usage'] },
  skills:   { crumbs: ['workspace', 'default', 'context', 'skills'] },
  memories: { crumbs: ['workspace', 'default', 'context', 'memories'] },
  logs:     { crumbs: ['workspace', 'default', 'context', 'logs'] },
};

function applyAccent(name: AccentName) {
  const a = ACCENTS[name] || ACCENTS.lime;
  const r = document.documentElement;
  r.style.setProperty('--accent', a.default);
  r.style.setProperty('--accent-hover', a.hover);
  r.style.setProperty('--accent-dim', a.dim);
  r.style.setProperty('--accent-fg', a.fg);
}

export default function App() {
  const [page, setPage] = useState<PageId>('overview');
  const [accent, setAccent] = useState<AccentName>('lime');
  const [density, setDensity] = useState<DensityName>('compact');
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    applyAccent(accent);
  }, [accent]);

  useEffect(() => {
    document.documentElement.classList.remove('density-compact', 'density-roomy');
    if (density === 'compact') document.documentElement.classList.add('density-compact');
    if (density === 'roomy') document.documentElement.classList.add('density-roomy');
  }, [density]);

  const screen = SCREENS[page] || SCREENS.overview;

  const renderPage = () => {
    switch (page) {
      case 'overview': return <Dashboard onNav={setPage} />;
      case 'servers': return <ServerDetail />;
      case 'traces': return <Traces />;
      case 'usage': return <Usage />;
      case 'skills': return <Skills />;
      case 'memories': return <Memories />;
      case 'logs': return <SessionLogs />;
      default: return <Dashboard onNav={setPage} />;
    }
  };

  return (
    <AppShell
      page={page}
      onNav={setPage}
      crumbs={screen.crumbs}
      onOpenSettings={() => setShowSettings(!showSettings)}
    >
      {showSettings && (
        <SettingsPopover
          accent={accent}
          onAccent={setAccent}
          density={density}
          onDensity={setDensity}
          onClose={() => setShowSettings(false)}
        />
      )}
      {renderPage()}
    </AppShell>
  );
}
