import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);
const MARK = '__FRIEDLIVER_PATH__';

/**
 * Apps started from the macOS Dock or Finder (and some Linux launchers) get a
 * bare PATH like /usr/bin:/bin, so CLIs installed with npm, Homebrew or nvm
 * can't be found. Ask the user's login shell for its PATH, as VS Code does.
 * Windows apps inherit the user's PATH already.
 */
export async function adoptLoginShellPath(): Promise<void> {
  if (process.platform === 'win32') return;
  const shell = process.env.SHELL || (process.platform === 'darwin' ? '/bin/zsh' : '/bin/bash');
  const known = (process.env.PATH ?? '').split(path.delimiter).filter(Boolean);
  let fromShell: string[] = [];
  try {
    const { stdout } = await run(shell, ['-ilc', `printf '${MARK}%s${MARK}' "$PATH"`], { timeout: 5000, env: process.env });
    const match = stdout.match(new RegExp(`${MARK}(.*)${MARK}`, 's'));
    if (match) fromShell = match[1].split(path.delimiter).filter(Boolean);
  } catch {
    // A slow or broken shell profile must not stop the app; fall back to common locations.
  }
  const common = process.platform === 'darwin' ? ['/opt/homebrew/bin', '/usr/local/bin'] : ['/usr/local/bin'];
  process.env.PATH = [...new Set([...fromShell, ...known, ...common])].join(path.delimiter);
}

