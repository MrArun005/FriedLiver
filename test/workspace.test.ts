import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { commitAll, createWorktree, headContent, mergeWorktree, removeWorktree, status } from '../src/main/workspace/git';
import { listFiles, searchText } from '../src/main/workspace/search';

async function tempDir(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), 'friedliver-ws-'));
}

async function project(): Promise<string> {
  const dir = await tempDir();
  await mkdir(path.join(dir, 'src'));
  await mkdir(path.join(dir, 'node_modules', 'lib'), { recursive: true });
  await writeFile(path.join(dir, 'src', 'a.ts'), 'export const Total = 1;\nconst total = 2;\n');
  await writeFile(path.join(dir, 'src', 'b.ts'), 'nothing here\n');
  await writeFile(path.join(dir, 'node_modules', 'lib', 'index.js'), 'total total total\n');
  await writeFile(path.join(dir, 'image.bin'), Buffer.from([0, 1, 2, 116, 111, 116, 97, 108]));
  return dir;
}

async function gitInit(dir: string): Promise<void> {
  await writeFile(path.join(dir, '.gitignore'), 'node_modules/\n');
  const g = (...args: string[]) => execFileSync('git', args, { cwd: dir, stdio: 'ignore' });
  g('init', '-q', '-b', 'main');
  g('config', 'user.email', 'test@example.com');
  g('config', 'user.name', 'Test');
}

describe('search', () => {
  it('lists files and skips node_modules', async () => {
    const dir = await project();
    expect((await listFiles(dir)).files).toEqual(['image.bin', 'src/a.ts', 'src/b.ts']);
  });

  it('finds text case-insensitively, skipping binary files and node_modules', async () => {
    const dir = await project();
    const { matches } = await searchText(dir, 'total');
    expect(matches.map((m) => [path.relative(dir, m.path), m.line, m.column])).toEqual([
      [path.join('src', 'a.ts'), 1, 14],
      [path.join('src', 'a.ts'), 2, 7],
    ]);
  });

  it('supports case-sensitive and regex search', async () => {
    const dir = await project();
    expect((await searchText(dir, 'total', { caseSensitive: true })).matches).toHaveLength(1);
    expect((await searchText(dir, 'T.tal|noth', { regex: true, caseSensitive: true })).matches.map((m) => m.line)).toEqual([1, 1]);
  });
});

describe('git', () => {
  it('reports branch and changes, shows HEAD content and commits', async () => {
    const dir = await project();
    await gitInit(dir);
    expect((await status(dir))!.files.map((f) => [f.path, f.status])).toEqual([
      ['.gitignore', 'U'],
      ['image.bin', 'U'],
      ['src/a.ts', 'U'],
      ['src/b.ts', 'U'],
    ]);

    const hash = await commitAll(dir, 'first');
    expect(hash).toMatch(/^[0-9a-f]{7,}$/);
    await writeFile(path.join(dir, 'src', 'b.ts'), 'changed\n');
    const s = (await status(dir))!;
    expect(s.branch).toBe('main');
    expect(s.files).toEqual([{ path: 'src/b.ts', status: 'M', staged: false }]);
    expect(await headContent(dir, 'src/b.ts')).toBe('nothing here\n');
    expect(await headContent(dir, 'src/missing.ts')).toBeNull();
  });

  it('returns null outside a repository', async () => {
    expect(await status(await tempDir())).toBeNull();
  });

  it('runs a task in a worktree and merges it back', async () => {
    const dir = await project();
    await gitInit(dir);
    await commitAll(dir, 'first');

    const wt = await createWorktree(dir, 'Add docs!');
    expect(wt.branch).toMatch(/^friedliver\/add-docs-/);
    expect(path.dirname(wt.path)).toBe(path.join(path.dirname(dir), `.${path.basename(dir)}-worktrees`));
    await writeFile(path.join(wt.path, 'DOCS.md'), '# Docs\n');
    expect((await status(dir))!.files).toEqual([]);

    await mergeWorktree(dir, wt, 'Add docs');
    expect(await readFile(path.join(dir, 'DOCS.md'), 'utf8')).toBe('# Docs\n');
    await removeWorktree(dir, wt);
    expect(execFileSync('git', ['branch', '--list', 'friedliver/*'], { cwd: dir }).toString().trim()).toBe('');
  });
});
