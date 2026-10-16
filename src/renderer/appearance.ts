import '@fontsource-variable/inter/wght.css';
import '@fontsource-variable/jetbrains-mono/wght.css';
import '@fontsource-variable/jetbrains-mono/wght-italic.css';
import { monaco } from './monaco';

/**
 * Fonts ship with the app (Inter for the interface, JetBrains Mono for code)
 * so Windows and macOS look the same: their system fonts differ in width and,
 * for code, Chromium falls back to Consolas on Windows and Menlo on macOS.
 */
export interface Appearance {
  uiFont: 'inter' | 'system';
  codeFont: 'jetbrains' | 'system';
  codeSize: number;
  ligatures: boolean;
}

export const UI_FONTS: Record<Appearance['uiFont'], { label: string; stack: string }> = {
  inter: { label: 'Inter (bundled)', stack: "'Inter Variable', system-ui, -apple-system, 'Segoe UI', sans-serif" },
  system: { label: 'System (Segoe UI / SF Pro)', stack: "system-ui, -apple-system, 'Segoe UI', sans-serif" },
};

export const CODE_FONTS: Record<Appearance['codeFont'], { label: string; stack: string }> = {
  jetbrains: { label: 'JetBrains Mono (bundled)', stack: "'JetBrains Mono Variable', 'Cascadia Code', Menlo, Consolas, monospace" },
  system: { label: 'System (Cascadia Code or Consolas / SF Mono or Menlo)', stack: "'Cascadia Code', 'SF Mono', Menlo, Consolas, 'DejaVu Sans Mono', monospace" },
};

export const DEFAULT_APPEARANCE: Appearance = { uiFont: 'inter', codeFont: 'jetbrains', codeSize: 13, ligatures: false };
const STORAGE_KEY = 'friedliver.appearance';
const listeners = new Set<(a: Appearance) => void>();
let current = load();

function load(): Appearance {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Partial<Appearance>;
    return {
      uiFont: saved.uiFont === 'system' ? 'system' : 'inter',
      codeFont: saved.codeFont === 'system' ? 'system' : 'jetbrains',
      codeSize: clampSize(saved.codeSize ?? DEFAULT_APPEARANCE.codeSize),
      ligatures: saved.ligatures === true,
    };
  } catch {
    return DEFAULT_APPEARANCE;
  }
}

function clampSize(n: number): number {
  return Math.min(Math.max(Math.round(n) || 13, 10), 22);
}

export function appearance(): Appearance {
  return current;
}

/** Monaco options for the current fonts. Line height is 1.55× so code breathes like the UI. */
export function editorFontOptions(a = current): monaco.editor.IEditorOptions {
  return { fontFamily: CODE_FONTS[a.codeFont].stack, fontSize: a.codeSize, lineHeight: Math.round(a.codeSize * 1.55), fontLigatures: a.ligatures };
}

export function setAppearance(change: Partial<Appearance>): Appearance {
  current = { ...current, ...change, codeSize: clampSize(change.codeSize ?? current.codeSize) };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch {
    // Storage unavailable: still applies for this session.
  }
  applyAppearance();
  return current;
}

export function applyAppearance(): void {
  const root = document.documentElement.style;
  root.setProperty('--font-ui', UI_FONTS[current.uiFont].stack);
  root.setProperty('--font-mono', CODE_FONTS[current.codeFont].stack);
  root.setProperty('--code-ligatures', current.ligatures ? 'normal' : 'none');
  const options = editorFontOptions();
  for (const editor of monaco.editor.getEditors()) editor.updateOptions(options);
  // Monaco measures glyph widths once; measure again when the bundled fonts finish loading.
  void document.fonts.ready.then(() => monaco.editor.remeasureFonts());
  listeners.forEach((l) => l(current));
}

export function onAppearance(listener: (a: Appearance) => void): () => void {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}
