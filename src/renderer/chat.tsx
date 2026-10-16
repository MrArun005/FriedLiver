import { useEffect, useRef, useState } from 'preact/hooks';
import type { AgentKey, AgentOption } from '../shared/ipc';
import { api } from './api';
import type { Chat, ChatItem } from './chatState';
import { Markdown } from './markdown';

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
}

export function ChatPanel({ agents, chats, activeChatId, onSelect, onNewChat, onSend }: ChatPanelProps) {
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
        <div class="chat-tabs" role="tablist">
          {chats.map((c) => (
            <button key={c.id} role="tab" aria-selected={c.id === activeChatId} onClick={() => onSelect(c.id)}>
              {c.label}
              {c.busy && ' …'}
            </button>
          ))}
        </div>
      )}
      {chat ? (
        <>
          <Transcript chat={chat} />
          <Composer chat={chat} onSend={onSend} />
        </>
      ) : (
        <div class="empty">
          Pick an agent and start a chat.
          <br />
          No login yet? Choose <strong>Demo (offline)</strong> and type <code>tour</code>.
        </div>
      )}
    </div>
  );
}

function Transcript({ chat }: { chat: Chat }) {
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => end.current?.scrollIntoView({ block: 'end' }), [chat.items.length, chat.items.at(-1)]);
  return (
    <div class="transcript" aria-live="polite">
      {chat.items.map((item, i) => (
        <Item key={i} item={item} />
      ))}
      {chat.busy && <div class="working">{chat.label} is working…</div>}
      <div ref={end} />
    </div>
  );
}

const STATUS_ICON: Record<string, string> = { pending: '○', in_progress: '●', completed: '●', failed: '✕' };

function Item({ item }: { item: ChatItem }) {
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
        <div class={`tool ${item.status ?? ''}`}>
          <span class="icon">{STATUS_ICON[item.status ?? 'pending'] ?? '○'}</span>
          <span>{item.title}</span>
          {item.toolKind && <span class="tag">{item.toolKind}</span>}
        </div>
      );
    case 'plan':
      return (
        <ol class="plan">
          {item.entries.map((e, i) => (
            <li key={i} class={e.status}>
              <span class="icon">{STATUS_ICON[e.status] ?? '○'}</span> {e.content}
            </li>
          ))}
        </ol>
      );
    case 'permission':
      return (
        <div class="card">
          <div class="card-title">Permission needed</div>
          <div>{item.title}</div>
          {item.answer ? (
            <div class="answer">You chose: {item.answer}</div>
          ) : (
            <div class="buttons">
              {item.options.map((o) => (
                <button
                  key={o.optionId}
                  class={o.kind.startsWith('allow') ? 'primary' : ''}
                  onClick={() => void api.respondPermission(item.requestId, o.optionId)}
                >
                  {o.name}
                </button>
              ))}
            </div>
          )}
        </div>
      );
    case 'notice':
      return (
        <div class={`notice ${item.tone}`}>
          <div>{item.text}</div>
          {item.detail && <code class="detail">{item.detail}</code>}
          {item.actions && (
            <div class="buttons">
              {item.actions.map((a) => (
                <button key={a.label} onClick={a.run}>
                  {a.label}
                </button>
              ))}
            </div>
          )}
        </div>
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
        {chat.busy ? (
          <button onClick={() => void api.cancel(chat.id)}>Stop</button>
        ) : (
          <button class="primary" onClick={send}>
            Send
          </button>
        )}
      </div>
    </div>
  );
}
