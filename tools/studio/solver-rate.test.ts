import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { LIVE_TICKS_PER_SECOND_V1, LIVE_TIMESTEP_SECONDS_V1 } from './live-physics.js';
import { PLAYGROUND_TIMESTEP_S_V1 } from './physics-playground-materials.js';

/**
 * Every solver lane runs at the one rate.
 *
 * The owner's rule is 60 Hz everywhere: 240 was a monitor refresh rate, and a
 * rate nobody ships is a rate nothing is really tested at. The rule was prose
 * for one session and drifted inside that session — two files spelled `1 / 240`
 * independently and agreed only by coincidence, so the headless twin and the
 * live session were quietly different worlds.
 *
 * This is the enforcement. A lane that derives its step from the shared
 * constant passes for free; a lane that spells its own literal fails here and
 * says so by name.
 */

const STUDIO_DIRECTORY = fileURLToPath(new URL('.', import.meta.url));

/**
 * Timestep literals are how the drift happened, so they are what is searched
 * for. A file may still name a rate in prose — the playground's constant
 * carries a comment about the rate it cannot meet yet — so only code lines
 * count.
 */
/**
 * Files allowed to name a rate other than the lane's, each for a stated reason.
 *
 * This list is meant to shrink. Anything on it is either a historical fact
 * about a recording — a trace made at 240 Hz was made at 240 Hz forever — or a
 * lane that has not reached the shared rate yet and says so where it is
 * declared.
 */
const RATE_EXEMPT_FILES: Readonly<Record<string, string>> = Object.freeze({
  'chain-replay-binding.ts':
    'the timestep the committed chain trace was recorded at, which is history '
    + 'rather than a rate anything solves at now',
  'physics-playground-materials.ts':
    'the headless twin has not reached 60 Hz yet; its declaration carries the '
    + 'measurement that blocks it',
});

function timestepLiteralOffenders(): readonly string[] {
  const offenders: string[] = [];
  for (const entry of readdirSync(STUDIO_DIRECTORY)) {
    if (!entry.endsWith('.ts') || entry.endsWith('.test.ts')) continue;
    if (entry in RATE_EXEMPT_FILES) continue;
    const source = readFileSync(`${STUDIO_DIRECTORY}${entry}`, 'utf8');
    source.split('\n').forEach((line, index) => {
      const code = line.split('//')[0] ?? '';
      if (/\b1\s*\/\s*(?:240|120|30)\b/.test(code)) {
        offenders.push(`${entry}:${String(index + 1)}: ${line.trim()}`);
      }
    });
  }
  return offenders;
}

describe('the one solver rate', () => {
  it('is 60 Hz', () => {
    expect(LIVE_TIMESTEP_SECONDS_V1).toBeCloseTo(1 / 60, 12);
    expect(LIVE_TICKS_PER_SECOND_V1).toBe(60);
  });

  it('has exactly one lane still off the shared rate, and it is the known one', () => {
    // The headless twin and the browser session are one world or they are not
    // a twin, so this gap is a defect with a date rather than a design.
    // Blocked on re-measuring: at 60 Hz the stacking stations rest ~0.05 m
    // into the floor against a 0.02 m tolerance, and the station thresholds
    // and law damping rates were all calibrated at 240 Hz.
    //
    // This asserts the gap is still exactly as recorded. When the playground
    // is fixed this test fails, and the fix is to delete this case and the
    // file's entry in RATE_EXEMPT_FILES — which is how the exception is
    // stopped from quietly becoming permanent.
    expect(
      PLAYGROUND_TIMESTEP_S_V1,
      'the playground twin has reached the shared rate — delete this case and '
      + "its RATE_EXEMPT_FILES entry, and assert it equals the lane's step",
    ).toBeCloseTo(1 / 240, 12);
    expect(PLAYGROUND_TIMESTEP_S_V1).not.toBeCloseTo(LIVE_TIMESTEP_SECONDS_V1, 6);
  });

  it('keeps every rate exemption explained where it is declared', () => {
    // An exemption without its reason on the page is an exemption nobody can
    // audit, so the reason has to survive in the file itself.
    for (const [file, reason] of Object.entries(RATE_EXEMPT_FILES)) {
      const source = readFileSync(`${STUDIO_DIRECTORY}${file}`, 'utf8');
      expect(
        /60 Hz|60Hz|recorded|history/i.test(source),
        `${file} is exempt from the shared solver rate because ${reason}, but `
        + 'nothing in the file says so. State it where the constant is declared.',
      ).toBe(true);
    }
  });

  it('is not quietly respelled as a literal anywhere in Studio', () => {
    const offenders = timestepLiteralOffenders();
    expect(
      offenders,
      'these lines spell a solver rate instead of deriving it from '
      + `LIVE_TIMESTEP_SECONDS_V1:\n${offenders.join('\n')}`,
    ).toEqual([]);
  });
});
