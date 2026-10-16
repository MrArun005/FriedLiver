import type { AgentKey, SignInMethod } from '../shared/ipc';
import { api } from './api';
import { Callout } from './ui';

export interface SignInState {
  agent: AgentKey;
  label: string;
  method: SignInMethod;
  phase: 'browser' | 'terminal' | 'done' | 'failed';
  url?: string;
  ptyId?: string;
  message?: string;
}

const TERMINAL_STEPS: Partial<Record<AgentKey, string>> = {
  claude: 'In the terminal below, type /login and press Enter, then approve in the browser page that opens. Type /exit once it says you are signed in.',
};

/**
 * Shown while a sign-in runs. FriedLiver only starts the vendor's own flow:
 * the browser page belongs to Google, OpenAI or Anthropic, and the
 * credentials stay with the agent's CLI.
 */
export function SignInCard({ state, onShowTerminal, onClose }: { state: SignInState; onShowTerminal(): void; onClose(): void }) {
  const cancel = () => {
    if (state.phase === 'terminal' && state.ptyId) void api.ptyKill(state.ptyId);
    else void api.cancelSignIn(state.agent);
    onClose();
  };
  return (
    <div class="sign-in-card" role="status">
      {state.phase === 'browser' && (
        <Callout tone="info" title={`Signing in to ${state.label}: ${state.method.name}`}>
          <div>Finish in the browser page that just opened. FriedLiver waits here and continues by itself.</div>
          <div class="actions">
            {state.url && (
              <button class="sm primary" onClick={() => void api.openExternal(state.url!)}>
                Open the sign-in page again
              </button>
            )}
            <button class="sm danger" onClick={cancel}>
              Cancel
            </button>
          </div>
        </Callout>
      )}
      {state.phase === 'terminal' && (
        <Callout tone="info" title={`Signing in to ${state.label}: ${state.method.name}`}>
          <div>{TERMINAL_STEPS[state.agent] ?? `${state.label}'s own login is running in the terminal below. Follow its steps there.`}</div>
          <div class="actions">
            <button class="sm" onClick={onShowTerminal}>
              Show terminal
            </button>
            <button class="sm danger" onClick={cancel}>
              Cancel
            </button>
          </div>
        </Callout>
      )}
      {state.phase === 'done' && (
        <Callout tone="success" title={`Signed in to ${state.label}`}>
          <div class="actions">
            <button class="sm" onClick={onClose}>
              Close
            </button>
          </div>
        </Callout>
      )}
      {state.phase === 'failed' && (
        <Callout tone="error" title={`Couldn't sign in to ${state.label}`}>
          <div>{state.message ?? 'The sign-in did not finish.'}</div>
          <div class="actions">
            <button class="sm" onClick={onClose}>
              Close
            </button>
          </div>
        </Callout>
      )}
    </div>
  );
}
