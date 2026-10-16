import { existsSync } from 'node:fs';
import path from 'node:path';
import * as pty from '@lydell/node-pty';
import { launchFor } from '../agents/processes';

export interface PtyEvents {
  /** `seq` counts chunks per terminal, so a late-attaching view can skip what `buffer()` already gave it. */
  data(id: string, data: string, seq: number): void;
  exit(id: string, exitCode: number): void;
}

const BUFFER_BYTES = 256 * 1024;

interface Session {
  pty: pty.IPty;
  buffer: string;
  seq: number;
}

/** First match for `exe` on PATH, Windows only. */
function onPath(exe: string): string | null {
  for (const dir of (process.env.PATH ?? '').split(path.delimiter)) {
    const full = path.join(dir, exe);
    if (dir && existsSync(full)) return full;
  }
  return null;
}

function defaultShell(): { file: string; args: string[] } {
  // PowerShell 7 when installed, else the Windows PowerShell every machine has.
  if (process.platform === 'win32') return { file: onPath('pwsh.exe') ?? 'powershell.exe', args: ['-NoLogo'] };
  // A login shell loads the user's profile, so PATH matches their normal terminal (nvm, Homebrew).
  return { file: process.env.SHELL || '/bin/bash', args: ['-l'] };
}

/** The user's own shells for the terminal panel (separate from agent commands, which need approval). */
export class PtyManager {
  private readonly ptys = new Map<string, Session>();
  private nextId = 1;

  constructor(private readonly events: PtyEvents) {}

  /** The user's default shell. */
  create(cwd: string, cols: number, rows: number): { id: string; title: string } {
    const shell = defaultShell();
    return this.spawn(shell.file, shell.args, { cwd, cols, rows, title: path.basename(shell.file).replace(/\.exe$/, '') });
  }

  /**
   * Any command in a terminal the user can type in, such as an agent's own
   * login (`claude-agent-acp --cli`). On Windows npm installs CLIs as .cmd
   * shims, which only cmd.exe can start.
   */
  run(command: string, args: string[], options: { cwd: string; env?: Record<string, string>; title: string }): { id: string; title: string } {
    const launch = launchFor(command, args);
    // A string is passed to Windows verbatim, keeping cmd.exe's quoting intact.
    return this.spawn(launch.file, launch.windowsVerbatimArguments ? launch.args.join(' ') : launch.args, { ...options, cols: 100, rows: 24 });
  }

  private spawn(
    file: string,
    args: string[] | string,
    options: { cwd: string; cols: number; rows: number; env?: Record<string, string>; title: string },
  ): { id: string; title: string } {
    const p = pty.spawn(file, args, {
      name: 'xterm-256color',
      cols: Math.max(2, Math.floor(options.cols) || 80),
      rows: Math.max(2, Math.floor(options.rows) || 24),
      cwd: options.cwd,
      env: { ...process.env, ...options.env, TERM_PROGRAM: 'FriedLiver' } as Record<string, string>,
    });
    const id = `pty-${this.nextId++}`;
    const session: Session = { pty: p, buffer: '', seq: 0 };
    p.onData((data) => {
      session.seq++;
      session.buffer = (session.buffer + data).slice(-BUFFER_BYTES);
      this.events.data(id, data, session.seq);
    });
    p.onExit(({ exitCode }) => {
      this.ptys.delete(id);
      this.events.exit(id, exitCode);
    });
    this.ptys.set(id, session);
    return { id, title: options.title };
  }

  /** Output so far, for a view that attaches after the terminal started printing. */
  buffer(id: string): { data: string; seq: number } {
    const session = this.ptys.get(id);
    return session ? { data: session.buffer, seq: session.seq } : { data: '', seq: 0 };
  }

  write(id: string, data: string): void {
    this.ptys.get(id)?.pty.write(data);
  }

  resize(id: string, cols: number, rows: number): void {
    if (cols > 1 && rows > 1) this.ptys.get(id)?.pty.resize(Math.floor(cols), Math.floor(rows));
  }

  kill(id: string): void {
    this.ptys.get(id)?.pty.kill();
    this.ptys.delete(id);
  }

  dispose(): void {
    for (const s of this.ptys.values()) s.pty.kill();
    this.ptys.clear();
  }
}
