import { mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { findOnWindowsPath, launchFor, quoteWindowsArg } from '../src/main/agents/processes';

describe('quoteWindowsArg', () => {
  it('leaves simple arguments alone and quotes the rest so Windows reads them back intact', () => {
    expect(quoteWindowsArg('--acp')).toBe('--acp');
    expect(quoteWindowsArg('C:\\Users\\Jane Doe\\app.js')).toBe('"C:\\Users\\Jane Doe\\app.js"');
    expect(quoteWindowsArg('say "hi"')).toBe('"say \\"hi\\""');
    expect(quoteWindowsArg('C:\\dir with space\\')).toBe('"C:\\dir with space\\\\"');
    expect(quoteWindowsArg('')).toBe('""');
    expect(quoteWindowsArg('a&b')).toBe('"a&b"');
  });
});

describe('findOnWindowsPath', () => {
  it("prefers npm's .cmd wrapper over the extensionless Git Bash script", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'friedliver-path-'));
    await writeFile(path.join(dir, 'gemini'), '#!/bin/sh');
    await writeFile(path.join(dir, 'gemini.cmd'), '@echo off');
    // Lowercase so the match also works on case-sensitive file systems (Windows ignores case).
    const env = { PATH: ['/nowhere', dir].join(path.delimiter), PATHEXT: '.com;.exe;.bat;.cmd' };
    expect(findOnWindowsPath('gemini', env)).toBe(path.join(dir, 'gemini.cmd'));
    expect(findOnWindowsPath('missing', env)).toBeNull();
    expect(findOnWindowsPath(path.join(dir, 'gemini'), env)).toBe(path.join(dir, 'gemini.cmd'));
  });
});

describe('launchFor', () => {
  it.skipIf(process.platform === 'win32')('runs commands directly outside Windows', () => {
    expect(launchFor('gemini', ['--acp', 'a b'])).toEqual({ file: 'gemini', args: ['--acp', 'a b'] });
  });
});
