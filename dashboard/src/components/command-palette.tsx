import { useEffect, useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { searchMemory, listRecentSessions } from "@/lib/api";
import type { SearchResult, SessionSummary } from "@/lib/types";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { formatRelativeTime, projectLabel, sourceLabel, truncate } from "@/lib/utils";
import { Search, MessageSquare, BarChart3, Terminal, Globe } from "lucide-react";

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [recent, setRecent] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const navigate = useNavigate();
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Cmd+K listener
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // Load recent sessions when opened
  useEffect(() => {
    if (open && recent.length === 0) {
      listRecentSessions(5)
        .then((r) => setRecent(r.sessions))
        .catch(() => {});
    }
  }, [open, recent.length]);

  // Search on query change
  const doSearch = useCallback((q: string) => {
    if (!q.trim()) {
      setResults([]);
      return;
    }
    setLoading(true);
    searchMemory({ query: q, limit: 8 })
      .then((r) => {
        setResults(r.results);
        setSelectedIdx(0);
      })
      .catch(() => setResults([]))
      .finally(() => setLoading(false));
  }, []);

  function onQueryChange(value: string) {
    setQuery(value);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => doSearch(value), 300);
  }

  function goTo(path: string) {
    setOpen(false);
    setQuery("");
    setResults([]);
    navigate(path);
  }

  // Items to display
  const navItems = [
    { label: "Sessions", path: "/", icon: MessageSquare },
    { label: "Search", path: "/search", icon: Search },
    { label: "Stats", path: "/stats", icon: BarChart3 },
  ];

  const showResults = query.trim() && results.length > 0;
  const showRecent = !query.trim() && recent.length > 0;

  // Keyboard navigation
  const totalItems = showResults ? results.length : showRecent ? recent.length + navItems.length : navItems.length;

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIdx((i) => Math.min(i + 1, totalItems - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (showResults) {
        goTo(`/sessions/${results[selectedIdx]?.session_id}`);
      } else if (showRecent) {
        if (selectedIdx < navItems.length) {
          goTo(navItems[selectedIdx].path);
        } else {
          goTo(`/sessions/${recent[selectedIdx - navItems.length]?.session_id}`);
        }
      } else if (selectedIdx < navItems.length) {
        goTo(navItems[selectedIdx].path);
      }
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="p-0 gap-0 max-w-[640px] overflow-hidden">
        <div className="flex items-center border-b border-border px-3">
          <Search className="h-4 w-4 text-muted-foreground shrink-0" />
          <Input
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search memory or navigate..."
            className="border-0 focus-visible:ring-0 shadow-none"
            autoFocus
          />
        </div>

        <div className="max-h-[360px] overflow-y-auto py-2">
          {/* Navigation items (when no query) */}
          {!showResults && (
            <div className="px-2 mb-2">
              <p className="px-2 py-1 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                Navigate
              </p>
              {navItems.map((item, i) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.path}
                    onClick={() => goTo(item.path)}
                    className={`w-full flex items-center gap-2 px-2 py-2 text-sm rounded-md transition-colors ${
                      selectedIdx === i ? "bg-accent" : "hover:bg-accent/50"
                    }`}
                  >
                    <Icon className="h-4 w-4 text-muted-foreground" />
                    {item.label}
                  </button>
                );
              })}
            </div>
          )}

          {/* Recent sessions */}
          {showRecent && (
            <div className="px-2">
              <p className="px-2 py-1 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                Recent
              </p>
              {recent.map((s, i) => {
                const idx = i + navItems.length;
                return (
                  <button
                    key={s.session_id}
                    onClick={() => goTo(`/sessions/${s.session_id}`)}
                    className={`w-full flex items-center gap-2 px-2 py-2 text-sm rounded-md transition-colors ${
                      selectedIdx === idx ? "bg-accent" : "hover:bg-accent/50"
                    }`}
                  >
                    {s.source === "claude_code" ? (
                      <Terminal className="h-3.5 w-3.5 text-indigo-400 shrink-0" />
                    ) : (
                      <Globe className="h-3.5 w-3.5 text-pink-400 shrink-0" />
                    )}
                    <span className="truncate">
                      {s.session_slug || projectLabel(s.project) || s.session_id.slice(0, 8)}
                    </span>
                    <span className="text-xs text-muted-foreground ml-auto shrink-0">
                      {formatRelativeTime(s.updated_at)}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Search results */}
          {showResults && (
            <div className="px-2">
              <p className="px-2 py-1 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                Results
              </p>
              {results.map((r, i) => (
                <button
                  key={`${r.session_id}-${i}`}
                  onClick={() => goTo(`/sessions/${r.session_id}`)}
                  className={`w-full text-left px-2 py-2 rounded-md transition-colors ${
                    selectedIdx === i ? "bg-accent" : "hover:bg-accent/50"
                  }`}
                >
                  <div className="flex items-center gap-2 text-sm">
                    {r.source === "claude_code" ? (
                      <Terminal className="h-3.5 w-3.5 text-indigo-400 shrink-0" />
                    ) : (
                      <Globe className="h-3.5 w-3.5 text-pink-400 shrink-0" />
                    )}
                    <span className="text-xs text-muted-foreground">
                      {r.project ? projectLabel(r.project) : sourceLabel(r.source)}
                    </span>
                    <span className="text-xs text-muted-foreground ml-auto">
                      {formatRelativeTime(r.timestamp)}
                    </span>
                  </div>
                  <p className="text-xs text-foreground/70 line-clamp-1 mt-0.5 pl-5.5">
                    {truncate(r.content, 120)}
                  </p>
                </button>
              ))}
            </div>
          )}

          {/* Loading */}
          {loading && (
            <div className="px-4 py-3 text-xs text-muted-foreground">Searching...</div>
          )}

          {/* No results */}
          {query.trim() && !loading && results.length === 0 && (
            <div className="px-4 py-6 text-center text-xs text-muted-foreground">
              No results for "{query}"
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
