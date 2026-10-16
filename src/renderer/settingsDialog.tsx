import { useEffect, useState } from 'preact/hooks';
import type { AccountStatus, AgentKey, ApiKeyName, SettingsView, SignInMethod, VendorAgentKey } from '../shared/ipc';
import { api } from './api';
import { CODE_FONTS, UI_FONTS, appearance, setAppearance, type Appearance } from './appearance';
import type { Theme } from './palettes';
import { THEMES } from './themes';
import { Callout, IconButton, toast } from './ui';

const AGENTS: { id: VendorAgentKey; label: string }[] = [
  { id: 'claude', label: 'Claude' },
  { id: 'codex', label: 'GPT (Codex)' },
  { id: 'gemini', label: 'Gemini' },
];
const KEYS: { name: ApiKeyName; label: string; url: string }[] = [
  { name: 'ANTHROPIC_API_KEY', label: 'Anthropic (Claude)', url: 'https://console.anthropic.com/settings/keys' },
  { name: 'OPENAI_API_KEY', label: 'OpenAI (Codex)', url: 'https://platform.openai.com/api-keys' },
  { name: 'GEMINI_API_KEY', label: 'Google (Gemini)', url: 'https://aistudio.google.com/apikey' },
];
const SAMPLE = `const total = items.reduce((sum, i) => sum + i.price, 0);
if (total >= 100 && user !== null) { /* 0O 1lI {}[] */ }`;

export interface SettingsDialogProps {
  theme: Theme;
  /** Bumped after a sign-in finishes, so the accounts list re-checks. */
  accountsVersion: number;
  onTheme(t: Theme): void;
  onSignIn(agent: AgentKey, method: SignInMethod): void;
  onInstall(command: string): void;
  onClose(): void;
}

export function SettingsDialog({ theme, accountsVersion, onTheme, onSignIn, onInstall, onClose }: SettingsDialogProps) {
  const [view, setView] = useState<SettingsView | null>(null);
  const [keyInputs, setKeyInputs] = useState<Record<string, string>>({});
  const [fonts, setFonts] = useState<Appearance>(appearance());

  useEffect(() => {
    void api.getSettings().then(setView);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, []);

  if (!view) return null;
  const s = view.settings;
  const update = async (change: Partial<SettingsView['settings']>) => setView(await api.updateSettings(change));
  const setFont = (change: Partial<Appearance>) => setFonts(setAppearance(change));
  const setAgent = (id: VendorAgentKey, field: 'command' | 'args', value: string) =>
    void update({
      agents: {
        ...s.agents,
        [id]: { ...s.agents[id], [field]: field === 'args' ? (value.trim() ? value.trim().split(/\s+/) : undefined) : value || undefined },
      },
    });
  const saveKey = async (name: ApiKeyName, value: string | null) => {
    const r = await api.setApiKey(name, value);
    if (!r.ok) return toast(r.message, 'error');
    setView(r.value);
    setKeyInputs((k) => ({ ...k, [name]: '' }));
    toast(value ? 'Key saved. Agents restart with it on the next message.' : 'Key removed.', 'success');
  };

  return (
    <div class="scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <div class="dialog-header">
          <h2 id="settings-title">Settings</h2>
          <span class="spacer" />
          <IconButton icon="close" label="Close settings" onClick={onClose} />
        </div>
        <div class="dialog-body">
          <section>
            <h3>Accounts</h3>
            <p class="hint">
              Sign in with each company's own login. The page you approve is theirs, and the agent keeps the credentials; FriedLiver
              never sees them.
            </p>
            {AGENTS.map((a) => (
              <AccountRow key={`${a.id}-${accountsVersion}`} agent={a.id} label={a.label} onSignIn={onSignIn} onInstall={onInstall} />
            ))}
          </section>

          <section>
            <h3>Appearance</h3>
            <div class="grid-2">
              <label class="field">
                <span>Theme</span>
                <select value={theme.id} onChange={(e) => onTheme(THEMES.find((t) => t.id === e.currentTarget.value) ?? theme)}>
                  {THEMES.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </label>
              <label class="field">
                <span>Interface font</span>
                <select value={fonts.uiFont} onChange={(e) => setFont({ uiFont: e.currentTarget.value as Appearance['uiFont'] })}>
                  {Object.entries(UI_FONTS).map(([id, f]) => (
                    <option key={id} value={id}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </label>
              <label class="field">
                <span>Code font (editor and terminal)</span>
                <select value={fonts.codeFont} onChange={(e) => setFont({ codeFont: e.currentTarget.value as Appearance['codeFont'] })}>
                  {Object.entries(CODE_FONTS).map(([id, f]) => (
                    <option key={id} value={id}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </label>
              <label class="field">
                <span>Code size</span>
                <input type="number" min={10} max={22} value={fonts.codeSize} onChange={(e) => setFont({ codeSize: Number(e.currentTarget.value) })} />
              </label>
            </div>
            <label class="check">
              <input type="checkbox" checked={fonts.ligatures} onChange={(e) => setFont({ ligatures: e.currentTarget.checked })} />
              Ligatures (<code>=&gt;</code> and <code>!==</code> drawn as single symbols)
            </label>
            <div class="font-preview" aria-label="Font preview">
              <div style={{ fontFamily: UI_FONTS[fonts.uiFont].stack }}>
                Interface: The agent wants to run <strong>npm test</strong>. Approve, deny, or open the diff. 1234567890
              </div>
              <pre
                style={{
                  fontFamily: CODE_FONTS[fonts.codeFont].stack,
                  fontSize: `${fonts.codeSize}px`,
                  lineHeight: 1.55,
                  fontVariantLigatures: fonts.ligatures ? 'normal' : 'none',
                }}
              >
                {SAMPLE}
              </pre>
            </div>
          </section>

          <section>
            <h3>Agents and memory</h3>
            <div class="grid-2">
              <label class="field">
                <span>Agents running at once</span>
                <input type="number" min={1} max={6} value={s.maxRunningAgents} onChange={(e) => void update({ maxRunningAgents: Number(e.currentTarget.value) })} />
              </label>
              <label class="field">
                <span>Stop idle agents after (minutes, 0 = never)</span>
                <input type="number" min={0} max={240} value={s.idleStopMinutes} onChange={(e) => void update({ idleStopMinutes: Number(e.currentTarget.value) })} />
              </label>
            </div>
            {AGENTS.map((a) => (
              <div key={a.id} class="grid-2">
                <label class="field">
                  <span>{a.label} command</span>
                  <input value={s.agents[a.id]?.command ?? ''} placeholder={view.defaults[a.id].command} onChange={(e) => setAgent(a.id, 'command', e.currentTarget.value)} />
                </label>
                <label class="field">
                  <span>Arguments</span>
                  <input
                    value={s.agents[a.id]?.args?.join(' ') ?? ''}
                    placeholder={view.defaults[a.id].args.join(' ') || '(none)'}
                    onChange={(e) => setAgent(a.id, 'args', e.currentTarget.value)}
                  />
                </label>
              </div>
            ))}
          </section>

          <section>
            <h3>API keys</h3>
            <p class="hint">Optional, instead of signing in. A key is passed only to that agent's process, as an environment variable.</p>
            {view.keys.protection === 'basic' && <Callout tone="warn">No system keyring was found, so keys are stored with basic protection only.</Callout>}
            {view.keys.protection === 'none' && (
              <Callout tone="error">This system can't store secrets safely. Set keys as environment variables before starting FriedLiver.</Callout>
            )}
            {KEYS.map((k) => (
              <div key={k.name} class="key-row">
                <span>
                  {k.label}
                  <br />
                  <button class="link hint" style={{ padding: 0 }} onClick={() => void api.openExternal(k.url)}>
                    Get a key ↗
                  </button>
                </span>
                <input
                  type="password"
                  autocomplete="off"
                  value={keyInputs[k.name] ?? ''}
                  placeholder={view.keys.saved[k.name] ? 'Saved (encrypted)' : k.name}
                  aria-label={`${k.label} API key`}
                  onInput={(e) => setKeyInputs((v) => ({ ...v, [k.name]: e.currentTarget.value }))}
                />
                {keyInputs[k.name] ? (
                  <button class="primary sm" onClick={() => void saveKey(k.name, keyInputs[k.name])}>
                    Save
                  </button>
                ) : view.keys.saved[k.name] ? (
                  <button class="danger sm" onClick={() => void saveKey(k.name, null)}>
                    Remove
                  </button>
                ) : (
                  <span />
                )}
              </div>
            ))}
          </section>
        </div>
      </div>
    </div>
  );
}

const STATUS_TEXT: Record<AccountStatus['status'], string> = {
  'signed-in': 'Signed in',
  'needs-sign-in': 'Not signed in',
  'not-installed': 'Not installed',
  error: 'Problem',
};
const STATUS_DOT: Record<AccountStatus['status'], string> = { 'signed-in': 'done', 'needs-sign-in': 'needs-you', 'not-installed': 'idle', error: 'error' };

/**
 * Checking starts the agent and asks it for a session, which needs no model
 * call. It's on demand, because each agent costs a few hundred MB while it runs.
 */
function AccountRow({
  agent,
  label,
  onSignIn,
  onInstall,
}: {
  agent: VendorAgentKey;
  label: string;
  onSignIn: SettingsDialogProps['onSignIn'];
  onInstall: SettingsDialogProps['onInstall'];
}) {
  const [status, setStatus] = useState<AccountStatus | 'checking' | null>(null);
  const check = async () => {
    setStatus('checking');
    setStatus(await api.checkSignIn(agent));
  };
  const methods = status && status !== 'checking' ? status.methods.filter((m) => m.kind !== 'key') : [];
  return (
    <div class="account-row">
      <strong>{label}</strong>
      <span class="status-text" title={status && status !== 'checking' ? status.message : undefined}>
        {status === null && 'Not checked'}
        {status === 'checking' && (
          <>
            <span class="dot" data-state="working" /> Checking…
          </>
        )}
        {status && status !== 'checking' && (
          <>
            <span class="dot" data-state={STATUS_DOT[status.status]} /> {STATUS_TEXT[status.status]}
          </>
        )}
      </span>
      <span class="actions">
        {methods.map((m) => (
          <button key={m.id} class="sm primary" title={m.description} onClick={() => onSignIn(agent, m)}>
            {m.name}
          </button>
        ))}
        {status && status !== 'checking' && status.status === 'not-installed' && status.installCommand && (
          <button class="sm" onClick={() => onInstall(status.installCommand!)}>
            Install
          </button>
        )}
        <button class="sm" disabled={status === 'checking'} onClick={() => void check()}>
          {status === null ? 'Check' : 'Check again'}
        </button>
      </span>
    </div>
  );
}
