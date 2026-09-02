import { describe, expect, it } from 'vitest';

import {
  repositoryCodeOnlyV1,
  repositorySourceFilesV1,
  REPOSITORY_SOURCE_ROOTS_V1,
} from '../../tests/testing/repo-source-roots.js';
import {
  LIVE_TICKS_PER_SECOND_V1,
  LIVE_TIMESTEP_SECONDS_V1,
} from './live-physics.js';
import { MACHINE_WORKS_FIXED_STEP_MS } from './machine-works-machine.js';
import { PLAYGROUND_TIMESTEP_S_V1 } from './physics-playground-materials.js';
import {
  SOLVER_TICKS_PER_SECOND_V1,
  SOLVER_TIMESTEP_SECONDS_V1,
} from './solver-rate.js';

/**
 * Every solver lane runs at the one rate, and there are no exceptions.
 *
 * The owner's rule is 60 Hz everywhere. It was prose for one session and
 * drifted inside that session — two files spelled the same rate independently
 * and agreed only by coincidence, so the headless twin and the live session
 * were quietly different worlds and nothing said so.
 *
 * This used to carry an exemption list, and removing it is the point. An
 * exemption survives by being easier to keep than to remove, and this one was
 * hiding more than it declared: it named the playground twin, whose stated
 * blocker turned out to be a measurement artifact rather than a solver defect;
 * it said nothing about the chain consumer, which ran a real Rapier world off
 * the shared rate; and its scan only ever covered `tools/studio`, so every
 * fixture in the repository sat outside the rule it claimed to enforce.
 *
 * Two horizons remained after that, and both are closed below. The scan's reach
 * now comes from `REPOSITORY_SOURCE_ROOTS_V1`, which a separate gate re-derives
 * from the repository's actual shape, so a new top-level directory of source
 * cannot sit outside it unnoticed. And the scan used to look only for *wrong*
 * rates — `1 / 240` and its neighbours — which meant a lane that respelled the
 * *right* rate was invisible: agreeing by coincidence is the original defect,
 * not a lesser version of it. `MACHINE_WORKS_FIXED_STEP_MS` was doing exactly
 * that, as `1_000 / 60`, for as long as this file has existed.
 */

/**
 * Rates a solver might plausibly be given instead of the shared one.
 *
 * 30 is deliberately absent: it is a sampling and display rate rather than a
 * rate anything solves at, and the scenario runner's 30 Hz observation interval
 * is a legitimate independent choice.
 */
const WRONG_RATE_LITERAL = /\b1\s*\/\s*(?:1000|960|480|240|120)\b/;

/**
 * The shared rate, respelled instead of derived.
 *
 * Matched only on a line that also names a solver step, because 60 is an
 * ordinary number — a pixel height, a frame count, a percentage. The pairing is
 * what makes this precise: `fixedTimestepMs: 1000 / 60` is a lane agreeing by
 * coincidence, while `height: 60` is not a rate at all. A display or render
 * clock is likewise not a solver step and is not matched; `clockStepMs` in the
 * light benchmark is the known example, and it is a page-evaluated body that
 * cannot import a constant.
 */
const SOLVER_STEP_NAME =
  /(?:timestep|time_step|fixed_?step|solver_?step|solver_?rate|ticks_?per_?second)/i;
const SHARED_RATE_SPELLING =
  /(?:\b1[_0-9]*\s*\/\s*60\b)|(?:\b16\.6[0-9]*\b)|(?:\b0\.016[0-9]*\b)/;

/** This file is the scanner, so it spells every rate it forbids. */
const SCANNER = 'tools/studio/solver-rate.test.ts';

/**
 * A generated trace states the rate it was made at as a fact about itself, not
 * as a rate anything solves at now, so the scan skips it.
 *
 * A test spells the value it checks; that is how it checks it, and a scan that
 * forbids the spelling forbids proving the rule. Both exemptions are held to
 * still describing something real by
 * `tests/testing/repo-wide-gate-coverage.test.ts`.
 */
function scannedSources(): readonly { path: string; text: string }[] {
  return repositorySourceFilesV1({
    roots: REPOSITORY_SOURCE_ROOTS_V1,
    skipGenerated: true,
    skipPaths: [SCANNER],
  });
}

function offendersMatching(
  matches: (line: string) => boolean,
  skipTests: boolean,
): readonly string[] {
  const offenders: string[] = [];
  for (const file of scannedSources()) {
    if (skipTests && /\.(?:test|spec)\.[cm]?[jt]s$/.test(file.path)) continue;
    repositoryCodeOnlyV1(file.text).split('\n').forEach((line, index) => {
      if (!matches(line)) return;
      offenders.push(`${file.path}:${String(index + 1)}: ${line.trim()}`);
    });
  }
  return offenders;
}

describe('the one solver rate', () => {
  it('is 60 Hz, and every lane derives from the same constant', () => {
    expect(SOLVER_TICKS_PER_SECOND_V1).toBe(60);
    expect(SOLVER_TIMESTEP_SECONDS_V1).toBeCloseTo(1 / 60, 12);
    // Identity, not approximate agreement. A lane that merely rounds to the
    // same number is a lane that can drift away from it.
    expect(LIVE_TIMESTEP_SECONDS_V1).toBe(SOLVER_TIMESTEP_SECONDS_V1);
    expect(LIVE_TICKS_PER_SECOND_V1).toBe(SOLVER_TICKS_PER_SECOND_V1);
    expect(PLAYGROUND_TIMESTEP_S_V1).toBe(SOLVER_TIMESTEP_SECONDS_V1);
    expect(MACHINE_WORKS_FIXED_STEP_MS).toBe(1_000 / SOLVER_TICKS_PER_SECOND_V1);
  });

  it('scans every source root, not the one where the drift happened before', () => {
    // The scan's reach is the thing that decides what it can see, so it is
    // asserted rather than assumed: a root contributing no files is a scan
    // walking an empty tree while every summary reads as full coverage.
    const scanned = scannedSources();
    for (const root of REPOSITORY_SOURCE_ROOTS_V1) {
      expect(
        scanned.filter((file) => file.path.startsWith(`${root}/`)).length,
        `the rate scan found no files under '${root}', so that root is outside `
        + 'the rule this file reports as enforced',
      ).toBeGreaterThan(0);
    }
  });

  it('sees a rate that hides behind a comment', () => {
    // The scan strips comments, which is exactly how a real literal could slip
    // past it on a line that also carries prose. This proves it does not.
    const disguised = repositoryCodeOnlyV1([
      '/* a comment mentioning 1 / 240 */',
      'const step = 1 / 240; // trailing prose about 1 / 960',
      '// a whole line about 1 / 120',
    ].join('\n'));
    expect(disguised.split('\n').filter((line) => WRONG_RATE_LITERAL.test(line)))
      .toEqual(['const step = 1 / 240; ']);
  });

  it('is spelled nowhere at all', () => {
    // There is no allowance left. This carried a five-file set while the
    // windmill consumer proof was being moved — an exact set rather than an
    // exemption list, so that emptying it failed the test and told whoever
    // emptied it to delete the list. It emptied on 2026-08-01, when that
    // proof's parameter search was re-run at the shared rate.
    const offenders = offendersMatching((line) => WRONG_RATE_LITERAL.test(line), false);
    expect(
      offenders,
      'these lines spell a solver rate instead of deriving it from '
      + `SOLVER_TIMESTEP_SECONDS_V1:\n${offenders.join('\n')}`,
    ).toEqual([]);
  });

  it('is not respelled by a lane that happens to agree with it', () => {
    // The defect this file was written for was two lanes spelling the SAME rate
    // independently: they agreed by coincidence rather than by construction, so
    // nothing kept them together when one moved. A scan that only looks for the
    // wrong number cannot see that, and did not — `MACHINE_WORKS_FIXED_STEP_MS`
    // spelled `1_000 / 60` for the whole life of the gate that claimed to have
    // ended the practice.
    const offenders = offendersMatching(
      (line) => SOLVER_STEP_NAME.test(line) && SHARED_RATE_SPELLING.test(line),
      true,
    );
    expect(
      offenders,
      'these lines respell the shared solver rate instead of deriving it from '
      + 'SOLVER_TICKS_PER_SECOND_V1 — agreeing by coincidence is the defect this '
      + `gate exists for, not a lesser version of it:\n${offenders.join('\n')}`,
    ).toEqual([]);
  });

  it('tells a respelled rate apart from an ordinary sixty', () => {
    // Non-vacuity for the pairing above: the matcher has to reject the numbers
    // that merely contain 60, or it would be a gate nobody could keep green and
    // the first exemption would empty it.
    const lines = [
      'export const MACHINE_WORKS_FIXED_STEP_MS = 1_000 / 60;',
      'fixedTimestepMs: 1000 / 60,',
      'const solverTimestepSeconds = 0.016666;',
      'player: { x: 200, y: 740, width: 760, height: 60 },',
      'const clockStepMs = 1_000 / 60;',
      'export const MACHINE_WORKS_FIXED_STEP_MS = 1_000 / SOLVER_TICKS_PER_SECOND_V1;',
    ];
    expect(
      lines.filter((line) => SOLVER_STEP_NAME.test(line) && SHARED_RATE_SPELLING.test(line)),
    ).toEqual([
      'export const MACHINE_WORKS_FIXED_STEP_MS = 1_000 / 60;',
      'fixedTimestepMs: 1000 / 60,',
      'const solverTimestepSeconds = 0.016666;',
    ]);
  });
});
