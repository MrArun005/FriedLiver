import { execFile } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import { promisify } from 'node:util';

const run = promisify(execFile);

export interface ProcEntry {
  pid: number;
  ppid: number;
  name: string;
  /** Filled by `listProcesses` on macOS/Windows, by `fillMemory` on Linux. */
  memBytes?: number;
}

/**
 * Which number we report. Linux PSS splits shared pages between the processes
 * that share them, so summing a process tree doesn't double count Electron's
 * shared libraries. macOS and Windows only give RSS / working set cheaply,
 * which overcounts shared memory.
 */
export const MEMORY_KIND = process.platform === 'linux' ? 'PSS' : process.platform === 'win32' ? 'working set' : 'RSS';

export async function listProcesses(): Promise<ProcEntry[]> {
  if (process.platform === 'linux') return listLinux();
  if (process.platform === 'win32') return listWindows();
  return listPs();
}

async function listLinux(): Promise<ProcEntry[]> {
  const dirs = (await readdir('/proc')).filter((d) => /^\d+$/.test(d));
  const entries = await Promise.all(
    dirs.map(async (d) => {
      try {
        const stat = await readFile(`/proc/${d}/stat`, 'utf8');
        // Format: pid (comm) state ppid ... — comm may contain spaces and parens.
        const close = stat.lastIndexOf(')');
        const name = stat.slice(stat.indexOf('(') + 1, close);
        const ppid = Number(stat.slice(close + 2).split(' ')[1]);
        return { pid: Number(d), ppid, name };
      } catch {
        return undefined; // Process exited while we were reading.
      }
    }),
  );
  return entries.filter((e): e is ProcEntry => e !== undefined);
}

async function listPs(): Promise<ProcEntry[]> {
  const { stdout } = await run('ps', ['-axo', 'pid=,ppid=,rss=,comm='], { maxBuffer: 16 * 1024 * 1024 });
  return stdout
    .split('\n')
    .map((line) => line.trim().match(/^(\d+)\s+(\d+)\s+(\d+)\s+(.*)$/))
    .filter((m): m is RegExpMatchArray => m !== null)
    .map((m) => ({ pid: Number(m[1]), ppid: Number(m[2]), memBytes: Number(m[3]) * 1024, name: m[4] }));
}

async function listWindows(): Promise<ProcEntry[]> {
  const script =
    'Get-CimInstance Win32_Process | ForEach-Object { "$($_.ProcessId),$($_.ParentProcessId),$($_.WorkingSetSize),$($_.Name)" }';
  const { stdout } = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
    maxBuffer: 16 * 1024 * 1024,
    windowsHide: true,
  });
  return stdout
    .split(/\r?\n/)
    .map((line) => line.match(/^(\d+),(\d+),(\d+),(.*)$/))
    .filter((m): m is RegExpMatchArray => m !== null)
    .map((m) => ({ pid: Number(m[1]), ppid: Number(m[2]), memBytes: Number(m[3]), name: m[4] }));
}

/** The process and all of its descendants. */
export function collectTree(rootPid: number, procs: ProcEntry[]): ProcEntry[] {
  const children = new Map<number, ProcEntry[]>();
  for (const p of procs) {
    if (p.pid === p.ppid) continue;
    const list = children.get(p.ppid) ?? [];
    list.push(p);
    children.set(p.ppid, list);
  }
  const root = procs.find((p) => p.pid === rootPid);
  if (!root) return [];
  const tree: ProcEntry[] = [];
  const stack = [root];
  const seen = new Set<number>();
  while (stack.length) {
    const p = stack.pop()!;
    if (seen.has(p.pid)) continue;
    seen.add(p.pid);
    tree.push(p);
    stack.push(...(children.get(p.pid) ?? []));
  }
  return tree;
}

/**
 * Reads memory for the given processes on Linux. Done lazily, only for the
 * trees being measured, because smaps_rollup walks page tables and isn't free.
 */
export async function fillMemory(entries: ProcEntry[]): Promise<void> {
  if (process.platform !== 'linux') return;
  await Promise.all(
    entries.map(async (e) => {
      if (e.memBytes !== undefined) return;
      e.memBytes = (await readKb(`/proc/${e.pid}/smaps_rollup`, 'Pss:')) ?? (await readKb(`/proc/${e.pid}/status`, 'VmRSS:')) ?? 0;
    }),
  );
}

async function readKb(file: string, field: string): Promise<number | undefined> {
  try {
    const text = await readFile(file, 'utf8');
    const line = text.split('\n').find((l) => l.startsWith(field));
    return line ? Number(line.slice(field.length).trim().split(/\s+/)[0]) * 1024 : undefined;
  } catch {
    return undefined;
  }
}

export async function treeMemoryBytes(rootPid: number, procs: ProcEntry[]): Promise<{ bytes: number; count: number }> {
  const tree = collectTree(rootPid, procs);
  await fillMemory(tree);
  return { bytes: tree.reduce((sum, p) => sum + (p.memBytes ?? 0), 0), count: tree.length };
}

export function formatMb(bytes: number): string {
  return `${Math.round(bytes / (1024 * 1024))} MB`;
}
