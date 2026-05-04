import { Fragment } from 'react';
import { Icon } from '../ui/icon';
import { TokenMeter } from '../ui/token-meter';

interface TopBarProps {
  crumbs: string[];
  onOpenSettings: () => void;
}

export function TopBar({ crumbs = [], onOpenSettings }: TopBarProps) {
  return (
    <div className="topbar">
      <div className="crumbs">
        {crumbs.map((c, i) => (
          <Fragment key={i}>
            <span className={i === crumbs.length - 1 ? 'leaf' : ''}>{c}</span>
            {i < crumbs.length - 1 && <span className="sep">/</span>}
          </Fragment>
        ))}
      </div>
      <div style={{ flex: 1 }} />
      <div className="row gap-3" style={{ position: 'relative' }}>
        <div style={{ position: 'relative' }}>
          <Icon
            name="search"
            size={13}
            style={{ position: 'absolute', left: 8, top: 7, color: 'var(--color-fg-2)' }}
          />
          <input
            className="input"
            placeholder="Search servers, tools, traces..."
            style={{ width: 240, paddingLeft: 26, paddingRight: 50, height: 28 }}
          />
          <kbd style={{ position: 'absolute', right: 6, top: 5 }}>Ctrl+K</kbd>
        </div>
        <TokenMeter />
        <button className="btn btn-icon btn-ghost" title="Notifications">
          <Icon name="bell" size={15} />
        </button>
        <button className="btn btn-icon btn-ghost" title="Settings" onClick={onOpenSettings}>
          <Icon name="settings" size={15} />
        </button>
      </div>
    </div>
  );
}
