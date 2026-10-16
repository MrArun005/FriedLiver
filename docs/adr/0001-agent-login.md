# ADR 0001: Agents sign in through their own CLIs, over ACP

Status: accepted, 2026-10-16

## Decision

FriedLiver never handles a login token. For each provider it starts that
company's official agent CLI as a child process and talks to it over the
Agent Client Protocol (ACP, JSON-RPC over stdin/stdout). The CLI signs the
user in and talks to its own servers. Every provider also works with an API
key, set in the environment before FriedLiver starts.

| Provider | Process FriedLiver starts | Sign-in |
|---|---|---|
| Claude | `claude-agent-acp` (`@zed-industries/claude-agent-acp`) | Claude Code's `/login`, or `ANTHROPIC_API_KEY` |
| GPT | `codex-acp` (`@zed-industries/codex-acp`) | `codex login` (Sign in with ChatGPT), or `OPENAI_API_KEY` |
| Gemini | `gemini --acp` (`@google/gemini-cli`) | the CLI's Google login, or `GEMINI_API_KEY` |

FriedLiver is the ACP *client* and advertises `fs.readTextFile`,
`fs.writeTextFile` and `terminal`, so agents ask FriedLiver to write files and
run commands instead of doing it themselves. That is what lets every write go
through a diff review and every command through an approval.

## Why

Vendors have changed their rules for third-party tools several times in 2026,
and reusing consumer login tokens in other apps has led to blocked accounts.
Running the vendor's own CLI keeps the account relationship between the user
and the vendor.

## Terms checked (read again before relying on subscriptions)

- Anthropic: consumer OAuth tokens limited to Claude Code and Claude.ai
  (enforced Jan 2026, terms updated Feb 2026). Zed's June 16, 2026 update says
  ACP use of Claude Code continues to draw on Claude subscriptions, and
  Anthropic promised advance notice of changes.
  <https://zed.dev/blog/anthropic-subscription-changes>,
  <https://zed.dev/docs/ai/use-an-existing-subscription>
- OpenAI: Codex supports Sign in with ChatGPT and API keys; API keys are
  recommended for automation. <https://developers.openai.com/codex/auth>
- Google: Antigravity's terms bar third-party tools from using the Antigravity
  login; FriedLiver uses Gemini CLI's own login instead.

## Sign-in flows (checked 2026-10-16)

Each adapter advertises its own methods over ACP. FriedLiver shows the
non-key ones as buttons:

| Agent | Method | Kind | What FriedLiver does | Verified |
|---|---|---|---|---|
| Claude (`claude-agent-acp` 0.23.1) | `claude-login` "Log in with Claude" | terminal, args `--cli` | Runs `claude-agent-acp --cli` in a FriedLiver terminal: Claude Code's own `/login` | Method read from the adapter source; the terminal flow tested end to end with a stand-in CLI |
| Codex (`codex-acp` 0.16.0) | `chatgpt` "Login with ChatGPT" | agent | Calls `authenticate`; Codex opens `https://auth.openai.com/oauth/authorize?...redirect_uri=http://localhost:1455/auth/callback` and waits | The authorize URL was captured from a real run |
| Gemini (`@google/gemini-cli` 0.64.0) | `oauth-personal` "Log in with Google" | agent | Calls `authenticate`; Gemini opens `https://accounts.google.com/o/oauth2/v2/auth?...redirect_uri=http://127.0.0.1:<port>/oauth2callback` and waits | The authorize URL was captured from a real run |

Key methods (`gemini-api-key`, Codex's `OPENAI_API_KEY`/`CODEX_API_KEY`
env vars) point to Settings → API keys. Gemini skips the browser when it
thinks it's headless (`CI`, `DEBIAN_FRONTEND=noninteractive`, no display on
Linux); desktops aren't. If an agent prints a sign-in link, FriedLiver offers
to open it again, but only for https links on the vendors' own sign-in hosts.

## Verified so far

- Gemini CLI 0.64.0 starts in ACP mode, completes `initialize`, and on
  `session/new` without credentials returns auth-required with its methods
  (Log in with Google, Gemini API key, Vertex AI, AI API Gateway). FriedLiver
  shows those as buttons.
- `claude-agent-acp` 0.23.1 starts and answers a prompt over ACP.
- Codex has not been tried yet.
