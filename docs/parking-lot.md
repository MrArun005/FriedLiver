# Parking lot

Ideas that are not in the MVP. They wait here until the Phase 2 gate, so the
MVP list stays fixed.

- Real interactive shell in the bottom panel (node-pty + xterm.js). Today agent commands run with approval and stream output, but there's no shell for you to type in.
- Run sign-in that needs a terminal (`claude /login`, `codex login`) inside FriedLiver instead of the system terminal.
- Checkpoints: snapshot before each agent turn, one-click rewind.
- Session history across restarts (ACP `session/load` where the agent supports it).
- MCP servers shared by all agents.
- Language servers (TypeScript, Python) behind a memory cap.
- Tauri instead of Electron, if the memory numbers justify the Rust learning curve.
- More themes, and importing VS Code themes.
- Packaging and signing for Windows, macOS and Linux (Phase 3).
