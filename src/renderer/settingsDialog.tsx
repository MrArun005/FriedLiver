import { useEffect, useRef, useState } from 'preact/hooks';
import type { AccountStatus, AgentKey, ApiKeyName, SettingsView, SignInMethod, VendorAgentKey } from '../shared/ipc';
import { api } from './api';
import { CODE_FONTS, UI_FONTS, appearance, setAppearance, type Appearance } from './appearance';
import type { Theme } from './palettes';
import { THEMES } from './themes';
import { AgentMark, Icon, type IconName } from './icons';
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
const SECTIONS: { id: string; label: string; icon: IconName }[] = [
  { id: 'accounts', label: 'Accounts', icon: 'user' },
  { id: 'appearance', label: 'Appearance', icon: 'palette' },
  { id: 'agents', label: 'Agents and memory', icon: 'sliders' },
  { id: 'keys', label: 'API keys', icon: 'key' },
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
  const [current, setCurrent] = useState(SECTIONS[0].id);
  const body = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void api.getSettings().then(setView);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, []);

  // The nav follows the scroll: the section whose title passed the top of the pane is current.
  useEffect(() => {
    const pane = body.current;
    if (!pane) return;
    const onScroll = () => {
      const top = pane.getBoundingClientRect().top + 48;
      let at = SECTIONS[0].id;
      for (const sec of SECTIONS) {
        const el = pane.querySelector(`#settings-${sec.id}`);
        if (el && el.getBoundingClientRect().top <= top) at = sec.id;
      }
      if (pane.scrollTop + pane.clientHeight >= pane.scrollHeight - 4) at = SECTIONS.at(-1)!.id;
      setCurrent(at);
    };
    pane.addEventListener('scroll', onScroll, { passive: true });
    return () => pane.removeEventListener('scroll', onScroll);
  }, [view !== null]);

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
      <div class="dialog settings" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <div class="dialog-header">
          <h2 id="settings-title">Settings</h2>
          <span class="spacer" />
          <IconButton icon="close" label="Close settings" onClick={onClose} />
        </div>
        <div class="settings-layout">
          <nav class="settings-nav" aria-label="Settings sections">
            {SECTIONS.map((sec) => (
              <button
                key={sec.id}
                aria-current={current === sec.id}
                onClick={() => {
                  setCurrent(sec.id);
                  body.current?.querySelector(`#settings-${sec.id}`)?.scrollIntoView({ block: 'start' });
                }}
              >
                <Icon name={sec.icon} />
                {sec.label}
              </button>
            ))}
          </nav>
          <div class="dialog-body" ref={body}>
            <section id="settings-accounts">
              <h3>Accounts</h3>
              <p class="hint">
                Sign in with each company's own login. The page you approve is theirs, and the agent keeps the credentials; FriedLiver never sees them.
              </p>
              <div class="card-list">
                {AGENTS.map((a) => (
                  <AccountRow key={`${a.id}-${accountsVersion}`} agent={a.id} label={a.label} onSignIn={onSignIn} onInstall={onInstall} />
                ))}
              </div>
            </section>

            <section id="settings-appearance">
              <h3>Appearance</h3>
              <div class="theme-cards" role="radiogroup" aria-label="Color theme">
                {THEMES.map((t) => (
                  <label key={t.id} class="theme-card" data-selected={t.id === theme.id}>
                    <input type="radio" class="visually-hidden" name="theme" checked={t.id === theme.id} onChange={() => onTheme(t)} />
                    <span class="theme-preview" style={{ background: t.ui.bg, borderColor: t.ui.border }} aria-hidden="true">
                      <span style={{ background: t.ui.panel, borderRight: `1px solid ${t.ui.border}` }} />
                      <span class="code">
                        <span style={{ background: t.syntax.keyword, width: '38%' }} />
                        <span style={{ background: t.syntax.string, width: '70%' }} />
                        <span style={{ background: t.syntax.type, width: '52%' }} />
                        <span style={{ background: t.ui['accent-bg'], width: '28%', marginTop: 'auto' }} />
                      </span>
                    </span>
                    <span class="name">
                      {t.name}
                      {t.id === theme.id && <Icon name="check" />}
                    </span>
                  </label>
                ))}
              </div>
              <div class="grid-2">
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

            <section id="settings-agents">
              <h3>Agents and memory</h3>
              <p class="hint">Each agent is a separate process of a few hundred MB. Fewer at once and a short idle stop keep FriedLiver light.</p>
              <div class="grid-2">
                <label class="field">
                  <span>Agents running at once</span>
                  <input
                    type="number"
                    min={1}
                    max={6}
                    value={s.maxRunningAgents}
                    onChange={(e) => void update({ maxRunningAgents: Number(e.currentTarget.value) })}
                  />
                </label>
                <label class="field">
                  <span>Stop idle agents after (minutes, 0 = never)</span>
                  <input
                    type="number"
                    min={0}
                    max={240}
                    value={s.idleStopMinutes}
                    onChange={(e) => void update({ idleStopMinutes: Number(e.currentTarget.value) })}
                  />
                </label>
              </div>
              <h4>Commands</h4>
              {AGENTS.map((a) => (
                <div key={a.id} class="grid-2">
                  <label class="field">
                    <span>{a.label} command</span>
                    <input
                      value={s.agents[a.id]?.command ?? ''}
                      placeholder={view.defaults[a.id].command}
                      onChange={(e) => setAgent(a.id, 'command', e.currentTarget.value)}
                    />
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

            <section id="settings-keys">
              <h3>API keys</h3>
              <p class="hint">Optional, instead of signing in. A key is passed only to that agent's process, as an environment variable.</p>
              {view.keys.protection === 'basic' && <Callout tone="warn">No system keyring was found, so keys are stored with basic protection only.</Callout>}
              {view.keys.protection === 'none' && (
                <Callout tone="error">This system can't store secrets safely. Set keys as environment variables before starting FriedLiver.</Callout>
              )}
              <div class="card-list">
                {KEYS.map((k) => (
                  <div key={k.name} class="key-row">
                    <span class="label">
                      {k.label}
                      <button class="link hint" onClick={() => void api.openExternal(k.url)}>
                        Get a key
                        <Icon name="external" />
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
              </div>
            </section>
          </div>
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
      <AgentMark agent={agent} />
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
