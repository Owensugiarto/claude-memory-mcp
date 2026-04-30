import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { listRecentSessions } from "@/lib/api";
import type { SessionSummary } from "@/lib/types";
import { cn, formatRelativeTime, groupByDate, sourceLabel, projectLabel } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Terminal, Globe } from "lucide-react";

export function SessionsPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const sourceFilter = searchParams.get("source") || "";
  const projectFilter = searchParams.get("project") || "";

  useEffect(() => {
    setLoading(true);
    setError(null);
    listRecentSessions(50, sourceFilter || undefined, projectFilter || undefined)
      .then((res) => setSessions(res.sessions))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [sourceFilter, projectFilter]);

  const projects = [...new Set(sessions.map((s) => s.project).filter(Boolean))] as string[];
  const grouped = groupByDate(sessions);

  function setFilter(key: string, value: string) {
    const params = new URLSearchParams(searchParams);
    if (value) params.set(key, value);
    else params.delete(key);
    setSearchParams(params);
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-lg font-semibold">Sessions</h1>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-6">
        {["", "claude_code", "claude_ai"].map((s) => (
          <button
            key={s}
            onClick={() => setFilter("source", s)}
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
        {projects.length > 0 && (
          <select
            value={projectFilter}
            onChange={(e) => setFilter("project", e.target.value)}
            className="px-3 py-1 text-xs rounded-full border border-border bg-background text-foreground"
          >
            <option value="">All projects</option>
            {projects.map((p) => (
              <option key={p} value={p}>{projectLabel(p)}</option>
            ))}
          </select>
        )}
      </div>

      {/* Loading */}
      {loading && (
        <div className="space-y-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-lg" />
          ))}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Empty */}
      {!loading && !error && sessions.length === 0 && (
        <div className="text-center py-16 text-muted-foreground text-sm">
          No sessions found.
        </div>
      )}

      {/* Session list grouped by date */}
      {!loading && !error && (
        <div className="space-y-6">
          {[...grouped.entries()].map(([date, items]) => (
            <div key={date}>
              <h2 className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">
                {date}
              </h2>
              <div className="space-y-1">
                {(items as SessionSummary[]).map((session) => (
                  <button
                    key={session.session_id}
                    onClick={() => navigate(`/sessions/${session.session_id}`)}
                    className="w-full flex items-center gap-3 px-3 py-3 rounded-lg text-left hover:bg-accent/50 transition-colors group"
                  >
                    <SourceIcon source={session.source} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium truncate">
                          {session.session_slug || projectLabel(session.project) || session.session_id.slice(0, 8)}
                        </span>
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0 shrink-0">
                          {sourceLabel(session.source)}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                        {session.project && (
                          <span className="truncate">{projectLabel(session.project)}</span>
                        )}
                        <span className="shrink-0">{session.message_count} msgs</span>
                      </div>
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {formatRelativeTime(session.updated_at)}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SourceIcon({ source }: { source: string }) {
  if (source === "claude_code") {
    return <Terminal className="h-4 w-4 text-indigo-400 shrink-0" />;
  }
  return <Globe className="h-4 w-4 text-pink-400 shrink-0" />;
}
