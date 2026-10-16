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

## Verified so far

- Gemini CLI 0.64.0 starts in ACP mode, completes `initialize`, and on
  `session/new` without credentials returns auth-required with its methods
  (Log in with Google, Gemini API key, Vertex AI, AI API Gateway). FriedLiver
  shows those as buttons.
- `claude-agent-acp` 0.23.1 starts and answers a prompt over ACP.
- Codex has not been tried yet.
