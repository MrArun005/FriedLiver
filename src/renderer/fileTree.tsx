import { useEffect, useState } from 'preact/hooks';
import type { DirEntry } from '../shared/ipc';
import { api } from './api';

interface TreeProps {
  activePath: string | null;
  refreshKey: number;
  onOpen(path: string): void;
}

export function FileTree({ root, ...props }: TreeProps & { root: string }) {
  return (
    <nav class="tree" aria-label="Files">
      <div class="pane-title">{root.split(/[\\/]/).pop()}</div>
      <Dir path={root} depth={0} {...props} />
    </nav>
  );
}

function Dir({ path, depth, ...props }: TreeProps & { path: string; depth: number }) {
  const [entries, setEntries] = useState<DirEntry[] | null>(null);
  useEffect(() => {
    api.listDir(path).then(setEntries, () => setEntries([]));
  }, [path, props.refreshKey]);
  if (!entries) return null;
  return (
    <ul>
      {entries.map((e) => (
        <Entry key={e.path} entry={e} depth={depth} {...props} />
      ))}
    </ul>
  );
}

function Entry({ entry, depth, ...props }: TreeProps & { entry: DirEntry; depth: number }) {
  const [open, setOpen] = useState(false);
  const indent = { paddingLeft: `${8 + depth * 12}px` };
  if (entry.dir) {
    return (
      <li>
        <button class="row" style={indent} onClick={() => setOpen(!open)} aria-expanded={open}>
          <span class="chevron" aria-hidden="true">{open ? "▾" : "▸"}</span>
          {entry.name}
        </button>
        {open && <Dir path={entry.path} depth={depth + 1} {...props} />}
      </li>
    );
  }
  return (
    <li>
      <button
        class={`row file${props.activePath === entry.path ? ' active' : ''}`}
        style={indent}
        onClick={() => props.onOpen(entry.path)}
      >
        {entry.name}
      </button>
    </li>
  );
}
