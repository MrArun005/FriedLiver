import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { VendorAgentId } from './agents/registry';

export const API_KEY_NAMES = ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'GEMINI_API_KEY'] as const;
export type ApiKeyName = (typeof API_KEY_NAMES)[number];

export interface AgentOverride {
  command?: string;
  args?: string[];
}

export interface Settings {
  idleStopMinutes: number;
  maxRunningAgents: number;
  agents: Partial<Record<VendorAgentId, AgentOverride>>;
}

export const DEFAULT_SETTINGS: Settings = { idleStopMinutes: 10, maxRunningAgents: 2, agents: {} };

/** How well stored keys are protected: by the OS keychain, by obfuscation only, or not storable. */
export type KeyProtection = 'os' | 'basic' | 'none';

/** Electron's safeStorage, injected so tests can run without Electron. */
export interface SecretBox {
  protection(): KeyProtection;
  encrypt(plain: string): Buffer;
  decrypt(sealed: Buffer): string;
}

interface StoredFile {
  settings?: Partial<Settings>;
  keys?: Partial<Record<ApiKeyName, string>>;
}

/**
 * Settings plus API keys in one JSON file under the app's user-data folder.
 * Keys are encrypted with the OS keychain and only ever leave this process as
 * environment variables for the vendor's own CLI.
 */
export class SettingsStore {
  private settings: Settings = structuredClone(DEFAULT_SETTINGS);
  private sealed: Partial<Record<ApiKeyName, string>> = {};

  constructor(
    private readonly file: string,
    private readonly box: SecretBox,
  ) {}

  async load(): Promise<void> {
    try {
      const stored = JSON.parse(await readFile(this.file, 'utf8')) as StoredFile;
      this.settings = sanitize({ ...DEFAULT_SETTINGS, ...stored.settings });
      this.sealed = stored.keys ?? {};
    } catch {
      // First run, or an unreadable file: start from defaults.
    }
  }

  get(): Settings {
    return structuredClone(this.settings);
  }

  async update(change: Partial<Settings>): Promise<Settings> {
    this.settings = sanitize({ ...this.settings, ...change });
    await this.save();
    return this.get();
  }

  keyStatus(): { protection: KeyProtection; saved: Record<ApiKeyName, boolean> } {
    const saved = Object.fromEntries(API_KEY_NAMES.map((k) => [k, Boolean(this.sealed[k])])) as Record<ApiKeyName, boolean>;
    return { protection: this.box.protection(), saved };
  }

  async setKey(name: ApiKeyName, value: string | null): Promise<void> {
    if (!API_KEY_NAMES.includes(name)) throw new Error(`Unknown key ${name}`);
    if (value === null || value.trim() === '') {
      delete this.sealed[name];
    } else {
      if (this.box.protection() === 'none') throw new Error('This system has no way to store secrets safely. Set the key as an environment variable instead.');
      this.sealed[name] = this.box.encrypt(value.trim()).toString('base64');
    }
    await this.save();
  }

  /** Saved keys as environment variables for agent processes. */
  keyEnv(): Record<string, string> {
    const env: Record<string, string> = {};
    for (const name of API_KEY_NAMES) {
      const sealed = this.sealed[name];
      if (!sealed) continue;
      try {
        env[name] = this.box.decrypt(Buffer.from(sealed, 'base64'));
      } catch {
        // Sealed on another machine or user account; ignore it.
      }
    }
    return env;
  }

  private async save(): Promise<void> {
    await mkdir(path.dirname(this.file), { recursive: true });
    const stored: StoredFile = { settings: this.settings, keys: this.sealed };
    await writeFile(this.file, JSON.stringify(stored, null, 2), { mode: 0o600 });
  }
}

function sanitize(s: Settings): Settings {
  const num = (v: unknown, min: number, max: number, fallback: number) =>
    typeof v === 'number' && Number.isFinite(v) ? Math.min(Math.max(Math.round(v), min), max) : fallback;
  const agents: Settings['agents'] = {};
  for (const [id, o] of Object.entries(s.agents ?? {})) {
    if (!['claude', 'codex', 'gemini'].includes(id) || !o) continue;
    agents[id as VendorAgentId] = {
      command: typeof o.command === 'string' && o.command.trim() ? o.command.trim() : undefined,
      args: Array.isArray(o.args) ? o.args.filter((a): a is string => typeof a === 'string') : undefined,
    };
  }
  return {
    idleStopMinutes: num(s.idleStopMinutes, 0, 240, DEFAULT_SETTINGS.idleStopMinutes),
    maxRunningAgents: num(s.maxRunningAgents, 1, 6, DEFAULT_SETTINGS.maxRunningAgents),
    agents,
  };
}
