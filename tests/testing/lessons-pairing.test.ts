import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * `docs/learning/lessons.md` is read at session start and is short by construction; the war
 * stories live beside it in `lessons-evidence.md`. The split only works if every rule can
 * reach its evidence and no evidence is stranded — a rule whose entry has gone missing is
 * indistinguishable from one that was never proved, and an entry no rule points at is never
 * read at all.
 */

const learning = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'docs', 'learning');
const indexPath = join(learning, 'lessons.md');
const evidencePath = join(learning, 'lessons-evidence.md');

/**
 * GitHub's heading-anchor algorithm: lowercase, drop punctuation, and each space becomes its
 * own hyphen so `a + b` yields `a--b`. Matching it exactly is the point — an anchor this accepts
 * but GitHub renders differently is a dead link the test would call healthy.
 */
function slug(heading: string): string {
  return heading
    .trim()
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s/g, '-');
}

function indexAnchors(): string[] {
  const text = readFileSync(indexPath, 'utf8');
  return [...text.matchAll(/\[evidence\]\(lessons-evidence\.md#([^)]+)\)/g)].map((m) => m[1]!);
}

function evidenceSlugs(): string[] {
  const text = readFileSync(evidencePath, 'utf8').replace(/^```[\s\S]*?^```/gm, '');
  return [...text.matchAll(/^## (.+)$/gm)].map((m) => slug(m[1]!));
}

describe('lessons index and evidence stay in step', () => {
  it('parses entries from both sides', () => {
    // Both assertions below are set differences, which pass trivially when one side is empty.
    // A parser that silently matched nothing would report a healthy file forever.
    expect(indexAnchors().length, 'parsed no rules out of lessons.md').toBeGreaterThan(0);
    expect(evidenceSlugs().length, 'parsed no entries out of lessons-evidence.md').toBeGreaterThan(0);
  });

  it('points every rule at an evidence entry that exists', () => {
    const known = new Set(evidenceSlugs());
    const dangling = [...new Set(indexAnchors())].filter((a) => !known.has(a)).sort();
    expect(dangling, `lessons.md links to headings that do not exist in the evidence file`).toEqual([]);
  });

  it('points at least one rule at every evidence entry', () => {
    const linked = new Set(indexAnchors());
    const stranded = [...new Set(evidenceSlugs())].filter((s) => !linked.has(s)).sort();
    expect(stranded, `evidence entries no rule points at will never be read`).toEqual([]);
  });

  it('keeps the index short enough to actually read at session start', () => {
    const lines = readFileSync(indexPath, 'utf8').split('\n').length;
    // Length is the thing that decides whether a session-start file gets read at all. Retire
    // lessons that have become gates rather than raising this ceiling.
    expect(lines).toBeLessThanOrEqual(120);
  });
});
