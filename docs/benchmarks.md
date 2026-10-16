# Memory benchmarks

How to measure: see the top of `scripts/ram-benchmark.ts`. Every run opens the
same folder, `bench/fixture`, and adds up the memory of the app's whole process
tree (main process, renderers, GPU, helpers, agents).

Numbers only compare fairly on the **same machine**. On Linux the figure is PSS,
which splits shared memory between processes; macOS and Windows report RSS or
working set, which counts shared memory more than once and reads higher.

## 2026-10-16, cloud container (Linux x64, no GPU, software rendering)

Idle, fixture folder open, sampled every 5 s for 30 s.

| App | Average | Peak | Processes |
|---|---|---|---|
| Bare Electron 44 window (Phase 0 baseline) | 292 MB | 292 MB | 6 |
| FriedLiver 0.1.0 (Monaco, chat, commands, images) | 340 MB | 346 MB | 6 |
| VS Code 1.142, fresh profile, no extensions | 761 MB | 848 MB | 12 |
| Demo agent process, while running | 45 MB | | 1 |

Biggest FriedLiver processes: renderer 95 MB, main 92 MB, GPU 91 MB (software
rendering; a real GPU usually costs less here).

These are not your machine's numbers. Before setting targets, run on your own
machine:

```bash
npm run bench:ram -- --app --label friedliver
npm run bench:ram -- --match "Code" --label vscode            # VS Code open on bench/fixture
npm run bench:ram -- --match "Antigravity" --label antigravity
```

The breakdown printed at the end shows which process holds the memory, for
example Antigravity's `language_server` process.
