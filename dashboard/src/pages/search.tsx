import { useState, useCallback } from 'react';
import { Icon } from '../components/ui/icon';

interface SearchResult {
  content: string;
  role: string;
  session_id: string;
  project: string | null;
  source: string;
  timestamp: string;
  score: number;
}

const BASE = '/api/proxy';

async function searchMemory(query: string, source?: string, limit = 20): Promise<SearchResult[]> {
  const params = new URLSearchParams({ q: query, limit: String(limit) });
  if (source) params.set('source', source);
  const res = await fetch(`${BASE}/search?${params}`);
  if (!res.ok) return [];
  const data = await res.json();
  return data.results || [];
}

function sourceLabel(src: string): string {
  if (src === 'claude_code') return 'Claude Code';
  if (src === 'claude_ai') return 'Claude.ai';
  return src;
}

function sourceBadgeClass(src: string): string {
  if (src === 'claude_code') return 'badge badge-accent';
  if (src === 'claude_ai') return 'badge badge-success';
  return 'badge';
}

function formatTime(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffDays === 0) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function highlightSnippet(content: string, query: string): string {
  // Return a snippet around the first match
  const lower = content.toLowerCase();
  const qLower = query.toLowerCase();
  const idx = lower.indexOf(qLower);
  const start = Math.max(0, idx - 100);
  const end = Math.min(content.length, idx + query.length + 200);
  let snippet = content.slice(start, end).replace(/\n/g, ' ');
  if (start > 0) snippet = '...' + snippet;
  if (end < content.length) snippet = snippet + '...';
  return snippet;
}

export function Search() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [sourceFilter, setSourceFilter] = useState('');
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);

  const doSearch = useCallback(async () => {
    if (!query.trim()) return;
    setLoading(true);
    setSearched(true);
    setSelectedIdx(null);
    const data = await searchMemory(query, sourceFilter || undefined);
    setResults(data);
    setLoading(false);
  }, [query, sourceFilter]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') doSearch();
  };

  return (
    <div className="content" style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '14px 22px' }}>
      {/* Header */}
      <div>
        <h1 className="t-h1" style={{ margin: 0 }}>Search</h1>
        <div className="t-small fg-2" style={{ marginTop: 4 }}>
          Search across all your Claude conversations by keyword.
        </div>
      </div>

      {/* Search bar */}
      <div className="row gap-3">
        <div style={{ position: 'relative', flex: 1 }}>
          <Icon name="search" size={14} style={{ position: 'absolute', left: 10, top: 9, color: 'var(--color-fg-2)' }} />
          <input
            className="input"
            placeholder="Search conversations, code, ideas..."
            style={{ width: '100%', height: 34, paddingLeft: 30, fontSize: 13 }}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            autoFocus
          />
        </div>
        <button className="btn btn-primary" style={{ height: 34 }} onClick={doSearch}>
          <Icon name="search" size={13} />Search
        </button>
      </div>

      {/* Source filter */}
      <div className="row gap-3">
        {['', 'claude_code', 'claude_ai'].map(src => (
          <button
            key={src}
            className="btn btn-sm"
            style={{
              background: sourceFilter === src ? 'var(--color-bg-3)' : undefined,
              borderColor: sourceFilter === src ? 'var(--accent)' : undefined,
            }}
            onClick={() => setSourceFilter(src)}
          >
            {src === '' ? 'All sources' : sourceLabel(src)}
          </button>
        ))}
        {searched && <span className="t-mono-sm fg-2" style={{ marginLeft: 'auto' }}>{results.length} results</span>}
      </div>

      {/* Results */}
      <div style={{ display: 'grid', gridTemplateColumns: selectedIdx !== null ? '1fr 1fr' : '1fr', gap: 14, minHeight: 500 }}>
        <div className="card" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ overflow: 'auto', flex: 1 }}>
            {loading ? (
              <div style={{ padding: 40, textAlign: 'center' }} className="fg-2 t-small">Searching...</div>
            ) : !searched ? (
              <div style={{ padding: 40, textAlign: 'center' }} className="fg-2 t-small">
                Type a query and press Enter to search across all your Claude conversations.
              </div>
            ) : results.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center' }} className="fg-2 t-small">
                No results found for "{query}"
              </div>
            ) : (
              results.map((r, i) => (
                <div
                  key={i}
                  onClick={() => setSelectedIdx(i)}
                  style={{
                    padding: '12px 14px',
                    borderBottom: '1px solid var(--color-border-0)',
                    background: selectedIdx === i ? 'var(--color-bg-2)' : 'transparent',
                    borderLeft: selectedIdx === i ? '2px solid var(--accent)' : '2px solid transparent',
                    cursor: 'pointer',
                  }}
                >
                  <div className="row" style={{ justifyContent: 'space-between', gap: 8 }}>
                    <div className="row gap-3">
                      <span className={sourceBadgeClass(r.source)}>{sourceLabel(r.source)}</span>
                      <span className="t-mono-sm" style={{ color: r.role === 'user' ? 'var(--accent)' : 'var(--color-fg-1)', textTransform: 'uppercase' }}>
                        {r.role === 'user' ? 'Human' : 'Assistant'}
                      </span>
                    </div>
                    <span className="t-mono-sm fg-2">{formatTime(r.timestamp)}</span>
                  </div>
                  <div className="t-small fg-1" style={{ marginTop: 6, lineHeight: 1.5, maxHeight: 60, overflow: 'hidden' }}>
                    {highlightSnippet(r.content, query)}
                  </div>
                  <div className="row gap-3" style={{ marginTop: 6 }}>
                    {r.project && <span className="t-mono-sm fg-2">{r.project}</span>}
                    <span className="t-mono-sm fg-2" style={{ marginLeft: 'auto' }}>
                      score: {r.score.toFixed(3)}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Full content panel */}
        {selectedIdx !== null && results[selectedIdx] && (
          <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
            <div className="row card-pad" style={{ borderBottom: '1px solid var(--color-border-0)', justifyContent: 'space-between' }}>
              <div>
                <div className="t-eyebrow">
                  {sourceLabel(results[selectedIdx].source)} &middot; {results[selectedIdx].role}
                </div>
                <div className="t-mono-sm fg-2" style={{ marginTop: 4 }}>
                  Session: {results[selectedIdx].session_id.slice(0, 24)}
                  {results[selectedIdx].project && <> &middot; {results[selectedIdx].project}</>}
                </div>
              </div>
              <span className="t-mono-sm fg-2">{formatTime(results[selectedIdx].timestamp)}</span>
            </div>
            <div style={{ padding: '16px 20px', overflow: 'auto', flex: 1 }}>
              <pre style={{
                margin: 0,
                fontFamily: 'var(--font-sans)',
                fontSize: 13,
                lineHeight: 1.65,
                color: 'var(--color-fg-1)',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}>
                {results[selectedIdx].content}
              </pre>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
