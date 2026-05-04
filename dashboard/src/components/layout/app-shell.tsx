import type { ReactNode } from 'react';
import { SidebarNav } from './sidebar';
import { TopBar } from './topbar';
import type { PageId } from '../../lib/types';

interface AppShellProps {
  page: PageId;
  onNav: (page: PageId) => void;
  crumbs: string[];
  onOpenSettings: () => void;
  children: ReactNode;
}

export function AppShell({ page, onNav, crumbs, onOpenSettings, children }: AppShellProps) {
  return (
    <div className="app" style={{ height: '100%' }}>
      <SidebarNav active={page} onNav={onNav} />
      <div className="main">
        <TopBar crumbs={crumbs} onOpenSettings={onOpenSettings} />
        <div style={{ position: 'relative', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          {children}
        </div>
      </div>
    </div>
  );
}
