import { describe, expect, it } from 'vitest';
import { TurnLog } from '../src/main/agents/turnLog';

function memoryIo(files: Record<string, string>) {
  return {
    files,
    write: async (f: string, c: string) => void (files[f] = c),
    remove: async (f: string) => void delete files[f],
  };
}

describe('TurnLog', () => {
  it('undoes the latest turn, restoring edits and removing new files', async () => {
    const log = new TurnLog();
    const io = memoryIo({ 'a.ts': 'v2', 'new.ts': 'created' });
    const turn = log.begin('chat');
    log.record('chat', 'a.ts', 'v1');
    log.record('chat', 'a.ts', 'v1.5'); // a second write in the same turn keeps the original
    log.record('chat', 'new.ts', null);

    expect(log.latest('chat')).toEqual({ turnId: turn, files: ['a.ts', 'new.ts'] });
    expect(await log.undo('chat', turn, io)).toEqual(['a.ts', 'new.ts']);
    expect(io.files).toEqual({ 'a.ts': 'v1' });
  });

  it('only undoes the most recent turn', async () => {
    const log = new TurnLog();
    const first = log.begin('chat');
    log.record('chat', 'a.ts', 'v1');
    log.begin('chat');
    log.record('chat', 'a.ts', 'v2');
    await expect(log.undo('chat', first, memoryIo({}))).rejects.toThrow(/most recent/);
  });

  it('reports nothing for a turn without writes', () => {
    const log = new TurnLog();
    log.begin('chat');
    expect(log.latest('chat')).toBeNull();
  });
});
