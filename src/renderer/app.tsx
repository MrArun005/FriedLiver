import type * as acp from '@agentclientprotocol/sdk';
import { useEffect, useReducer, useRef, useState } from 'preact/hooks';
import type { AgentKey, AgentOption, ImageItem, MainEvent, MemoryReport, PromptOutcome } from '../shared/ipc';
import { api } from './api';
import { ChatPanel, type Attachment } from './chat';
import { chatsReducer, type ChatItem, type NoticeAction } from './chatState';
import { CommandsPanel, type CommandView } from './commands';
import { EditorPane, type WriteReview } from './editor';
import { FileTree } from './fileTree';
import { ImagesPanel } from './images';
import { Splitter, useLayout } from './layout';
import { THEMES, applyTheme, saveTheme, savedTheme } from './themes';

const MEMORY_POLL_MS = 5000;

export function App() {
  const [root, setRoot] = useState<string | null>(null);
  const [file, setFile] = useState<string | null>(null);
  const [treeKey, setTreeKey] = useState(0);
  const [changedFile, setChangedFile] = useState<{ path: string; n: number } | null>(null);
  const [agents, setAgents] = useState<AgentOption[]>([]);
  const [chats, dispatch] = useReducer(chatsReducer, []);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [reviews, setReviews] = useState<WriteReview[]>([]);
  const [commands, setCommands] = useState<CommandView[]>([]);
  const [images, setImages] = useState<ImageItem[]>([]);
  const [tab, setTab] = useState<'chat' | 'images'>('chat');
  const [unseenImages, setUnseenImages] = useState(0);
  const [running, setRunning] = useState<{ id: string; label: string; busy: boolean }[]>([]);
  const [memory, setMemory] = useState<MemoryReport | null>(null);
  const [theme, setTheme] = useState(savedTheme);
  const [layout, setLayout] = useLayout();
  const tabRef = useRef(tab);
  tabRef.current = tab;
  const chatCount = useRef<Record<string, number>>({});

  useEffect(() => {
    void api.initialFolder().then(setRoot);
    void api.agents().then(setAgents);
    return api.onEvent(handleEvent);
  }, []);

  // Ctrl/Cmd+Shift+A moves the agents between the side and the center.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        toggleAgents();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });

  useEffect(() => {
    applyTheme(theme);
    saveTheme(theme);
  }, [theme]);

  useEffect(() => {
    const poll = () => {
      if (document.visibilityState === 'visible') void api.memory().then(setMemory, () => {});
    };
    poll();
    const timer = setInterval(poll, MEMORY_POLL_MS);
    return () => clearInterval(timer);
  }, []);

  function handleEvent(event: MainEvent): void {
    switch (event.type) {
      case 'update':
        dispatch({ t: 'update', chatId: event.chatId, update: event.update });
        break;
      case 'notice':
        dispatch({ t: 'items', chatId: event.chatId, items: [{ kind: 'notice', text: event.text, tone: 'info' }] });
        break;
      case 'permission':
        dispatch({
          t: 'items',
          chatId: event.chatId,
          items: [{ kind: 'permission', requestId: event.requestId, title: event.title, options: event.options }],
        });
        break;
      case 'permissionClosed':
        dispatch({ t: 'permissionAnswered', requestId: event.requestId, answer: 'answered' });
        break;
      case 'writeReview':
        setReviews((list) => [...list, { reviewId: event.reviewId, path: event.path, before: event.before, after: event.after }]);
        break;
      case 'writeReviewClosed':
        setReviews((list) => list.filter((r) => r.reviewId !== event.reviewId));
        break;
      case 'fileChanged':
        setTreeKey((k) => k + 1);
        setChangedFile((c) => ({ path: event.path, n: (c?.n ?? 0) + 1 }));
        break;
      case 'command':
        setCommands((list) => {
          const at = list.findIndex((c) => c.commandId === event.commandId);
          if (at < 0) return [...list, { ...event, output: '' }];
          return list.map((c, i) => (i === at ? { ...c, state: event.state, exitCode: event.exitCode ?? c.exitCode } : c));
        });
        break;
      case 'commandOutput':
        setCommands((list) => list.map((c) => (c.commandId === event.commandId ? { ...c, output: c.output + event.data } : c)));
        break;
      case 'agents':
        setRunning(event.running);
        // Starting or stopping an agent changes memory a lot; don't wait for the next poll.
        void api.memory().then(setMemory, () => {});
        break;
      case 'image':
        setImages((list) => (list.some((i) => i.id === event.image.id) ? list : [...list, event.image]));
        if (tabRef.current !== 'images') setUnseenImages((n) => n + 1);
        break;
    }
  }

  async function newChat(agent: AgentKey): Promise<void> {
    const id = await api.createChat(agent);
    const base = agents.find((a) => a.id === agent)?.label ?? agent;
    const n = (chatCount.current[agent] = (chatCount.current[agent] ?? 0) + 1);
    dispatch({ t: 'created', chat: { id, agent, label: n > 1 ? `${base} ${n}` : base, items: [], busy: false } });
    setActiveChatId(id);
    setTab('chat');
  }

  async function send(chatId: string, text: string, attachments: Attachment[]): Promise<void> {
    const blocks: acp.ContentBlock[] = [];
    if (text) blocks.push({ type: 'text', text });
    for (const a of attachments) blocks.push({ type: 'image', data: a.data, mimeType: a.mimeType });
    dispatch({
      t: 'items',
      chatId,
      items: [{ kind: 'user', text, images: attachments.map((a) => `data:${a.mimeType};base64,${a.data}`) }],
    });
    await runPrompt(chatId, blocks);
  }

  async function runPrompt(chatId: string, blocks: acp.ContentBlock[]): Promise<void> {
    dispatch({ t: 'busy', chatId, busy: true });
    const outcome = await api.prompt(chatId, blocks).catch(
      (err: unknown): PromptOutcome => ({ ok: false, kind: 'error', message: String(err) }),
    );
    dispatch({ t: 'busy', chatId, busy: false });
    const notice = outcomeNotice(outcome, chatId, blocks);
    if (notice) dispatch({ t: 'items', chatId, items: [notice] });
  }

  function outcomeNotice(outcome: PromptOutcome, chatId: string, blocks: acp.ContentBlock[]): ChatItem | null {
    const retry: NoticeAction = { label: 'Try again', run: () => void runPrompt(chatId, blocks) };
    if (outcome.ok) {
      return outcome.stopReason === 'end_turn' ? null : { kind: 'notice', tone: 'info', text: `Stopped (${outcome.stopReason}).` };
    }
    if (outcome.kind === 'auth') {
      const agent = chats.find((c) => c.id === chatId)?.agent;
      const signIns: NoticeAction[] = outcome.methods
        .filter((m) => !m.terminal)
        .map((m) => ({
          label: m.name,
          run: () =>
            void api.signIn(agent!, m.id).then((r) => {
              if (r.ok) void runPrompt(chatId, blocks);
              else dispatch({ t: 'items', chatId, items: [{ kind: 'notice', tone: 'error', text: r.message ?? 'Sign-in failed.' }] });
            }),
        }));
      return { kind: 'notice', tone: 'error', text: outcome.message, detail: outcome.loginHint, actions: [...signIns, retry] };
    }
    if (outcome.kind === 'not_installed') {
      return {
        kind: 'notice',
        tone: 'error',
        text: outcome.message.split(' Install it with:')[0],
        detail: outcome.installCommand,
        actions: [{ label: 'Copy install command', run: () => void navigator.clipboard.writeText(outcome.installCommand) }, retry],
      };
    }
    return { kind: 'notice', tone: 'error', text: outcome.message, actions: [retry] };
  }

  function toggleAgents(): void {
    setLayout({ agents: layout.agents === 'side' ? 'center' : 'side' });
  }

  async function openFolder(): Promise<void> {
    const folder = await api.openFolder();
    if (folder) {
      setRoot(folder);
      setFile(null);
    }
  }

  if (!root) {
    return (
      <div class="welcome">
        <h1>FriedLiver</h1>
        <p>Open a folder to start. Agents work inside the folder you open.</p>
        <button class="primary" onClick={() => void openFolder()}>
          Open folder
        </button>
      </div>
    );
  }

  const agentMb = memory?.agents.reduce((sum, a) => sum + a.mb, 0) ?? 0;
  return (
    <div class={`app agents-${layout.agents}`} style={{ '--side-width': `${layout.sideWidth[layout.agents]}px` }}>
      <FileTree root={root} activePath={file} refreshKey={treeKey} onOpen={setFile} />
      <Splitter onResize={(w) => setLayout({ sideWidth: { ...layout.sideWidth, [layout.agents]: w } })} />
      <EditorPane file={file} review={reviews[0] ?? null} pendingReviews={reviews.length} changedFile={changedFile} onSaved={() => setTreeKey((k) => k + 1)} />
      <CommandsPanel commands={commands} />
      <aside class="right" aria-label="Agents">
        <div class="tabs" role="tablist">
          <button role="tab" aria-selected={tab === 'chat'} onClick={() => setTab('chat')}>
            Chat
          </button>
          <button
            role="tab"
            aria-selected={tab === 'images'}
            onClick={() => {
              setTab('images');
              setUnseenImages(0);
            }}
          >
            Images {images.length > 0 && <span class={unseenImages ? 'badge' : 'count'}>{unseenImages || images.length}</span>}
          </button>
          <span class="spacer" />
          <button
            class="move"
            onClick={toggleAgents}
            title={`${layout.agents === 'side' ? 'Move agents to the center' : 'Move agents to the side'} (Ctrl/Cmd+Shift+A)`}
          >
            {layout.agents === 'side' ? '⇤ Center' : 'Side ⇥'}
          </button>
        </div>
        <div class="tab-body" hidden={tab !== 'chat'}>
          <ChatPanel agents={agents} chats={chats} activeChatId={activeChatId} onSelect={setActiveChatId} onNewChat={(a) => void newChat(a)} onSend={(c, t, a) => void send(c, t, a)} />
        </div>
        <div class="tab-body" hidden={tab !== 'images'}>
          <ImagesPanel images={images} />
        </div>
      </aside>
      <footer class="status">
        <button class="link" onClick={() => void openFolder()} title="Open another folder">
          {root}
        </button>
        <span class="spacer" />
        {memory && (
          <span title={`Memory (${memory.kind}) of FriedLiver's own processes and of each running agent`}>
            FriedLiver {memory.editorMb} MB
            {memory.agents.map((a) => ` · ${a.label} ${a.mb} MB`)}
            {agentMb > 0 && ` · total ${memory.editorMb + agentMb} MB`}
          </span>
        )}
        {running.length > 0 && (
          <button class="link" onClick={() => void api.stopAgents()}>
            Stop agents
          </button>
        )}
        <select
          class="theme-picker"
          aria-label="Theme"
          value={theme.id}
          onChange={(e) => setTheme(THEMES.find((t) => t.id === e.currentTarget.value) ?? theme)}
        >
          {THEMES.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </footer>
    </div>
  );
}
