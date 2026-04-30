import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { getSession } from "@/lib/api";
import type { SessionResponse, SessionMessage } from "@/lib/types";
import { formatTime, formatDate, sourceLabel, projectLabel, cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ArrowLeft, User, Bot, Wrench, Settings } from "lucide-react";

const ROLE_CONFIG: Record<string, { label: string; color: string; icon: typeof User }> = {
  human: { label: "Human", color: "text-indigo-400", icon: User },
  user: { label: "Human", color: "text-indigo-400", icon: User },
  assistant: { label: "Assistant", color: "text-emerald-400", icon: Bot },
  system: { label: "System", color: "text-zinc-400", icon: Settings },
  tool: { label: "Tool", color: "text-amber-400", icon: Wrench },
};

function getRoleConfig(role: string) {
  return ROLE_CONFIG[role] || ROLE_CONFIG.system;
}

function isToolCallBlock(content: string): boolean {
  const trimmed = content.trim();
  return (
    (trimmed.startsWith("{") && trimmed.includes('"tool_use"')) ||
    (trimmed.startsWith("{") && trimmed.includes('"name"') && trimmed.includes('"input"')) ||
    (trimmed.startsWith("[{") && trimmed.includes('"type"'))
  );
}

export function SessionViewPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<SessionResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionId) return;
    setLoading(true);
    setError(null);
    getSession(sessionId)
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [sessionId]);

  if (loading) {
    return (
      <div className="p-6 max-w-3xl mx-auto space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-64" />
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4">
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          {error || "Session not found"}
        </div>
      </div>
    );
  }

  const { session, messages } = data;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="border-b border-border px-6 py-4 shrink-0">
        <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-2">
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
        <div className="flex items-center gap-2 flex-wrap">
          <h1 className="text-lg font-semibold">
            {session.session_slug || projectLabel(session.project) || session.session_id.slice(0, 8)}
          </h1>
          <Badge variant="secondary" className="text-[10px]">
            {sourceLabel(session.source)}
          </Badge>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
          {session.project && <span>{projectLabel(session.project)}</span>}
          <span>{formatDate(session.created_at)}</span>
          <span>{messages.length} messages</span>
        </div>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1">
        <div className="max-w-3xl mx-auto px-6 py-4 space-y-1">
          {messages.map((msg, i) => (
            <MessageBubble key={i} message={msg} />
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

function MessageBubble({ message }: { message: SessionMessage }) {
  const [collapsed, setCollapsed] = useState(true);
  const config = getRoleConfig(message.role);
  const Icon = config.icon;
  const isTool = isToolCallBlock(message.content);

  if (isTool && collapsed) {
    return (
      <button
        onClick={() => setCollapsed(false)}
        className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-xs text-muted-foreground hover:bg-accent/50 transition-colors"
      >
        <Wrench className="h-3 w-3 text-amber-400" />
        <span>Tool call</span>
        <span className="text-[10px]">(click to expand)</span>
      </button>
    );
  }

  return (
    <div className="py-3">
      <div className="flex items-center gap-2 mb-1.5">
        <Icon className={cn("h-3.5 w-3.5", config.color)} />
        <span className={cn("text-xs font-medium", config.color)}>{config.label}</span>
        <span className="text-[10px] text-muted-foreground">
          {formatTime(message.timestamp)}
        </span>
        {isTool && (
          <button onClick={() => setCollapsed(true)} className="text-[10px] text-muted-foreground hover:text-foreground ml-auto">
            collapse
          </button>
        )}
      </div>
      <div className="pl-5.5 text-sm leading-relaxed whitespace-pre-wrap break-words text-foreground/90">
        {message.content}
      </div>
    </div>
  );
}
