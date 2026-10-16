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
| Settings | Ctrl/Cmd+,: accounts and sign-in, theme, fonts, agents running at once, idle timeout, agent commands, API keys (encrypted with your OS keychain) |
| Fonts | Inter and JetBrains Mono ship with the app, so Windows and macOS look the same; code size and ligatures are settings |
| Themes | Black Blue (default), Midnight Blue, Graphite, Daylight Blue. One palette drives the app, the editor and the terminal ([design system](docs/design-system.md)) |
| Commands | Ctrl/Cmd+Shift+P for everything above |

## Sign in to the real agents

Install the agent's CLI once, then open **Settings → Accounts**, press
**Check**, and use the sign-in button. Each one is the company's own login;
FriedLiver never sees your credentials.

| Agent | Install | Sign-in button | What happens |
|---|---|---|---|
| Claude | `npm install -g @zed-industries/claude-agent-acp` | Log in with Claude | Claude Code's own login opens in a FriedLiver terminal: type `/login`, approve on claude.ai, then `/exit` |
| GPT (Codex) | `npm install -g @zed-industries/codex-acp` | Login with ChatGPT | Your browser opens OpenAI's sign-in page (`auth.openai.com`); FriedLiver continues when you approve |
| Gemini | `npm install -g @google/gemini-cli` | Log in with Google | Your browser opens Google's sign-in page (`accounts.google.com`); same as above |

API keys in Settings still work as an alternative. If an agent isn't installed,
**Install** types the command into a terminal for you. Why it works this way:
[docs/adr/0001-agent-login.md](docs/adr/0001-agent-login.md).

Talk to an agent without the UI, handy when something doesn't work:

```bash
npm run acp:hello -- gemini "Say hi in five words"
```

## Windows and macOS

- Agents installed with npm are found even when FriedLiver starts from the
  Dock or Finder: it reads your login shell's PATH at startup.
- The terminal uses PowerShell 7 when installed (else Windows PowerShell) on
  Windows, and your login shell on macOS.
- macOS gets a native menu with working Cmd+Z/Shift+Z in the editor; Cmd+W
  closes the editor tab and Cmd+Shift+W the window. Windows has no menu bar;
  everything is in the command palette.

## Build installers

```bash
npm run dist        # this OS: .dmg/.zip on macOS, .exe on Windows, AppImage/.deb on Linux
npm run dist:dir    # unpacked app in release/, quickest to try
```

Builds aren't code-signed yet, so macOS and Windows warn on first launch.
CI builds all three on every push.

## FriedLiver in VS Code

FriedLiver is also becoming a VS Code fork, so every Open VSX extension works
in it. The fork's build tooling, branding and built-in extensions live in
`code/`. Until its installers are ready, the two built-in extensions install
into VS Code 1.104 or newer, and into editors built on it, such as
Antigravity:

1. Download the **friedliver-vscode-extensions** artifact from the latest CI
   run, which contains `friedliver-agents.vsix` and `friedliver-theme.vsix`.
2. In the Extensions view, choose **⋯ → Install from VSIX…** for each file,
   then reload the window.
3. Open a folder, then click the **FriedLiver Agents** icon in the activity
   bar. Drag the icon to the right-hand side bar if you want the chat there.
4. Pick **Demo** and type `tour`. Edits open in the diff editor:
   Accept is Ctrl/Cmd+Alt+Y and Reject is Ctrl/Cmd+Alt+N. The
   "decisions waiting" item in the status bar jumps to whatever waits on you.

Sign in to Claude, GPT or Gemini from the **Accounts** section of the same
panel, after installing their CLIs as described above. The command palette has
the rest under "FriedLiver": Agent Manager (Tasks), Move Agents to the
Center, Set API Key, Stop All Agents. The theme extension adds FriedLiver
Black Blue (the default), Light Blue, Midnight Blue and Graphite.

## Develop

Commits are made through FriedLiver itself: the script below opens the repo
in the app, types the message into the Git panel and presses Commit all.

```bash
npm run build && node scripts/friedliver-commit.mjs message.txt
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
| `code/extensions/friedliver-agents/` | The agents as a VS Code extension, reusing `src/main/agents/` |
| `code/extensions/friedliver-theme/` | VS Code color themes generated from `palette.json` |
| `docs/fork/` | Fork defaults and the memory plan |
