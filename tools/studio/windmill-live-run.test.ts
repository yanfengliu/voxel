import { describe, expect, it } from 'vitest';

import { timeoutForMeasuredWorkMs } from '../../tests/testing/test-timeout.js';

import { createStudioCatalog } from './catalog.js';
import {
  LIVE_TICKS_PER_SECOND_V1,
  LivePhysicsSessionV1,
  type LivePlacementSourceV1,
} from './live-physics.js';
import { buildRecipe } from './recipe.js';
import { catalogPartsV1, catalogRecipesV1 } from './studio-library.js';
import { WINDMILL_LIVE_PROFILE_V1 } from './windmill-live-profile.js';
import { WINDMILL_PLACEMENT_IDS_V1, WINDMILL_SCENE_LAYOUT_V1 } from './windmill-layout.js';
import { WINDMILL_OPERATIONAL_NUMERICAL_PROFILE_V1 } from './windmill-numerical-profile.js';
import {
  WINDMILL_SACK_SPOT_SECONDS_V1,
  windmillMilledImpactsV1,
} from './windmill-production-kinematics.js';
import { createWindmillScene } from './windmill-scene.js';

/**
 * One live mill solve, measured on the owner's machine: 141 ms and 102 ms for
 * the two cases here.
 *
 * These carried a bare `600_000` — ten minutes for a tenth of a second of
 * work. Above the shared floor, so the meta-scan never saw it, but loose
 * enough to hide almost any regression.
 */
const WINDMILL_SOLVE_WORK_MS = 150;

/**
 * The mill actually milling, solved rather than replayed.
 *
 * Everything else about the windmill can be right while the machine stands
 * still, which is what happened three times over while this was built: the
 * rotor jammed in its own bearing, then the cam gripped the follower and
 * dragged it over the top, then the hammer swung clear out of reach. None of
 * those failures touch the geometry, the joints, or the wind law — they are
 * only visible by running it and watching the hammer come down.
 */

const TICKS_PER_SECOND = LIVE_TICKS_PER_SECOND_V1;
const RUN_SECONDS = 24;

async function createMillSession(): Promise<LivePhysicsSessionV1> {
  const catalog = createStudioCatalog();
  const recipes = catalogRecipesV1(catalog);
  const parts = catalogPartsV1(catalog);
  const scene = createWindmillScene();
  const planned = new Set(WINDMILL_LIVE_PROFILE_V1.bodies.map((body) => body.placementId));
  const sources: LivePlacementSourceV1[] = scene.placements
    .filter((placement) => planned.has(placement.id))
    .map((placement) => {
      const grain = placement.grain ?? WINDMILL_SCENE_LAYOUT_V1.grain;
      const model = buildRecipe(recipes[placement.model]!, parts, recipes).model;
      return {
        placementId: placement.id,
        model,
        grain,
        centre: [
          placement.at[0],
          placement.at[1] + (model.size[1] * grain) / 2,
          placement.at[2],
        ] as const,
      };
    });
  return LivePhysicsSessionV1.create(WINDMILL_LIVE_PROFILE_V1, sources);
}

async function runMill(): Promise<{
  readonly impactTicks: readonly number[];
  readonly impacts: readonly number[];
  readonly rotorTurns: number;
  readonly hammerLowDegrees: number;
  readonly hammerHighDegrees: number;
  readonly spins: readonly number[];
}> {
  const session = await createMillSession();
  try {
    const impactTicks: number[] = [];
    const impacts: number[] = [];
    const spins: number[] = [];
    let struck = true;
    let armed = false;
    let turned = 0;
    let previousAngle = 0;
    let low = Number.POSITIVE_INFINITY;
    let high = Number.NEGATIVE_INFINITY;
    const degrees = (quaternion: readonly number[]): number =>
      (2 * Math.atan2(quaternion[2]!, quaternion[3]!) * 180) / Math.PI;
    for (let tick = 0; tick < TICKS_PER_SECOND * RUN_SECONDS; tick += 1) {
      session.stepOnce();
      const bodies = session.snapshot();
      const rotor = bodies.find((body) => body.placementId === WINDMILL_PLACEMENT_IDS_V1.rotor);
      const hammer = bodies.find((body) => body.placementId === WINDMILL_PLACEMENT_IDS_V1.hammer);
      const angle = degrees(rotor?.quaternion ?? [0, 0, 0, 1]);
      // Unwrapped turning, so a rotor that only jitters cannot look like one
      // that spins: half-turn jumps are the wrap, not motion.
      let step = angle - previousAngle;
      if (step > 180) step -= 360;
      if (step < -180) step += 360;
      turned += Math.abs(step);
      previousAngle = angle;
      const hammerAngle = degrees(hammer?.quaternion ?? [0, 0, 0, 1]);
      if (tick > TICKS_PER_SECOND) {
        low = Math.min(low, hammerAngle);
        high = Math.max(high, hammerAngle);
        spins.push(rotor?.angularVelocity[2] ?? 0);
      }
      const touching = session
        .contactSamples(WINDMILL_PLACEMENT_IDS_V1.hammer, 8)
        .some((sample) => sample.other === WINDMILL_PLACEMENT_IDS_V1.anvil);
      if (!touching) armed = true;
      if (armed && touching && !struck) {
        impactTicks.push(tick);
        impacts.push(tick / TICKS_PER_SECOND);
      }
      struck = touching;
    }
    return {
      impactTicks,
      impacts,
      rotorTurns: turned / 360,
      hammerLowDegrees: low,
      hammerHighDegrees: high,
      spins,
    };
  } finally {
    session.dispose();
  }
}

describe('the windmill, solved live', () => {
  it('runs the same complete numerical profile as the consumer proof', async () => {
    const session = await createMillSession();
    try {
      const actual = session.numericalSnapshot();
      const expected = WINDMILL_OPERATIONAL_NUMERICAL_PROFILE_V1;
      if (actual === null) {
        throw new Error('The live windmill did not apply a numerical profile.');
      }
      expect(WINDMILL_LIVE_PROFILE_V1.numericalProfile).toBe(expected);
      expect(actual.fixedStepSeconds).toBeCloseTo(expected.fixedStepSeconds, 8);
      expect(actual.contactNaturalFrequency)
        .toBeCloseTo(expected.contactNaturalFrequency, 8);
      expect(actual.lengthUnit).toBeCloseTo(expected.lengthUnit, 8);
      expect(actual.normalizedAllowedLinearError)
        .toBeCloseTo(expected.normalizedAllowedLinearError, 8);
      expect(actual.normalizedPredictionDistance)
        .toBeCloseTo(expected.normalizedPredictionDistance, 8);
      expect(actual.numSolverIterations).toBe(expected.numSolverIterations);
      expect(actual.numInternalPgsIterations)
        .toBe(expected.numInternalPgsIterations);
      expect(actual.minIslandSize).toBe(expected.minIslandSize);
      expect(actual.maxCcdSubsteps).toBe(expected.maxCcdSubsteps);
    } finally {
      session.dispose();
    }
  });

  it('turns, lifts its hammer, and strikes the anvil repeatedly', {
    timeout: timeoutForMeasuredWorkMs(WINDMILL_SOLVE_WORK_MS),
  }, async () => {
    const run = await runMill();

    // A mill that turns. The jammed-bearing failure sat at a hundredth of
    // this while its angular velocity still read as nonzero jitter.
    expect(run.rotorTurns).toBeGreaterThan(3);

    // A hammer that works rather than one flung over its pivot: it comes back
    // down to rest each cycle and never goes anywhere near the top.
    expect(run.hammerLowDegrees).toBeLessThan(2);
    expect(run.hammerHighDegrees).toBeGreaterThan(15);
    expect(run.hammerHighDegrees).toBeLessThan(90);

    // It keeps striking, which is the mill doing its job rather than seizing
    // after a promising start.
    expect(run.impacts.length).toBeGreaterThan(4);
    expect(run.impactTicks.slice(0, 6)).toEqual([
      110, 244, 382, 520, 658, 796,
    ]);
    for (let index = 1; index < run.impactTicks.length; index += 1) {
      expect(
        (run.impactTicks[index]! - run.impactTicks[index - 1]!)
        / TICKS_PER_SECOND,
      ).toBeGreaterThan(WINDMILL_SACK_SPOT_SECONDS_V1);
    }
    expect(windmillMilledImpactsV1(run.impacts))
      .toEqual(run.impacts.slice(0, 5));
    const late = run.impacts.filter((time) => time > RUN_SECONDS / 2);
    expect(late.length, `late strikes among ${JSON.stringify(run.impacts)}`)
      .toBeGreaterThan(1);
  });

  it('settles to a loaded speed instead of running away', {
    timeout: timeoutForMeasuredWorkMs(WINDMILL_SOLVE_WORK_MS),
  }, async () => {
    const run = await runMill();
    const speeds = run.spins.map(Math.abs);
    const settled = speeds.slice(Math.floor(speeds.length / 2));
    const mean = settled.reduce((sum, value) => sum + value, 0) / settled.length;

    // The wind law is self-limiting, and the hammer takes work out on top of
    // that: the mill holds a steady loaded speed well under its free-spin.
    expect(mean).toBeGreaterThan(0.5);
    expect(mean).toBeLessThan(6);
    const peak = Math.max(...settled);
    expect(peak, 'no runaway').toBeLessThan(12);
  });
});
