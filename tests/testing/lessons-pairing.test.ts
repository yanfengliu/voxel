import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * `docs/learning/lessons.md` is a staging queue, and this keeps the queue's
 * shape.
 *
 * Three things have to hold. Every rule can reach its evidence, because a rule
 * whose entry has gone missing is indistinguishable from one that was never
 * proved. Every entry is reachable from a rule, because an entry no rule points
 * at is never read at all. And every rule **names the gate it is waiting for**,
 * because the constitution's test for whether something is a lesson is exactly
 * that: an entry that can name no gate is folklore, or belongs in the fleet
 * canon or in `docs/policies/local-rules.md`, and an index that only grows is a
 * list of things that failed to graduate.
 *
 * The parsers used to be proved against the live files: each check asserted the
 * file yielded at least one entry. That is a non-vacuity check that fails the
 * moment the queue is legitimately empty — which is the state this file is
 * meant to reach, and did reach in part on 2026-09-02 — so it punished the one
 * outcome the whole discipline exists to produce. The parsers are now proved
 * against inline fixtures, which cannot empty, and the set comparisons run
 * against the live files, which may. An empty queue passes; a half-emptied one,
 * with a rule whose entry has gone or an entry whose rule has gone, does not.
 */

const learning = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'docs', 'learning');
const indexPath = join(learning, 'lessons.md');
const evidencePath = join(learning, 'lessons-evidence.md');

/**
 * GitHub's heading-anchor algorithm: lowercase, drop punctuation, and each space
 * becomes its own hyphen so `a + b` yields `a--b`. Matching it exactly is the
 * point — an anchor this accepts but GitHub renders differently is a dead link
 * the test would call healthy.
 */
function slug(heading: string): string {
  return heading
    .trim()
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s/g, '-');
}

function anchorsIn(text: string): string[] {
  return [...text.matchAll(/\[evidence\]\(lessons-evidence\.md#([^)]+)\)/g)].map((m) => m[1]!);
}

function headingSlugsIn(text: string): string[] {
  return [...text.replace(/^```[\s\S]*?^```/gm, '').matchAll(/^## (.+)$/gm)]
    .map((m) => slug(m[1]!));
}

/** A queued rule is a top-level bullet that links to its evidence. */
function ruleLinesIn(text: string): string[] {
  return text.split('\n').filter((line) => /^- .*\[evidence\]\(lessons-evidence\.md#/.test(line));
}

const INDEX = (): string => readFileSync(indexPath, 'utf8');
const EVIDENCE = (): string => readFileSync(evidencePath, 'utf8');

describe('the lesson parsers read what they claim to', () => {
  // Proved against fixtures rather than against the live files: these are the
  // checks that used to make an emptied queue fail.
  it('finds a rule, its anchor, and the gate it names', () => {
    const fixture = [
      '## Method',
      '',
      '- A claim worth keeping. ([evidence](lessons-evidence.md#a-war-story)) — **waiting on:** a gate.',
      '- Prose that links nowhere and is therefore not a rule.',
    ].join('\n');
    expect(anchorsIn(fixture)).toEqual(['a-war-story']);
    expect(ruleLinesIn(fixture)).toHaveLength(1);
  });

  it('slugs a heading the way GitHub does', () => {
    const fixture = ['## A war story, told once', '', 'Body.'].join('\n');
    expect(headingSlugsIn(fixture)).toEqual(['a-war-story-told-once']);
  });

  it('reads no entry out of a file that has none', () => {
    expect(headingSlugsIn('# Lessons — evidence\n\nNothing queued.\n')).toEqual([]);
    expect(anchorsIn('# Lessons\n\nNothing queued.\n')).toEqual([]);
  });
});

describe('lessons index and evidence stay in step', () => {
  it('points every rule at an evidence entry that exists', () => {
    const known = new Set(headingSlugsIn(EVIDENCE()));
    const dangling = [...new Set(anchorsIn(INDEX()))].filter((a) => !known.has(a)).sort();
    expect(dangling, 'lessons.md links to headings that do not exist in the evidence file').toEqual([]);
  });

  it('points at least one rule at every evidence entry', () => {
    const linked = new Set(anchorsIn(INDEX()));
    const stranded = [...new Set(headingSlugsIn(EVIDENCE()))].filter((s) => !linked.has(s)).sort();
    expect(stranded, 'evidence entries no rule points at will never be read').toEqual([]);
  });

  it('makes every queued rule name the gate it is waiting for', () => {
    // The constitution's own test. A queued entry that names no gate is not a
    // lesson: promote it to the fleet canon, localise it to
    // docs/policies/local-rules.md, or drop it.
    const unnamed = ruleLinesIn(INDEX())
      .filter((line) => !/\*\*waiting on:\*\*/i.test(line))
      .map((line) => line.slice(0, 100));
    expect(
      unnamed,
      'these queued rules name no gate, so by the constitution they are not '
      + 'lessons — stage them in canon-candidates.md, move them to '
      + 'docs/policies/local-rules.md, or drop them',
    ).toEqual([]);
  });

  it('keeps the index short enough that reading it stays cheap', () => {
    const lines = INDEX().split('\n').length;
    // Length is what decides whether a queue gets read at all. Retire lessons
    // that have become gates rather than raising this ceiling.
    expect(lines).toBeLessThanOrEqual(120);
  });
});
