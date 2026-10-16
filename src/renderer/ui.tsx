import type { ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { Icon, type IconName } from './icons';

export type Tone = 'info' | 'warn' | 'error' | 'success';

/** Square button with only an icon. The label is required: it is the accessible name and tooltip. */
export function IconButton({
  icon,
  label,
  onClick,
  size,
  pressed,
  disabled,
}: {
  icon: IconName;
  label: string;
  onClick(): void;
  size?: 'sm';
  pressed?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      class={`icon ghost${size ? ` ${size}` : ''}`}
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      <Icon name={icon} />
    </button>
  );
}

export function Callout({ tone, title, children }: { tone: Tone; title?: string; children?: ComponentChildren }) {
  return (
    <div class="callout" data-tone={tone} role={tone === 'error' ? 'alert' : undefined}>
      {title && <div class="callout-title">{title}</div>}
      {children}
    </div>
  );
}

export function PaneHeader({ title, children }: { title: string; children?: ComponentChildren }) {
  return (
    <div class="pane-header">
      <span>{title}</span>
      <span class="spacer" />
      {children}
    </div>
  );
}

// ---- Toasts: short-lived feedback for actions that don't belong in a transcript. ----

interface Toast {
  id: number;
  tone: Tone;
  text: string;
}

let nextToast = 1;
const listeners = new Set<(toasts: Toast[]) => void>();
let toasts: Toast[] = [];

export function toast(text: string, tone: Tone = 'info'): void {
  const t = { id: nextToast++, tone, text };
  toasts = [...toasts, t];
  listeners.forEach((l) => l(toasts));
  setTimeout(() => {
    toasts = toasts.filter((x) => x.id !== t.id);
    listeners.forEach((l) => l(toasts));
  }, tone === 'error' ? 8000 : 4000);
}

export function Toasts() {
  const [list, setList] = useState(toasts);
  useEffect(() => {
    listeners.add(setList);
    return () => void listeners.delete(setList);
  }, []);
  return (
    <div class="toasts" aria-live="polite">
      {list.map((t) => (
        <div key={t.id} class="callout toast" data-tone={t.tone}>
          {t.text}
        </div>
      ))}
    </div>
  );
}

export const basename = (p: string) => p.split(/[\\/]/).pop() ?? p;
export const isMac = () => window.friedliver.platform === 'darwin';
export const modKey = () => (isMac() ? '⌘' : 'Ctrl');

/**
 * Joins a folder from the main process with a `/`-separated relative path,
 * keeping the folder's separator so Windows paths stay `C:\\x\\y` and tabs
 * opened from quick open match tabs opened from the tree.
 */
export function joinPath(root: string, rel: string): string {
  const sep = root.includes('\\') && !root.includes('/') ? '\\' : '/';
  return `${root.replace(/[\\/]+$/, '')}${sep}${rel.split('/').join(sep)}`;
}
