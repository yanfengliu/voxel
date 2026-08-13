import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  LIVE_TICKS_PER_SECOND_V1,
  LIVE_TIMESTEP_SECONDS_V1,
} from './live-physics.js';
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
 * The scan now covers the whole repository, and there is nowhere left to keep
 * a rate of one's own. The last lane to move was the windmill consumer proof,
 * and it took an exhaustive re-search of the machine's geometry to move it.
 */

const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url));
const SCANNED_DIRECTORIES = ['src', 'tools', 'fixtures', 'tests', 'scripts'];
/**
 * Generated traces are skipped. A recording states the rate it was made at as
 * a fact about itself, not as a rate anything solves at now.
 */
const GENERATED_PREFIX = 'generated-';
/**
 * Rates a solver might plausibly be given instead of the shared one.
 *
 * 30 is deliberately absent: it is a sampling and display rate rather than a
 * rate anything solves at, and the scenario runner's 30 Hz observation
 * interval is a legitimate independent choice.
 */
const RATE_LITERAL = /\b1\s*\/\s*(?:1000|960|480|240|120)\b/;
const BLOCK_COMMENT = /\/\*[\s\S]*?\*\//g;

function sourceFiles(directory: string): readonly string[] {
  const found: string[] = [];
  const walk = (current: string): void => {
    for (const entry of readdirSync(current)) {
      if (entry === 'node_modules' || entry.startsWith('.')) continue;
      const full = join(current, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      // `.mjs` too: `scripts/` is listed as scanned and contains nothing
      // else, so restricting to `.ts` meant that directory contributed zero
      // files while every summary read as whole-repository coverage.
      if (!/\.(?:ts|mjs|js)$/.test(entry)) continue;
      if (entry.startsWith(GENERATED_PREFIX)) continue;
      // This file necessarily spells rates: they are its test data. It is the
      // scanner, not a lane, and the case below proves the scanner still sees
      // a literal that hides behind a comment.
      if (entry === 'solver-rate.test.ts') continue;
      found.push(full);
    }
  };
  walk(join(REPO_ROOT, directory));
  return found;
}

/**
 * Strips comments before searching.
 *
 * Prose about a historical rate — this file's own explanation included — must
 * not fail the scan, and a real literal must not be able to hide behind one.
 */
function codeOnly(source: string): string {
  return source
    .replace(BLOCK_COMMENT, '')
    .split('\n')
    .map((line) => line.split('//')[0] ?? '')
    .join('\n');
}

function rateLiteralOffenders(): readonly string[] {
  const offenders: string[] = [];
  for (const directory of SCANNED_DIRECTORIES) {
    for (const file of sourceFiles(directory)) {
      codeOnly(readFileSync(file, 'utf8')).split('\n').forEach((line, index) => {
        if (!RATE_LITERAL.test(line)) return;
        offenders.push(
          `${file.slice(REPO_ROOT.length)}:${String(index + 1)}: ${line.trim()}`,
        );
      });
    }
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
  });

  it('sees a rate that hides behind a comment', () => {
    // The scan strips comments, which is exactly how a real literal could slip
    // past it on a line that also carries prose. This proves it does not.
    const disguised = codeOnly([
      '/* a comment mentioning 1 / 240 */',
      'const step = 1 / 240; // trailing prose about 1 / 960',
      '// a whole line about 1 / 120',
    ].join('\n'));
    expect(disguised.split('\n').filter((line) => RATE_LITERAL.test(line)))
      .toEqual(['const step = 1 / 240; ']);
  });

  it('is spelled nowhere at all', () => {
    // There is no allowance left. This carried a five-file set while the
    // windmill consumer proof was being moved — an exact set rather than an
    // exemption list, so that emptying it failed the test and told whoever
    // emptied it to delete the list. It emptied on 2026-08-01, when that
    // proof's parameter search was re-run at the shared rate.
    const offenders = rateLiteralOffenders();
    expect(
      offenders,
      'these lines spell a solver rate instead of deriving it from '
      + `SOLVER_TIMESTEP_SECONDS_V1:\n${offenders.join('\n')}`,
    ).toEqual([]);
  });
});
