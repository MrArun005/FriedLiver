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
| FriedLiver 0.2.0 (adds terminal, tabs, git, tasks, settings) | 314 MB | 321 MB | 6 |
| Demo agent process, while running | 44 MB | | 1 |
| Gemini CLI 0.64 in ACP mode, while running | 322 MB | | 1 |

Biggest FriedLiver 0.2 processes: renderer 98 MB, main 89 MB, GPU 67 MB
(software rendering; a real GPU usually costs less here). A real agent CLI
costs as much as the editor itself (Gemini: 322 MB), which is why agents stop
when idle and only two run at once by default.

These are not your machine's numbers. Before setting targets, run on your own
machine:

```bash
npm run bench:ram -- --app --label friedliver
npm run bench:ram -- --match "Code" --label vscode            # VS Code open on bench/fixture
npm run bench:ram -- --match "Antigravity" --label antigravity
```

The breakdown printed at the end shows which process holds the memory, for
example Antigravity's `language_server` process.

## 2026-10-16: the VS Code fork against VS Code and the FriedLiver app

Same cloud container. Each app opens `bench/fixture` with `src/format.ts` in the
editor, so the language features run. Then memory is sampled for 30 s.
"First start" uses a new profile, and "Start" is the next launches. Each app
ran at least twice, and the runs agreed within about 10 %. Script:
`scripts/compare-editors.mjs`.

| | FriedLiver fork 1.142 | VS Code 1.105 | FriedLiver 0.2 app |
|---|---|---|---|
| First start, until the files are listed | 4.1 s | 3.7 s | 1.7 s |
| Start | 3.0–3.2 s | 2.8–2.9 s | 1.6 s |
| Memory after it settles | 840 MB | 1005 MB | 373 MB |
| Memory, average / peak | 994 / 1150 MB | 1050 / 1100 MB | 382 / 390 MB |
| Processes | 13 | 13 | 6 |
| Installed size, Linux | 611 MB | 444 MB | |
| Windows installer | about 120–180 MB (see note) | 232 MB (1.142 user setup) | 108 MB |
| macOS download | 270 MB `.dmg` (before the trim) | 302 MB (1.142 `.zip`) | |
| Linux `.deb` | 177 MB (before the trim) | 229 MB (1.142) | |

- The fork settles about 165 MB below stock VS Code. Copilot and the built-in
  AI features are removed, and the agent host never starts. It is still more
  than twice the size of the FriedLiver app, as a full VS Code workbench is.
- First starts on a cold machine are slower for all three. The very first
  launch of any app in a fresh container took 20–40 s while the operating
  system filled its file cache. Those runs are left out.
- Installed size: the first packaged fork was 1.1 GB, because 300 MB of source
  maps and the 150 MB Copilot SDK runtime were still in it. `build.mjs` now
  removes both, which brings it to 611 MB. The installers above were built
  before that change, so they will shrink by part of that 447 MB (source maps
  compress well).
- VS Code here is 1.105 from its own download. Its installer sizes are for
  1.142 from Microsoft's download server.
- Agents run as separate processes and cost the same in every app: Codex about
  33 MB, Gemini about 320 MB.

### Extensions in the fork

The fork installs from Open VSX. Prettier 12.4, ESLint 3.0 and GitLens
installed with the fork's CLI and activated in the packaged app. GitLens's
Commit Graph, Prettier's status item and the FriedLiver Agents panel ran
side by side. Before patch 0040, every gallery install failed in a packaged
build with "Signature verification was not executed". Dev builds skip that
check.

| On Open VSX | Microsoft-only (not on Open VSX) | Open replacement on Open VSX |
|---|---|---|
| Prettier, ESLint, GitLens, Python, Jupyter, Java (Red Hat), Go, rust-analyzer, Tailwind CSS, Vue | Pylance | basedpyright |
| | C/C++ | clangd |
| | C# | `muhammad-sammy.csharp` |
| | Remote - SSH | Open Remote - SSH |
| | GitHub Copilot | FriedLiver Agents (Claude, Codex, Gemini) |
