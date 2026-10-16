import type { ITheme } from '@xterm/xterm';
import { monaco } from './monaco';
import { DEFAULT_THEME, THEMES, type Theme } from './palettes';

export { DEFAULT_THEME, THEMES, type Theme };

/** `#rrggbb` plus an opacity from 0 to 1, as `#rrggbbaa`. */
function alpha(hex: string, opacity: number): string {
  return hex.slice(0, 7) + Math.round(opacity * 255).toString(16).padStart(2, '0');
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
      'editor.rangeHighlightBackground': alpha(u.accent, 0.12),
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
      focusBorder: alpha(u.accent, 0.6),
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

/** Terminal colors from the same palette: ANSI red is the theme's error color, blue its accent, and so on. */
export function terminalTheme(t: Theme): ITheme {
  const u = t.ui;
  const s = t.syntax;
  return {
    background: u.bg,
    foreground: u.text,
    cursor: u.accent,
    cursorAccent: u.bg,
    selectionBackground: alpha(u.accent, 0.3),
    black: t.dark ? u['panel-2'] : u.text,
    red: u.bad,
    green: u.ok,
    yellow: u.warn,
    blue: u.accent,
    magenta: s.number,
    cyan: s.type,
    white: t.dark ? u.text : u['panel-2'],
    brightBlack: u.muted,
    brightRed: u.bad,
    brightGreen: s.string,
    brightYellow: u.warn,
    brightBlue: s.keyword,
    brightMagenta: s.regexp,
    brightCyan: s.type,
    brightWhite: t.dark ? '#ffffff' : u.text,
  };
}

export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  for (const [name, value] of Object.entries(theme.ui)) root.style.setProperty(`--${name}`, value);
  // Syntax colors too, so file icons and agent marks in the chrome use the editor's palette.
  for (const [name, value] of Object.entries(theme.syntax)) root.style.setProperty(`--syntax-${name}`, value);
  root.style.colorScheme = theme.dark ? 'dark' : 'light';
  root.classList.toggle('theme-dark', theme.dark);
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
