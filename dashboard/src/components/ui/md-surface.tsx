import type { ReactNode } from 'react';

/** Simple markdown-to-JSX renderer */
export function renderMd(md: string): ReactNode[] {
  const lines = md.split('\n');
  const out: ReactNode[] = [];
  let inCode = false;
  let codeBuf: string[] = [];
  let listBuf: string[] = [];

  const flushList = () => {
    if (listBuf.length) {
      out.push(
        <ul key={`ul${out.length}`}>
          {listBuf.map((t, i) => (
            <li key={i}>{inl(t)}</li>
          ))}
        </ul>
      );
      listBuf = [];
    }
  };

  const inl = (s: string): ReactNode[] => {
    const parts: ReactNode[] = [];
    let i = 0;
    let last = 0;
    while (i < s.length) {
      if (s[i] === '`') {
        const e = s.indexOf('`', i + 1);
        if (e > 0) {
          if (i > last) parts.push(s.slice(last, i));
          parts.push(<code key={parts.length}>{s.slice(i + 1, e)}</code>);
          i = e + 1;
          last = i;
          continue;
        }
      }
      if (s.startsWith('**', i)) {
        const e = s.indexOf('**', i + 2);
        if (e > 0) {
          if (i > last) parts.push(s.slice(last, i));
          parts.push(<strong key={parts.length}>{s.slice(i + 2, e)}</strong>);
          i = e + 2;
          last = i;
          continue;
        }
      }
      i++;
    }
    if (last < s.length) parts.push(s.slice(last));
    return parts;
  };

  lines.forEach((ln, idx) => {
    if (ln.startsWith('```')) {
      if (inCode) {
        out.push(<pre key={idx}>{codeBuf.join('\n')}</pre>);
        codeBuf = [];
        inCode = false;
      } else {
        flushList();
        inCode = true;
      }
      return;
    }
    if (inCode) {
      codeBuf.push(ln);
      return;
    }
    if (ln.startsWith('# ')) {
      flushList();
      out.push(<h1 key={idx}>{ln.slice(2)}</h1>);
      return;
    }
    if (ln.startsWith('## ')) {
      flushList();
      out.push(<h2 key={idx}>{ln.slice(3)}</h2>);
      return;
    }
    if (ln.startsWith('### ')) {
      flushList();
      out.push(<h3 key={idx}>{ln.slice(4)}</h3>);
      return;
    }
    if (ln.startsWith('- ')) {
      listBuf.push(ln.slice(2));
      return;
    }
    if (ln.trim() === '') {
      flushList();
      return;
    }
    flushList();
    out.push(<p key={idx}>{inl(ln)}</p>);
  });

  flushList();
  return out;
}

interface MdSurfaceProps {
  children: ReactNode;
}

export function MdSurface({ children }: MdSurfaceProps) {
  return (
    <div className="md" style={{ color: 'var(--color-fg-1)', lineHeight: 1.65, fontSize: 13.5 }}>
      {children}
    </div>
  );
}
