import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import type * as acp from '@agentclientprotocol/sdk';
import { dialog, ipcMain, type BrowserWindow } from 'electron';
import type { AgentKey, AgentOption, DirEntry, FriedLiverApi, MainEvent, MemoryReport, PromptOutcome } from '../shared/ipc';
import { CHANNELS } from '../shared/ipc';
import { AgentStartError } from './agents/agentConnection';
import { readIfExists, readTextFile, writeTextFile } from './agents/fileAccess';
import { AgentHub, AuthRequiredError } from './agents/hub';
import { AGENT_IDS, DEFAULT_AGENTS, demoAgentSpec, isAgentId, type AgentId, type AgentSpec } from './agents/registry';
import type { TerminalListener } from './agents/terminals';
import { MEMORY_KIND, listProcesses, treeMemoryBytes } from './ram/processTree';

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
const IDLE_STOP_MS = 10 * 60 * 1000;

type Pending<T> = { chatId?: string; resolve: (value: T) => void };

/** Owns the agents, the open folder and every file write or command, and talks to the window. */
export class AppController {
  private root: string | null;
  private hub: AgentHub;
  private nextId = 1;
  private readonly permissions = new Map<string, Pending<acp.RequestPermissionResponse>>();
  private readonly writes = new Map<string, Pending<{ accept: boolean; content?: string }>>();
  private readonly commands = new Map<string, Pending<boolean>>();
  private readonly shownImages = new Set<string>();

  constructor(
    private readonly win: BrowserWindow,
    private readonly options: { initialFolder: string | null; demoAgentScript: string; version: string },
  ) {
    this.root = options.initialFolder;
    this.hub = this.createHub();
  }

  register(): void {
    const api: Omit<FriedLiverApi, 'versions' | 'onEvent'> = {
      initialFolder: async () => this.root,
      openFolder: () => this.openFolder(),
      listDir: (dir) => this.listDir(dir),
      readFile: async (file) => {
        const resolved = this.inside(file);
        const text = await readFile(resolved, 'utf8');
        if (Buffer.byteLength(text) > MAX_EDITOR_FILE_BYTES) throw new Error('File is too large to open.');
        return text;
      },
      writeFile: async (file, content) => {
        await writeTextFile(this.inside(file), String(content));
      },
      agents: async () => AGENT_IDS.map((id): AgentOption => ({ id, label: this.spec(id).label })),
      createChat: async (agent) => this.hub.createChat(agentArg(agent)).id,
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
        this.permissions.get(requestId)?.resolve(
          optionId ? { outcome: { outcome: 'selected', optionId } } : { outcome: { outcome: 'cancelled' } },
        );
      },
      respondWrite: async (reviewId, accept, content) => {
        this.writes.get(reviewId)?.resolve({ accept: accept === true, content: typeof content === 'string' ? content : undefined });
      },
      respondCommand: async (commandId, approve) => {
        this.commands.get(commandId)?.resolve(approve === true);
      },
      stopAgents: () => this.hub.stopAll(),
      memory: () => this.memory(),
    };
    for (const [name, handler] of Object.entries(api)) {
      const channel = CHANNELS[name as keyof typeof CHANNELS];
      ipcMain.handle(channel, (_event, ...args: unknown[]) => (handler as (...a: unknown[]) => unknown)(...args));
    }
  }

  async dispose(): Promise<void> {
    for (const name of Object.keys(CHANNELS)) ipcMain.removeHandler(CHANNELS[name as keyof typeof CHANNELS]);
    await this.hub.dispose();
  }

  private emit(event: MainEvent): void {
    if (!this.win.isDestroyed()) this.win.webContents.send(CHANNELS.event, event);
  }

  private id(prefix: string): string {
    return `${prefix}-${this.nextId++}`;
  }

  private spec(id: AgentId): AgentSpec {
    return id === 'demo' ? demoAgentSpec(this.options.demoAgentScript) : DEFAULT_AGENTS[id];
  }

  private createHub(): AgentHub {
    return new AgentHub({
      cwd: this.root ?? process.cwd(),
      clientVersion: this.options.version,
      resolveSpec: (id) => this.spec(id),
      idleStopMs: IDLE_STOP_MS,
      maxRunning: 1,
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
    this.hub = this.createHub();
    return this.root;
  }

  private inside(file: unknown): string {
    if (!this.root || typeof file !== 'string') throw new Error('No folder is open.');
    const resolved = path.resolve(this.root, file);
    const rel = path.relative(this.root, resolved);
    if (rel.startsWith('..') || path.isAbsolute(rel)) throw new Error('That path is outside the open folder.');
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

  private async prompt(chatId: string, blocks: unknown): Promise<PromptOutcome> {
    const content = Array.isArray(blocks) ? (blocks as acp.ContentBlock[]) : [];
    for (const block of content) {
      if (block.type === 'image') this.showImage(`you-${this.nextId++}`, `data:${block.mimeType};base64,${block.data}`, 'Attached', 'you');
    }
    const agent = this.hub.getChat(chatId)?.agentId;
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

  /** Every agent write waits for the user to review the diff. */
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
    await writeTextFile(req.path, decision.content ?? req.content);
    this.emit({ type: 'fileChanged', path: req.path });
  }

  /** Every agent command waits for approval, then streams to the commands panel. */
  private commandHooks(agentId: AgentId): TerminalListener {
    const label = this.spec(agentId).label;
    const ids = new Map<string, string>();
    return {
      approve: (info) => {
        const commandId = this.id('cmd');
        ids.set(info.terminalId, commandId);
        const base = { type: 'command', commandId, agent: label, commandLine: info.commandLine, cwd: info.cwd } as const;
        this.emit({ ...base, state: 'awaiting' });
        return new Promise<boolean>((resolve) => {
          this.commands.set(commandId, {
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
        const commandId = ids.get(terminalId);
        if (commandId) this.emit({ type: 'commandOutput', commandId, data });
      },
      onExit: (terminalId, status) => {
        const commandId = ids.get(terminalId);
        if (!commandId) return;
        this.emit({ type: 'command', commandId, agent: label, commandLine: '', cwd: '', state: 'exited', exitCode: status.exitCode });
      },
    };
  }

  /** A cancelled or failed turn must not leave reviews waiting forever. */
  private settleChat(chatId: string): void {
    for (const p of [...this.permissions.values()]) if (p.chatId === chatId) p.resolve({ outcome: { outcome: 'cancelled' } });
    for (const p of [...this.writes.values()]) if (p.chatId === chatId) p.resolve({ accept: false });
  }

  /** Images the agent reads or produces go to the images panel on the right. */
  private async collectImages(update: acp.SessionUpdate): Promise<void> {
    if (update.sessionUpdate === 'agent_message_chunk' && update.content.type === 'image') {
      const { data, mimeType } = update.content;
      this.showImage(`msg-${this.nextId++}`, `data:${mimeType};base64,${data}`, 'From the agent', 'agent');
      return;
    }
    if (update.sessionUpdate !== 'tool_call' && update.sessionUpdate !== 'tool_call_update') return;
    for (const item of update.content ?? []) {
      if (item.type === 'content' && item.content.type === 'image') {
        this.showImage(`tool-${this.nextId++}`, `data:${item.content.mimeType};base64,${item.content.data}`, update.title ?? 'Tool output', 'agent');
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

function agentArg(value: unknown): AgentKey {
  if (!isAgentId(value)) throw new Error(`Unknown agent ${String(value)}`);
  return value;
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
