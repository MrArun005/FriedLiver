// Measures the memory of a whole app: the main process and everything it started.
//
//   npm run bench:ram -- --app                      launch FriedLiver on bench/fixture and measure it
//   npm run bench:ram -- --match "Code"             measure a running app (VS Code)
//   npm run bench:ram -- --match "Antigravity"      ...or Antigravity
//   npm run bench:ram -- --pid 12345                measure one process tree
//
// Options: --seconds 60 (how long to sample), --interval 5, --label <name>,
// --warmup 10 (seconds to wait after --app launch before sampling).
// Results print as a table and are saved to bench-results/<label>-<time>.json.
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { parseArgs } from 'node:util';
import { killProcessTree } from '../src/main/agents/processes';
import { MEMORY_KIND, collectTree, fillMemory, formatMb, listProcesses, type ProcEntry } from '../src/main/ram/processTree';

const { values } = parseArgs({
  options: {
    app: { type: 'boolean', default: false },
    match: { type: 'string' },
    pid: { type: 'string' },
    seconds: { type: 'string', default: '60' },
    interval: { type: 'string', default: '5' },
    warmup: { type: 'string', default: '10' },
    label: { type: 'string' },
  },
});

const seconds = Number(values.seconds);
let finished = false;
const interval = Number(values.interval);

/** Top-level processes whose name contains `match` and whose parent doesn't. */
function findRoots(procs: ProcEntry[], match: string): number[] {
  const needle = match.toLowerCase();
  const matches = new Set(procs.filter((p) => path.basename(p.name).toLowerCase().includes(needle)).map((p) => p.pid));
  return procs.filter((p) => matches.has(p.pid) && !matches.has(p.ppid)).map((p) => p.pid);
}

async function sample(rootsFor: (procs: ProcEntry[]) => number[]): Promise<{ bytes: number; tree: ProcEntry[] }> {
  const procs = await listProcesses();
  const seen = new Map<number, ProcEntry>();
  for (const root of rootsFor(procs)) for (const p of collectTree(root, procs)) seen.set(p.pid, p);
  const tree = [...seen.values()];
  await fillMemory(tree);
  return { bytes: tree.reduce((sum, p) => sum + (p.memBytes ?? 0), 0), tree };
}

/** Process command lines tell Electron's identical-looking helpers apart (renderer, gpu, utility). */
async function describe(p: ProcEntry): Promise<string> {
  if (process.platform !== 'linux') return p.name;
  try {
    // Chromium rewrites its process title, so arguments may be space- or NUL-separated.
    const cmd = (await readFile(`/proc/${p.pid}/cmdline`, 'utf8')).split(/[\0 ]/);
    const type = cmd.find((a) => a.startsWith('--type='))?.slice(7);
    const sub = cmd.find((a) => a.startsWith('--utility-sub-type='))?.slice(19);
    return type ? `${p.name} [${sub ?? type}]` : p.name;
  } catch {
    return p.name;
  }
}

function launchApp(): ChildProcess {
  // `require('electron')` from Node gives the path to the Electron binary.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const electron = require('electron') as unknown as string;
  // Chromium's sandbox refuses to run as root (CI containers); everywhere else keep it on.
  const root = path.resolve(__dirname, '..');
  const args = ['.', '--folder', path.join(root, 'bench', 'fixture')];
  // Chromium's sandbox can't start as root, or on CI images that restrict user namespaces.
  if (process.getuid?.() === 0 || process.env.CI) args.push('--no-sandbox');
  const child = spawn(electron, args, { cwd: root, stdio: ['ignore', 'ignore', 'pipe'], detached: process.platform !== 'win32' });
  const stderr: string[] = [];
  child.stderr?.setEncoding('utf8').on('data', (d: string) => stderr.push(d));
  child.once('exit', (code, signal) => {
    if (!finished) console.error(`FriedLiver exited early (code ${code}, signal ${signal}):\n${stderr.join('').slice(-2000)}`);
  });
  return child;
}

async function main(): Promise<void> {
  let label = values.label;
  let rootsFor: (procs: ProcEntry[]) => number[];
  let launched: ChildProcess | undefined;

  if (values.app) {
    launched = launchApp();
    const pid = launched.pid!;
    rootsFor = () => [pid];
    label ??= 'friedliver';
    console.log(`Launched FriedLiver (pid ${pid}); waiting ${values.warmup}s before sampling…`);
    await sleep(Number(values.warmup) * 1000);
  } else if (values.pid) {
    const pid = Number(values.pid);
    rootsFor = () => [pid];
    label ??= `pid-${pid}`;
  } else if (values.match) {
    const match = values.match;
    rootsFor = (procs) => findRoots(procs, match);
    label ??= match.toLowerCase().replace(/\W+/g, '-');
  } else {
    console.error('Pass --app, --match <name> or --pid <pid>. See the top of scripts/ram-benchmark.ts.');
    process.exit(1);
  }

  const { samples, breakdown } = await (async () => {
    const samples: { t: number; bytes: number; count: number }[] = [];
    let lastTree: ProcEntry[] = [];
    const start = Date.now();
    try {
      while (Date.now() - start <= seconds * 1000) {
        const { bytes, tree } = await sample(rootsFor);
        if (tree.length === 0) throw new Error('No matching processes are running.');
        lastTree = tree;
        samples.push({ t: Math.round((Date.now() - start) / 1000), bytes, count: tree.length });
        console.log(`${String(samples.at(-1)!.t).padStart(4)}s  ${formatMb(bytes).padStart(8)}  (${tree.length} processes)`);
        await sleep(interval * 1000);
      }
      // Describe processes while they still exist: a launched app is killed below.
      const breakdown = await Promise.all(
        [...lastTree]
          .sort((a, b) => (b.memBytes ?? 0) - (a.memBytes ?? 0))
          .map(async (p) => ({ pid: p.pid, name: await describe(p), mb: Math.round((p.memBytes ?? 0) / 2 ** 20) })),
      );
      return { samples, breakdown };
    } finally {
      finished = true;
      if (launched?.pid) killProcessTree(launched.pid);
    }
  })();

  console.log('\nBiggest processes in the last sample:');
  for (const p of breakdown.slice(0, 12)) console.log(`  ${String(p.mb).padStart(6)} MB  ${p.name} (pid ${p.pid})`);

  const mb = samples.map((s) => s.bytes);
  const avg = mb.reduce((a, b) => a + b, 0) / mb.length;
  const result = {
    label,
    memoryKind: MEMORY_KIND,
    platform: `${os.platform()} ${os.release()} ${os.arch()}`,
    totalMemory: formatMb(os.totalmem()),
    date: new Date().toISOString(),
    averageMb: Math.round(avg / 2 ** 20),
    peakMb: Math.round(Math.max(...mb) / 2 ** 20),
    lastMb: Math.round(mb.at(-1)! / 2 ** 20),
    processes: samples.at(-1)!.count,
    breakdown,
    samples,
  };
  console.log(`\n${label}: average ${result.averageMb} MB, peak ${result.peakMb} MB ${MEMORY_KIND} across ${result.processes} processes`);

  await mkdir('bench-results', { recursive: true });
  const file = path.join('bench-results', `${label}-${result.date.replace(/[:.]/g, '-')}.json`);
  await writeFile(file, JSON.stringify(result, null, 2));
  console.log(`Saved ${file}`);
}

void main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
