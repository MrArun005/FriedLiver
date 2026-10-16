import path from 'node:path';
import * as pty from '@lydell/node-pty';

export interface PtyEvents {
  data(id: string, data: string): void;
  exit(id: string, exitCode: number): void;
}

function defaultShell(): { file: string; args: string[] } {
  if (process.platform === 'win32') return { file: 'powershell.exe', args: ['-NoLogo'] };
  // A login shell loads the user's profile, so PATH matches their normal terminal (nvm, Homebrew).
  return { file: process.env.SHELL || '/bin/bash', args: ['-l'] };
}

/** The user's own shells for the terminal panel (separate from agent commands, which need approval). */
export class PtyManager {
  private readonly ptys = new Map<string, pty.IPty>();
  private nextId = 1;

  constructor(private readonly events: PtyEvents) {}

  create(cwd: string, cols: number, rows: number): { id: string; title: string } {
    const shell = defaultShell();
    const p = pty.spawn(shell.file, shell.args, {
      name: 'xterm-256color',
      cols: Math.max(2, Math.floor(cols) || 80),
      rows: Math.max(2, Math.floor(rows) || 24),
      cwd,
      env: { ...process.env, TERM_PROGRAM: 'FriedLiver' } as Record<string, string>,
    });
    const id = `pty-${this.nextId++}`;
    p.onData((data) => this.events.data(id, data));
    p.onExit(({ exitCode }) => {
      this.ptys.delete(id);
      this.events.exit(id, exitCode);
    });
    this.ptys.set(id, p);
    return { id, title: path.basename(shell.file).replace(/\.exe$/, '') };
  }

  write(id: string, data: string): void {
    this.ptys.get(id)?.write(data);
  }

  resize(id: string, cols: number, rows: number): void {
    if (cols > 1 && rows > 1) this.ptys.get(id)?.resize(Math.floor(cols), Math.floor(rows));
  }

  kill(id: string): void {
    this.ptys.get(id)?.kill();
    this.ptys.delete(id);
  }

  dispose(): void {
    for (const p of this.ptys.values()) p.kill();
    this.ptys.clear();
  }
}
