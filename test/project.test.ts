import { mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { AgentHub } from '../src/main/agents/hub';
import { fakeHub } from './helpers';

let hub: AgentHub | undefined;
afterEach(async () => {
  await hub?.dispose();
  hub = undefined;
});

// The full loop the IDE exists for: an agent writes a project, runs its tests,
// sees one fail, fixes the code, reruns, and runs the app, with every write and
// command passing through the client.
describe('demo agent builds and tests a project', () => {
  it('creates calc/, fixes the failing test, and runs the app', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'friedliver-project-'));
    const commands: string[] = [];
    const made = fakeHub({
      cwd: dir,
      terminalListener: () => ({
        approve: async (info) => {
          commands.push(info.commandLine);
          return true;
        },
        onStart: () => {},
        onData: () => {},
        onExit: () => {},
      }),
    });
    hub = made.hub;
    const chat = hub.createChat('demo');

    const result = await hub.prompt(chat.id, [{ type: 'text', text: 'project' }]);

    expect(result.stopReason).toBe('end_turn');
    expect(made.rec.writes.map((w) => path.relative(dir, w.path))).toEqual([
      path.join('calc', 'package.json'),
      path.join('calc', 'src', 'calc.js'),
      path.join('calc', 'src', 'cli.js'),
      path.join('calc', 'test', 'calc.test.js'),
      path.join('calc', 'src', 'calc.js'),
    ]);
    expect(commands).toEqual(['npm test', 'npm test', 'npm start -- 6*7']);
    const text = made.rec.text(chat.id);
    expect(text).toContain('Tests failed: `multiply`');
    expect(text).toContain('All 3 tests pass now.');
    expect(text).toContain('The app works: `6 * 7 = 42`.');
    expect(await readFile(path.join(dir, 'calc', 'src', 'calc.js'), 'utf8')).toContain('a * b');
  }, 60_000);

  it('stops without running anything when the first file is rejected', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'friedliver-project-'));
    const commands: string[] = [];
    const made = fakeHub({
      cwd: dir,
      files: {
        read: async () => ({ content: '' }),
        write: async () => {
          throw new Error('rejected');
        },
      },
      terminalListener: () => ({
        approve: async (info) => (commands.push(info.commandLine), true),
        onStart: () => {},
        onData: () => {},
        onExit: () => {},
      }),
    });
    hub = made.hub;
    const chat = hub.createChat('demo');

    await hub.prompt(chat.id, [{ type: 'text', text: 'project' }]);

    expect(commands).toEqual([]);
    expect(made.rec.text(chat.id)).toContain('You rejected `calc/package.json`');
  });
});
