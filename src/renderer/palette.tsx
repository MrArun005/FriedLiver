import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { rank, type FuzzyMatch } from './fuzzy';

export interface PaletteItem {
  id: string;
  label: string;
  detail?: string;
  run(): void;
}

/**
 * Quick open (files) and the command palette share this: type to filter,
 * arrows to move, Enter to run, Escape to close.
 */
export function Palette({ items, placeholder, onClose }: { items: PaletteItem[]; placeholder: string; onClose(): void }) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const results = useMemo(() => rank(items, query, (i) => i.label, 60), [items, query]);

  useEffect(() => input.current?.focus(), []);
  useEffect(() => setSelected(0), [query]);
  useEffect(() => {
    list.current?.children[selected]?.scrollIntoView({ block: 'nearest' });
  }, [selected]);

  const run = (i: number) => {
    const r = results[i];
    if (!r) return;
    onClose();
    r.item.run();
  };

  return (
    <div class="scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div class="palette" role="dialog" aria-label={placeholder}>
        <input
          ref={input}
          value={query}
          placeholder={placeholder}
          aria-controls="palette-list"
          aria-activedescendant={results[selected] ? `palette-${selected}` : undefined}
          onInput={(e) => setQuery(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') setSelected((s) => Math.min(s + 1, results.length - 1));
            else if (e.key === 'ArrowUp') setSelected((s) => Math.max(s - 1, 0));
            else if (e.key === 'Enter') run(selected);
            else if (e.key === 'Escape') onClose();
            else return;
            e.preventDefault();
          }}
        />
        <ul id="palette-list" role="listbox" ref={list}>
          {results.length === 0 && <li class="hint">No matches</li>}
          {results.map((r, i) => (
            <li
              key={r.item.id}
              id={`palette-${i}`}
              role="option"
              aria-selected={i === selected}
              onMouseMove={() => setSelected(i)}
              onClick={() => run(i)}
            >
              <Highlight text={r.item.label} match={r.match} />
              {r.item.detail && <span class="detail">{r.item.detail}</span>}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Highlight({ text, match }: { text: string; match: FuzzyMatch }) {
  const hit = new Set(match.indices);
  return <span>{[...text].map((ch, i) => (hit.has(i) ? <mark key={i}>{ch}</mark> : ch))}</span>;
}
