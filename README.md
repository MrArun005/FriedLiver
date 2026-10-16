# FriedLiver

A light IDE with Claude, GPT and Gemini coding agents. Each agent signs in
through its own official CLI, so FriedLiver never sees your login. Every file
an agent wants to write shows up as a diff you accept or reject, and every
command waits for your approval.

Built from scratch on Electron, Monaco and the
[Agent Client Protocol](https://agentclientprotocol.com). Plan and progress:
[docs/PLAN.md](docs/PLAN.md).

## Run it

```bash
npm install
npm start                              # opens a window; pick a folder
npm start -- --folder bench/fixture    # or open a folder straight away
```

No login yet? In the chat panel choose **Demo (offline)** and type:

- `tour`: the agent makes a plan, proposes a file (you review the diff), asks to
  run a command (you approve it) and sends an image to the Images tab.
- `project`: the agent builds a small calculator in `calc/`, runs `npm test`
  (one test fails), fixes the bug, reruns the tests and runs the app.

## Layout

Agents sit on the right by default. Click **⇤ Center** (or press
Ctrl/Cmd+Shift+A) to put the agents in the middle with the editor beside them.
Drag the divider to resize; FriedLiver remembers both layouts.

## Connect the real agents

Install the agent CLI, sign in with the vendor's own tool once, then pick the
agent in FriedLiver.

| Agent | Install | Sign in |
|---|---|---|
| Claude | `npm install -g @zed-industries/claude-agent-acp` | `claude` then `/login`, or set `ANTHROPIC_API_KEY` |
| GPT (Codex) | `npm install -g @zed-industries/codex-acp` | `codex login`, or set `OPENAI_API_KEY` |
| Gemini | `npm install -g @google/gemini-cli` | run `gemini` and choose Login with Google, or set `GEMINI_API_KEY` |

If an agent isn't installed or isn't signed in, the chat tells you what to run.
Why login works this way: [docs/adr/0001-agent-login.md](docs/adr/0001-agent-login.md).

Talk to an agent without the UI (handy when something doesn't work):

```bash
npm run acp:hello -- gemini "Say hi in five words"
npm run acp:hello -- demo "hello"
```

## Memory

Agents start when a chat needs them, only one runs at a time, and they stop
after 10 idle minutes. The status bar shows FriedLiver's memory and each
agent's separately.

```bash
npm run bench:ram -- --app                       # FriedLiver on bench/fixture
npm run bench:ram -- --match "Antigravity"       # anything else that's running
```

Results so far: [docs/benchmarks.md](docs/benchmarks.md).

## Themes

Black Blue (default), Midnight Blue, Graphite and Daylight Blue, picked from the
status bar. One palette in `src/renderer/themes.ts` drives both the app and the
editor, so they always match.

## Develop

```bash
npm run typecheck && npm run lint && npm test
xvfb-run -a node scripts/ui-tour.mjs shots/   # drives the real app, saves screenshots
```

| Path | What |
|---|---|
| `src/main/agents/` | ACP client: agent processes, sessions, approvals, commands |
| `src/main/controller.ts` | Owns the open folder; every agent write and command goes through it |
| `src/shared/ipc.ts` | The whole main ↔ window contract |
| `src/renderer/` | Preact UI: file tree, Monaco, chat, commands, images, themes |
| `test/fixtures/fakeAgent.mjs` | Offline ACP agent used by tests and the demo |
| `bench/fixture/` | Fixed project every benchmark opens |
