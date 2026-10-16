# FriedLiver plan: a multi-agent IDE, built from scratch

**Status (2026-10-16):** Phase 0 done. Phase 1 steps 1, 3, 4, 5 and 6 work with the
demo agent; step 2 (real shell) and step 7 (Claude and Codex signed in) are next.
See "Progress" at the bottom.

No VS Code fork and no extension: FriedLiver owns every layer.

## 1. Goals

- One window with an editor, a terminal, and a right sidebar.
- Three agents to choose from (Claude, GPT, Gemini), one per chat.
- Each agent signs in through its own official CLI. The IDE never sees a login token.
- Agents can read and edit files and run commands. The IDE controls every file write and command.
- Images panel on the right for attachments and screenshots.
- Low memory use. Targets are set after measuring in Phase 0, not before.

## 2. Stack

| Part | Choice | Why |
|---|---|---|
| Shell | Electron for Phase 1 | Easy to start. Decide on Tauri after measuring. |
| Editor | Monaco | The editor core VS Code uses: text, diffs, highlighting. |
| Terminal | xterm.js + node-pty | Real shells, real colours, real job control. |
| UI | Preact | Small bundle. |
| Agent link | `@agentclientprotocol/sdk` | Official ACP library. |
| Build | esbuild | Fast enough for a solo project. |
| Tests | Vitest + Playwright | Unit tests first, UI tests once the layout settles. |
| CI | GitHub Actions | Runs tests and the memory benchmark. |

## 3. Architecture

- **Main process (Node):** starts and stops agent CLIs, owns the file system and the
  shell, holds one ACP connection per agent. (`src/main`)
- **Renderer:** Monaco, chat, commands, images. Talks to main through a narrow IPC
  API. (`src/renderer`, contract in `src/shared/ipc.ts`)

The main process is the ACP client. It advertises file read/write and terminal
support, so agents ask FriedLiver before writing or running anything.

## 4. Login

Each vendor's CLI handles sign-in and talks to its own servers. Every provider
also accepts an API key. Terms and links: `docs/adr/0001-agent-login.md`.

## 5. Scope

**MVP (Phase 1):**
- Open a folder, edit files in Monaco, save.
- Terminal panel with a real shell.
- Chat panel for one agent.
- Agent edits arrive as diffs. You accept or reject each hunk.
- Command requests show up in the terminal. You approve or deny each one.
- Images panel: attachments and screenshots the agent produces.

**Not in MVP:** checkpoints, MCP, plugins, language servers. See `docs/parking-lot.md`.

## 6. Phases

**Phase 0 (setup):** repo skeleton, TypeScript, lint, tests, CI, fixed test folder
(`bench/fixture`), benchmark script, baseline numbers, login design record.

**Phase 1 (MVP), each step with a demo:**
1. Window, folder tree, Monaco editor, save.
2. Terminal with node-pty and xterm.js.
3. ACP client talking to one agent, streamed text in the chat panel.
4. Agent file writes as diffs with accept and reject.
5. Command approval flow.
6. Images panel.
7. Second and third agents.

**Gate before Phase 2:** one agent finishes a real task on your machine; one week
of daily use with no crashes; memory targets set from Phase 0 numbers.

**Phase 2:** session history, checkpoints, idle stop, first-run check for agent CLIs.

**Phase 3:** packaging for Windows, macOS and Linux.

## 7. Memory

- Measure, don't guess: `npm run bench:ram`, results in `docs/benchmarks.md`.
- Agents start when needed and stop after 10 idle minutes. One agent runs at a time.
- Monaco's TypeScript/JSON/CSS language workers are left out; syntax highlighting only.
- Every agent CLI is a Node process (roughly 150–400 MB while running), so idle stop is the main lever.

## 8. Risks

| Risk | Response |
|---|---|
| Login rules change again | The IDE never touches tokens. API keys remain the fallback. |
| ACP adapters change or break | Pin versions. Test against a fake agent in CI. |
| Scope creep | MVP list is fixed. New ideas go in `docs/parking-lot.md`. |
| Monaco and xterm.js add memory | Measure after each step. |
| Learning Electron and ACP at once | `npm run acp:hello` talks to an agent with no UI at all. |

## Progress

| Step | State |
|---|---|
| Phase 0 | Done. Baseline: bare Electron 292 MB, VS Code 761 MB (container, PSS). |
| 1. Window, tree, Monaco, save | Done. |
| 2. Real shell (node-pty + xterm.js) | Not started. Agent commands already run with approval and live output. |
| 3. ACP client + chat | Done. Demo agent end to end; Gemini CLI connects and offers sign-in. |
| 4. Diffs with accept/reject | Done. Whole-file accept or reject; undo single hunks with Monaco's revert arrows. |
| 5. Command approval | Done. |
| 6. Images panel | Done. |
| 7. Claude and Codex | Wired in; needs your sign-in to verify. |
| Themes | Black Blue (default), Midnight Blue, Graphite, Daylight Blue. |

## Answered

1. Name: FriedLiver.
2. Operating system: still open.
3. First agent: Gemini for testing (it was the one checked here); Claude is wired in too.
4. API keys: none in CI; the offline demo agent covers tests.
