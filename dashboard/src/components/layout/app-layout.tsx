import { useState } from "react";
import { Outlet, NavLink } from "react-router-dom";
import { MessageSquare, Search, BarChart3, Brain, Menu } from "lucide-react";
import { cn } from "@/lib/utils";
import { CommandPalette } from "@/components/command-palette";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

const navItems = [
  { to: "/", icon: MessageSquare, label: "Sessions", end: true },
  { to: "/search", icon: Search, label: "Search" },
  { to: "/stats", icon: BarChart3, label: "Stats" },
];

function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <>
      <div className="flex items-center gap-2 px-4 h-14 border-b border-border">
        <Brain className="h-5 w-5 text-primary" />
        <span className="text-sm font-semibold tracking-tight">Memory</span>
      </div>
      <nav className="flex-1 px-2 py-2 space-y-0.5">
        {navItems.map(({ to, icon: Icon, label, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
                isActive
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
              )
            }
          >
            <Icon className="h-4 w-4" />
            {label}
          </NavLink>
        ))}
      </nav>
      <div className="px-4 py-3 border-t border-border">
        <p className="text-[11px] text-muted-foreground">Cmd+K to search</p>
      </div>
    </>
  );
}

export function AppLayout() {
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-[220px] flex-col border-r border-border bg-sidebar shrink-0">
        <SidebarNav />
      </aside>

      {/* Mobile header + drawer */}
      <div className="flex flex-col flex-1 min-w-0">
        <header className="flex md:hidden items-center gap-2 px-4 h-12 border-b border-border bg-background shrink-0">
          <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
            <SheetTrigger asChild>
              <button className="p-1.5 rounded-md hover:bg-accent transition-colors">
                <Menu className="h-5 w-5" />
              </button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[260px] p-0 flex flex-col">
              <SidebarNav onNavigate={() => setDrawerOpen(false)} />
            </SheetContent>
          </Sheet>
          <Brain className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold tracking-tight">Memory</span>
        </header>

        {/* Main content */}
        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>

      <CommandPalette />
    </div>
  );
}
