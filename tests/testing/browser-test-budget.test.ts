import { globSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { REPOSITORY_ROOT_V1, repositoryCodeOnlyV1 } from './repo-source-roots.js';

/**
 * Every per-test budget in the browser lane comes from a measurement.
 *
 * `test-timeout.test.ts` scans the vitest suite for a budget nobody measured
 * and skips `tests/browser/**` by name, on the stated grounds that Playwright
 * budgets "come from `playwright.config.ts` and from `test.setTimeout()`
 * calls, not from the literals this file greps for". That is true, and it left
 * `test.setTimeout()` unread by anything. `browser-timeout-headroom.ts` watches
 * the other half — how much of a budget a test spends — and it cannot see where
 * the budget came from: a number nobody measured sits at 74% looking exactly
 * like a number somebody did, right up to the first host that pushes it past
 * 100%.
 *
 * That is what happened. On 2026-09-16, run 35164009617, five oak tests were
 * at or past their budgets across the two CI legs. The four that carried a bare
 * literal — `test.setTimeout(120_000)` twice in the weather spec, once in the
 * stages spec, and a `180_000` in `oak-ecosystem.spec.ts` copied from a
 * different test — were the ones that failed. The one oak test budgeted through
 * `timeoutForMeasuredWorkMs` spent 55% of what it was given, on the same runner,
 * in the same run.
 *
 * So this gate reads the constructor rather than the number. A browser budget
 * must be built by `timeoutForMeasuredWorkMs(<measured>)`, whose own docstring
 * is where the rule "write the measurement at the call site" lives. It makes an
 * unmeasured browser budget unwriteable.
 *
 * **What it does not prove.** Three bounds, stated here because a gate is only
 * evidence inside them:
 *
 * - It reads the *shape* of a budget, never the truth of the measurement. Any
 *   number can be passed to `timeoutForMeasuredWorkMs`. What the gate forces is
 *   that the number goes through the function that demands one, and appears
 *   beside the comment that records it.
 * - It reads `test.setTimeout(` textually, per line. It cannot see the suite
 *   default in `playwright.config.ts`, and it cannot see an intra-test
 *   `{ timeout: N }` on a single wait — the class `test-timeout.test.ts`
 *   records as still ungated, and which is still ungated after this file.
 * - The four studio specs below keep hand-written literals. They are frozen by
 *   value, not waived: a new one anywhere fails, and changing one of these
 *   fails until this list is changed with it.
 */

/**
 * The browser budgets that predate this gate, by the value they carry.
 *
 * Each was measured on windows-latest and recorded in
 * `docs/learning/defect-register.md` (2026-08-28), not derived by
 * `timeoutForMeasuredWorkMs` — its four-times multiple scales a *workstation*
 * number, and feeding it a CI figure is one of the two arithmetic mistakes that
 * entry records. Re-deriving them means re-measuring them here, which is work
 * this gate does not do and must not pretend to have done.
 *
 * Keyed by value rather than by line so an unrelated edit above one of them
 * does not fail the gate for moving it.
 */
const MEASURED_ON_CI_LITERALS_V1: Readonly<Record<string, readonly number[]>> = {
  // Machine Works diagnostic projection: 53.0 s here, 72.9 s on windows-latest.
  'tests/browser/model-studio-machine-works.spec.ts': [180_000],
  'tests/browser/model-studio-physics-playground.spec.ts': [240_000],
  // Riverfall overhead capture: 86.5 s on windows-latest.
  'tests/browser/model-studio-riverfall.spec.ts': [180_000],
  'tests/browser/model-studio-windmill-assets.spec.ts': [180_000, 180_000],
};

/** The constructor a browser budget must be built by. */
const MEASURED_BUDGET_CALL = 'timeoutForMeasuredWorkMs(';

/**
 * Below this, the scan has not read the lane it claims to read. The browser
 * suite carried eleven `test.setTimeout()` sites when this gate landed; a glob
 * that finds far fewer has stopped matching, and a scan that matches nothing
 * reports "did not run" as "passed".
 */
const MINIMUM_BUDGET_SITES = 8;

interface BudgetSiteV1 {
  readonly file: string;
  readonly line: number;
  readonly argument: string;
}

function browserBudgetSitesV1(): readonly BudgetSiteV1[] {
  const sites: BudgetSiteV1[] = [];
  const files = globSync('tests/browser/**/*.ts', { cwd: REPOSITORY_ROOT_V1 })
    .map((found) => found.split('\\').join('/'))
    .sort();
  for (const file of files) {
    // Comments are stripped first: this file's own prose quotes
    // `test.setTimeout(120_000)` while explaining why it must not exist, and a
    // scan that reads its own explanation as an offender proves nothing.
    const text = repositoryCodeOnlyV1(readFileSync(join(REPOSITORY_ROOT_V1, file), 'utf8'));
    text.split('\n').forEach((line, index) => {
      const at = line.indexOf('test.setTimeout(');
      if (at < 0) return;
      sites.push({
        file,
        line: index + 1,
        argument: line.slice(at + 'test.setTimeout('.length).trim(),
      });
    });
  }
  return sites;
}

describe('no browser budget is a number nobody measured', () => {
  const sites = browserBudgetSitesV1();

  it('read the browser lane rather than an empty glob', () => {
    expect(
      sites.length,
      'the scan found almost no `test.setTimeout()` sites, so it proved nothing about the browser lane',
    ).toBeGreaterThanOrEqual(MINIMUM_BUDGET_SITES);
  });

  it('classifies every budget it found', () => {
    // A site the gate cannot parse is not a passing site. Reporting an
    // unreadable budget as a compliant one is the failure this whole file
    // exists to make impossible, committed by the gate itself.
    const unreadable = sites
      .filter((site) => !site.argument.startsWith(MEASURED_BUDGET_CALL)
        && !/^[0-9][0-9_]*\s*\)/.test(site.argument))
      .map((site) => `${site.file}:${String(site.line)} — test.setTimeout(${site.argument}`);
    expect(
      unreadable.sort(),
      'this gate can only classify `test.setTimeout(timeoutForMeasuredWorkMs(<measured>))` and '
        + '`test.setTimeout(<literal>)`; it found a form it cannot read, and a budget it cannot '
        + 'read is not a budget it has checked — widen the classifier or write the budget in one '
        + 'of the two forms it knows',
    ).toEqual([]);
  });

  it('builds every new budget from a measurement', () => {
    const literals = new Map<string, number[]>();
    for (const site of sites) {
      if (site.argument.startsWith(MEASURED_BUDGET_CALL)) continue;
      const digits = /^([0-9][0-9_]*)\s*\)/.exec(site.argument);
      if (digits === null) continue; // Reported by the classifier test above.
      const found = literals.get(site.file) ?? [];
      found.push(Number(digits[1]!.replaceAll('_', '')));
      literals.set(site.file, found);
    }

    const actual = Object.fromEntries(
      [...literals].sort(([left], [right]) => left.localeCompare(right))
        .map(([file, values]) => [file, values.sort((a, b) => a - b)]),
    );
    const expected = Object.fromEntries(
      Object.entries(MEASURED_ON_CI_LITERALS_V1)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([file, values]) => [file, [...values].sort((a, b) => a - b)]),
    );

    expect(
      actual,
      'a browser budget written as a bare literal is a number nothing measured, which is what '
        + 'took CI down on 2026-09-16: write it as '
        + '`test.setTimeout(timeoutForMeasuredWorkMs(<measured>))` with the measurement in a '
        + 'comment beside it, measured on this workstation with the test run alone. The four '
        + 'studio specs listed in MEASURED_ON_CI_LITERALS_V1 keep hand-written budgets measured '
        + 'on windows-latest and recorded in docs/learning/defect-register.md; changing one of '
        + 'those means re-measuring it and updating that list in the same commit.',
    ).toEqual(expected);
  });
});
