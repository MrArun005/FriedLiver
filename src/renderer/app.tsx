import type * as acp from '@agentclientprotocol/sdk';
import { useEffect, useMemo, useReducer, useRef, useState } from 'preact/hooks';
import type { AgentKey, AgentOption, GitStatus, ImageItem, MainEvent, MemoryReport, PromptOutcome } from '../shared/ipc';
import { api } from './api';
import { BottomPanel } from './bottomPanel';
import { ChatPanel, type Attachment } from './chat';
import { chatStatus, chatsReducer, titleFrom, type Chat, type ChatItem, type NoticeAction } from './chatState';
import type { CommandView } from './commands';
import { EditorPane, type DiffView, type WriteReview } from './editor';
import { FileTree } from './fileTree';
import { GitPanel } from './gitPanel';
import { Icon, type IconName } from './icons';
import { ImagesPanel } from './images';
import { Splitter, useLayout, type SidebarView } from './layout';
import { Palette, type PaletteItem } from './palette';
import { SearchPanel } from './searchPanel';
import { SettingsDialog } from './settingsDialog';
import { TasksView } from './tasks';
import { THEMES, applyTheme, saveTheme, savedTheme } from './themes';
import { Toasts, basename, modKey, toast } from './ui';

const MEMORY_POLL_MS = 5000;
type AgentTab = 'chat' | 'tasks' | 'images';

export function App() {
  const [root, setRoot] = useState<string | null>(null);
  const [tabs, setTabs] = useState<string[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [reveal, setReveal] = useState<{ path: string; line: number; n: number } | null>(null);
  const [diffView, setDiffView] = useState<DiffView | null>(null);
  const [treeKey, setTreeKey] = useState(0);
  const [changedFile, setChangedFile] = useState<{ path: string; n: number } | null>(null);
  const [agents, setAgents] = useState<AgentOption[]>([]);
  const [chats, dispatch] = useReducer(chatsReducer, []);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [reviews, setReviews] = useState<WriteReview[]>([]);
  const [commands, setCommands] = useState<CommandView[]>([]);
  const [images, setImages] = useState<ImageItem[]>([]);
  const [agentTab, setAgentTab] = useState<AgentTab>('chat');
  const [unseenImages, setUnseenImages] = useState(0);
  const [running, setRunning] = useState<{ id: string; label: string; busy: boolean }[]>([]);
  const [memory, setMemory] = useState<MemoryReport | null>(null);
  const [git, setGit] = useState<GitStatus | null | undefined>(undefined);
  const [theme, setTheme] = useState(savedTheme);
  const [layout, setLayout] = useLayout();
  const [bottomTab, setBottomTab] = useState('commands');
  const [palette, setPalette] = useState<'files' | 'commands' | null>(null);
  const [files, setFiles] = useState<string[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [searchFocus, setSearchFocus] = useState(0);
  const agentTabRef = useRef(agentTab);
  agentTabRef.current = agentTab;
  const chatCount = useRef<Record<string, number>>({});

  useEffect(() => {
    void api.initialFolder().then(setRoot);
    void api.agents().then(setAgents);
    return api.onEvent(handleEvent);
  }, []);

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

  useEffect(() => {
    if (root) refreshGit();
  }, [root]);

  // Keyboard shortcuts. Capture phase, so they work while Monaco or the terminal has focus.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const key = e.key.toLowerCase();
      const withShift: Record<string, () => void> = {
        p: () => setPalette('commands'),
        f: () => showSidebar('search'),
        e: () => showSidebar('files'),
        g: () => showSidebar('git'),
        a: toggleAgents,
      };
      const plain: Record<string, () => void> = {
        p: () => void openQuickOpen(),
        '`': toggleBottom,
        ',': () => setSettingsOpen(true),
        b: () => setLayout((l) => ({ sidebar: l.sidebar ? null : 'files' })),
        w: () => active && closeTab(active),
      };
      const action = (e.shiftKey ? withShift : plain)[key];
      if (!action) return;
      e.preventDefault();
      e.stopPropagation();
      action();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });

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
        setReviews((list) => [...list, event]);
        break;
      case 'writeReviewClosed':
        setReviews((list) => list.filter((r) => r.reviewId !== event.reviewId));
        break;
      case 'fileChanged':
        setTreeKey((k) => k + 1);
        setChangedFile((c) => ({ path: event.path, n: (c?.n ?? 0) + 1 }));
        refreshGit();
        break;
      case 'turnChanges':
        dispatch({ t: 'changes', chatId: event.chatId, turnId: event.turnId, files: event.files });
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
        if (agentTabRef.current !== 'images') setUnseenImages((n) => n + 1);
        break;
      case 'ptyData':
      case 'ptyExit':
        break; // Each terminal view listens for its own pty.
    }
  }

  // ---- Files and editor ----

  function openFile(path: string, line?: number): void {
    setDiffView(null);
    setTabs((t) => (t.includes(path) ? t : [...t, path]));
    setActive(path);
    if (line) setReveal((r) => ({ path, line, n: (r?.n ?? 0) + 1 }));
  }

  function closeTab(path: string): void {
    if (dirty.has(path) && !confirm(`${basename(path)} has unsaved changes. Close it anyway?`)) return;
    const i = tabs.indexOf(path);
    const rest = tabs.filter((t) => t !== path);
    setTabs(rest);
    setDirty((d) => {
      const n = new Set(d);
      n.delete(path);
      return n;
    });
    if (active === path) setActive(rest[Math.min(i, rest.length - 1)] ?? null);
  }

  async function openQuickOpen(): Promise<void> {
    setPalette('files');
    setFiles((await api.listFiles()).files);
  }

  function refreshGit(): void {
    void api.gitStatus().then(setGit, () => setGit(null));
  }

  async function openGitDiff(rel: string, status: string): Promise<void> {
    if (!git) return;
    const path = `${git.root}/${rel}`;
    const original = status === 'U' || status === 'A' ? '' : ((await api.gitHead(path)) ?? '');
    const modified = status === 'D' ? '' : await api.readFile(path).catch(() => '');
    setDiffView({ title: 'HEAD ↔ working copy', path, original, modified });
  }

  const gitMarks = useMemo(() => new Map((git?.files ?? []).map((f) => [`${git!.root}/${f.path}`, f.status])), [git]);

  // ---- Layout ----

  function showSidebar(view: SidebarView): void {
    setLayout((l) => ({ sidebar: l.sidebar === view && view !== 'search' ? null : view }));
    if (view === 'search') setSearchFocus((n) => n + 1);
    if (view === 'git') refreshGit();
  }
  function toggleAgents(): void {
    setLayout((l) => ({ agents: l.agents === 'side' ? 'center' : 'side' }));
  }
  /** Ctrl+`: show the terminal; hide the panel only when the terminal is already showing. */
  function toggleBottom(): void {
    if (layout.bottom && bottomTab.startsWith('pty-')) {
      setLayout({ bottom: false });
      return;
    }
    setLayout({ bottom: true });
    setBottomTab('terminal');
  }

  // ---- Agents ----

  async function newChat(agent: AgentKey, options: { worktree?: boolean; title?: string } = {}): Promise<string | null> {
    const r = await api.createChat(agent, options);
    if (!r.ok) {
      toast(r.message, 'error');
      return null;
    }
    const base = agents.find((a) => a.id === agent)?.label ?? agent;
    const n = (chatCount.current[agent] = (chatCount.current[agent] ?? 0) + 1);
    const chat: Chat = {
      id: r.value.chatId,
      agent,
      label: n > 1 ? `${base} ${n}` : base,
      title: options.title ? titleFrom(options.title) : 'New chat',
      cwd: r.value.cwd,
      branch: r.value.branch,
      changedFiles: 0,
      items: [],
      busy: false,
    };
    dispatch({ t: 'created', chat });
    setActiveChatId(chat.id);
    return chat.id;
  }

  async function send(chatId: string, text: string, attachments: Attachment[]): Promise<void> {
    const blocks: acp.ContentBlock[] = [];
    if (text) blocks.push({ type: 'text', text });
    for (const a of attachments) blocks.push({ type: 'image', data: a.data, mimeType: a.mimeType });
    const chat = chats.find((c) => c.id === chatId);
    if (chat && !chat.items.some((i) => i.kind === 'user')) dispatch({ t: 'title', chatId, title: titleFrom(text) });
    dispatch({ t: 'items', chatId, items: [{ kind: 'user', text, images: attachments.map((a) => `data:${a.mimeType};base64,${a.data}`) }] });
    await runPrompt(chatId, blocks, chat?.agent);
  }

  async function runPrompt(chatId: string, blocks: acp.ContentBlock[], agent?: AgentKey): Promise<void> {
    dispatch({ t: 'busy', chatId, busy: true });
    const outcome = await api.prompt(chatId, blocks).catch((err: unknown): PromptOutcome => ({ ok: false, kind: 'error', message: String(err) }));
    dispatch({ t: 'busy', chatId, busy: false });
    const notice = outcomeNotice(outcome, chatId, blocks, agent);
    if (notice) dispatch({ t: 'items', chatId, items: [notice] });
  }

  function outcomeNotice(outcome: PromptOutcome, chatId: string, blocks: acp.ContentBlock[], agent?: AgentKey): ChatItem | null {
    const retry: NoticeAction = { label: 'Try again', run: () => void runPrompt(chatId, blocks, agent) };
    if (outcome.ok) {
      return outcome.stopReason === 'end_turn' ? null : { kind: 'notice', tone: 'info', text: `Stopped (${outcome.stopReason}).` };
    }
    if (outcome.kind === 'auth') {
      const signIns: NoticeAction[] = outcome.methods
        .filter((m) => !m.terminal)
        .map((m) => ({
          label: m.name,
          run: () =>
            void api.signIn(agent!, m.id).then((r) => {
              if (r.ok) void runPrompt(chatId, blocks, agent);
              else dispatch({ t: 'items', chatId, items: [{ kind: 'notice', tone: 'error', text: r.message ?? 'Sign-in failed.' }] });
            }),
        }));
      const keys: NoticeAction = { label: 'Add an API key', run: () => setSettingsOpen(true) };
      return { kind: 'notice', tone: 'error', text: outcome.message, detail: outcome.loginHint, actions: [...signIns, keys, retry] };
    }
    if (outcome.kind === 'not_installed') {
      return {
        kind: 'notice',
        tone: 'error',
        text: outcome.message.split(' Install it with:')[0],
        detail: outcome.installCommand,
        actions: [
          {
            label: 'Install in terminal',
            run: () => {
              setLayout({ bottom: true });
              setBottomTab('terminal');
              void navigator.clipboard.writeText(outcome.installCommand);
              toast('Install command copied. Paste it in the terminal and press Enter.');
            },
          },
          retry,
        ],
      };
    }
    return { kind: 'notice', tone: 'error', text: outcome.message, actions: [retry] };
  }

  async function createTask(agent: AgentKey, prompt: string, worktree: boolean): Promise<void> {
    const chatId = await newChat(agent, { worktree, title: prompt });
    if (!chatId) return;
    setAgentTab('chat');
    dispatch({ t: 'items', chatId, items: [{ kind: 'user', text: prompt, images: [] }] });
    await runPrompt(chatId, [{ type: 'text', text: prompt }], agent);
  }

  async function undoTurn(chatId: string, turnId: string): Promise<void> {
    const r = await api.undoTurn(chatId, turnId);
    if (!r.ok) return toast(r.message, 'error');
    dispatch({ t: 'undone', chatId, turnId });
    toast(`Restored ${r.value.length} file${r.value.length === 1 ? '' : 's'}.`, 'success');
  }

  async function mergeTask(chatId: string): Promise<void> {
    const r = await api.mergeTask(chatId);
    if (r.ok) toast('Merged into the main checkout.', 'success');
    else toast(r.message, 'error');
    refreshGit();
  }

  async function removeTask(chatId: string): Promise<void> {
    if (!confirm('Delete this task’s worktree and branch? Unmerged work in it is lost.')) return;
    const r = await api.removeTask(chatId);
    if (r.ok) dispatch({ t: 'removedWorktree', chatId });
    else toast(r.message, 'error');
  }

  const waitingOnUser = (chatId: string) =>
    reviews.some((r) => r.chatId === chatId) || commands.some((c) => c.chatId === chatId && c.state === 'awaiting');
  const statusOf = (chat: Chat) => chatStatus(chat, waitingOnUser(chat.id));
  const needsYou = chats.filter((c) => statusOf(c) === 'needs-you').length;

  // ---- Palettes ----

  const commandItems: PaletteItem[] = [
    ...agents.map((a) => ({ id: `chat-${a.id}`, label: `New chat: ${a.label}`, run: () => void newChat(a.id).then(() => setAgentTab('chat')) })),
    { id: 'tasks', label: 'Show tasks (Agent Manager)', run: () => setAgentTab('tasks') },
    {
      id: 'agents',
      label: layout.agents === 'side' ? 'Move agents to the center' : 'Move agents to the side',
      detail: `${modKey()}+Shift+A`,
      run: toggleAgents,
    },
    { id: 'quick', label: 'Go to file…', detail: `${modKey()}+P`, run: () => void openQuickOpen() },
    { id: 'search', label: 'Search in files', detail: `${modKey()}+Shift+F`, run: () => showSidebar('search') },
    { id: 'files', label: 'Show files', detail: `${modKey()}+Shift+E`, run: () => showSidebar('files') },
    { id: 'git', label: 'Show source control', detail: `${modKey()}+Shift+G`, run: () => showSidebar('git') },
    {
      id: 'terminal',
      label: 'New terminal',
      detail: `${modKey()}+\``,
      run: () => {
        setLayout({ bottom: true });
        setBottomTab('terminal');
      },
    },
    { id: 'bottom', label: 'Toggle bottom panel', run: toggleBottom },
    { id: 'settings', label: 'Open settings', detail: `${modKey()}+,`, run: () => setSettingsOpen(true) },
    { id: 'stop', label: 'Stop all agents', run: () => void api.stopAgents() },
    { id: 'folder', label: 'Open folder…', run: () => void openFolder() },
    ...THEMES.map((t) => ({ id: `theme-${t.id}`, label: `Theme: ${t.name}`, run: () => setTheme(t) })),
  ];
  const fileItems: PaletteItem[] = files.map((f) => ({ id: f, label: f, run: () => openFile(`${root}/${f}`) }));

  async function openFolder(): Promise<void> {
    const folder = await api.openFolder();
    if (folder) {
      setRoot(folder);
      setTabs([]);
      setActive(null);
    }
  }

  if (!root) {
    return (
      <div class="welcome">
        <h1>FriedLiver</h1>
        <p class="hint">Open a folder to start. Agents work inside the folder you open.</p>
        <button class="primary" onClick={() => void openFolder()}>
          Open folder
        </button>
        <div class="keys">
          <span>Go to file</span>
          <span>
            <kbd>{modKey()}</kbd>+<kbd>P</kbd>
          </span>
          <span>Commands</span>
          <span>
            <kbd>{modKey()}</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd>
          </span>
          <span>Agents to the center</span>
          <span>
            <kbd>{modKey()}</kbd>+<kbd>Shift</kbd>+<kbd>A</kbd>
          </span>
        </div>
      </div>
    );
  }

  const agentMb = memory?.agents.reduce((sum, a) => sum + a.mb, 0) ?? 0;
  const activity: { view: SidebarView; icon: IconName; label: string; badge?: number }[] = [
    { view: 'files', icon: 'files', label: `Files (${modKey()}+Shift+E)` },
    { view: 'search', icon: 'search', label: `Search (${modKey()}+Shift+F)` },
    { view: 'git', icon: 'git', label: `Source control (${modKey()}+Shift+G)`, badge: git?.files.length || undefined },
  ];
  const appClass = ['app', `agents-${layout.agents}`, layout.sidebar ? '' : 'sidebar-hidden', layout.bottom ? '' : 'bottom-hidden'].join(' ');

  return (
    <div class={appClass} style={{ '--side-width': `${layout.sideWidth[layout.agents]}px` }}>
      <nav class="activity" aria-label="Views">
        {activity.map((a) => (
          <button key={a.view} aria-label={a.label} title={a.label} aria-pressed={layout.sidebar === a.view} onClick={() => showSidebar(a.view)}>
            <Icon name={a.icon} />
            {a.badge ? <span class="badge">{a.badge}</span> : null}
          </button>
        ))}
        <button aria-label="Tasks (Agent Manager)" title="Tasks (Agent Manager)" aria-pressed={agentTab === 'tasks'} onClick={() => setAgentTab(agentTab === 'tasks' ? 'chat' : 'tasks')}>
          <Icon name="agents" />
          {needsYou > 0 && (
            <span class="badge" data-tone="warn">
              {needsYou}
            </span>
          )}
        </button>
        <button aria-label={`Terminal (${modKey()}+\`)`} title={`Terminal (${modKey()}+\`)`} aria-pressed={layout.bottom} onClick={toggleBottom}>
          <Icon name="terminal" />
        </button>
        <span class="spacer" />
        <button aria-label={`Settings (${modKey()}+,)`} title={`Settings (${modKey()}+,)`} onClick={() => setSettingsOpen(true)}>
          <Icon name="settings" />
        </button>
      </nav>

      <aside class="sidebar" aria-label="Sidebar">
        {layout.sidebar === 'files' && <FileTree root={root} activePath={active} refreshKey={treeKey} gitMarks={gitMarks} onOpen={(p) => openFile(p)} />}
        {layout.sidebar === 'search' && <SearchPanel root={root} focusKey={searchFocus} onOpen={openFile} />}
        {layout.sidebar === 'git' && <GitPanel status={git} onRefresh={refreshGit} onDiff={(p, s) => void openGitDiff(p, s)} />}
      </aside>

      <EditorPane
        tabs={tabs}
        active={active}
        dirty={dirty}
        review={reviews[0] ?? null}
        pendingReviews={reviews.length}
        diffView={diffView}
        reveal={reveal}
        changedFile={changedFile}
        onActivate={(p) => {
          setDiffView(null);
          setActive(p);
        }}
        onClose={closeTab}
        onCloseDiff={() => setDiffView(null)}
        onDirtyChange={(path, isDirty) =>
          setDirty((d) => {
            if (d.has(path) === isDirty) return d;
            const n = new Set(d);
            if (isDirty) n.add(path);
            else n.delete(path);
            return n;
          })
        }
        onSaved={() => {
          setTreeKey((k) => k + 1);
          refreshGit();
        }}
      />

      <BottomPanel commands={commands} theme={theme} tab={bottomTab} onTab={setBottomTab} onHide={() => setLayout({ bottom: false })} />

      <Splitter onResize={(w) => setLayout((l) => ({ sideWidth: { ...l.sideWidth, [l.agents]: w } }))} />

      <aside class="agents" aria-label="Agents">
        <div class="tabs" role="tablist">
          <button role="tab" class="tab" aria-selected={agentTab === 'chat'} onClick={() => setAgentTab('chat')}>
            Chat
          </button>
          <button role="tab" class="tab" aria-selected={agentTab === 'tasks'} onClick={() => setAgentTab('tasks')}>
            Tasks
            {needsYou > 0 && (
              <span class="badge" data-tone="warn">
                {needsYou}
              </span>
            )}
          </button>
          <button
            role="tab"
            class="tab"
            aria-selected={agentTab === 'images'}
            onClick={() => {
              setAgentTab('images');
              setUnseenImages(0);
            }}
          >
            Images {unseenImages > 0 ? <span class="badge">{unseenImages}</span> : images.length > 0 ? <span class="hint">{images.length}</span> : null}
          </button>
          <div class="end">
            <button
              class="ghost sm"
              onClick={toggleAgents}
              title={`${layout.agents === 'side' ? 'Move agents to the center' : 'Move agents to the side'} (${modKey()}+Shift+A)`}
            >
              <Icon name={layout.agents === 'side' ? 'center' : 'side'} />
              {layout.agents === 'side' ? 'Center' : 'Side'}
            </button>
          </div>
        </div>
        <div class="tab-body" hidden={agentTab !== 'chat'}>
          <ChatPanel
            agents={agents}
            chats={chats}
            activeChatId={activeChatId}
            onSelect={setActiveChatId}
            onNewChat={(a) => void newChat(a)}
            onSend={(c, t, a) => void send(c, t, a)}
            onUndo={(c, t) => void undoTurn(c, t)}
            onOpenFile={(p) => openFile(p)}
          />
        </div>
        <div class="tab-body" hidden={agentTab !== 'tasks'}>
          <TasksView
            agents={agents}
            chats={chats}
            statusOf={statusOf}
            onOpen={(id) => {
              setActiveChatId(id);
              setAgentTab('chat');
            }}
            onCreate={(a, p, w) => void createTask(a, p, w)}
            onStop={(id) => void api.cancel(id)}
            onMerge={(id) => void mergeTask(id)}
            onRemove={(id) => void removeTask(id)}
          />
        </div>
        <div class="tab-body" hidden={agentTab !== 'images'}>
          <ImagesPanel images={images} />
        </div>
      </aside>

      <footer class="status">
        <button class="link" onClick={() => void openFolder()} title={`${root} (open another folder)`}>
          {basename(root)}
        </button>
        {git?.branch && (
          <button class="link" onClick={() => showSidebar('git')} title="Source control">
            ⎇ {git.branch}
            {git.files.length ? ` · ${git.files.length} changed` : ''}
          </button>
        )}
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
        <select aria-label="Theme" value={theme.id} onChange={(e) => setTheme(THEMES.find((t) => t.id === e.currentTarget.value) ?? theme)}>
          {THEMES.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </footer>

      {palette === 'files' && <Palette items={fileItems} placeholder="Go to file" onClose={() => setPalette(null)} />}
      {palette === 'commands' && <Palette items={commandItems} placeholder="Type a command" onClose={() => setPalette(null)} />}
      {settingsOpen && <SettingsDialog theme={theme} onTheme={setTheme} onClose={() => setSettingsOpen(false)} />}
      <Toasts />
    </div>
  );
}
