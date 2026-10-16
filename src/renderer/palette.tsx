import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { AgentKey } from '../shared/ipc';
import { rank, type FuzzyMatch } from './fuzzy';
import { AgentMark, FileIcon, Icon, type IconName } from './icons';
import { Keys } from './ui';

export interface PaletteItem {
  id: string;
  label: string;
  /** A shortcut such as `Ctrl+Shift+P`, shown as keycaps. */
  detail?: string;
  icon?: IconName;
  agent?: AgentKey;
  /** A path: shown as the file name, then its folder. */
  file?: boolean;
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
        <div class="palette-input">
          <Icon name="search" />
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
        </div>
        <ul id="palette-list" role="listbox" ref={list}>
          {results.length === 0 && <li class="hint">No matches</li>}
          {results.map((r, i) => (
            <li key={r.item.id} id={`palette-${i}`} role="option" aria-selected={i === selected} onMouseMove={() => setSelected(i)} onClick={() => run(i)}>
              {r.item.file ? (
                <FileLabel path={r.item.label} match={r.match} />
              ) : (
                <>
                  {r.item.agent ? <AgentMark agent={r.item.agent} size="sm" /> : r.item.icon ? <Icon name={r.item.icon} /> : null}
                  <span class="label">
                    <Highlight text={r.item.label} match={r.match} />
                  </span>
                </>
              )}
              {r.item.detail && (
                <span class="detail">
                  <Keys keys={r.item.detail} />
                </span>
              )}
            </li>
          ))}
        </ul>
        <div class="palette-foot" aria-hidden="true">
          <span>
            <kbd>↑</kbd>
            <kbd>↓</kbd> to move
          </span>
          <span>
            <kbd>↵</kbd> to {items.some((i) => i.file) ? 'open' : 'run'}
          </span>
          <span>
            <kbd>Esc</kbd> to close
          </span>
          <span class="spacer" />
          <span class="tabular">
            {results.length} {results.length === 1 ? 'result' : 'results'}
          </span>
        </div>
      </div>
    </div>
  );
}

/** `src/app/main.ts` as "main.ts  src/app", with the matched letters marked in both parts. */
function FileLabel({ path, match }: { path: string; match: FuzzyMatch }) {
  const cut = path.lastIndexOf('/') + 1;
  return (
    <>
      <FileIcon name={path.slice(cut)} />
      <span class="label">
        <Highlight text={path.slice(cut)} match={match} offset={cut} />
      </span>
      {cut > 0 && (
        <span class="dir">
          <Highlight text={path.slice(0, cut - 1)} match={match} />
        </span>
      )}
    </>
  );
}

function Highlight({ text, match, offset = 0 }: { text: string; match: FuzzyMatch; offset?: number }) {
  const hit = new Set(match.indices);
  return <span>{[...text].map((ch, i) => (hit.has(i + offset) ? <mark key={i}>{ch}</mark> : ch))}</span>;
}
