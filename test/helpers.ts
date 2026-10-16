import path from 'node:path';
import type * as acp from '@agentclientprotocol/sdk';
import { readTextFile, writeTextFile } from '../src/main/agents/fileAccess';
import { AgentHub, type HubOptions } from '../src/main/agents/hub';
import { DEFAULT_AGENTS, type AgentSpec } from '../src/main/agents/registry';

export const FAKE_AGENT = path.join(__dirname, 'fixtures', 'fakeAgent.mjs');

export function fakeSpec(env: Record<string, string> = {}): AgentSpec {
  return { ...DEFAULT_AGENTS.gemini, label: 'Fake', command: process.execPath, args: [FAKE_AGENT], env };
}

export interface Recorded {
  updates: { chatId: string; update: acp.SessionUpdate }[];
  notices: string[];
  writes: acp.WriteTextFileRequest[];
  permissions: acp.RequestPermissionRequest[];
  text(chatId: string): string;
}

/** A hub wired to the fake agent, recording everything it reports. */
export function fakeHub(
  options: Partial<HubOptions> & { answer?: string; env?: Record<string, string>; onStderr?: (line: string) => void } = {},
): { hub: AgentHub; rec: Recorded } {
  const rec: Recorded = {
    updates: [],
    notices: [],
    writes: [],
    permissions: [],
    text: (chatId) =>
      rec.updates
        .filter((u) => u.chatId === chatId)
        .map(({ update }) =>
          update.sessionUpdate === 'agent_message_chunk' && update.content.type === 'text' ? update.content.text : '',
        )
        .join(''),
  };
  const hub = new AgentHub({
    cwd: process.cwd(),
    clientVersion: 'test',
    resolveSpec: () => fakeSpec(options.env),
    idleStopMs: 0,
    maxRunning: 1,
    events: {
      update: (chatId, update) => rec.updates.push({ chatId, update }),
      notice: (_chatId, text) => rec.notices.push(text),
      agentsChanged: () => {},
      agentStderr: (_id, line) => options.onStderr?.(line),
      permission: async (_chatId, req) => {
        rec.permissions.push(req);
        return { outcome: { outcome: 'selected', optionId: options.answer ?? 'allow' } };
      },
    },
    files: {
      read: readTextFile,
      write: async (_chatId, req) => {
        rec.writes.push(req);
        await writeTextFile(req.path, req.content);
      },
    },
    ...options,
  });
  return { hub, rec };
}
