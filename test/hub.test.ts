import { mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { AgentStartError } from '../src/main/agents/agentConnection';
import { AuthRequiredError, type AgentHub } from '../src/main/agents/hub';
import { fakeHub } from './helpers';

let hub: AgentHub | undefined;
afterEach(async () => {
  await hub?.dispose();
  hub = undefined;
});

describe('AgentHub with the fake agent', () => {
  it('starts the agent on the first prompt and streams its reply', async () => {
    const made = fakeHub();
    hub = made.hub;
    const chat = hub.createChat('gemini');
    expect(hub.running()).toHaveLength(0);

    const result = await hub.prompt(chat.id, [{ type: 'text', text: 'hello there' }]);

    expect(result.stopReason).toBe('end_turn');
    expect(made.rec.text(chat.id)).toBe('You said: hello there');
    expect(hub.running()).toHaveLength(1);
  });

  it('passes images through when the agent supports them', async () => {
    const made = fakeHub();
    hub = made.hub;
    const chat = hub.createChat('gemini');
    await hub.prompt(chat.id, [
      { type: 'text', text: 'look' },
      { type: 'image', data: 'aGk=', mimeType: 'image/png' },
    ]);
    expect(made.rec.text(chat.id)).toBe('You said: look (+1 image)');
  });

  it('drops images, with a notice, when the agent cannot take them', async () => {
    const made = fakeHub({ env: { FAKE_AGENT_IMAGES: '0' } });
    hub = made.hub;
    const chat = hub.createChat('gemini');
    await hub.prompt(chat.id, [
      { type: 'text', text: 'look' },
      { type: 'image', data: 'aGk=', mimeType: 'image/png' },
    ]);
    expect(made.rec.text(chat.id)).toBe('You said: look');
    expect(made.rec.notices[0]).toMatch(/can't take images/);
  });

  it('writes a file only after permission is granted', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'friedliver-'));
    const file = path.join(dir, 'a.txt');
    const made = fakeHub({ answer: 'allow' });
    hub = made.hub;
    const chat = hub.createChat('gemini');

    await hub.prompt(chat.id, [{ type: 'text', text: `edit ${file}` }]);

    expect(made.rec.permissions).toHaveLength(1);
    expect(made.rec.permissions[0].options.map((o) => o.kind)).toEqual(['allow_once', 'reject_once']);
    expect(await readFile(file, 'utf8')).toBe('edited by fake agent\n');
  });

  it('does not write when permission is refused', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'friedliver-'));
    const made = fakeHub({ answer: 'reject' });
    hub = made.hub;
    const chat = hub.createChat('gemini');

    await hub.prompt(chat.id, [{ type: 'text', text: `edit ${path.join(dir, 'a.txt')}` }]);

    expect(made.rec.writes).toHaveLength(0);
    expect(made.rec.text(chat.id)).toBe('Skipped the edit.');
  });

  it('runs agent commands in a client terminal and returns their output', async () => {
    const started: string[] = [];
    const made = fakeHub({
      terminalListener: () => ({ onStart: (i) => started.push(i.commandLine), onData: () => {}, onExit: () => {} }),
    });
    hub = made.hub;
    const chat = hub.createChat('gemini');

    await hub.prompt(chat.id, [{ type: 'text', text: 'run' }]);

    expect(started).toHaveLength(1);
    expect(made.rec.text(chat.id)).toBe('exit 0: hello from terminal');
  });

  it('cancels a running turn', async () => {
    const made = fakeHub();
    hub = made.hub;
    const chat = hub.createChat('gemini');
    const turn = hub.prompt(chat.id, [{ type: 'text', text: 'wait' }]);
    await waitFor(() => hub!.running().some((a) => a.busy));
    await new Promise((r) => setTimeout(r, 200));

    await hub.cancel(chat.id);

    expect((await turn).stopReason).toBe('cancelled');
  });

  it('stops an idle agent and restarts it in a new session on the next prompt', async () => {
    const made = fakeHub({ idleStopMs: 300 });
    hub = made.hub;
    const chat = hub.createChat('gemini');
    await hub.prompt(chat.id, [{ type: 'text', text: 'one' }]);
    expect(hub.running()).toHaveLength(1);

    await waitFor(() => hub!.running().length === 0);
    await hub.prompt(chat.id, [{ type: 'text', text: 'two' }]);

    expect(made.rec.text(chat.id)).toBe('You said: oneYou said: two');
    expect(made.rec.notices[0]).toMatch(/new session/);
  });

  it('reports sign-in methods when the agent needs auth, and works after authenticating', async () => {
    const made = fakeHub({ env: { FAKE_AGENT_AUTH: '1' } });
    hub = made.hub;
    const chat = hub.createChat('gemini');

    const err = await hub.prompt(chat.id, [{ type: 'text', text: 'hi' }]).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AuthRequiredError);
    expect((err as AuthRequiredError).methods.map((m) => m.id)).toEqual(['fake-login']);

    await hub.authenticate('gemini', 'fake-login');
    const result = await hub.prompt(chat.id, [{ type: 'text', text: 'hi' }]);
    expect(result.stopReason).toBe('end_turn');
  });

  it('explains how to install an agent that is missing', async () => {
    const made = fakeHub({
      resolveSpec: () => ({
        id: 'gemini',
        label: 'Gemini',
        command: 'friedliver-no-such-agent',
        args: [],
        installCommand: 'npm install -g @google/gemini-cli',
        loginHint: '',
      }),
    });
    hub = made.hub;
    const chat = hub.createChat('gemini');

    const err = await hub.prompt(chat.id, [{ type: 'text', text: 'hi' }]).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(AgentStartError);
    expect((err as AgentStartError).failure).toBe('not_installed');
    expect((err as Error).message).toContain('npm install -g @google/gemini-cli');
  });
});

async function waitFor(condition: () => boolean, timeoutMs = 5000): Promise<void> {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeoutMs) throw new Error('Timed out waiting for condition');
    await new Promise((r) => setTimeout(r, 25));
  }
}

describe('AgentHub chats in their own folders', () => {
  it('starts each session in the chat folder', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'friedliver-cwd-'));
    const made = fakeHub();
    hub = made.hub;
    const chat = hub.createChat('gemini', dir);
    await hub.prompt(chat.id, [{ type: 'text', text: 'tour' }]);
    // The tour writes NOTES.md into the session's cwd.
    expect(made.rec.writes[0].path).toBe(`${dir}/NOTES.md`);
  });
});

describe('signing in', () => {
  it('reports whether an agent is signed in, and its methods when not', async () => {
    const made = fakeHub({ env: { FAKE_AGENT_AUTH: '1' } });
    hub = made.hub;
    const before = await hub.checkSignIn('gemini');
    expect(before).toEqual({ signedIn: false, methods: [{ id: 'fake-login', name: 'Fake login' }] });

    await hub.authenticate('gemini', 'fake-login');
    expect(await hub.checkSignIn('gemini')).toEqual({ signedIn: true });
  });

  it('passes the agent stderr on, so a sign-in link can be shown', async () => {
    const lines: string[] = [];
    const made = fakeHub({ env: { FAKE_AGENT_AUTH: '1' }, onStderr: (l) => lines.push(l) });
    hub = made.hub;
    await hub.authenticate('gemini', 'fake-login');
    expect(lines.join('\n')).toContain('https://accounts.google.com/o/oauth2/v2/auth');
  });
});

describe('agent limit', () => {
  it('counts agents that are starting at the same time', async () => {
    const made = fakeHub({ maxRunning: 2 });
    hub = made.hub;
    await hub.prompt(hub.createChat('claude').id, [{ type: 'text', text: 'a' }]);
    await hub.prompt(hub.createChat('codex').id, [{ type: 'text', text: 'b' }]);
    await hub.prompt(hub.createChat('gemini').id, [{ type: 'text', text: 'c' }]);
    expect(hub.running().map((a) => a.id).sort()).toEqual(['codex', 'gemini']);

    await Promise.all([hub.checkSignIn('claude'), hub.checkSignIn('demo')]);
    expect(hub.running().length).toBeLessThanOrEqual(2);
  });
});
