// Same test for three apps: startup (cold first launch, then two warm launches) and memory
// with bench/fixture open and a TypeScript file in the editor.
//   xvfb-run -a node scripts/compare-editors.mjs <name> <code|electron> <executable> <workdir>
//   (electron = this repo's app via require("electron"); code = VS Code or the FriedLiver fork. Keep <workdir>
//   short: the editors put a Unix socket in it, and socket paths are limited to about 108 characters.)
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(ROOT, 'package.json'));
const { _electron: electron } = require('playwright');

const [name, kind, exe, dir] = process.argv.slice(2);
const FIXTURE = path.join(ROOT, 'bench', 'fixture');
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(dir, { recursive: true });

function launch() {
  if (kind === 'electron') {
    return electron.launch({ executablePath: exe, args: ['.', '--folder', FIXTURE, '--no-sandbox'], cwd: ROOT, env: { ...process.env, FRIEDLIVER_USER_DATA: `${dir}/ud` } });
  }
  return electron.launch({ executablePath: exe, args: [FIXTURE, '--no-sandbox', `--user-data-dir=${dir}/ud`, `--extensions-dir=${dir}/ext`, '--disable-workspace-trust', '--skip-welcome', '--skip-release-notes', '--disable-gpu'] });
}
// Ready = the folder's files are listed and clickable.
const READY = kind === 'electron' ? '.tree .row' : '.explorer-folders-view .monaco-list-row';

const startups = [];
let memory = null;
for (let run = 0; run < 3; run++) {
  const t0 = Date.now();
  const app = await launch();
  const win = await app.firstWindow();
  await win.waitForSelector(READY, { timeout: 120000 });
  startups.push(Date.now() - t0);
  if (run === 0) {
    // Open src/format.ts, let the language features start, then measure the whole process tree.
    if (kind === 'electron') {
      await win.locator('.tree .row', { hasText: 'src' }).first().click();
      await win.locator('.tree .row', { hasText: 'format.ts' }).first().click();
    } else {
      // Click through the Explorer: keyboard shortcuts depend on which view has focus.
      await win.locator('.explorer-folders-view .monaco-list-row', { hasText: 'src' }).first().click();
      await win.locator('.explorer-folders-view .monaco-list-row', { hasText: 'format.ts' }).first().click();
    }
    await win.waitForSelector('.monaco-editor .view-lines', { timeout: 60000 });
    await win.waitForTimeout(15000);
    const out = execFileSync('node', [path.join(ROOT, 'dist', 'ram-benchmark.js'), '--pid', String(app.process().pid), '--seconds', '30', '--interval', '5', '--label', `bench-${name}`], { cwd: ROOT, encoding: 'utf8' });
    const m = /average (\d+) MB, peak (\d+) MB PSS across (\d+) processes/.exec(out);
    const samples = [...out.matchAll(/^\s+\d+s\s+(\d+) MB/gm)].map((x) => Number(x[1]));
    memory = { average: Number(m[1]), peak: Number(m[2]), settled: samples.at(-1), processes: Number(m[3]) };
  }
  await app.close();
}
console.log(JSON.stringify({ name, coldMs: startups[0], warmMs: Math.round((startups[1] + startups[2]) / 2), memory }));
