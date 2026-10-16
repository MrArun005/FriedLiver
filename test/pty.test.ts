import { describe, expect, it } from 'vitest';
import { PtyManager } from '../src/main/terminal/ptyManager';

describe.skipIf(process.platform === 'win32')('PtyManager', () => {
  it('runs a real shell, takes input, and reports exit', async () => {
    let out = '';
    const exited = new Promise<number>((resolve) => {
      const ptys = new PtyManager({ data: (_id, d) => (out += d), exit: (_id, code) => resolve(code) });
      const { id } = ptys.create(process.cwd(), 80, 24);
      ptys.write(id, 'echo "pty-$((40 + 2))"; exit 3\r');
    });
    expect(await exited).toBe(3);
    expect(out).toContain('pty-42');
  });
});

describe.skipIf(process.platform === 'win32')('PtyManager buffer', () => {
  it('keeps output for views that attach late, with a sequence number', async () => {
    let last = 0;
    const ptys = new PtyManager({ data: (_id, _d, seq) => (last = seq), exit: () => {} });
    const { id } = ptys.run(process.execPath, ['-e', "process.stdout.write('early-output'); setTimeout(() => {}, 300)"], { cwd: process.cwd(), title: 't' });
    await new Promise((r) => setTimeout(r, 200));
    const { data, seq } = ptys.buffer(id);
    expect(data).toContain('early-output');
    expect(seq).toBe(last);
    ptys.dispose();
  });
});
