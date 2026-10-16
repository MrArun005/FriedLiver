// Commits through FriedLiver's own Git panel, the way a person would: open the
// repository in the app, type the message, press "Commit all".
//
//   npm run build && node scripts/friedliver-commit.mjs <message-file> [screenshot.png]
//
// The message comes from a file so multi-line messages and trailers survive
// shells. On Linux without a display: xvfb-run -a node scripts/friedliver-commit.mjs …
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { _electron as electron } from 'playwright';

const [messageFile, screenshot] = process.argv.slice(2);
if (!messageFile) {
  console.error('Usage: node scripts/friedliver-commit.mjs <message-file> [screenshot.png]');
  process.exit(1);
}
const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const repo = process.env.FRIEDLIVER_REPO ? path.resolve(process.env.FRIEDLIVER_REPO) : root;
const message = (await readFile(messageFile, 'utf8')).trim();
const before = execFileSync('git', ['rev-parse', '--verify', '-q', 'HEAD'], { cwd: repo }).toString().trim();

const args = ['.', '--folder', repo];
if (process.getuid?.() === 0) args.push('--no-sandbox');
const profile = await mkdtemp(path.join(os.tmpdir(), 'friedliver-commit-'));
const app = await electron.launch({ executablePath: require('electron'), args, cwd: root, env: { ...process.env, FRIEDLIVER_USER_DATA: profile } });
const win = await app.firstWindow();
await win.setViewportSize({ width: 1440, height: 900 });
try {
  await win.waitForSelector('.app');
  await win.getByRole('button', { name: /Source control/ }).first().click();
  const files = win.locator('.git-file');
  await files.first().waitFor({ timeout: 15_000 }).catch(() => {
    throw new Error('FriedLiver shows no changes to commit.');
  });
  console.log(`FriedLiver lists ${await files.count()} changed files.`);
  await win.getByLabel('Commit message').fill(message);
  if (screenshot) await win.screenshot({ path: screenshot });
  await win.getByRole('button', { name: /^Commit all/ }).click();
  await win.getByText(/^Committed [0-9a-f]+/).waitFor({ timeout: 30_000 });
} finally {
  await app.close();
}
const after = execFileSync('git', ['log', '-1', '--format=%h %s'], { cwd: repo }).toString().trim();
if (after.startsWith(before.slice(0, 7))) throw new Error('No new commit was made.');
console.log(`Committed through FriedLiver: ${after}`);
