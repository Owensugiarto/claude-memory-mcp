import { useEffect, useState } from "react";
import { getHealth } from "@/lib/api";
import type { HealthResponse } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { projectLabel, sourceLabel } from "@/lib/utils";
import { MessageSquare, FolderOpen, Cpu, Database } from "lucide-react";

export function StatsPage() {
  const [stats, setStats] = useState<HealthResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getHealth()
      .then(setStats)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="p-6 max-w-3xl mx-auto space-y-4">
        <h1 className="text-lg font-semibold mb-4">Stats</h1>
        <div className="grid grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <h1 className="text-lg font-semibold mb-4">Stats</h1>
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          {error || "Failed to load stats"}
        </div>
      </div>
    );
  }

  const sourceEntries = Object.entries(stats.by_source);
  const projectEntries = Object.entries(stats.by_project).sort((a, b) => b[1] - a[1]);
  const maxProjectCount = projectEntries.length > 0 ? projectEntries[0][1] : 1;

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h1 className="text-lg font-semibold mb-6">Stats</h1>

      <div className="grid grid-cols-2 gap-4 mb-8">
        <StatCard
          icon={<Database className="h-4 w-4" />}
          label="Total Sessions"
          value={stats.total_sessions.toLocaleString()}
        />
        <StatCard
          icon={<MessageSquare className="h-4 w-4" />}
          label="Total Messages"
          value={stats.total_messages.toLocaleString()}
        />
        {sourceEntries.map(([source, count]) => (
          <StatCard
            key={source}
            icon={<Cpu className="h-4 w-4" />}
            label={sourceLabel(source)}
            value={`${count} sessions`}
          />
        ))}
      </div>

      {projectEntries.length > 0 && (
        <div>
          <h2 className="text-sm font-medium mb-3 flex items-center gap-2">
            <FolderOpen className="h-4 w-4 text-muted-foreground" />
            Projects
          </h2>
          <div className="space-y-2">
            {projectEntries.map(([project, count]) => (
              <div key={project} className="flex items-center gap-3">
                <span className="text-sm text-foreground w-40 truncate shrink-0">
                  {projectLabel(project)}
                </span>
                <div className="flex-1 h-5 rounded-sm bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-sm bg-primary/20"
                    style={{ width: `${(count / maxProjectCount) * 100}%` }}
                  />
                </div>
                <span className="text-xs text-muted-foreground w-8 text-right shrink-0">
                  {count}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
          {icon}
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-semibold">{value}</p>
      </CardContent>
    </Card>
  );
}
