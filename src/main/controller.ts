import { readdir, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import type * as acp from '@agentclientprotocol/sdk';
import { dialog, ipcMain, type BrowserWindow } from 'electron';
import type { AgentOption, ChatInfo, DirEntry, FriedLiverApi, MainEvent, MemoryReport, Method, PromptOutcome, Result, SettingsView } from '../shared/ipc';
import { EVENT_CHANNEL, METHODS, channel } from '../shared/ipc';
import { AgentStartError } from './agents/agentConnection';
import { readIfExists, readTextFile, writeTextFile } from './agents/fileAccess';
import { AgentHub, AuthRequiredError } from './agents/hub';
import { AGENT_IDS, DEFAULT_AGENTS, demoAgentSpec, isAgentId, type AgentId, type AgentSpec } from './agents/registry';
import type { TerminalListener } from './agents/terminals';
import { TurnLog } from './agents/turnLog';
import { MEMORY_KIND, listProcesses, treeMemoryBytes } from './ram/processTree';
import { API_KEY_NAMES, type ApiKeyName, type SettingsStore } from './settings';
import { PtyManager } from './terminal/ptyManager';
import * as git from './workspace/git';
import { listFiles, searchText } from './workspace/search';

const IMAGE_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.bmp': 'image/bmp',
};
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_EDITOR_FILE_BYTES = 5 * 1024 * 1024;

type Pending<T> = { chatId?: string; resolve: (value: T) => void };
type Api = Omit<FriedLiverApi, 'versions' | 'platform' | 'onEvent'>;

/**
 * Owns the open folder, the agents, the user's terminals and every agent file
 * write or command, and talks to the window.
 */
export class AppController {
  private root: string | null;
  private hub: AgentHub;
  private nextId = 1;
  private readonly permissions = new Map<string, Pending<acp.RequestPermissionResponse>>();
  private readonly writes = new Map<string, Pending<{ accept: boolean; content?: string }>>();
  private readonly commands = new Map<string, Pending<boolean>>();
  private readonly shownImages = new Set<string>();
  private readonly turns = new TurnLog();
  /** Tasks that run in their own git worktree, by chat. */
  private readonly worktrees = new Map<string, git.Worktree & { title: string }>();
  private readonly ptys: PtyManager;

  constructor(
    private readonly win: BrowserWindow,
    private readonly settings: SettingsStore,
    private readonly options: { initialFolder: string | null; demoAgentScript: string; version: string },
  ) {
    this.root = options.initialFolder;
    this.hub = this.createHub();
    this.ptys = new PtyManager({
      data: (id, data) => this.emit({ type: 'ptyData', id, data }),
      exit: (id, exitCode) => this.emit({ type: 'ptyExit', id, exitCode }),
    });
  }

  register(): void {
    const api: Api = {
      initialFolder: async () => this.root,
      openFolder: () => this.openFolder(),
      listDir: (dir) => this.listDir(dir),
      listFiles: async () => (this.root ? listFiles(this.root) : { files: [], truncated: false }),
      search: (query, opts) =>
        attempt(async () => {
          if (!this.root || typeof query !== 'string' || !query) return { matches: [], truncated: false };
          return searchText(this.root, query, { caseSensitive: opts?.caseSensitive === true, regex: opts?.regex === true });
        }),
      readFile: async (file) => {
        const text = await readFile(this.inside(file), 'utf8');
        if (Buffer.byteLength(text) > MAX_EDITOR_FILE_BYTES) throw new Error('File is too large to open.');
        return text;
      },
      writeFile: async (file, content) => {
        await writeTextFile(this.inside(file), String(content));
      },

      agents: async () => AGENT_IDS.map((id): AgentOption => ({ id, label: this.spec(id).label })),
      createChat: (agent, opts) => attempt(() => this.createChat(agentArg(agent), opts?.worktree === true, String(opts?.title ?? 'task'))),
      prompt: (chatId, blocks) => this.prompt(String(chatId), blocks),
      cancel: async (chatId) => {
        this.settleChat(String(chatId));
        await this.hub.cancel(String(chatId));
      },
      signIn: async (agent, methodId) => {
        try {
          await this.hub.authenticate(agentArg(agent), String(methodId));
          return { ok: true };
        } catch (err) {
          return { ok: false, message: messageOf(err) };
        }
      },
      respondPermission: async (requestId, optionId) => {
        this.permissions
          .get(requestId)
          ?.resolve(optionId ? { outcome: { outcome: 'selected', optionId } } : { outcome: { outcome: 'cancelled' } });
      },
      respondWrite: async (reviewId, accept, content) => {
        this.writes.get(reviewId)?.resolve({ accept: accept === true, content: typeof content === 'string' ? content : undefined });
      },
      respondCommand: async (commandId, approve) => {
        this.commands.get(commandId)?.resolve(approve === true);
      },
      undoTurn: (chatId, turnId) =>
        attempt(async () => {
          const files = await this.turns.undo(String(chatId), String(turnId), {
            write: (f, c) => writeTextFile(f, c),
            remove: (f) => rm(f, { force: true }),
          });
          for (const file of files) this.emit({ type: 'fileChanged', path: file });
          return files;
        }),
      mergeTask: (chatId) =>
        attempt(async () => {
          const wt = this.worktrees.get(String(chatId));
          if (!wt || !this.root) throw new Error('This task has no worktree.');
          await git.mergeWorktree((await git.repoRoot(this.root))!, wt, `FriedLiver task: ${wt.title}`);
          this.emit({ type: 'fileChanged', path: this.root });
        }),
      removeTask: (chatId) =>
        attempt(async () => {
          const wt = this.worktrees.get(String(chatId));
          if (!wt || !this.root) throw new Error('This task has no worktree.');
          await git.removeWorktree((await git.repoRoot(this.root))!, wt);
          this.worktrees.delete(String(chatId));
        }),
      stopAgents: () => this.hub.stopAll(),

      ptyCreate: async (cols, rows) => this.ptys.create(this.root ?? process.cwd(), Number(cols), Number(rows)),
      ptyWrite: async (id, data) => this.ptys.write(String(id), String(data)),
      ptyResize: async (id, cols, rows) => this.ptys.resize(String(id), Number(cols), Number(rows)),
      ptyKill: async (id) => this.ptys.kill(String(id)),

      gitStatus: async () => (this.root ? git.status(this.root) : null),
      gitHead: async (file) => {
        const resolved = this.inside(file);
        const repo = await git.repoRoot(path.dirname(resolved));
        return repo ? git.headContent(repo, path.relative(repo, resolved)) : null;
      },
      gitCommit: (message) =>
        attempt(async () => {
          const repo = this.root && (await git.repoRoot(this.root));
          if (!repo) throw new Error('This folder is not a git repository.');
          return git.commitAll(repo, String(message));
        }),

      getSettings: async () => this.settingsView(),
      updateSettings: async (change) => {
        await this.settings.update(change);
        this.applySettings();
        return this.settingsView();
      },
      setApiKey: (name, value) =>
        attempt(async () => {
          if (!API_KEY_NAMES.includes(name as ApiKeyName)) throw new Error('Unknown key.');
          await this.settings.setKey(name as ApiKeyName, typeof value === 'string' ? value : null);
          // Agents read keys at startup; restart them so a new key takes effect.
          await this.hub.stopAll();
          return this.settingsView();
        }),

      memory: () => this.memory(),
    };
    for (const method of METHODS) {
      const handler = api[method] as (...a: unknown[]) => unknown;
      ipcMain.handle(channel(method), (_event, ...args: unknown[]) => handler(...args));
    }
  }

  async dispose(): Promise<void> {
    for (const method of METHODS) ipcMain.removeHandler(channel(method as Method));
    this.ptys.dispose();
    await this.hub.dispose();
  }

  private emit(event: MainEvent): void {
    if (!this.win.isDestroyed()) this.win.webContents.send(EVENT_CHANNEL, event);
  }

  private id(prefix: string): string {
    return `${prefix}-${this.nextId++}`;
  }

  /** The agent's command, with the user's overrides and saved API keys applied. */
  private spec(id: AgentId): AgentSpec {
    if (id === 'demo') return demoAgentSpec(this.options.demoAgentScript);
    const base = DEFAULT_AGENTS[id];
    const override = this.settings.get().agents[id];
    return {
      ...base,
      command: override?.command ?? base.command,
      args: override?.args ?? base.args,
      env: { ...base.env, ...this.settings.keyEnv() },
    };
  }

  private settingsView(): SettingsView {
    const defaults = Object.fromEntries(
      (['claude', 'codex', 'gemini'] as const).map((id) => [id, { command: DEFAULT_AGENTS[id].command, args: DEFAULT_AGENTS[id].args }]),
    ) as SettingsView['defaults'];
    return { settings: this.settings.get(), defaults, keys: this.settings.keyStatus() };
  }

  private applySettings(): void {
    const s = this.settings.get();
    this.hub.configure({ idleStopMs: s.idleStopMinutes * 60_000, maxRunning: s.maxRunningAgents });
  }

  private createHub(): AgentHub {
    const s = this.settings.get();
    return new AgentHub({
      cwd: this.root ?? process.cwd(),
      clientVersion: this.options.version,
      resolveSpec: (id) => this.spec(id),
      idleStopMs: s.idleStopMinutes * 60_000,
      maxRunning: s.maxRunningAgents,
      log: (line) => console.log(line),
      events: {
        update: (chatId, update) => {
          this.emit({ type: 'update', chatId, update });
          void this.collectImages(update);
        },
        notice: (chatId, text) => this.emit({ type: 'notice', chatId, text }),
        agentsChanged: () => this.emit({ type: 'agents', running: this.hub.running() }),
        permission: (chatId, req, signal) => this.askPermission(chatId, req, signal),
      },
      files: {
        read: (req) => readTextFile(req),
        write: (chatId, req) => this.reviewWrite(chatId, req),
      },
      terminalListener: (agentId) => this.commandHooks(agentId),
    });
  }

  private async openFolder(): Promise<string | null> {
    const result = await dialog.showOpenDialog(this.win, { properties: ['openDirectory'] });
    if (result.canceled || !result.filePaths[0]) return null;
    await this.hub.dispose();
    this.root = result.filePaths[0];
    this.worktrees.clear();
    this.hub = this.createHub();
    return this.root;
  }

  /** Resolves a renderer-supplied path, which must be inside the open folder or a task's worktree. */
  private inside(file: unknown): string {
    if (!this.root || typeof file !== 'string') throw new Error('No folder is open.');
    const resolved = path.resolve(this.root, file);
    const roots = [this.root, ...[...this.worktrees.values()].map((w) => w.path)];
    const ok = roots.some((r) => {
      const rel = path.relative(r, resolved);
      return !rel.startsWith('..') && !path.isAbsolute(rel);
    });
    if (!ok) throw new Error('That path is outside the open folder.');
    return resolved;
  }

  private async listDir(dir: unknown): Promise<DirEntry[]> {
    const resolved = this.inside(dir);
    const entries = await readdir(resolved, { withFileTypes: true });
    return entries
      .filter((e) => e.name !== '.git' && e.name !== '.DS_Store')
      .map((e) => ({ name: e.name, path: path.join(resolved, e.name), dir: e.isDirectory() }))
      .sort((a, b) => Number(b.dir) - Number(a.dir) || a.name.localeCompare(b.name));
  }

  private async createChat(agent: AgentId, worktree: boolean, title: string): Promise<ChatInfo> {
    if (!this.root) throw new Error('Open a folder first.');
    if (!worktree) {
      const chat = this.hub.createChat(agent);
      return { chatId: chat.id, cwd: chat.cwd };
    }
    const repo = await git.repoRoot(this.root);
    if (!repo) throw new Error('A separate worktree needs a git repository. Run `git init` and commit once, or untick the option.');
    const wt = await git.createWorktree(repo, title);
    const chat = this.hub.createChat(agent, wt.path);
    this.worktrees.set(chat.id, { ...wt, title });
    return { chatId: chat.id, cwd: wt.path, branch: wt.branch };
  }

  private async prompt(chatId: string, blocks: unknown): Promise<PromptOutcome> {
    const content = Array.isArray(blocks) ? (blocks as acp.ContentBlock[]) : [];
    for (const block of content) {
      if (block.type === 'image') this.showImage(this.id('you'), `data:${block.mimeType};base64,${block.data}`, 'Attached', 'you');
    }
    const agent = this.hub.getChat(chatId)?.agentId;
    this.turns.begin(chatId);
    try {
      const result = await this.hub.prompt(chatId, content);
      return { ok: true, stopReason: result.stopReason };
    } catch (err) {
      this.settleChat(chatId);
      if (err instanceof AuthRequiredError) {
        return {
          ok: false,
          kind: 'auth',
          message: err.message,
          loginHint: agent ? this.spec(agent).loginHint : '',
          methods: err.methods.map((m) => ({
            id: m.id,
            name: m.name,
            description: m.description ?? undefined,
            terminal: 'type' in m && m.type === 'terminal',
          })),
        };
      }
      if (err instanceof AgentStartError && err.failure === 'not_installed') {
        return { ok: false, kind: 'not_installed', message: err.message, installCommand: err.spec.installCommand };
      }
      return { ok: false, kind: 'error', message: messageOf(err) };
    } finally {
      const changed = this.turns.latest(chatId);
      if (changed) this.emit({ type: 'turnChanges', chatId, ...changed });
    }
  }

  private askPermission(chatId: string, req: acp.RequestPermissionRequest, signal: AbortSignal): Promise<acp.RequestPermissionResponse> {
    const requestId = this.id('perm');
    return new Promise((resolve) => {
      const done = (answer: acp.RequestPermissionResponse) => {
        if (!this.permissions.delete(requestId)) return;
        this.emit({ type: 'permissionClosed', requestId });
        resolve(answer);
      };
      this.permissions.set(requestId, { chatId, resolve: done });
      signal.addEventListener('abort', () => done({ outcome: { outcome: 'cancelled' } }), { once: true });
      this.emit({
        type: 'permission',
        requestId,
        chatId,
        title: req.toolCall.title ?? 'The agent wants to use a tool',
        toolKind: req.toolCall.kind ?? undefined,
        options: req.options,
      });
    });
  }

  /** Every agent write waits for the user to review the diff, and is recorded for undo. */
  private async reviewWrite(chatId: string | undefined, req: acp.WriteTextFileRequest): Promise<void> {
    const reviewId = this.id('write');
    const before = await readIfExists(req.path);
    const decision = await new Promise<{ accept: boolean; content?: string }>((resolve) => {
      this.writes.set(reviewId, {
        chatId,
        resolve: (value) => {
          if (!this.writes.delete(reviewId)) return;
          this.emit({ type: 'writeReviewClosed', reviewId });
          resolve(value);
        },
      });
      this.emit({ type: 'writeReview', reviewId, chatId, path: req.path, before, after: req.content });
    });
    if (!decision.accept) throw new Error(`The user rejected the change to ${req.path}.`);
    if (chatId) this.turns.record(chatId, req.path, before);
    await writeTextFile(req.path, decision.content ?? req.content);
    this.emit({ type: 'fileChanged', path: req.path });
  }

  /** Every agent command waits for approval, then streams to the commands panel. */
  private commandHooks(agentId: AgentId): TerminalListener {
    const label = this.spec(agentId).label;
    const ids = new Map<string, { commandId: string; chatId?: string }>();
    return {
      approve: (info) => {
        const commandId = this.id('cmd');
        const chatId = this.hub.chatIdForSession(info.sessionId);
        ids.set(info.terminalId, { commandId, chatId });
        const base = { type: 'command', commandId, chatId, agent: label, commandLine: info.commandLine, cwd: info.cwd } as const;
        this.emit({ ...base, state: 'awaiting' });
        return new Promise<boolean>((resolve) => {
          this.commands.set(commandId, {
            chatId,
            resolve: (ok) => {
              if (!this.commands.delete(commandId)) return;
              this.emit({ ...base, state: ok ? 'running' : 'denied' });
              resolve(ok);
            },
          });
        });
      },
      onStart: () => {},
      onData: (terminalId, data) => {
        const known = ids.get(terminalId);
        if (known) this.emit({ type: 'commandOutput', commandId: known.commandId, data });
      },
      onExit: (terminalId, status) => {
        const known = ids.get(terminalId);
        if (!known) return;
        this.emit({ type: 'command', ...known, agent: label, commandLine: '', cwd: '', state: 'exited', exitCode: status.exitCode });
      },
    };
  }

  /** A cancelled or failed turn must not leave reviews or commands waiting forever. */
  private settleChat(chatId: string): void {
    for (const p of [...this.permissions.values()]) if (p.chatId === chatId) p.resolve({ outcome: { outcome: 'cancelled' } });
    for (const p of [...this.writes.values()]) if (p.chatId === chatId) p.resolve({ accept: false });
    for (const p of [...this.commands.values()]) if (p.chatId === chatId) p.resolve(false);
  }

  /** Images the agent reads or produces go to the images panel. */
  private async collectImages(update: acp.SessionUpdate): Promise<void> {
    if (update.sessionUpdate === 'agent_message_chunk' && update.content.type === 'image') {
      const { data, mimeType } = update.content;
      this.showImage(this.id('msg'), `data:${mimeType};base64,${data}`, 'From the agent', 'agent');
      return;
    }
    if (update.sessionUpdate !== 'tool_call' && update.sessionUpdate !== 'tool_call_update') return;
    for (const item of update.content ?? []) {
      if (item.type === 'content' && item.content.type === 'image') {
        this.showImage(this.id('tool'), `data:${item.content.mimeType};base64,${item.content.data}`, update.title ?? 'Tool output', 'agent');
      }
    }
    for (const loc of update.locations ?? []) {
      const type = IMAGE_TYPES[path.extname(loc.path).toLowerCase()];
      if (!type || this.shownImages.has(loc.path)) continue;
      try {
        const bytes = await readFile(loc.path);
        if (bytes.length > MAX_IMAGE_BYTES) continue;
        this.showImage(loc.path, `data:${type};base64,${bytes.toString('base64')}`, path.basename(loc.path), 'agent');
      } catch {
        // The agent may report paths that don't exist yet.
      }
    }
  }

  private showImage(id: string, src: string, title: string, from: 'agent' | 'you'): void {
    this.shownImages.add(id);
    this.emit({ type: 'image', image: { id, src, title, from } });
  }

  private async memory(): Promise<MemoryReport> {
    const procs = await listProcesses();
    const total = await treeMemoryBytes(process.pid, procs);
    const agents = await Promise.all(
      this.hub
        .running()
        .filter((a) => a.pid)
        .map(async (a) => ({ label: a.label, bytes: (await treeMemoryBytes(a.pid!, procs)).bytes })),
    );
    const agentBytes = agents.reduce((sum, a) => sum + a.bytes, 0);
    const mb = (b: number) => Math.round(b / 2 ** 20);
    return { kind: MEMORY_KIND, editorMb: mb(total.bytes - agentBytes), agents: agents.map((a) => ({ label: a.label, mb: mb(a.bytes) })) };
  }
}

async function attempt<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, value: await fn() };
  } catch (err) {
    return { ok: false, message: messageOf(err) };
  }
}

function agentArg(value: unknown): AgentId {
  if (!isAgentId(value)) throw new Error(`Unknown agent ${String(value)}`);
  return value;
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
