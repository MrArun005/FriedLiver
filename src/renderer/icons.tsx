import type { AgentKey } from '../shared/ipc';

// 16px line icons on a 24px grid. Stroke uses currentColor so icons follow text color and themes.
const PATHS = {
  files: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z M14 3v5h5',
  file: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z M14 3v5h5',
  folder: 'M3.5 7.5a2 2 0 0 1 2-2h3.6l2 2h7.4a2 2 0 0 1 2 2v7.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z',
  search: 'M11 4a7 7 0 1 0 0 14a7 7 0 1 0 0-14 M20 20l-4-4',
  git: 'M6 3v12 M18 9a3 3 0 1 0 0-6a3 3 0 0 0 0 6 M6 21a3 3 0 1 0 0-6a3 3 0 0 0 0 6 M18 9a9 9 0 0 1-9 9',
  agents: 'M12 3v3 M8 8h8a3 3 0 0 1 3 3v5a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3v-5a3 3 0 0 1 3-3z M9.5 13h.01 M14.5 13h.01',
  terminal: 'M4 5h16v14H4z M8 10l2 2-2 2 M12 15h4',
  settings:
    'M12 9a3 3 0 1 0 0 6a3 3 0 0 0 0-6 M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-2.9-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 3 14H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.2-2.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 10 3.1V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0 1.2 2.9h.1a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  plus: 'M12 5v14 M5 12h14',
  close: 'M6 6l12 12 M18 6L6 18',
  center: 'M4 5h16v14H4z M9 5v14 M15 5v14',
  side: 'M4 5h16v14H4z M15 5v14',
  undo: 'M9 14L4 9l5-5 M4 9h10a6 6 0 0 1 0 12h-3',
  stop: 'M7 7h10v10H7z',
  refresh: 'M20 11a8 8 0 1 0-2.3 5.7 M20 4v7h-7',
  merge: 'M6 3v18 M6 9a9 9 0 0 0 9 9h3 M18 15l3 3-3 3',
  trash: 'M4 7h16 M10 11v6 M14 11v6 M6 7l1 13h10l1-13 M9 7V4h6v3',
  image: 'M4 5h16v14H4z M4 16l5-5 4 4 2-2 5 5 M15 9h.01',
  'chevron-right': 'M9.5 6l6 6-6 6',
  'chevron-down': 'M6 9.5l6 6 6-6',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  'check-circle': 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18 M8.2 12.4l2.6 2.6 5-5.2',
  circle: 'M12 4.5a7.5 7.5 0 1 0 0 15a7.5 7.5 0 1 0 0-15',
  info: 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18 M12 11v5 M12 7.8h.01',
  alert: 'M10.3 4.3L2.6 17.6A2 2 0 0 0 4.3 20.6h15.4a2 2 0 0 0 1.7-3L13.7 4.3a2 2 0 0 0-3.4 0z M12 9.5v4 M12 17h.01',
  'alert-circle': 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18 M12 7.5v5.5 M12 16.3h.01',
  'arrow-up': 'M12 19V5 M6 11l6-6 6 6',
  paperclip: 'M20 11.5l-8.3 8.3a5 5 0 0 1-7.1-7.1l8.6-8.6a3.3 3.3 0 0 1 4.7 4.7l-8.6 8.6a1.7 1.7 0 0 1-2.4-2.4l7.9-7.9',
  shield: 'M12 3l7 3v6c0 4.5-3 7.7-7 9-4-1.3-7-4.5-7-9V6z M9 12l2 2 4-4',
  eye: 'M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z M12 9.5a2.5 2.5 0 1 0 0 5a2.5 2.5 0 1 0 0-5',
  pencil: 'M4 20h4L19 9l-4-4L4 16z M13.5 6.5l4 4',
  globe: 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18 M3 12h18 M12 3c2.4 2.5 3.6 5.5 3.6 9s-1.2 6.5-3.6 9c-2.4-2.5-3.6-5.5-3.6-9S9.6 5.5 12 3',
  sparkle: 'M12 3.5l1.9 5.4 5.6 1.6-5.6 1.6L12 17.5l-1.9-5.4-5.6-1.6 5.6-1.6z M18.5 16.5l.6 1.6 1.6.6-1.6.6-.6 1.6-.6-1.6-1.6-.6 1.6-.6z',
  play: 'M7.5 5.5l11 6.5-11 6.5z',
  cpu: 'M7 7h10v10H7z M10 3.5V7 M14 3.5V7 M10 17v3.5 M14 17v3.5 M3.5 10H7 M3.5 14H7 M17 10h3.5 M17 14h3.5',
  list: 'M9 6h11 M9 12h11 M9 18h11 M4.5 6h.01 M4.5 12h.01 M4.5 18h.01',
  external: 'M14 4h6v6 M20 4l-9 9 M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5',
  key: 'M14.5 4a5.5 5.5 0 1 0 0 11a5.5 5.5 0 1 0 0-11 M10.6 13.4L3.5 20.5 M6.5 17.5l2.2 2.2 M8.6 15.4l2 2',
  user: 'M12 4a4 4 0 1 0 0 8a4 4 0 1 0 0-8 M4.5 20.5a7.5 7.5 0 0 1 15 0',
  palette:
    'M12 3a9 9 0 1 0 0 18c1 0 1.6-.8 1.6-1.6 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7-.5-1.2 0-.9.7-1.6 1.6-1.6h1.9a5 5 0 0 0 5-5C21.1 6.4 17 3 12 3z M7.5 11.5h.01 M10 7.5h.01 M15 7.5h.01',
  sliders: 'M4 7h9 M17 7h3 M4 17h3 M11 17h9 M15 4.5v5 M9 14.5v5',
  'agent-claude': 'M12 4v16 M4 12h16 M6.4 6.4l11.2 11.2 M17.6 6.4L6.4 17.6',
  'agent-codex': 'M12 3.5l7.4 4.25v8.5L12 20.5l-7.4-4.25v-8.5z M4.6 7.75L12 12l7.4-4.25 M12 12v8.5',
  'agent-gemini': 'M12 3.5c.7 4.6 3.9 7.8 8.5 8.5-4.6.7-7.8 3.9-8.5 8.5-.7-4.6-3.9-7.8-8.5-8.5 4.6-.7 7.8-3.9 8.5-8.5z',
  'agent-demo': 'M9 3.5h6 M10.2 3.5v6L5.3 17.8a1.8 1.8 0 0 0 1.6 2.7h10.2a1.8 1.8 0 0 0 1.6-2.7l-4.9-8.3v-6 M7.6 14.5h8.8',
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, label }: { name: IconName; label?: string }) {
  return (
    <svg
      class="icon-svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.7"
      stroke-linecap="round"
      stroke-linejoin="round"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : 'true'}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}

/**
 * Each agent's mark: one glyph in the agent's own color on a tinted tile, so a
 * chat, a task or an account row says who is working before you read the name.
 */
export function AgentMark({ agent, size = 'md' }: { agent: AgentKey; size?: 'sm' | 'md' | 'lg' }) {
  return (
    <span class="agent-mark" data-agent={agent} data-size={size} aria-hidden="true">
      <Icon name={`agent-${agent}`} />
    </span>
  );
}

/** File-type tint from the theme's syntax colors, so the tree and tabs follow the editor's palette. */
const FILE_TONES: Record<string, string> = {
  ts: 'var(--syntax-type)',
  tsx: 'var(--syntax-type)',
  mts: 'var(--syntax-type)',
  cts: 'var(--syntax-type)',
  js: 'var(--warn)',
  jsx: 'var(--warn)',
  mjs: 'var(--warn)',
  cjs: 'var(--warn)',
  json: 'var(--syntax-number)',
  md: 'var(--syntax-string)',
  css: 'var(--syntax-regexp)',
  scss: 'var(--syntax-regexp)',
  html: 'var(--bad)',
  py: 'var(--syntax-keyword)',
  rs: 'var(--bad)',
  go: 'var(--syntax-type)',
  sh: 'var(--ok)',
  yml: 'var(--syntax-regexp)',
  yaml: 'var(--syntax-regexp)',
  svg: 'var(--warn)',
  png: 'var(--syntax-number)',
  jpg: 'var(--syntax-number)',
};

export function FileIcon({ name }: { name: string }) {
  const ext = name.includes('.') ? name.split('.').pop()!.toLowerCase() : '';
  return (
    <span class="file-icon" style={{ color: FILE_TONES[ext] ?? 'var(--muted)' }}>
      <Icon name="file" />
    </span>
  );
}
