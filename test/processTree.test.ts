import { spawn } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { collectTree, listProcesses, treeMemoryBytes, type ProcEntry } from '../src/main/ram/processTree';

describe('collectTree', () => {
  it('collects a process and all of its descendants, ignoring others', () => {
    const procs: ProcEntry[] = [
      { pid: 1, ppid: 0, name: 'init' },
      { pid: 10, ppid: 1, name: 'app' },
      { pid: 11, ppid: 10, name: 'renderer' },
      { pid: 12, ppid: 11, name: 'agent' },
      { pid: 20, ppid: 1, name: 'other' },
    ];
    expect(collectTree(10, procs).map((p) => p.pid).sort()).toEqual([10, 11, 12]);
    expect(collectTree(99, procs)).toEqual([]);
  });
});

describe('treeMemoryBytes', () => {
  it('measures this process plus a child it started', async () => {
    const child = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 5000)']);
    try {
      await new Promise((r) => setTimeout(r, 300));
      const procs = await listProcesses();
      const alone = collectTree(child.pid!, procs);
      expect(alone).toHaveLength(1);

      const { bytes, count } = await treeMemoryBytes(process.pid, procs);
      expect(count).toBeGreaterThanOrEqual(2);
      expect(bytes).toBeGreaterThan(10 * 1024 * 1024);
    } finally {
      child.kill();
    }
  });
});
