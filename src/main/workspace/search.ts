import { open, readdir, stat } from 'node:fs/promises';
import path from 'node:path';

/** Never walked: dependencies, build output and VCS data. Also keeps memory and time flat. */
export const IGNORED_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'out',
  '.next',
  'coverage',
  '.cache',
  '.venv',
  'venv',
  '__pycache__',
  'target',
]);
const MAX_FILE_BYTES = 1024 * 1024;

/** Relative paths (with `/`) of every file under `root`, skipping ignored folders and symlinks. */
export async function listFiles(root: string, limit = 20_000): Promise<{ files: string[]; truncated: boolean }> {
  const files: string[] = [];
  const stack = [''];
  while (stack.length) {
    const rel = stack.pop()!;
    let entries;
    try {
      entries = await readdir(path.join(root, rel), { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      if (e.isSymbolicLink()) continue;
      const child = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) {
        if (!IGNORED_DIRS.has(e.name)) stack.push(child);
      } else if (e.isFile()) {
        files.push(child);
        if (files.length >= limit) return { files: files.sort(), truncated: true };
      }
    }
  }
  return { files: files.sort(), truncated: false };
}

export interface SearchMatch {
  path: string;
  line: number;
  column: number;
  text: string;
}

export interface SearchOptions {
  caseSensitive?: boolean;
  regex?: boolean;
  limit?: number;
}

/** Plain-text (or regex) search through every text file under `root`. */
export async function searchText(
  root: string,
  query: string,
  options: SearchOptions = {},
): Promise<{ matches: SearchMatch[]; truncated: boolean }> {
  const limit = options.limit ?? 500;
  const flags = options.caseSensitive ? 'g' : 'gi';
  const pattern = new RegExp(options.regex ? query : query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), flags);
  const { files } = await listFiles(root);
  const matches: SearchMatch[] = [];
  for (const rel of files) {
    const text = await readText(path.join(root, rel));
    if (text === null) continue;
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
      pattern.lastIndex = 0;
      const m = pattern.exec(lines[i]);
      if (!m) continue;
      matches.push({ path: path.join(root, rel), line: i + 1, column: m.index + 1, text: lines[i].trim().slice(0, 240) });
      if (matches.length >= limit) return { matches, truncated: true };
    }
  }
  return { matches, truncated: false };
}

/** File contents, or null for large or binary files. */
async function readText(file: string): Promise<string | null> {
  try {
    if ((await stat(file)).size > MAX_FILE_BYTES) return null;
    const handle = await open(file, 'r');
    try {
      const buf = await handle.readFile();
      if (buf.subarray(0, 8000).includes(0)) return null;
      return buf.toString('utf8');
    } finally {
      await handle.close();
    }
  } catch {
    return null;
  }
}
