import { mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { readIfExists, readTextFile, writeTextFile } from '../src/main/agents/fileAccess';

describe('fileAccess', () => {
  it('reads a line range with a 1-based start line', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'friedliver-'));
    const file = path.join(dir, 'f.txt');
    await writeFile(file, 'one\ntwo\nthree\nfour');
    expect((await readTextFile({ sessionId: 's', path: file, line: 2, limit: 2 })).content).toBe('two\nthree');
    expect((await readTextFile({ sessionId: 's', path: file })).content).toBe('one\ntwo\nthree\nfour');
  });

  it('creates parent folders when writing, and reads a missing file as null', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'friedliver-'));
    const file = path.join(dir, 'a', 'b', 'c.txt');
    expect(await readIfExists(file)).toBeNull();
    await writeTextFile(file, 'hi');
    expect(await readIfExists(file)).toBe('hi');
  });
});
