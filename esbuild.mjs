import { copyFile, mkdir } from 'node:fs/promises';
import * as esbuild from 'esbuild';

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

const shared = {
  bundle: true,
  minify: production,
  sourcemap: !production,
  logLevel: 'warning',
};

const node = { ...shared, platform: 'node', format: 'cjs', target: 'node22', external: ['electron'] };

const builds = [
  { ...node, entryPoints: ['src/main/main.ts'], outfile: 'dist/main.js' },
  { ...node, entryPoints: ['src/preload/preload.ts'], outfile: 'dist/preload.js' },
  // The offline demo agent, bundled so it runs without node_modules.
  { ...node, entryPoints: ['test/fixtures/fakeAgent.mjs'], outfile: 'dist/demo-agent.js' },
  {
    ...shared,
    entryPoints: ['src/renderer/main.tsx'],
    outfile: 'dist/renderer/renderer.js',
    platform: 'browser',
    format: 'iife',
    target: 'chrome130',
    jsx: 'automatic',
    jsxImportSource: 'preact',
    loader: { '.ttf': 'file' },
  },
  // Monaco's one worker: diffing and word ranges off the UI thread.
  {
    ...shared,
    entryPoints: { 'editor.worker': 'monaco-editor/editor/editor.worker.js' },
    outdir: 'dist/renderer',
    platform: 'browser',
    format: 'iife',
    target: 'chrome130',
  },
  // Command-line tools: the ACP hello-world client and the RAM benchmark.
  { ...node, entryPoints: ['scripts/acp-hello.ts'], outfile: 'dist/acp-hello.js' },
  { ...node, entryPoints: ['scripts/ram-benchmark.ts'], outfile: 'dist/ram-benchmark.js' },
];

async function copyStatic() {
  await mkdir('dist/renderer', { recursive: true });
  await copyFile('src/renderer/index.html', 'dist/renderer/index.html');
}

if (watch) {
  const contexts = await Promise.all(builds.map((b) => esbuild.context(b)));
  await Promise.all(contexts.map((c) => c.watch()));
  await copyStatic();
} else {
  await Promise.all(builds.map((b) => esbuild.build(b)));
  await copyStatic();
}
