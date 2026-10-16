import { useEffect } from 'preact/hooks';
import { CommandsList, type CommandView } from './commands';
import type { Theme } from './palettes';
import { TerminalView } from './terminal';
import { Icon } from './icons';
import { IconButton } from './ui';

export interface Shell {
  id: string;
  title: string;
}

/** Terminals the user types in (including agents' own logins), plus the agent commands waiting for approval. */
export function BottomPanel({
  shells,
  commands,
  theme,
  tab,
  onTab,
  onNewShell,
  onCloseShell,
  onHide,
}: {
  shells: Shell[];
  commands: CommandView[];
  theme: Theme;
  tab: string;
  onTab(tab: string): void;
  onNewShell(): void;
  onCloseShell(id: string): void;
  onHide(): void;
}) {
  const waiting = commands.filter((c) => c.state === 'awaiting').length;

  // "terminal" means: show a terminal, starting one if there is none.
  useEffect(() => {
    if (tab !== 'terminal') return;
    if (shells.length === 0) onNewShell();
    else onTab(shells.at(-1)!.id);
  }, [tab, shells.length]);

  // An agent asking to run something pulls the commands tab forward.
  useEffect(() => {
    if (waiting > 0) onTab('commands');
  }, [waiting]);

  return (
    <section class="bottom" aria-label="Terminal and agent commands">
      <div class="tabs" role="tablist">
        <button role="tab" class="tab" aria-selected={tab === 'commands'} onClick={() => onTab('commands')}>
          <Icon name="shield" />
          Agent commands{' '}
          {waiting > 0 && (
            <span class="badge" data-tone="warn">
              {waiting}
            </span>
          )}
        </button>
        <span class="tab-sep" aria-hidden="true" />
        {shells.map((s, i) => (
          <button key={s.id} role="tab" class="tab" aria-selected={tab === s.id} onClick={() => onTab(s.id)}>
            <Icon name="terminal" />
            {s.title}
            {shells.filter((x) => x.title === s.title).length > 1 ? ` ${i + 1}` : ''}
            <span
              class="close"
              role="button"
              aria-label={`Close ${s.title}`}
              onClick={(e) => {
                e.stopPropagation();
                onCloseShell(s.id);
              }}
            >
              <Icon name="close" />
            </span>
          </button>
        ))}
        <IconButton icon="plus" label="New terminal" size="sm" onClick={onNewShell} />
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
