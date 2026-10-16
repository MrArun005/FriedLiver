import { useEffect, useState } from 'preact/hooks';
import { api } from './api';
import { CommandsList, type CommandView } from './commands';
import type { Theme } from './palettes';
import { TerminalView } from './terminal';
import { IconButton } from './ui';

interface Shell {
  id: string;
  title: string;
}

/** Terminals the user types in, plus the agent commands waiting for approval. */
export function BottomPanel({
  commands,
  theme,
  tab,
  onTab,
  onHide,
}: {
  commands: CommandView[];
  theme: Theme;
  tab: string;
  onTab(tab: string): void;
  onHide(): void;
}) {
  const [shells, setShells] = useState<Shell[]>([]);
  const waiting = commands.filter((c) => c.state === 'awaiting').length;

  const newShell = async () => {
    const shell = await api.ptyCreate(100, 24);
    setShells((list) => [...list, shell]);
    onTab(shell.id);
  };
  const closeShell = (id: string) => {
    void api.ptyKill(id);
    const rest = shells.filter((s) => s.id !== id);
    setShells(rest);
    if (tab === id) onTab(rest.at(-1)?.id ?? 'commands');
  };

  // Opening the terminal tab with no shells starts one.
  useEffect(() => {
    if (tab === 'terminal' && shells.length === 0) void newShell();
    else if (tab === 'terminal') onTab(shells.at(-1)!.id);
  }, [tab]);

  // Agents asking to run something pulls the commands tab forward.
  useEffect(() => {
    if (waiting > 0) onTab('commands');
  }, [waiting]);

  return (
    <section class="bottom" aria-label="Terminal and agent commands">
      <div class="tabs" role="tablist">
        {shells.map((s, i) => (
          <button key={s.id} role="tab" class="tab" aria-selected={tab === s.id} onClick={() => onTab(s.id)}>
            {s.title} {shells.length > 1 ? i + 1 : ''}
            <span
              class="close"
              role="button"
              aria-label={`Close terminal ${i + 1}`}
              onClick={(e) => {
                e.stopPropagation();
                closeShell(s.id);
              }}
            >
              ×
            </span>
          </button>
        ))}
        <IconButton icon="plus" label="New terminal" size="sm" onClick={() => void newShell()} />
        <button role="tab" class="tab" aria-selected={tab === 'commands'} onClick={() => onTab('commands')}>
          Agent commands {waiting > 0 && <span class="badge" data-tone="warn">{waiting}</span>}
        </button>
        <div class="end">
          <IconButton icon="close" label="Hide panel" size="sm" onClick={onHide} />
        </div>
      </div>
      {shells.map((s) => (
        <TerminalView key={s.id} id={s.id} theme={theme} visible={tab === s.id} />
      ))}
      <div class="tab-body" hidden={tab !== 'commands'}>
        <CommandsList commands={commands} />
      </div>
    </section>
  );
}
