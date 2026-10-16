export interface FuzzyMatch {
  score: number;
  /** Indexes in `text` that matched, for highlighting. */
  indices: number[];
}

const BOUNDARY = /[\\/_\-. ]/;

function subsequence(q: string, t: string, start: number): number[] | null {
  const indices: number[] = [];
  let from = start;
  for (const ch of q) {
    const at = t.indexOf(ch, from);
    if (at < 0) return null;
    indices.push(at);
    from = at + 1;
  }
  return indices;
}

/**
 * Subsequence match, like VS Code's quick open: every query character must
 * appear in order. The file name (after the last slash) is tried first, and
 * consecutive runs and word starts score higher.
 */
export function fuzzy(query: string, text: string): FuzzyMatch | null {
  const q = query.toLowerCase().replace(/\s+/g, '');
  if (!q) return { score: 0, indices: [] };
  const t = text.toLowerCase();
  const nameStart = Math.max(text.lastIndexOf('/'), text.lastIndexOf('\\')) + 1;
  const inName = subsequence(q, t, nameStart);
  const indices = inName ?? subsequence(q, t, 0);
  if (!indices) return null;

  let score = inName ? 10 : 0;
  indices.forEach((at, i) => {
    if (i > 0 && at === indices[i - 1] + 1) score += 5;
    if (at === 0 || BOUNDARY.test(text[at - 1])) score += 3;
  });
  // Tighter, shorter names win ties: `controller.ts` over `controller.test.ts`.
  score -= (indices.at(-1)! - indices[0]) * 0.2 + (text.length - nameStart) * 0.05;
  return { score, indices };
}

/** Best matches first, at most `limit`. */
export function rank<T>(items: T[], query: string, text: (item: T) => string, limit = 50): { item: T; match: FuzzyMatch }[] {
  const out: { item: T; match: FuzzyMatch }[] = [];
  for (const item of items) {
    const match = fuzzy(query, text(item));
    if (match) out.push({ item, match });
  }
  return out.sort((a, b) => b.match.score - a.match.score).slice(0, limit);
}
