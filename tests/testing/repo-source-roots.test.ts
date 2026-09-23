import { describe, expect, it } from 'vitest';

import { repositoryCodeOnlyV1 } from './repo-source-roots.js';

/**
 * The comment stripper, tested on the one property its callers depend on and
 * nothing had ever asserted: that it does not move a line.
 *
 * Both callers report a line number derived from the stripped text —
 * `browser-test-budget.test.ts` names the offending budget's site, and
 * `tools/studio/solver-rate.test.ts` names the offending rate literal's — and
 * both were wrong by the number of lines inside every block comment above the
 * match, because the stripper deleted a block comment's newlines along with its
 * text. Measured on 2026-09-16: it named `model-studio-machine-works.spec.ts:601`
 * for a budget at `:620`, `:424` for `:430`, and `:272`/`:465` for `:280`/`:473`.
 *
 * It surfaces only when a scan fails, which is the one moment its reader needs
 * the line, and this repository treats an error message as a product surface.
 *
 * The fixture below is deliberately a **multi-line** block comment. The only
 * case either caller's own tests exercised was a single-line one
 * (`solver-rate.test.ts`, "sees a rate that hides behind a comment"), which both
 * the broken and the fixed stripper handle identically — so reverting the fix
 * reddened no test at all, and the fix to a change whose whole subject is that a
 * rule is prose until it is a gate was itself carried by prose.
 */
describe('repositoryCodeOnlyV1', () => {
  it('keeps every line where it was, so a scan can report the line it found', () => {
    const source = [
      'const before = 1;',
      '/* a block comment',
      '   spanning three lines',
      '   before the match */',
      'const target = 240;',
    ].join('\n');

    const stripped = repositoryCodeOnlyV1(source);
    const lines = stripped.split('\n');

    // The claim, stated as the thing a caller actually does: find the match,
    // report its index. Five lines in, five lines out, and the match on line 5.
    expect(lines).toHaveLength(source.split('\n').length);
    expect(lines.findIndex((line) => line.includes('240')) + 1).toBe(5);

    // And the comment is genuinely gone rather than merely displaced.
    expect(stripped).not.toContain('block comment');
    expect(stripped).not.toContain('spanning three lines');
  });

  it('still hides a value written inside a comment, on either comment form', () => {
    // The property the stripper exists for. Preserving the line breaks must not
    // start letting commented-out values through.
    const stripped = repositoryCodeOnlyV1([
      '/* prose mentioning 240',
      '   and still mentioning 240 */',
      'const real = 60; // trailing prose about 240',
      '// a whole line about 240',
    ].join('\n'));

    expect(stripped).not.toContain('240');
    expect(stripped).toContain('const real = 60;');
  });
});
