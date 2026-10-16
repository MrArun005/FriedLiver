import type * as acp from '@agentclientprotocol/sdk';
import type { AgentKey } from '../shared/ipc';

export interface NoticeAction {
  label: string;
  run(): void;
}

export type ChatItem =
  | { kind: 'user'; text: string; images: string[] }
  | { kind: 'agent'; text: string }
  | { kind: 'thought'; text: string }
  | { kind: 'tool'; id: string; title: string; toolKind?: string; status?: string; locations: string[] }
  | { kind: 'plan'; entries: { content: string; status: string }[] }
  | { kind: 'permission'; requestId: string; title: string; options: acp.PermissionOption[]; answer?: string }
  | { kind: 'notice'; text: string; tone: 'info' | 'error'; detail?: string; actions?: NoticeAction[] }
  | { kind: 'changes'; turnId: string; files: string[]; undone?: boolean };

export interface Chat {
  id: string;
  agent: AgentKey;
  /** Agent name, numbered when there are several chats with the same agent. */
  label: string;
  /** What the task is about: the first message, shortened. */
  title: string;
  cwd: string;
  branch?: string;
  changedFiles: number;
  items: ChatItem[];
  busy: boolean;
}

export type ChatStatus = 'idle' | 'working' | 'needs-you' | 'done' | 'error';

export type ChatAction =
  | { t: 'created'; chat: Chat }
  | { t: 'items'; chatId: string; items: ChatItem[] }
  | { t: 'update'; chatId: string; update: acp.SessionUpdate }
  | { t: 'busy'; chatId: string; busy: boolean }
  | { t: 'title'; chatId: string; title: string }
  | { t: 'permissionAnswered'; requestId: string; answer: string }
  | { t: 'changes'; chatId: string; turnId: string; files: string[] }
  | { t: 'undone'; chatId: string; turnId: string }
  | { t: 'removedWorktree'; chatId: string };

export function chatsReducer(chats: Chat[], action: ChatAction): Chat[] {
  switch (action.t) {
    case 'created':
      return [...chats, action.chat];
    case 'items':
      return edit(chats, action.chatId, (c) => ({ ...c, items: [...c.items, ...action.items] }));
    case 'busy':
      return edit(chats, action.chatId, (c) => ({ ...c, busy: action.busy }));
    case 'title':
      return edit(chats, action.chatId, (c) => ({ ...c, title: action.title }));
    case 'update':
      return edit(chats, action.chatId, (c) => ({ ...c, items: applyUpdate(c.items, action.update) }));
    case 'permissionAnswered':
      return chats.map((c) => ({
        ...c,
        items: c.items.map((i) => (i.kind === 'permission' && i.requestId === action.requestId ? { ...i, answer: action.answer } : i)),
      }));
    case 'changes':
      return edit(chats, action.chatId, (c) => ({
        ...c,
        changedFiles: c.changedFiles + action.files.length,
        items: [...c.items, { kind: 'changes', turnId: action.turnId, files: action.files }],
      }));
    case 'undone':
      return edit(chats, action.chatId, (c) => {
        const card = c.items.find((i) => i.kind === 'changes' && i.turnId === action.turnId);
        const undone = card?.kind === 'changes' ? card.files.length : 0;
        return {
          ...c,
          changedFiles: Math.max(0, c.changedFiles - undone),
          items: c.items.map((i) => (i.kind === 'changes' && i.turnId === action.turnId ? { ...i, undone: true } : i)),
        };
      });
    case 'removedWorktree':
      return edit(chats, action.chatId, (c) => ({ ...c, branch: undefined }));
  }
}

function edit(chats: Chat[], chatId: string, fn: (c: Chat) => Chat): Chat[] {
  return chats.map((c) => (c.id === chatId ? fn(c) : c));
}

/** One line from the first message, for task lists and tabs. */
export function titleFrom(text: string): string {
  const line = text.split('\n')[0].trim();
  return line.length > 60 ? `${line.slice(0, 57)}…` : line || 'Untitled task';
}

/** Where a task stands. `waitingOnUser` covers reviews and commands, which live outside the transcript. */
export function chatStatus(chat: Chat, waitingOnUser: boolean): ChatStatus {
  const pendingPermission = chat.items.some((i) => i.kind === 'permission' && !i.answer);
  if (chat.busy && (pendingPermission || waitingOnUser)) return 'needs-you';
  if (chat.busy) return 'working';
  const last = chat.items.at(-1);
  if (last?.kind === 'notice' && last.tone === 'error') return 'error';
  return chat.items.some((i) => i.kind === 'user') ? 'done' : 'idle';
}

/** Folds one ACP session update into the chat transcript. */
export function applyUpdate(items: ChatItem[], update: acp.SessionUpdate): ChatItem[] {
  const last = items.at(-1);
  switch (update.sessionUpdate) {
    case 'agent_message_chunk':
    case 'agent_thought_chunk': {
      if (update.content.type !== 'text') return items;
      const kind = update.sessionUpdate === 'agent_message_chunk' ? 'agent' : 'thought';
      if (last?.kind === kind) return [...items.slice(0, -1), { kind, text: last.text + update.content.text }];
      return [...items, { kind, text: update.content.text }];
    }
    case 'tool_call': {
      const tool: ChatItem = {
        kind: 'tool',
        id: update.toolCallId,
        title: update.title,
        toolKind: update.kind,
        status: update.status,
        locations: (update.locations ?? []).map((l) => l.path),
      };
      const at = items.findIndex((i) => i.kind === 'tool' && i.id === update.toolCallId);
      return at < 0 ? [...items, tool] : items.map((i, n) => (n === at ? tool : i));
    }
    case 'tool_call_update':
      return items.map((i) =>
        i.kind === 'tool' && i.id === update.toolCallId
          ? {
              ...i,
              title: update.title ?? i.title,
              status: update.status ?? i.status,
              locations: update.locations ? update.locations.map((l) => l.path) : i.locations,
            }
          : i,
      );
    case 'plan': {
      const plan: ChatItem = { kind: 'plan', entries: update.entries.map((e) => ({ content: e.content, status: e.status })) };
      // One live plan per turn: replace it in place until the user speaks again.
      const lastUser = items.map((i) => i.kind).lastIndexOf('user');
      const at = items.findIndex((i, n) => n > lastUser && i.kind === 'plan');
      return at < 0 ? [...items, plan] : items.map((i, n) => (n === at ? plan : i));
    }
    default:
      return items;
  }
}
