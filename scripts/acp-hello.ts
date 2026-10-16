// Hello-world ACP client: talks to one agent from the command line, before any UI exists.
//
//   npm run acp:hello -- gemini "Say hi in five words"
//   npm run acp:hello -- demo "hello"
//
// Agents: claude, codex, gemini, or demo (the offline test agent, no login needed).
import path from 'node:path';
import { createInterface } from 'node:readline/promises';
import type * as acp from '@agentclientprotocol/sdk';
import { AgentStartError } from '../src/main/agents/agentConnection';
import { readIfExists, readTextFile, writeTextFile } from '../src/main/agents/fileAccess';
import { AgentHub, AuthRequiredError } from '../src/main/agents/hub';
import { DEFAULT_AGENTS, demoAgentSpec, isAgentId, type AgentId } from '../src/main/agents/registry';

const [agentArg, ...promptWords] = process.argv.slice(2);
const prompt = promptWords.join(' ');
if (!agentArg || !prompt || !isAgentId(agentArg)) {
  console.error('Usage: npm run acp:hello -- <claude|codex|gemini|demo> "<prompt>"');
  process.exit(1);
}

const agentId: AgentId = agentArg;
const spec = agentId === 'demo' ? demoAgentSpec(path.join(__dirname, 'demo-agent.js')) : DEFAULT_AGENTS[agentId];

const rl = createInterface({ input: process.stdin, output: process.stdout });
const ask = async (question: string): Promise<string> => (process.stdin.isTTY ? (await rl.question(question)).trim() : '');
const print = (text: string) => process.stdout.write(text);

const hub = new AgentHub({
  cwd: process.cwd(),
  clientVersion: '0.1.0',
  resolveSpec: () => spec,
  idleStopMs: 0,
  maxRunning: 1,
  log: process.env.FRIEDLIVER_DEBUG ? (line) => console.error(`  ${line}`) : undefined,
  events: {
    update: (_chatId, update) => printUpdate(update),
    notice: (_chatId, text) => print(`\n[note] ${text}\n`),
    agentsChanged: () => {},
    permission: async (_chatId, req) => {
      print(`\n[permission] ${req.toolCall.title ?? 'Tool call'}\n`);
      req.options.forEach((o, i) => print(`  ${i + 1}. ${o.name}\n`));
      const choice = req.options[Number(await ask('Choose: ')) - 1];
      // No terminal to ask in: refuse rather than guess.
      const fallback = req.options.find((o) => o.kind.startsWith('reject'));
      const picked = choice ?? fallback;
      return picked ? { outcome: { outcome: 'selected', optionId: picked.optionId } } : { outcome: { outcome: 'cancelled' } };
    },
  },
  files: {
    read: readTextFile,
    write: async (_chatId, req) => {
      const before = await readIfExists(req.path);
      print(`\n[write] ${req.path} (${before === null ? 'new file' : 'changed'}, ${req.content.length} chars)\n`);
      if ((await ask('Write it? [y/N] ')).toLowerCase() !== 'y') throw new Error('The user declined this write.');
      await writeTextFile(req.path, req.content);
    },
  },
  terminalListener: () => ({
    onStart: (info) => print(`\n[run] ${info.commandLine}\n`),
    onData: (_id, data) => print(data),
    onExit: (_id, status) => print(`[exit ${status.exitCode ?? status.signal}]\n`),
  }),
});

function printUpdate(update: acp.SessionUpdate): void {
  switch (update.sessionUpdate) {
    case 'agent_message_chunk':
      if (update.content.type === 'text') print(update.content.text);
      break;
    case 'tool_call':
      print(`\n[tool] ${update.title}${update.status ? ` (${update.status})` : ''}\n`);
      break;
    case 'tool_call_update':
      if (update.status === 'completed' || update.status === 'failed') print(`[tool ${update.status}]\n`);
      break;
    case 'plan':
      print(`\n[plan]\n${update.entries.map((e) => `  - [${e.status}] ${e.content}`).join('\n')}\n`);
      break;
    default:
      break;
  }
}

async function main(): Promise<number> {
  const chat = hub.createChat(agentId);
  try {
    const result = await hub.prompt(chat.id, [{ type: 'text', text: prompt }]);
    print(`\n\n[done: ${result.stopReason}]\n`);
    return 0;
  } catch (err) {
    if (err instanceof AuthRequiredError) {
      console.error(`\n${err.message} ${spec.loginHint}`);
      for (const m of err.methods) console.error(`  sign-in option: ${m.name} (${m.id})${m.description ? ` - ${m.description}` : ''}`);
      return 2;
    }
    if (err instanceof AgentStartError) {
      console.error(`\n${err.message}`);
      return 2;
    }
    console.error(`\n${err instanceof Error ? err.message : String(err)}`);
    return 1;
  } finally {
    rl.close();
    await hub.dispose();
  }
}

void main().then((code) => process.exit(code));
