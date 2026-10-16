import { existsSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { AgentHub } from '../src/main/agents/hub';
import { PtyManager } from '../src/main/terminal/ptyManager';
import { FAKE_AGENT, fakeHub } from './helpers';

let hub: AgentHub | undefined;
afterEach(async () => {
  await hub?.dispose();
  hub = undefined;
});

// Claude's sign-in is a terminal method: the client runs the agent's own CLI
// login in a terminal, the user finishes it, and the next agent start sees it.
describe.skipIf(process.platform === 'win32')('terminal sign-in', () => {
  it('runs the agent login in a pty, then the agent is signed in', async () => {
    const marker = path.join(await mkdtemp(path.join(os.tmpdir(), 'friedliver-login-')), 'marker');
    const env = { FAKE_AGENT_LOGIN_MARKER: marker };
    const made = fakeHub({
      env,
      resolveSpec: () => ({
        id: 'claude',
        label: 'Fake Claude',
        command: process.execPath,
        args: [FAKE_AGENT, '--require-login'],
        env,
        installCommand: '',
        loginHint: '',
      }),
    });
    hub = made.hub;

    const before = await hub.checkSignIn('claude');
    expect(before.signedIn).toBe(false);
    const method = !before.signedIn ? before.methods[0] : undefined;
    expect(method).toMatchObject({ id: 'demo-login', type: 'terminal', args: ['--cli'] });

    let output = '';
    const exitCode = await new Promise<number>((resolve) => {
      const ptys = new PtyManager({ data: (_id, d) => (output += d), exit: (_id, code) => resolve(code) });
      const { id } = ptys.run(process.execPath, [FAKE_AGENT, '--require-login', '--cli'], { cwd: process.cwd(), env, title: 'login' });
      const press = setInterval(() => {
        if (output.includes('Press Enter')) {
          clearInterval(press);
          ptys.write(id, '\r');
        }
      }, 50);
    });
    expect(exitCode).toBe(0);
    expect(output).toContain('Signed in.');
    expect(existsSync(marker)).toBe(true);

    await hub.stopAgent('claude');
    expect(await hub.checkSignIn('claude')).toEqual({ signedIn: true });
  });
});
