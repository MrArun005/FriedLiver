// Theme data only (no DOM, no Monaco), so tests can check every palette.
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
    /** Overlay shadows and the dimmed backdrop behind dialogs. */
    'shadow-color': string;
    scrim: string;
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
      muted: '#7a8bad',
      accent: '#4c9aff',
      'accent-bg': '#1f6feb',
      'accent-text': '#ffffff',
      hover: '#0d1729',
      active: '#11264a',
      'code-bg': '#050a14',
      'status-bg': '#060a12',
      'status-text': '#8b9bb8',
      ok: '#3fd0c9',
      warn: '#f0b93a',
      bad: '#ff6b81',
      'error-bg': '#2a0d14',
      'review-bar': '#0b1a33',
      'shadow-color': '#000000cc',
      scrim: '#000000b3',
    },
    syntax: {
      comment: '#7084a8',
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
      'accent-bg': '#0369a1',
      'accent-text': '#ffffff',
      hover: '#16223d',
      active: '#1c2c50',
      'code-bg': '#0a101c',
      'status-bg': '#0f1729',
      'status-text': '#97a3c2',
      ok: '#34d399',
      warn: '#fbbf24',
      bad: '#f87171',
      'error-bg': '#3b1219',
      'review-bar': '#13213d',
      'shadow-color': '#000000b3',
      scrim: '#050a14b3',
    },
    syntax: {
      comment: '#7787a8',
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
      'status-bg': '#1f1f23',
      'status-text': '#a8a8b1',
      ok: '#4ade80',
      warn: '#facc15',
      bad: '#f87171',
      'error-bg': '#3a1515',
      'review-bar': '#26262c',
      'shadow-color': '#000000b3',
      scrim: '#0a0a0cb3',
    },
    syntax: {
      comment: '#8a8a94',
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
      accent: '#1a5ccc',
      'accent-bg': '#1f6feb',
      'accent-text': '#ffffff',
      hover: '#e8eef9',
      active: '#dbe6fb',
      'code-bg': '#f2f5fa',
      'status-bg': '#f5f7fb',
      'status-text': '#4a566b',
      ok: '#0b7a5e',
      warn: '#8f5200',
      bad: '#c62c3c',
      'error-bg': '#fde8ea',
      'review-bar': '#e7eefb',
      'shadow-color': '#1c243333',
      scrim: '#1c243366',
    },
    syntax: {
      comment: '#636e82',
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
