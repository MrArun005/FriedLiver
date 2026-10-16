import { useEffect, useState } from 'preact/hooks';
import type { GitStatus } from '../shared/ipc';
import { api } from './api';
import { FileIcon, Icon } from './icons';
import { IconButton, PaneHeader, basename, toast } from './ui';

const STATUS_NAME = { M: 'Modified', A: 'Added', D: 'Deleted', R: 'Renamed', U: 'Untracked', C: 'Conflict' } as const;

/** Changes against HEAD: click to diff, then commit everything with a message. */
export function GitPanel({
  status,
  onRefresh,
  onDiff,
}: {
  status: GitStatus | null | undefined;
  onRefresh(): void;
  onDiff(path: string, statusLetter: string): void;
}) {
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(onRefresh, []);

  const commit = async () => {
    setBusy(true);
    const r = await api.gitCommit(message);
    setBusy(false);
    if (r.ok) {
      toast(`Committed ${r.value}`, 'success');
      setMessage('');
      onRefresh();
    } else toast(r.message, 'error');
  };

  if (status === null) {
    return (
      <>
        <PaneHeader title="Source control" />
        <div class="empty compact">
          This folder isn't a git repository. Run <code>git init</code> in the terminal to start tracking changes.
        </div>
      </>
    );
  }
  return (
    <>
      <PaneHeader title={status?.branch ? `Git · ${status.branch}` : 'Source control'}>
        <IconButton icon="refresh" label="Refresh" size="sm" onClick={onRefresh} />
      </PaneHeader>
      <div class="git-commit">
        <textarea value={message} placeholder="Commit message" aria-label="Commit message" onInput={(e) => setMessage(e.currentTarget.value)} />
        <button class="primary" disabled={busy || !message.trim() || !status?.files.length} onClick={() => void commit()}>
          <Icon name="check" />
          Commit all {status?.files.length ? `(${status.files.length})` : ''}
        </button>
      </div>
      <div class="sidebar-body">
        {status?.files.length === 0 && <div class="empty compact">No changes. Edits you save or accept from an agent show up here.</div>}
        {!!status?.files.length && <div class="section-label">Changes · {status.files.length}</div>}
        {status?.files.map((f) => (
          <button key={f.path} class="git-file" title={`${STATUS_NAME[f.status]}: ${f.path}`} onClick={() => onDiff(f.path, f.status)}>
            <FileIcon name={basename(f.path)} />
            <span class="name">{basename(f.path)}</span>
            {f.path.includes('/') && <span class="dir">{f.path.slice(0, f.path.lastIndexOf('/'))}</span>}
            <span class="letter" data-status={f.status}>
              {f.status}
            </span>
          </button>
        ))}
      </div>
    </>
  );
}
