import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { SearchMatch } from '../shared/ipc';
import { api } from './api';
import { FileIcon, Icon } from './icons';
import { PaneHeader, basename } from './ui';

/** Find in files. Results are grouped by file; clicking a line opens it there. */
export function SearchPanel({ root, focusKey, onOpen }: { root: string; focusKey: number; onOpen(path: string, line: number): void }) {
  const [query, setQuery] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [regex, setRegex] = useState(false);
  const [result, setResult] = useState<{ matches: SearchMatch[]; truncated: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => input.current?.focus(), [focusKey]);

  // Search as you type, after a short pause.
  useEffect(() => {
    if (!query) {
      setResult(null);
      setError(null);
      return;
    }
    const timer = setTimeout(async () => {
      const r = await api.search(query, { caseSensitive, regex });
      if (r.ok) {
        setResult(r.value);
        setError(null);
      } else setError(r.message);
    }, 200);
    return () => clearTimeout(timer);
  }, [query, caseSensitive, regex]);

  const groups = new Map<string, SearchMatch[]>();
  for (const m of result?.matches ?? []) groups.set(m.path, [...(groups.get(m.path) ?? []), m]);
  const rel = (p: string) => (p.startsWith(root) ? p.slice(root.length + 1) : p);
  const pattern = useMemo(() => {
    if (!query) return null;
    try {
      return new RegExp(regex ? query : query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), caseSensitive ? 'g' : 'gi');
    } catch {
      return null;
    }
  }, [query, regex, caseSensitive]);

  return (
    <>
      <PaneHeader title="Search" />
      <div class="search-form">
        <div class="search-box">
          <Icon name="search" />
          <input ref={input} value={query} placeholder="Search in files" aria-label="Search in files" onInput={(e) => setQuery(e.currentTarget.value)} />
          <span class="toggles">
            <button class="toggle" aria-pressed={caseSensitive} title="Match case" aria-label="Match case" onClick={() => setCaseSensitive(!caseSensitive)}>
              Aa
            </button>
            <button class="toggle" aria-pressed={regex} title="Use regular expression" aria-label="Use regular expression" onClick={() => setRegex(!regex)}>
              .*
            </button>
          </span>
        </div>
        {error && <div class="hint">{error}</div>}
        {result && (
          <div class="hint">
            {result.matches.length} {result.matches.length === 1 ? 'result' : 'results'} in {groups.size} {groups.size === 1 ? 'file' : 'files'}
            {result.truncated && ' (showing the first 500)'}
          </div>
        )}
      </div>
      <div class="sidebar-body">
        {[...groups].map(([file, matches]) => (
          <div key={file}>
            <button class="result-file" title={file} onClick={() => onOpen(file, matches[0].line)}>
              <FileIcon name={basename(file)} />
              {basename(file)}
              {rel(file).includes('/') && <span class="dir">{rel(file).slice(0, rel(file).length - basename(file).length - 1)}</span>}
              <span class="tag tabular">{matches.length}</span>
            </button>
            {matches.map((m) => (
              <button key={`${m.line}:${m.column}`} class="result-line" title={m.text} onClick={() => onOpen(file, m.line)}>
                <span class="ln tabular">{m.line}</span>
                <span class="text">
                  <Marked text={m.text} pattern={pattern} />
                </span>
              </button>
            ))}
          </div>
        ))}
      </div>
    </>
  );
}

/** The line with every match marked, trimmed so the first match stays in view. */
function Marked({ text, pattern }: { text: string; pattern: RegExp | null }) {
  const line = text.trimStart();
  if (!pattern) return <>{line}</>;
  const parts: (string | { hit: string })[] = [];
  let last = 0;
  pattern.lastIndex = 0;
  for (const m of line.matchAll(pattern)) {
    if (!m[0]) break;
    parts.push(line.slice(last, m.index), { hit: m[0] });
    last = m.index + m[0].length;
  }
  parts.push(line.slice(last));
  return <>{parts.map((p, i) => (typeof p === 'string' ? p : <mark key={i}>{p.hit}</mark>))}</>;
}
