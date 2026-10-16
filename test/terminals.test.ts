import { describe, expect, it } from 'vitest';
import { TerminalManager } from '../src/main/agents/terminals';

const node = process.execPath;

describe('TerminalManager', () => {
  it('runs a command with args and captures its output and exit code', async () => {
    const terminals = new TerminalManager(process.cwd());
    const { terminalId } = await terminals.create({ sessionId: 's', command: node, args: ['-e', 'console.log("hi"); process.exit(3)'] });

    const exit = await terminals.waitForExit({ sessionId: 's', terminalId });

    expect(exit.exitCode).toBe(3);
    expect(terminals.output({ sessionId: 's', terminalId })).toMatchObject({ output: 'hi\n', truncated: false });
  });

  it('runs a bare command string through the shell', async () => {
    const terminals = new TerminalManager(process.cwd());
    const { terminalId } = await terminals.create({ sessionId: 's', command: 'echo shell-works' });
    await terminals.waitForExit({ sessionId: 's', terminalId });
    expect(terminals.output({ sessionId: 's', terminalId }).output.trim()).toBe('shell-works');
  });

  it('keeps only the newest output once the byte limit is hit', async () => {
    const terminals = new TerminalManager(process.cwd());
    const { terminalId } = await terminals.create({
      sessionId: 's',
      command: node,
      args: ['-e', 'process.stdout.write("a".repeat(100) + "é".repeat(10) + "END")'],
      outputByteLimit: 16,
    });
    await terminals.waitForExit({ sessionId: 's', terminalId });

    const { output, truncated } = terminals.output({ sessionId: 's', terminalId });
    expect(truncated).toBe(true);
    expect(output.endsWith('END')).toBe(true);
    expect(Buffer.byteLength(output)).toBeLessThanOrEqual(16);
    expect(output).not.toContain('�');
  });

  it('kills a long-running command', async () => {
    const terminals = new TerminalManager(process.cwd());
    const { terminalId } = await terminals.create({ sessionId: 's', command: node, args: ['-e', 'setInterval(() => {}, 1000)'] });

    terminals.kill({ sessionId: 's', terminalId });
    const exit = await terminals.waitForExit({ sessionId: 's', terminalId });

    expect(exit.exitCode !== 0 || exit.signal).toBeTruthy();
  });

  it('refuses a command the user denies, without running it', async () => {
    const started: string[] = [];
    const terminals = new TerminalManager(process.cwd(), {
      approve: async () => false,
      onStart: (info) => started.push(info.commandLine),
      onData: () => {},
      onExit: () => {},
    });
    await expect(terminals.create({ sessionId: 's', command: 'echo nope' })).rejects.toThrow(/denied/);
    expect(started).toHaveLength(0);
  });

  it('mirrors output to a listener', async () => {
    const seen: string[] = [];
    const terminals = new TerminalManager(process.cwd(), {
      onStart: (info) => seen.push(`start ${info.commandLine}`),
      onData: (_id, data) => seen.push(data),
      onExit: (_id, status) => seen.push(`exit ${status.exitCode}`),
    });
    const { terminalId } = await terminals.create({ sessionId: 's', command: node, args: ['-e', 'console.log("x")'] });
    await terminals.waitForExit({ sessionId: 's', terminalId });

    expect(seen[0]).toMatch(/^start .*node/);
    expect(seen).toContain('x\n');
    expect(seen.at(-1)).toBe('exit 0');
  });
});
