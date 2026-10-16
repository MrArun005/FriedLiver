import { useEffect, useRef } from 'preact/hooks';
import type { CommandState } from '../shared/ipc';
import { api } from './api';

export interface CommandView {
  commandId: string;
  agent: string;
  commandLine: string;
  cwd: string;
  state: CommandState;
  exitCode?: number | null;
  output: string;
}

const STATE_LABEL: Record<CommandState, string> = {
  awaiting: 'Waiting for you',
  running: 'Running',
  denied: 'Denied',
  exited: 'Finished',
};

/** Agent commands: nothing runs until approved here, and output streams in live. */
export function CommandsPanel({ commands }: { commands: CommandView[] }) {
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => end.current?.scrollIntoView({ block: 'end' }), [commands]);
  const waiting = commands.filter((c) => c.state === 'awaiting').length;
  return (
    <section class="commands" aria-label="Agent commands">
      <div class="pane-title">
        Commands {waiting > 0 && <span class="badge">{waiting} waiting</span>}
      </div>
      <div class="command-list">
        {commands.length === 0 && <div class="empty small">Commands an agent wants to run show up here. Nothing runs until you approve it.</div>}
        {commands.map((c) => (
          <div key={c.commandId} class={`command ${c.state}`}>
            <div class="command-head">
              <code>$ {c.commandLine}</code>
              <span class="tag">{c.agent}</span>
              <span class="state">
                {STATE_LABEL[c.state]}
                {c.state === 'exited' && ` (exit ${c.exitCode ?? '?'})`}
              </span>
              {c.state === 'awaiting' && (
                <>
                  <button class="primary" onClick={() => void api.respondCommand(c.commandId, true)}>
                    Run
                  </button>
                  <button onClick={() => void api.respondCommand(c.commandId, false)}>Deny</button>
                </>
              )}
            </div>
            {c.output && <pre class="output">{c.output}</pre>}
          </div>
        ))}
        <div ref={end} />
      </div>
    </section>
  );
}
