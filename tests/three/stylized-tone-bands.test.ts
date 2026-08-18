import { describe, expect, it } from 'vitest';

import {
  FULL_TONE_RANGE,
  GRADIENT_TONE_SOFTNESS,
  TONE_BAND_GLSL,
  TONE_BAND_UNIFORM_NAMES,
  gamutSafeToneScale,
  steppedLuminance,
} from '../../src/three/stylizedToneBands.js';
import { StylizedResolvePass } from '../../src/three/stylizedResolvePass.js';

const HARD = 0;

describe('steppedLuminance', () => {
  it('snaps to the tones of its range, counting both ends', () => {
    // Two bands across 0..1 gives three tones: 0, 0.5, 1.
    expect(steppedLuminance(0.1, 2, FULL_TONE_RANGE, HARD)).toBeCloseTo(0, 6);
    expect(steppedLuminance(0.4, 2, FULL_TONE_RANGE, HARD)).toBeCloseTo(0.5, 6);
    expect(steppedLuminance(0.6, 2, FULL_TONE_RANGE, HARD)).toBeCloseTo(0.5, 6);
    expect(steppedLuminance(0.9, 2, FULL_TONE_RANGE, HARD)).toBeCloseTo(1, 6);
  });

  it('spreads bands over a narrow range instead of the whole scale', () => {
    // The failure this range exists to prevent: banding a lane that occupies
    // 0.55..0.88 against 0..1 puts an edge at 0.75, inside the lane, and every
    // pixel either side of it lands a third apart. Against its own range the
    // same two bands land at the lane's floor, middle and ceiling.
    const lane = { min: 0.55, max: 0.88 };

    expect(steppedLuminance(0.57, 2, lane, HARD)).toBeCloseTo(0.55, 6);
    expect(steppedLuminance(0.72, 2, lane, HARD)).toBeCloseTo(0.715, 6);
    expect(steppedLuminance(0.86, 2, lane, HARD)).toBeCloseTo(0.88, 6);

    // Against the full range the same inputs straddle a single edge at 0.75.
    expect(steppedLuminance(0.72, 2, FULL_TONE_RANGE, HARD)).toBeCloseTo(0.5, 6);
    expect(steppedLuminance(0.86, 2, FULL_TONE_RANGE, HARD)).toBeCloseTo(1, 6);
  });

  it('leaves luminance outside the range untouched', () => {
    const lane = { min: 0.55, max: 0.88 };

    // A sky above every tone of the lane must not be dragged to its ceiling.
    expect(steppedLuminance(0.914, 2, lane, HARD)).toBeCloseTo(0.914, 6);
    expect(steppedLuminance(0.2, 2, lane, HARD)).toBeCloseTo(0.2, 6);
  });

  it('leaves the flat part of a band alone and changes only the crossing', () => {
    // With two bands the risers sit at luminance 0.25 and 0.75; 0.05 is deep
    // inside the first flat region, where softness has nothing to ramp.
    expect(steppedLuminance(0.05, 2, FULL_TONE_RANGE, GRADIENT_TONE_SOFTNESS))
      .toBeCloseTo(steppedLuminance(0.05, 2, FULL_TONE_RANGE, HARD), 6);

    const hardAtEdge = steppedLuminance(0.26, 2, FULL_TONE_RANGE, HARD);
    const softAtEdge = steppedLuminance(0.26, 2, FULL_TONE_RANGE, GRADIENT_TONE_SOFTNESS);

    expect(softAtEdge).not.toBeCloseTo(hardAtEdge, 3);
    expect(softAtEdge).toBeGreaterThan(0);
    expect(softAtEdge).toBeLessThan(0.5);
  });

  it('swallows small modulation near an edge instead of amplifying it', () => {
    // The combing artefact: a hard edge turns detail that straddles it into a
    // full band step. Two samples 0.025 apart across the edge at 0.25.
    const below = 0.2375;
    const above = 0.2625;

    const hardStep = Math.abs(
      steppedLuminance(above, 2, FULL_TONE_RANGE, HARD)
      - steppedLuminance(below, 2, FULL_TONE_RANGE, HARD),
    );
    const softStep = Math.abs(
      steppedLuminance(above, 2, FULL_TONE_RANGE, GRADIENT_TONE_SOFTNESS)
      - steppedLuminance(below, 2, FULL_TONE_RANGE, GRADIENT_TONE_SOFTNESS),
    );

    expect(hardStep).toBeCloseTo(0.5, 6);
    expect(softStep).toBeLessThan(hardStep / 2);
  });

  it('never returns a tone outside its own range, whole or fractional bands', () => {
    // A fractional count leaves a partial cell at the top. Flooring is what
    // keeps its upper tone on range.max instead of past it: unfloored, 2.5
    // bands resolve the ceiling to (2 + 1) / 2.5 = 1.2 of the span. The GLSL
    // half of this function used the raw count until 2026-08-17 and did
    // exactly that; both floor now.
    const lane = { min: 0.2, max: 0.8 };

    for (const bands of [1, 2, 2.5, 3, 3.7, 6]) {
      for (let i = 0; i <= 20; i++) {
        const luminance = lane.min + ((lane.max - lane.min) * i) / 20;
        const stepped = steppedLuminance(luminance, bands, lane, HARD);

        const at = `bands=${String(bands)} luminance=${String(luminance)}`;

        expect(stepped, at).toBeGreaterThanOrEqual(lane.min - 1e-9);
        expect(stepped, at).toBeLessThanOrEqual(lane.max + 1e-9);
      }
    }
  });

  it('treats a fractional band count as its floor', () => {
    expect(steppedLuminance(0.9, 2.5, FULL_TONE_RANGE, HARD))
      .toBeCloseTo(steppedLuminance(0.9, 2, FULL_TONE_RANGE, HARD), 9);
  });

  it('returns the input unbanded when the range or band count is unusable', () => {
    expect(steppedLuminance(0.3, 0, FULL_TONE_RANGE, HARD)).toBeCloseTo(0.3, 6);
    expect(steppedLuminance(0.3, 2, { min: 0.5, max: 0.5 }, HARD)).toBeCloseTo(0.3, 6);
    expect(steppedLuminance(Number.NaN, 2, FULL_TONE_RANGE, HARD)).toBe(0);
  });
});

describe('gamutSafeToneScale', () => {
  it('holds the hue by scaling every channel alike', () => {
    // Brightening 0.4 to 0.6 is a 1.5x on all three, so the ratios survive.
    expect(gamutSafeToneScale(0.4, 0.6, 0.5)).toBeCloseTo(1.5, 6);
  });

  it('caps the scale where the brightest channel reaches white', () => {
    // The washed-cyan failure: an unbounded 1.333 with blue already at 0.94
    // clips blue and green while red keeps climbing. The cap lands the pixel
    // short of its band rather than in the wrong colour.
    const capped = gamutSafeToneScale(0.7, 0.933, 0.94);

    expect(capped).toBeLessThan(0.933 / 0.7);
    expect(capped).toBeCloseTo(1 / 0.94, 6);
    expect(0.94 * capped).toBeLessThanOrEqual(1);
  });

  it('never scales negative or by a non-finite factor', () => {
    expect(gamutSafeToneScale(0.5, -1, 0.5)).toBe(0);
    expect(gamutSafeToneScale(Number.NaN, 0.5, 0.5)).toBe(1);
  });
});

describe('tone band shader interface', () => {
  it('declares every shared uniform in the GLSL', () => {
    for (const name of TONE_BAND_UNIFORM_NAMES) {
      expect(TONE_BAND_GLSL).toContain(name);
    }
  });

  it('supplies every shared uniform from the pass', () => {
    // The silent drift this catches: a uniform added on one side only compiles
    // fine and quietly reads zero, which looks like a tuning problem.
    const pass = new StylizedResolvePass(4, 4);

    try {
      for (const name of TONE_BAND_UNIFORM_NAMES) {
        expect(pass.uniforms[name], `pass is missing uniform ${name}`).toBeDefined();
      }
    } finally {
      pass.dispose();
    }
  });
});
