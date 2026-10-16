import { monaco } from './monaco';

/**
 * One palette drives both the app chrome (CSS variables) and the Monaco
 * editor theme, so panels, diffs and code always match.
 */
export interface Theme {
  id: string;
  name: string;
  dark: boolean;
  ui: {
    bg: string;
    panel: string;
    'panel-2': string;
    border: string;
    text: string;
    muted: string;
    accent: string;
    'accent-bg': string;
    'accent-text': string;
    hover: string;
    active: string;
    'code-bg': string;
    'status-bg': string;
    'status-text': string;
    ok: string;
    warn: string;
    bad: string;
    'error-bg': string;
    'review-bar': string;
  };
  syntax: {
    comment: string;
    keyword: string;
    type: string;
    string: string;
    number: string;
    regexp: string;
    delimiter: string;
    identifier: string;
  };
}

export const THEMES: Theme[] = [
  {
    id: 'black-blue',
    name: 'Black Blue',
    dark: true,
    ui: {
      bg: '#000000',
      panel: '#060a12',
      'panel-2': '#0c1322',
      border: '#16233a',
      text: '#d7e3fc',
      muted: '#6e7f9e',
      accent: '#4c9aff',
      'accent-bg': '#1f6feb',
      'accent-text': '#ffffff',
      hover: '#0d1729',
      active: '#11264a',
      'code-bg': '#050a14',
      'status-bg': '#0d2a5c',
      'status-text': '#cfe0ff',
      ok: '#3fd0c9',
      warn: '#f0b93a',
      bad: '#ff6b81',
      'error-bg': '#2a0d14',
      'review-bar': '#0b1a33',
    },
    syntax: {
      comment: '#4d5f80',
      keyword: '#4c9aff',
      type: '#79d4ff',
      string: '#5ad1c4',
      number: '#a9a1ff',
      regexp: '#ff8fc8',
      delimiter: '#8fa3c7',
      identifier: '#d7e3fc',
    },
  },
  {
    id: 'midnight-blue',
    name: 'Midnight Blue',
    dark: true,
    ui: {
      bg: '#0b1220',
      panel: '#0f1729',
      'panel-2': '#15203a',
      border: '#1f2c4a',
      text: '#cdd6f4',
      muted: '#7f8bab',
      accent: '#38bdf8',
      'accent-bg': '#0284c7',
      'accent-text': '#ffffff',
      hover: '#16223d',
      active: '#1c2c50',
      'code-bg': '#0a101c',
      'status-bg': '#0369a1',
      'status-text': '#e0f2fe',
      ok: '#34d399',
      warn: '#fbbf24',
      bad: '#f87171',
      'error-bg': '#3b1219',
      'review-bar': '#13213d',
    },
    syntax: {
      comment: '#5b6b8c',
      keyword: '#38bdf8',
      type: '#7dd3fc',
      string: '#86efac',
      number: '#fcd34d',
      regexp: '#f9a8d4',
      delimiter: '#94a3b8',
      identifier: '#cdd6f4',
    },
  },
  {
    id: 'graphite',
    name: 'Graphite',
    dark: true,
    ui: {
      bg: '#18181b',
      panel: '#1f1f23',
      'panel-2': '#27272a',
      border: '#34343a',
      text: '#e4e4e7',
      muted: '#9a9aa3',
      accent: '#60a5fa',
      'accent-bg': '#2563eb',
      'accent-text': '#ffffff',
      hover: '#2a2a30',
      active: '#33333b',
      'code-bg': '#141417',
      'status-bg': '#2563eb',
      'status-text': '#ffffff',
      ok: '#4ade80',
      warn: '#facc15',
      bad: '#f87171',
      'error-bg': '#3a1515',
      'review-bar': '#26262c',
    },
    syntax: {
      comment: '#6b6b75',
      keyword: '#60a5fa',
      type: '#67e8f9',
      string: '#86efac',
      number: '#fbbf24',
      regexp: '#f472b6',
      delimiter: '#a1a1aa',
      identifier: '#e4e4e7',
    },
  },
  {
    id: 'daylight-blue',
    name: 'Daylight Blue',
    dark: false,
    ui: {
      bg: '#ffffff',
      panel: '#f5f7fb',
      'panel-2': '#eaeef5',
      border: '#d5dce8',
      text: '#1c2433',
      muted: '#5d6b82',
      accent: '#1f6feb',
      'accent-bg': '#1f6feb',
      'accent-text': '#ffffff',
      hover: '#e8eef9',
      active: '#dbe6fb',
      'code-bg': '#f2f5fa',
      'status-bg': '#1f6feb',
      'status-text': '#ffffff',
      ok: '#0f8a6c',
      warn: '#a15c00',
      bad: '#c62c3c',
      'error-bg': '#fde8ea',
      'review-bar': '#e7eefb',
    },
    syntax: {
      comment: '#7a8699',
      keyword: '#0b5bd3',
      type: '#0a7ea4',
      string: '#0f7b5f',
      number: '#8a3ffc',
      regexp: '#c2185b',
      delimiter: '#4b5567',
      identifier: '#1c2433',
    },
  },
];

export const DEFAULT_THEME = THEMES[0];

/** `#rrggbb` plus an opacity from 0 to 1, as Monaco's `#rrggbbaa`. */
function alpha(hex: string, opacity: number): string {
  return hex + Math.round(opacity * 255).toString(16).padStart(2, '0');
}

function monacoTheme(t: Theme): monaco.editor.IStandaloneThemeData {
  const s = t.syntax;
  const u = t.ui;
  const rule = (token: string, foreground: string, fontStyle?: string) => ({ token, foreground: foreground.slice(1), fontStyle });
  return {
    base: t.dark ? 'vs-dark' : 'vs',
    inherit: true,
    rules: [
      rule('', s.identifier),
      rule('comment', s.comment, 'italic'),
      rule('keyword', s.keyword),
      rule('type', s.type),
      rule('type.identifier', s.type),
      rule('identifier', s.identifier),
      rule('string', s.string),
      rule('string.escape', s.regexp),
      rule('number', s.number),
      rule('constant', s.number),
      rule('regexp', s.regexp),
      rule('delimiter', s.delimiter),
      rule('operator', s.delimiter),
      rule('tag', s.keyword),
      rule('attribute.name', s.type),
      rule('attribute.value', s.string),
      rule('variable', s.identifier),
      rule('predefined', s.type),
    ],
    colors: {
      'editor.background': u.bg,
      'editor.foreground': u.text,
      'editorGutter.background': u.bg,
      'editorLineNumber.foreground': alpha(u.muted, 0.7),
      'editorLineNumber.activeForeground': u.text,
      'editor.lineHighlightBackground': alpha(u.hover, 0.9),
      'editor.lineHighlightBorder': alpha(u.hover, 0),
      'editor.selectionBackground': alpha(u.accent, 0.3),
      'editor.inactiveSelectionBackground': alpha(u.accent, 0.15),
      'editor.findMatchHighlightBackground': alpha(u.warn, 0.25),
      'editorCursor.foreground': u.accent,
      // Bracket pairs cycle through the theme's own colors instead of Monaco's gold/pink/blue.
      'editorBracketHighlight.foreground1': s.keyword,
      'editorBracketHighlight.foreground2': s.type,
      'editorBracketHighlight.foreground3': s.number,
      'editorBracketHighlight.foreground4': s.keyword,
      'editorBracketHighlight.foreground5': s.type,
      'editorBracketHighlight.foreground6': s.number,
      'editorBracketHighlight.unexpectedBracket.foreground': u.bad,
      'editorBracketMatch.background': alpha(u.accent, 0.15),
      'editorBracketMatch.border': alpha(u.accent, 0.6),
      'editorIndentGuide.background1': alpha(u.border, 0.8),
      'editorIndentGuide.activeBackground1': u.muted,
      'editorWidget.background': u.panel,
      'editorWidget.border': u.border,
      'editorSuggestWidget.background': u.panel,
      'editorSuggestWidget.selectedBackground': u.active,
      'editorHoverWidget.background': u.panel,
      'input.background': u.bg,
      'focusBorder': alpha(u.accent, 0.6),
      'scrollbarSlider.background': alpha(u.muted, 0.2),
      'scrollbarSlider.hoverBackground': alpha(u.muted, 0.35),
      'scrollbarSlider.activeBackground': alpha(u.muted, 0.5),
      'editorOverviewRuler.border': alpha(u.border, 0),
      'diffEditor.insertedTextBackground': alpha(u.ok, 0.22),
      'diffEditor.removedTextBackground': alpha(u.bad, 0.22),
      'diffEditor.insertedLineBackground': alpha(u.ok, 0.1),
      'diffEditor.removedLineBackground': alpha(u.bad, 0.1),
      'diffEditor.diagonalFill': alpha(u.border, 0.6),
      'diffEditorGutter.insertedLineBackground': alpha(u.ok, 0.18),
      'diffEditorGutter.removedLineBackground': alpha(u.bad, 0.18),
    },
  };
}

export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  for (const [name, value] of Object.entries(theme.ui)) root.style.setProperty(`--${name}`, value);
  root.style.colorScheme = theme.dark ? 'dark' : 'light';
  monaco.editor.defineTheme(theme.id, monacoTheme(theme));
  monaco.editor.setTheme(theme.id);
}

const STORAGE_KEY = 'friedliver.theme';

export function savedTheme(): Theme {
  try {
    const id = localStorage.getItem(STORAGE_KEY);
    return THEMES.find((t) => t.id === id) ?? DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

export function saveTheme(theme: Theme): void {
  try {
    localStorage.setItem(STORAGE_KEY, theme.id);
  } catch {
    // Storage unavailable: the theme still applies for this session.
  }
}
