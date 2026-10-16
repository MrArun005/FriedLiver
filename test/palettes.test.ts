import { describe, expect, it } from 'vitest';
import { THEMES } from '../src/renderer/palettes';

// WCAG 2.1 relative luminance and contrast ratio.
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// Every pairing the UI actually uses for text, held to WCAG AA (4.5:1).
const UI_PAIRS: [string, string][] = [
  ['text', 'bg'],
  ['text', 'panel'],
  ['text', 'panel-2'],
  ['muted', 'bg'],
  ['muted', 'panel'],
  ['muted', 'panel-2'],
  ['accent', 'panel'],
  ['accent', 'bg'],
  ['accent-text', 'accent-bg'],
  ['status-text', 'status-bg'],
  ['bad', 'panel-2'],
  ['warn', 'panel-2'],
  ['ok', 'panel'],
];

describe.each(THEMES)('$name theme', (theme) => {
  it.each(UI_PAIRS)('%s on %s meets 4.5:1', (fg, bg) => {
    const ui = theme.ui as Record<string, string>;
    expect(contrast(ui[fg], ui[bg])).toBeGreaterThanOrEqual(4.5);
  });

  it('every syntax color meets 4.5:1 on the editor background', () => {
    for (const [token, color] of Object.entries(theme.syntax)) {
      expect(contrast(color, theme.ui.bg), token).toBeGreaterThanOrEqual(4.5);
    }
  });
});

it('every theme defines the same tokens', () => {
  const keys = THEMES.map((t) => Object.keys(t.ui).sort().join());
  expect(new Set(keys).size).toBe(1);
});
