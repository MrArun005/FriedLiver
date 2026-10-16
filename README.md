# FriedLiver

A light IDE with Claude, GPT and Gemini coding agents. Each agent signs in
through its own official CLI, so FriedLiver never sees your login. Every file
an agent wants to write shows up as a diff you accept or reject, and every
command waits for your approval.

Built from scratch on Electron, Monaco, xterm.js and the
[Agent Client Protocol](https://agentclientprotocol.com). About 314 MB idle
against 761 MB for VS Code on the same machine
([benchmarks](docs/benchmarks.md)).

## Run it

```bash
npm install
npm start                              # opens a window; pick a folder
npm start -- --folder bench/fixture    # or open a folder straight away
```

No login yet? Choose **Demo (offline)** in the chat panel and type:

- `tour`: a plan, a file you review as a diff, a command you approve, an image.
- `project`: builds a small calculator in `calc/`, runs `npm test` (one test
  fails), fixes the bug, reruns the tests and runs the app.

## What's in it

| Area | What you get |
|---|---|
| Editor | Monaco with tabs, unsaved markers, Ctrl/Cmd+S, quick open (Ctrl/Cmd+P), search in files (Ctrl/Cmd+Shift+F) |
| Terminal | Real shells (node-pty + xterm.js), several at once, colored by the theme (Ctrl/Cmd+`) |
| Agents | Claude, Codex, Gemini, Demo. Several chats, two agents at once by default, idle agents stop after 10 minutes |
| Safety | Every agent write is a diff review (undo single hunks with the arrows); every command waits for Run or Deny |
| Checkpoints | "Undo this turn" puts back every file the agent's last turn changed |
| Tasks | The Agent Manager: every chat as a task with its status (working, needs you, done). A task can run in its own git worktree, then be merged back |
| Git | Changes against HEAD, diffs, commit all, branch in the status bar, change marks in the file tree |
| Layout | Agents on the side or in the center (Ctrl/Cmd+Shift+A), resizable; sidebar (Ctrl/Cmd+B) and panel toggle |
| Images | Attachments, screenshots and image files the agent reads, in their own tab |
| Settings | Ctrl/Cmd+,: theme, agents running at once, idle timeout, agent commands, API keys (encrypted with your OS keychain) |
| Themes | Black Blue (default), Midnight Blue, Graphite, Daylight Blue. One palette drives the app, the editor and the terminal ([design system](docs/design-system.md)) |
| Commands | Ctrl/Cmd+Shift+P for everything above |

## Connect the real agents

Install the agent CLI, sign in once with the vendor's own tool, then pick
the agent in FriedLiver.

| Agent | Install | Sign in |
|---|---|---|
| Claude | `npm install -g @zed-industries/claude-agent-acp` | `claude`, then `/login`, or an API key in Settings |
| GPT (Codex) | `npm install -g @zed-industries/codex-acp` | `codex login`, or an API key in Settings |
| Gemini | `npm install -g @google/gemini-cli` | run `gemini` and choose Login with Google, or an API key in Settings |

If an agent isn't installed or isn't signed in, the chat says what to do and
can paste the install command into the terminal. Why login works this way:
[docs/adr/0001-agent-login.md](docs/adr/0001-agent-login.md).

Talk to an agent without the UI, handy when something doesn't work:

```bash
npm run acp:hello -- gemini "Say hi in five words"
```

## Build installers

```bash
npm run dist        # this OS: .dmg/.zip on macOS, .exe on Windows, AppImage/.deb on Linux
npm run dist:dir    # unpacked app in release/, quickest to try
```

Builds aren't code-signed yet, so macOS and Windows warn on first launch.
CI builds all three on every push.

## Develop

```bash
npm run typecheck && npm run lint && npm test
xvfb-run -a node scripts/ui-tour.mjs shots/   # drives the real app through every feature, saves screenshots
npm run bench:ram -- --app                     # memory of the whole process tree
```

| Path | What |
|---|---|
| `src/main/agents/` | ACP client: agent processes, sessions, approvals, commands, checkpoints |
| `src/main/controller.ts` | Owns the folder; every agent write and command goes through it |
| `src/main/terminal/`, `workspace/` | Shells, search, git and worktrees |
| `src/main/settings.ts` | Settings and encrypted API keys |
| `src/shared/ipc.ts` | The whole main ↔ window contract |
| `src/renderer/` | Preact UI; tokens and components in `styles.css`, palettes in `palettes.ts` |
| `test/fixtures/fakeAgent.mjs` | Offline ACP agent for the demo and the tests |
| `bench/fixture/` | Fixed project every benchmark opens |
