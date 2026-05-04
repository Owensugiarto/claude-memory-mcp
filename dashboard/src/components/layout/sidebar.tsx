import { Icon } from '../ui/icon';
import type { PageId } from '../../lib/types';

interface SidebarNavProps {
  active: PageId;
  onNav: (page: PageId) => void;
}

interface NavEntry {
  section?: string;
  id?: PageId;
  icon?: string;
  label?: string;
  count?: string;
}

const items: NavEntry[] = [
  { section: 'Workspace' },
  { id: 'overview', icon: 'grid', label: 'Overview' },
  { id: 'servers', icon: 'server', label: 'Servers', count: '12' },
  { id: 'traces', icon: 'logs', label: 'Traces' },
  { id: 'usage', icon: 'database', label: 'Usage' },
  { section: 'Context' },
  { id: 'skills', icon: 'code', label: 'Skills', count: '14' },
  { id: 'memories', icon: 'circle-help', label: 'Memories', count: '32' },
  { id: 'logs', icon: 'logs', label: 'Logs', count: '186' },
  { section: 'Security' },
];

export function SidebarNav({ active, onNav }: SidebarNavProps) {
  return (
    <aside className="sidebar-nav">
      <div className="brand">
        <span className="brand-mark">MCP</span>
        <span className="brand-tag">CONSOLE</span>
      </div>
      {items.map((it, i) => {
        if (it.section) {
          return (
            <div key={i} className="nav-section">
              {it.section}
            </div>
          );
        }
        return (
          <div
            key={it.id}
            className={'nav-item' + (active === it.id ? ' active' : '')}
            onClick={() => onNav(it.id as PageId)}
          >
            <Icon name={it.icon!} size={15} />
            <span>{it.label}</span>
            {it.count && <span className="count">{it.count}</span>}
          </div>
        );
      })}
      <div style={{ flex: 1 }} />
      <div className="nav-item" style={{ color: 'var(--color-fg-2)' }}>
        <Icon name="circle-help" size={15} />
        <span>Docs</span>
        <Icon name="external" size={12} style={{ marginLeft: 'auto' }} />
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 10px',
          borderTop: '1px solid var(--color-border-0)',
          marginTop: 6,
        }}
      >
        <div
          style={{
            width: 22,
            height: 22,
            borderRadius: '50%',
            background: 'linear-gradient(135deg,#2a2a32,#444)',
            border: '1px solid var(--color-border-1)',
          }}
        />
        <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.2 }}>
          <span style={{ fontSize: 11.5, color: 'var(--color-fg-0)' }}>owen@local</span>
          <span style={{ fontSize: 10, color: 'var(--color-fg-2)', fontFamily: 'var(--font-mono)' }}>
            workspace &middot; default
          </span>
        </div>
      </div>
    </aside>
  );
}
