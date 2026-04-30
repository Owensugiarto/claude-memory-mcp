import { useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { searchMemory } from "@/lib/api";
import type { SearchResult } from "@/lib/types";
import { cn, sourceLabel, projectLabel, formatRelativeTime, truncate } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Search as SearchIcon, Terminal, Globe } from "lucide-react";

export function SearchPage() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [sourceFilter, setSourceFilter] = useState("");
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const doSearch = useCallback(
    (q: string, source: string) => {
      if (!q.trim()) {
        setResults([]);
        setSearched(false);
        return;
      }
      setLoading(true);
      setSearched(true);
      searchMemory({
        query: q,
        source: source as "" | "claude_code" | "claude_ai",
        limit: 20,
      })
        .then((res) => setResults(res.results))
        .catch(() => setResults([]))
        .finally(() => setLoading(false));
    },
    []
  );

  function onQueryChange(value: string) {
    setQuery(value);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => doSearch(value, sourceFilter), 300);
  }

  function onSourceChange(source: string) {
    setSourceFilter(source);
    if (query.trim()) {
      doSearch(query, source);
    }
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h1 className="text-lg font-semibold mb-6">Search Memory</h1>

      {/* Search input */}
      <div className="relative mb-4">
        <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Search conversations..."
          className="pl-9"
          autoFocus
        />
      </div>

      {/* Source filter */}
      <div className="flex gap-2 mb-6">
        {["", "claude_code", "claude_ai"].map((s) => (
          <button
            key={s}
            onClick={() => onSourceChange(s)}
            className={cn(
              "px-3 py-1 text-xs rounded-full border transition-colors",
              sourceFilter === s
                ? "bg-primary text-primary-foreground border-primary"
                : "text-muted-foreground border-border hover:border-foreground/20"
            )}
          >
            {s ? sourceLabel(s) : "All sources"}
          </button>
        ))}
      </div>

      {/* Loading */}
      {loading && (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-lg" />
          ))}
        </div>
      )}

      {/* Results */}
      {!loading && searched && results.length === 0 && (
        <div className="text-center py-16 text-muted-foreground text-sm">
          No results found for "{query}"
        </div>
      )}

      {!loading && results.length > 0 && (
        <div className="space-y-2">
          {results.map((r, i) => (
            <button
              key={`${r.session_id}-${i}`}
              onClick={() => navigate(`/sessions/${r.session_id}`)}
              className="w-full text-left px-4 py-3 rounded-lg border border-border hover:bg-accent/50 transition-colors"
            >
              <div className="flex items-center gap-2 mb-1">
                {r.source === "claude_code" ? (
                  <Terminal className="h-3.5 w-3.5 text-indigo-400" />
                ) : (
                  <Globe className="h-3.5 w-3.5 text-pink-400" />
                )}
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                  {r.role}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {r.project ? projectLabel(r.project) : sourceLabel(r.source)}
                </span>
                <span className="text-[10px] text-muted-foreground ml-auto">
                  {formatRelativeTime(r.timestamp)}
                </span>
                <ScoreIndicator score={r.score} />
              </div>
              <p className="text-sm text-foreground/80 line-clamp-2">
                {truncate(r.content, 200)}
              </p>
            </button>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!searched && !loading && (
        <div className="text-center py-16 text-muted-foreground text-sm">
          Type to search across all your Claude conversations
        </div>
      )}
    </div>
  );
}

function ScoreIndicator({ score }: { score: number }) {
  const normalized = Math.min(score * 50, 100);
  return (
    <div className="flex items-center gap-1" title={`Score: ${score.toFixed(3)}`}>
      <div className="w-12 h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full bg-emerald-500/60"
          style={{ width: `${normalized}%` }}
        />
      </div>
    </div>
  );
}
