import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { AgentKey, AgentOption } from '../shared/ipc';
import { api } from './api';
import type { Chat, ChatItem } from './chatState';
import { AgentMark, FileIcon, Icon } from './icons';
import { Inline, Markdown } from './markdown';
import { Callout, IconButton, basename } from './ui';

export interface Attachment {
  name: string;
  mimeType: string;
  /** Base64 without the data: prefix, as ACP image blocks want it. */
  data: string;
}

interface ChatPanelProps {
  agents: AgentOption[];
  chats: Chat[];
  activeChatId: string | null;
  onSelect(chatId: string): void;
  onNewChat(agent: AgentKey): void;
  /** Opens a chat with the agent and sends the first message right away. */
  onQuickStart(agent: AgentKey, prompt: string): void;
  onSend(chatId: string, text: string, attachments: Attachment[]): void;
  onUndo(chatId: string, turnId: string): void;
  onOpenFile(path: string): void;
}

const AGENT_BLURB: Record<AgentKey, string> = {
  claude: 'Claude Code, by Anthropic',
  codex: 'Codex, by OpenAI',
  gemini: 'Gemini CLI, by Google',
  demo: 'Offline, no sign-in',
};

/** "Demo (offline) 2" → "Demo 2": tabs have room for the name, not the note. */
export const shortLabel = (label: string) => label.replace(/\s*\([^)]*\)/g, '').trim() || label;

export function ChatPanel(props: ChatPanelProps) {
  const { agents, chats, activeChatId, onSelect, onNewChat } = props;
  const [agent, setAgent] = useState<AgentKey>('demo');
  const chat = chats.find((c) => c.id === activeChatId) ?? null;
  const agentLabel = agents.find((a) => a.id === agent)?.label ?? agent;
  const strip = useRef<HTMLDivElement>(null);
  const [fade, setFade] = useState('');

  // Chats that don't fit scroll sideways: fade the cut edge, and keep the open chat in view.
  const updateFade = () => {
    const el = strip.current;
    if (!el) return;
    const left = el.scrollLeft > 2;
    const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 2;
    setFade(left && right ? 'both' : left ? 'left' : right ? 'right' : '');
  };
  useEffect(() => {
    const el = strip.current;
    const tab = el?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (el && tab) {
      if (tab.offsetLeft < el.scrollLeft) el.scrollLeft = tab.offsetLeft - 8;
      else if (tab.offsetLeft + tab.offsetWidth > el.scrollLeft + el.clientWidth) el.scrollLeft = tab.offsetLeft + tab.offsetWidth - el.clientWidth + 8;
    }
    updateFade();
  }, [activeChatId, chats.length]);
  useEffect(() => {
    const observer = new ResizeObserver(updateFade);
    if (strip.current) observer.observe(strip.current);
    return () => observer.disconnect();
  }, []);

  return (
    <div class="chat">
      <div class="chat-head">
        <div
          ref={strip}
          class="chat-tabs"
          data-fade={fade || undefined}
          onScroll={updateFade}
          role="tablist"
          aria-label="Chats"
          // A vertical wheel scrolls the strip sideways, so every chat stays reachable.
          onWheel={(e) => {
            if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) e.currentTarget.scrollLeft += e.deltaY;
          }}
        >
          {chats.map((c) => (
            <button
              key={c.id}
              role="tab"
              class="chat-tab"
              aria-selected={c.id === activeChatId}
              onClick={() => onSelect(c.id)}
              title={`${c.label}: ${c.title}`}
            >
              <AgentMark agent={c.agent} size="sm" />
              <span class="label">{shortLabel(c.label)}</span>
              {c.busy && <span class="dot" data-state="working" />}
            </button>
          ))}
        </div>
        <div class="new-chat">
          <select value={agent} onChange={(e) => setAgent(e.currentTarget.value as AgentKey)} aria-label="Agent">
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
          <button onClick={() => onNewChat(agent)} aria-label="New chat" title={`New chat with ${agentLabel}`}>
            <Icon name="plus" />
            <span class="label">New chat</span>
          </button>
        </div>
      </div>
      {chat ? (
        <>
          {chat.branch && (
            <div class="chat-meta" title={chat.cwd}>
              <Icon name="git" />
              Own worktree on <code>{chat.branch}</code>
            </div>
          )}
          <Transcript chat={chat} {...props} />
          <Composer chat={chat} onSend={props.onSend} />
        </>
      ) : (
        <ChatEmpty {...props} />
      )}
    </div>
  );
}

/** Before the first chat: who to work with, and a way in without any login. */
function ChatEmpty({ agents, onNewChat, onQuickStart }: ChatPanelProps) {
  return (
    <div class="chat-empty">
      <div>
        <h2>Start a chat</h2>
        <p class="hint">Edits arrive as diffs you review. Commands wait for your OK.</p>
      </div>
      <div class="agent-cards">
        {agents.map((a) => (
          <button key={a.id} class="agent-card" onClick={() => onNewChat(a.id)}>
            <AgentMark agent={a.id} size="lg" />
            <span class="text">
              <span>{shortLabel(a.label)}</span>
              <span class="hint">{AGENT_BLURB[a.id]}</span>
            </span>
          </button>
        ))}
      </div>
      {agents.some((a) => a.id === 'demo') && (
        <div class="try-row">
          <span class="hint">No login yet? Try the demo:</span>
          <button class="sm" onClick={() => onQuickStart('demo', 'tour')}>
            <Icon name="play" />
            Take the tour
          </button>
          <button class="sm" onClick={() => onQuickStart('demo', 'project')}>
            Build a project
          </button>
        </div>
      )}
    </div>
  );
}

function Transcript({ chat, onUndo, onOpenFile }: { chat: Chat } & Pick<ChatPanelProps, 'onUndo' | 'onOpenFile'>) {
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => end.current?.scrollIntoView({ block: 'end' }), [chat.items.length, chat.items.at(-1)]);
  // Only the newest change card can be undone (older ones may be overwritten by later turns).
  const lastChanges = chat.items.map((i) => i.kind).lastIndexOf('changes');

  // Each agent turn opens with who is speaking; consecutive tool calls share one card.
  const out: ComponentChildren[] = [];
  let tools: { item: Extract<ChatItem, { kind: 'tool' }>; i: number }[] = [];
  let needsHead = true;
  const flushTools = () => {
    if (tools.length === 0) return;
    out.push(
      <div key={`tools-${tools[0].i}`} class="tool-group">
        {tools.map(({ item, i }) => (
          <ToolRow key={i} item={item} />
        ))}
      </div>,
    );
    tools = [];
  };
  const head = (key: string) => (
    <div key={key} class="turn-head">
      <AgentMark agent={chat.agent} size="sm" />
      {chat.label}
    </div>
  );
  chat.items.forEach((item, i) => {
    if (item.kind === 'user') {
      flushTools();
      needsHead = true;
    } else if (needsHead) {
      out.push(head(`head-${i}`));
      needsHead = false;
    }
    if (item.kind === 'tool') {
      tools.push({ item, i });
      return;
    }
    flushTools();
    out.push(<Item key={i} item={item} canUndo={i === lastChanges && !chat.busy} onUndo={(turnId) => onUndo(chat.id, turnId)} onOpenFile={onOpenFile} />);
  });
  flushTools();

  return (
    <div class="transcript" aria-live="polite">
      {out}
      {chat.busy && needsHead && head('head-working')}
      {chat.busy && (
        <div class="working">
          <span class="spinner" aria-hidden="true" />
          <span class="shimmer">{chat.label} is working…</span>
        </div>
      )}
      <div ref={end} />
    </div>
  );
}

const PLAN_STATE: Record<string, string> = { completed: 'done', in_progress: 'working', pending: 'idle' };
const TOOL_STATE: Record<string, string> = { completed: 'done', in_progress: 'working', failed: 'error', pending: 'idle' };

/** Done, working, failed or waiting, drawn the same way for tool calls and plan steps. */
function StatusIcon({ state, done = 'check' }: { state: string; done?: 'check' | 'check-circle' }) {
  return (
    <span class="status-icon" data-state={state} aria-label={state === 'idle' ? 'pending' : state}>
      {state === 'working' ? <span class="spinner" /> : <Icon name={state === 'done' ? done : state === 'error' ? 'alert-circle' : 'circle'} />}
    </span>
  );
}

function ToolRow({ item }: { item: Extract<ChatItem, { kind: 'tool' }> }) {
  return (
    <div class="tool">
      <StatusIcon state={TOOL_STATE[item.status ?? 'pending']} />
      <span class="tool-title" title={item.title}>
        {item.title}
      </span>
      {item.toolKind && <span class="tag">{item.toolKind}</span>}
    </div>
  );
}

function Item({ item, canUndo, onUndo, onOpenFile }: { item: ChatItem; canUndo: boolean; onUndo(turnId: string): void; onOpenFile(path: string): void }) {
  switch (item.kind) {
    case 'user':
      return (
        <div class="msg user">
          {item.text}
          {item.images.length > 0 && (
            <div class="thumbs">
              {item.images.map((src, i) => (
                <img key={i} src={src} alt="Attached image" />
              ))}
            </div>
          )}
        </div>
      );
    case 'agent':
      return (
        <div class="msg agent">
          <Markdown text={item.text} />
        </div>
      );
    case 'thought':
      return (
        <details class="thought">
          <summary>
            <span class="chevron" aria-hidden="true">
              <Icon name="chevron-right" />
            </span>
            <Icon name="sparkle" />
            Thinking
          </summary>
          {item.text}
        </details>
      );
    case 'tool':
      return <ToolRow item={item} />;
    case 'plan': {
      const done = item.entries.filter((e) => e.status === 'completed').length;
      return (
        <div class="plan">
          <div class="plan-head">
            <Icon name="list" />
            Plan
            <span class="hint tabular">
              {done} of {item.entries.length} done
            </span>
          </div>
          <div class="progress" aria-hidden="true">
            <span style={{ width: `${item.entries.length ? (done / item.entries.length) * 100 : 0}%` }} />
          </div>
          <ol aria-label="Plan">
            {item.entries.map((e, i) => (
              <li key={i} data-state={PLAN_STATE[e.status] ?? 'idle'}>
                <StatusIcon state={PLAN_STATE[e.status] ?? 'idle'} done="check-circle" />
                {e.content}
              </li>
            ))}
          </ol>
        </div>
      );
    }
    case 'permission':
      return (
        <Callout tone="warn" icon="shield" title="Permission needed">
          <div>
            <Inline text={item.title} />
          </div>
          {item.answer ? (
            <div class="hint">You chose: {item.answer}</div>
          ) : (
            <div class="actions">
              {item.options.map((o) => (
                <button
                  key={o.optionId}
                  class={`sm ${o.kind.startsWith('allow') ? 'primary' : 'danger'}`}
                  onClick={() => void api.respondPermission(item.requestId, o.optionId)}
                >
                  {o.name}
                </button>
              ))}
            </div>
          )}
        </Callout>
      );
    case 'notice':
      return (
        <Callout tone={item.tone}>
          <div>
            <Inline text={item.text} />
          </div>
          {item.detail && <code class="detail">{item.detail}</code>}
          {item.actions && (
            <div class="actions">
              {item.actions.map((a, i) => (
                <button key={a.label} class={`sm${i === 0 && item.tone === 'error' ? ' primary' : ''}`} onClick={a.run}>
                  {a.label}
                </button>
              ))}
            </div>
          )}
        </Callout>
      );
    case 'changes':
      return (
        <Callout
          tone={item.undone ? 'info' : 'success'}
          icon={item.undone ? 'undo' : 'check-circle'}
          title={item.undone ? 'Turn undone' : `Changed ${item.files.length} file${item.files.length === 1 ? '' : 's'}`}
        >
          <div class="file-chips">
            {item.files.map((f) => (
              <button key={f} class="file-chip" title={f} onClick={() => onOpenFile(f)}>
                <FileIcon name={basename(f)} />
                {basename(f)}
              </button>
            ))}
          </div>
          {!item.undone && canUndo && (
            <div class="actions">
              <button class="sm" onClick={() => onUndo(item.turnId)}>
                <Icon name="undo" />
                Undo this turn
              </button>
            </div>
          )}
        </Callout>
      );
  }
}

function readImages(files: File[], add: (a: Attachment) => void): void {
  for (const file of files) {
    if (!file.type.startsWith('image/')) continue;
    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result);
      add({ name: file.name || 'pasted image', mimeType: file.type, data: url.slice(url.indexOf(',') + 1) });
    };
    reader.readAsDataURL(file);
  }
}

function Composer({ chat, onSend }: { chat: Chat; onSend: ChatPanelProps['onSend'] }) {
  const [text, setText] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const box = useRef<HTMLTextAreaElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const add = (a: Attachment) => setAttachments((list) => [...list, a]);

  // Grows with the message, up to the max-height in CSS, then scrolls.
  useEffect(() => {
    const ta = box.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${ta.scrollHeight}px`;
  }, [text]);

  const send = () => {
    if (!text.trim() && attachments.length === 0) return;
    onSend(chat.id, text.trim(), attachments);
    setText('');
    setAttachments([]);
  };

  const onPaste = (e: ClipboardEvent) => {
    const files = Array.from(e.clipboardData?.items ?? [])
      .map((item) => (item.kind === 'file' ? item.getAsFile() : null))
      .filter((f): f is File => !!f && f.type.startsWith('image/'));
    if (files.length === 0) return;
    e.preventDefault();
    readImages(files, add);
  };

  return (
    <div class="composer">
      <div class="composer-box">
        {attachments.length > 0 && (
          <div class="thumbs">
            {attachments.map((a, i) => (
              <button key={i} class="thumb" title="Remove" onClick={() => setAttachments(attachments.filter((_, n) => n !== i))}>
                <img src={`data:${a.mimeType};base64,${a.data}`} alt={a.name} />
              </button>
            ))}
          </div>
        )}
        <textarea
          ref={box}
          rows={1}
          value={text}
          aria-label={`Message ${chat.label}`}
          placeholder={`Message ${chat.label}…`}
          onInput={(e) => setText(e.currentTarget.value)}
          onPaste={onPaste}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              if (!chat.busy) send();
            }
          }}
        />
        <div class="composer-bar">
          <span class="who">
            <AgentMark agent={chat.agent} size="sm" />
            {chat.label}
          </span>
          <IconButton icon="paperclip" label="Attach images" size="sm" onClick={() => picker.current?.click()} />
          <input
            ref={picker}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => {
              readImages(Array.from(e.currentTarget.files ?? []), add);
              e.currentTarget.value = '';
            }}
          />
          <span class="spacer" />
          {chat.busy ? (
            <button class="danger sm" onClick={() => void api.cancel(chat.id)}>
              <Icon name="stop" />
              Stop
            </button>
          ) : (
            <>
              <span class="hint keys-hint">
                <kbd>↵</kbd> send <kbd>⇧↵</kbd> new line
              </span>
              <button class="primary send" aria-label="Send" title="Send (Enter)" onClick={send} disabled={!text.trim() && attachments.length === 0}>
                <Icon name="arrow-up" />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
