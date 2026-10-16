import { useEffect, useRef, useState } from 'preact/hooks';
import type { AgentKey, AgentOption } from '../shared/ipc';
import { api } from './api';
import type { Chat, ChatItem } from './chatState';
import { Markdown } from './markdown';
import { Callout, basename, modKey } from './ui';

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
  onSend(chatId: string, text: string, attachments: Attachment[]): void;
  onUndo(chatId: string, turnId: string): void;
  onOpenFile(path: string): void;
}

export function ChatPanel(props: ChatPanelProps) {
  const { agents, chats, activeChatId, onSelect, onNewChat } = props;
  const [agent, setAgent] = useState<AgentKey>('demo');
  const chat = chats.find((c) => c.id === activeChatId) ?? null;

  return (
    <div class="chat">
      <div class="chat-head">
        <select value={agent} onChange={(e) => setAgent(e.currentTarget.value as AgentKey)} aria-label="Agent">
          {agents.map((a) => (
            <option key={a.id} value={a.id}>
              {a.label}
            </option>
          ))}
        </select>
        <button onClick={() => onNewChat(agent)}>New chat</button>
      </div>
      {chats.length > 1 && (
        <div class="tabs" role="tablist" aria-label="Chats">
          {chats.map((c) => (
            <button key={c.id} role="tab" class="tab" aria-selected={c.id === activeChatId} onClick={() => onSelect(c.id)} title={c.title}>
              {c.busy && <span class="dot" data-state="working" />}
              {c.label}
            </button>
          ))}
        </div>
      )}
      {chat ? (
        <>
          {chat.branch && (
            <div class="chat-meta" title={chat.cwd}>
              Worktree <code>{chat.branch}</code>
            </div>
          )}
          <Transcript chat={chat} {...props} />
          <Composer chat={chat} onSend={props.onSend} />
        </>
      ) : (
        <div class="empty">
          Pick an agent and start a chat.
          <br />
          No login yet? Choose <strong>Demo (offline)</strong> and type <code>tour</code> or <code>project</code>.
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
  return (
    <div class="transcript" aria-live="polite">
      {chat.items.map((item, i) => (
        <Item key={i} item={item} canUndo={i === lastChanges && !chat.busy} onUndo={(turnId) => onUndo(chat.id, turnId)} onOpenFile={onOpenFile} />
      ))}
      {chat.busy && (
        <div class="working">
          <span class="dot" data-state="working" /> {chat.label} is working…
        </div>
      )}
      <div ref={end} />
    </div>
  );
}

const PLAN_STATE: Record<string, string> = { completed: 'done', in_progress: 'working', pending: 'idle' };
const TOOL_STATE: Record<string, string> = { completed: 'done', in_progress: 'working', failed: 'error', pending: 'idle' };

function Item({
  item,
  canUndo,
  onUndo,
  onOpenFile,
}: {
  item: ChatItem;
  canUndo: boolean;
  onUndo(turnId: string): void;
  onOpenFile(path: string): void;
}) {
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
          <summary>Thinking</summary>
          {item.text}
        </details>
      );
    case 'tool':
      return (
        <div class="tool">
          <span class="dot" data-state={TOOL_STATE[item.status ?? 'pending']} />
          <span>{item.title}</span>
          {item.toolKind && <span class="tag">{item.toolKind}</span>}
        </div>
      );
    case 'plan':
      return (
        <ol class="plan" aria-label="Plan">
          {item.entries.map((e, i) => (
            <li key={i} data-state={PLAN_STATE[e.status] ?? 'idle'}>
              <span class="dot" data-state={PLAN_STATE[e.status] ?? 'idle'} /> {e.content}
            </li>
          ))}
        </ol>
      );
    case 'permission':
      return (
        <Callout tone="warn" title="Permission needed">
          <div>{item.title}</div>
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
          <div>{item.text}</div>
          {item.detail && <code class="detail">{item.detail}</code>}
          {item.actions && (
            <div class="actions">
              {item.actions.map((a) => (
                <button key={a.label} class="sm" onClick={a.run}>
                  {a.label}
                </button>
              ))}
            </div>
          )}
        </Callout>
      );
    case 'changes':
      return (
        <Callout tone={item.undone ? 'info' : 'success'} title={item.undone ? 'Turn undone' : `Changed ${item.files.length} file${item.files.length === 1 ? '' : 's'}`}>
          <div class="actions">
            {item.files.map((f) => (
              <button key={f} class="sm ghost" title={f} onClick={() => onOpenFile(f)}>
                {basename(f)}
              </button>
            ))}
          </div>
          {!item.undone && canUndo && (
            <div class="actions">
              <button class="sm" onClick={() => onUndo(item.turnId)}>
                Undo this turn
              </button>
            </div>
          )}
        </Callout>
      );
  }
}

function Composer({ chat, onSend }: { chat: Chat; onSend: ChatPanelProps['onSend'] }) {
  const [text, setText] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);

  const send = () => {
    if (!text.trim() && attachments.length === 0) return;
    onSend(chat.id, text.trim(), attachments);
    setText('');
    setAttachments([]);
  };

  const onPaste = (e: ClipboardEvent) => {
    for (const item of Array.from(e.clipboardData?.items ?? [])) {
      const file = item.kind === 'file' ? item.getAsFile() : null;
      if (!file || !file.type.startsWith('image/')) continue;
      e.preventDefault();
      const reader = new FileReader();
      reader.onload = () => {
        const url = String(reader.result);
        setAttachments((list) => [...list, { name: file.name || 'pasted image', mimeType: file.type, data: url.slice(url.indexOf(',') + 1) }]);
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div class="composer">
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
        value={text}
        aria-label={`Message ${chat.label}`}
        placeholder={`Message ${chat.label}. Enter to send, Shift+Enter for a new line. Paste images here.`}
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
        <span class="hint">
          <kbd>{modKey()}</kbd>+<kbd>Shift</kbd>+<kbd>A</kbd> moves agents to the center
        </span>
        <span class="spacer" />
        {chat.busy ? (
          <button class="danger" onClick={() => void api.cancel(chat.id)}>
            Stop
          </button>
        ) : (
          <button class="primary" onClick={send} disabled={!text.trim() && attachments.length === 0}>
            Send
          </button>
        )}
      </div>
    </div>
  );
}
