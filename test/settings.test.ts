import { mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { SettingsStore, type KeyProtection, type SecretBox } from '../src/main/settings';

// Reversible stand-in for the OS keychain.
const box = (protection: KeyProtection = 'os'): SecretBox => ({
  protection: () => protection,
  encrypt: (plain) => Buffer.from([...Buffer.from(plain)].map((b) => b ^ 0x5a)),
  decrypt: (sealed) => Buffer.from([...sealed].map((b) => b ^ 0x5a)).toString(),
});

async function store(protection?: KeyProtection) {
  const file = path.join(await mkdtemp(path.join(os.tmpdir(), 'friedliver-settings-')), 'settings.json');
  return { file, store: new SettingsStore(file, box(protection)) };
}

describe('SettingsStore', () => {
  it('starts from defaults and clamps bad values', async () => {
    const { store: s } = await store();
    await s.load();
    expect(s.get()).toEqual({ idleStopMinutes: 10, maxRunningAgents: 2, agents: {} });
    expect(await s.update({ maxRunningAgents: 99, idleStopMinutes: -5 })).toMatchObject({ maxRunningAgents: 6, idleStopMinutes: 0 });
  });

  it('keeps agent overrides and drops unknown agents', async () => {
    const { store: s } = await store();
    const out = await s.update({ agents: { gemini: { command: ' gemini-dev ', args: ['--acp'] }, nope: {} } as never });
    expect(out.agents).toEqual({ gemini: { command: 'gemini-dev', args: ['--acp'] } });
  });

  it('stores keys encrypted, reloads them, and exposes them only as env', async () => {
    const { file, store: s } = await store();
    await s.setKey('GEMINI_API_KEY', 'secret-123');
    expect(await readFile(file, 'utf8')).not.toContain('secret-123');
    expect(s.keyStatus().saved).toEqual({ ANTHROPIC_API_KEY: false, OPENAI_API_KEY: false, GEMINI_API_KEY: true });

    const again = new SettingsStore(file, box());
    await again.load();
    expect(again.keyEnv()).toEqual({ GEMINI_API_KEY: 'secret-123' });
    await again.setKey('GEMINI_API_KEY', null);
    expect(again.keyEnv()).toEqual({});
  });

  it('refuses to store keys when the system cannot protect them', async () => {
    const { store: s } = await store('none');
    await expect(s.setKey('OPENAI_API_KEY', 'x')).rejects.toThrow(/environment variable/);
  });
});
