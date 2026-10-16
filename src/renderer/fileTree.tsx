import { useEffect, useState } from 'preact/hooks';
import type { DirEntry } from '../shared/ipc';
import { api } from './api';
import { FileIcon, Icon } from './icons';
import { PaneHeader, basename } from './ui';

interface TreeProps {
  activePath: string | null;
  refreshKey: number;
  /** Git status letters by absolute path, shown at the end of each row. */
  gitMarks: Map<string, string>;
  onOpen(path: string): void;
}

export function FileTree({ root, ...props }: TreeProps & { root: string }) {
  return (
    <>
      <PaneHeader title={basename(root)} />
      <nav class="sidebar-body tree" aria-label="Files">
        <Dir path={root} depth={0} {...props} />
      </nav>
    </>
  );
}

function Dir({ path, depth, ...props }: TreeProps & { path: string; depth: number }) {
  const [entries, setEntries] = useState<DirEntry[] | null>(null);
  useEffect(() => {
    api.listDir(path).then(setEntries, () => setEntries([]));
  }, [path, props.refreshKey]);
  if (!entries) return null;
  return (
    <ul role={depth === 0 ? 'tree' : 'group'} style={{ '--depth': depth }}>
      {entries.map((e) => (
        <Entry key={e.path} entry={e} depth={depth} {...props} />
      ))}
    </ul>
  );
}

function Entry({ entry, depth, ...props }: TreeProps & { entry: DirEntry; depth: number }) {
  const [open, setOpen] = useState(false);
  const indent = { paddingLeft: `calc(var(--space-4) + ${depth * 12}px)` };
  const mark = props.gitMarks.get(entry.path);
  if (entry.dir) {
    return (
      <li role="treeitem" aria-expanded={open}>
        <button class="row" style={indent} onClick={() => setOpen(!open)}>
          <span class="chevron" aria-hidden="true">
            <Icon name="chevron-right" />
          </span>
          <span class="name">{entry.name}</span>
        </button>
        {open && <Dir path={entry.path} depth={depth + 1} {...props} />}
      </li>
    );
  }
  return (
    <li role="treeitem">
      <button class={`row${props.activePath === entry.path ? ' active' : ''}`} style={indent} onClick={() => props.onOpen(entry.path)}>
        <FileIcon name={entry.name} />
        <span class="name">{entry.name}</span>
        {mark && (
          <span class="git-mark" data-status={mark} aria-label={`git: ${mark}`}>
            {mark}
          </span>
        )}
      </button>
    </li>
  );
}
