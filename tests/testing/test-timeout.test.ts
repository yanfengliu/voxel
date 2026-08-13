import { globSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  CONTENTION_ALLOWANCE_MS,
  MEASURED_WORK_MULTIPLE,
  timeoutForMeasuredWorkMs,
} from './test-timeout.js';

/**
 * The pairs below are the 2026-08-07 measurements: work done alone, against the
 * worst wall clock the same test showed under load. Every budget has to clear its
 * own contended number, or the bomb is re-armed for the case that proved it.
 */
const MEASURED = [
  { alone: 570, contended: 6_145 },
  { alone: 1_301, contended: 11_708 },
  { alone: 1_694, contended: 11_640 },
  { alone: 3_387, contended: 41_814 },
  { alone: 9_629, contended: 52_692 },
];

describe('timeoutForMeasuredWorkMs', () => {
  it('clears every contended measurement it was derived from', () => {
    for (const { alone, contended } of MEASURED) {
      expect(timeoutForMeasuredWorkMs(alone)).toBeGreaterThan(contended);
    }
  });

  it('would not have been satisfied by a multiple of the work alone', () => {
    // The point of the allowance: for every one of these, four times the work is
    // less than the wall clock the test actually needed, so a pure k*work rule
    // fails outright and a max(floor, k*work) rule just collapses to the floor.
    for (const { alone, contended } of MEASURED) {
      expect(MEASURED_WORK_MULTIPLE * alone).toBeLessThan(contended);
    }
    // For the shortest case it is below even the 5 s default it had already blown.
    expect(MEASURED_WORK_MULTIPLE * 570).toBeLessThan(5_000);
  });

  it('still tracks the work, so a heavier test gets a bigger budget', () => {
    const light = timeoutForMeasuredWorkMs(500);
    const heavy = timeoutForMeasuredWorkMs(50_000);
    expect(heavy - light).toBe(MEASURED_WORK_MULTIPLE * (50_000 - 500));
  });

  it('gives an unmeasured test exactly the contention allowance', () => {
    // This is what vitest.config.ts installs as the global default: the rule
    // applied to zero measured work, rather than a number chosen by hand.
    expect(timeoutForMeasuredWorkMs(0)).toBe(CONTENTION_ALLOWANCE_MS);
  });

  it('stays in the same range as the Riverfall budget that set the multiple', () => {
    // The causal-evidence attestation measured 44.4 s alone on 2026-08-01 and was
    // given 180_000 ms by hand. The rule adds the allowance on top, so it lands
    // higher - a ceiling moving up is safe - but must not run away from it.
    const derived = timeoutForMeasuredWorkMs(44_400);
    expect(derived).toBe(222_600);
    expect(derived).toBeGreaterThan(180_000);
    expect(derived).toBeLessThan(2 * 180_000);
  });

  it('refuses a measurement that is not one', () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, -1]) {
      expect(() => timeoutForMeasuredWorkMs(bad)).toThrow(RangeError);
    }
  });
});

/**
 * The rule above is prose until something reads every line. `docs/learning/lessons.md`
 * is explicit that a rule which is only prose drifts inside the session that wrote it,
 * and this one had already drifted: ten hand-written budgets sat below the allowance
 * on 2026-08-07, two of them in the very file carrying the timeout lesson.
 */
describe('no test opts itself out of the contention allowance', () => {
  const TIMEOUT_LITERAL = [
    // `it('...', { timeout: 30_000 }, () => {`
    /\{\s*timeout:\s*([0-9][0-9_]*)\s*\}/g,
    // `  }, 30_000);` — the trailing-argument form, anchored to the start of a
    // line so it only matches a closing `it(...)` brace. Without the anchor this
    // also catches ordinary calls like `definition.build({}, 1234)`, where 1234
    // is a seed and not a budget at all.
    // The trailing comma is optional because the multi-line form
    //   },
    //   600_000,
    //   );
    // is already in the tree, and without it that budget was invisible to the
    // scan whose whole promise is that no test opts itself out.
    /^[ \t]*\}\s*,\s*([0-9]+_[0-9_]+|[0-9]{4,})\s*,?\s*\)/gm,
  ];

  it('has no bare numeric budget below the allowance', () => {
    const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
    const files = globSync('**/*.test.ts', { cwd: repoRoot })
      .map((f) => f.split('\\').join('/'))
      // `tests/browser/**` are Playwright specs on their own gate and their own
      // timeout semantics; `tmp/**` and `.claude/**` are excluded from this suite
      // entirely (see vitest.config.ts), so they cannot arm anything.
      // `node_modules/` is not ours to police: a dependency shipping a
      // `.test.ts` would fail this gate on foreign code.
      .filter((f) => !f.startsWith('tests/browser/') && !f.startsWith('tmp/')
        && !f.includes('.claude/') && !f.split('/').includes('node_modules'))
      // This file quotes literals while explaining them.
      .filter((f) => f !== 'tests/testing/test-timeout.test.ts');

    expect(files.length, 'globbed no test files — the scan would pass vacuously').toBeGreaterThan(100);

    const offenders: string[] = [];
    for (const file of files) {
      const text = readFileSync(join(repoRoot, file), 'utf8');
      for (const pattern of TIMEOUT_LITERAL) {
        pattern.lastIndex = 0;
        for (const match of text.matchAll(pattern)) {
          const ms = Number(match[1]!.replaceAll('_', ''));
          if (ms < CONTENTION_ALLOWANCE_MS) {
            const line = text.slice(0, match.index).split('\n').length;
            offenders.push(`${file}:${String(line)} — ${match[0].trim()} (${String(ms)} ms)`);
          }
        }
      }
    }

    expect(
      offenders.sort(),
      'a budget below the allowance opts its test out of the floor every other test gets; '
        + 'replace it with timeoutForMeasuredWorkMs(<measured>) and write the measurement beside it',
    ).toEqual([]);
  });
});
