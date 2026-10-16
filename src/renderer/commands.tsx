import { useEffect, useRef } from 'preact/hooks';
import type { CommandState } from '../shared/ipc';
import { api } from './api';
import { Icon } from './icons';

export interface CommandView {
  commandId: string;
  chatId?: string;
  agent: string;
  commandLine: string;
  cwd: string;
  state: CommandState;
  exitCode?: number | null;
  output: string;
}

const STATE_DOT: Record<CommandState, string> = { awaiting: 'needs-you', running: 'working', denied: 'error', exited: 'done' };
const STATE_LABEL: Record<CommandState, string> = {
  awaiting: 'Waiting for you',
  running: 'Running',
  denied: 'Denied',
  exited: 'Finished',
};

/** Agent commands: nothing runs until approved here, and output streams in live. */
export function CommandsList({ commands }: { commands: CommandView[] }) {
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => end.current?.scrollIntoView({ block: 'end' }), [commands]);
  return (
    <div class="command-list">
      {commands.length === 0 && <div class="empty compact">Commands an agent wants to run show up here. Nothing runs until you approve it.</div>}
      {commands.map((c) => (
        <div key={c.commandId} class="command" data-state={c.state}>
          <div class="command-head">
            <code title={c.commandLine}>
              <span class="prompt">$ </span>
              {c.commandLine}
            </code>
            <span class="tag">{c.agent}</span>
            <span class="state">
              <span class="dot" data-state={c.state === 'exited' && c.exitCode != null && c.exitCode !== 0 ? 'error' : STATE_DOT[c.state]} />
              {STATE_LABEL[c.state]}
              {c.state === 'exited' && ` (exit ${c.exitCode ?? '?'})`}
            </span>
            {c.state === 'awaiting' && (
              <>
                <button class="danger sm" onClick={() => void api.respondCommand(c.commandId, false)}>
                  Deny
                </button>
                <button class="primary sm" onClick={() => void api.respondCommand(c.commandId, true)}>
                  <Icon name="play" />
                  Run
                </button>
              </>
            )}
          </div>
          {c.output && <pre class="output">{c.output}</pre>}
        </div>
      ))}
      <div ref={end} />
    </div>
  );
}
