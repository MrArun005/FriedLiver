import { useEffect, useState } from 'preact/hooks';
import type { ApiKeyName, SettingsView, VendorAgentKey } from '../shared/ipc';
import { api } from './api';
import type { Theme } from './palettes';
import { THEMES } from './themes';
import { Callout, IconButton, toast } from './ui';

const AGENTS: { id: VendorAgentKey; label: string }[] = [
  { id: 'claude', label: 'Claude' },
  { id: 'codex', label: 'GPT (Codex)' },
  { id: 'gemini', label: 'Gemini' },
];
const KEYS: { name: ApiKeyName; label: string }[] = [
  { name: 'ANTHROPIC_API_KEY', label: 'Anthropic (Claude)' },
  { name: 'OPENAI_API_KEY', label: 'OpenAI (Codex)' },
  { name: 'GEMINI_API_KEY', label: 'Google (Gemini)' },
];

export function SettingsDialog({ theme, onTheme, onClose }: { theme: Theme; onTheme(t: Theme): void; onClose(): void }) {
  const [view, setView] = useState<SettingsView | null>(null);
  const [keyInputs, setKeyInputs] = useState<Record<string, string>>({});

  useEffect(() => {
    void api.getSettings().then(setView);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, []);

  if (!view) return null;
  const s = view.settings;
  const update = async (change: Partial<SettingsView['settings']>) => setView(await api.updateSettings(change));
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
            <h3>Appearance</h3>
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
            <p class="hint">
              Optional. Signing in through each agent's own CLI is usually better. A key here is passed only to that agent's process, as
              an environment variable.
            </p>
            {view.keys.protection === 'basic' && (
              <Callout tone="warn">No system keyring was found, so keys are stored with basic protection only.</Callout>
            )}
            {view.keys.protection === 'none' && (
              <Callout tone="error">This system can't store secrets safely. Set keys as environment variables before starting FriedLiver.</Callout>
            )}
            {KEYS.map((k) => (
              <div key={k.name} class="key-row">
                <span>
                  {k.label}
                  <br />
                  <code class="hint">{k.name}</code>
                </span>
                <input
                  type="password"
                  autocomplete="off"
                  value={keyInputs[k.name] ?? ''}
                  placeholder={view.keys.saved[k.name] ? 'Saved (encrypted)' : 'Paste a key'}
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
