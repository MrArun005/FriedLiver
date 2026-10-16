import { describe, expect, it } from 'vitest';
import { fuzzy, rank } from '../src/renderer/fuzzy';

describe('fuzzy', () => {
  it('matches characters in order and reports where', () => {
    expect(fuzzy('cjs', 'src/calc.js')?.indices).toEqual([4, 9, 10]);
    expect(fuzzy('xyz', 'src/calc.js')).toBeNull();
  });

  it('prefers file-name matches and word starts', () => {
    const files = ['src/main/controller.ts', 'docs/contributing.md', 'src/renderer/chat.tsx', 'test/controller.test.ts'];
    expect(rank(files, 'ctrl', (f) => f).map((r) => r.item)).toEqual(['src/main/controller.ts', 'test/controller.test.ts']);
    expect(rank(files, 'chat', (f) => f)[0].item).toBe('src/renderer/chat.tsx');
  });

  it('returns everything for an empty query', () => {
    expect(rank(['a', 'b'], '', (x) => x)).toHaveLength(2);
  });
});
