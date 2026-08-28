import { describe, expect, it } from 'vitest';

import {
  physicsPlaygroundStationV1,
} from '../../tools/studio/physics-playground-stations.js';
import {
  createPhysicsPlaygroundProfileV1,
} from '../../tools/studio/physics-playground-profiles.js';
import {
  SOLVER_SOFT_CCD_PREDICTION_V1,
} from '../../tools/studio/solver-rate.js';
import {
  playgroundResultLineV1,
  runPlaygroundScenarioV1,
} from './playground-run.js';
import {
  initPlaygroundRapierV1,
  PlaygroundWorldV1,
} from './playground-world.js';

/**
 * The playground's smoke layer: the eight failures that matter most, each
 * asked as directly as possible. Deeper per-station physics claims live in
 * playground-stations.test.ts; this file exists so a broken solver
 * integration fails loudly and specifically within one test run.
 */

function station(sceneId: string) {
  const found = physicsPlaygroundStationV1(sceneId);
  if (!found) throw new Error(`No playground station registered for '${sceneId}'.`);
  return found;
}

const falling = station('studio:scene:physics-falling');
const structures = station('studio:scene:physics-structures');
const launcher = station('studio:scene:physics-launcher');

// One shared run per expensive scenario, started lazily at first await so a
// rejection is always owned by the test that observed it (an import-time
// promise rejects before any handler exists and vitest blames the wrong
// test in its diagnostics).
function once<T>(make: () => Promise<T>): () => Promise<T> {
  let started: Promise<T> | null = null;
  return () => started ??= make();
}
const fallingRun = once(() => runPlaygroundScenarioV1(falling, 'falling-settle'));
const structuresRun = once(() => runPlaygroundScenarioV1(structures, 'structures-stand'));
const ccdRun = once(() => runPlaygroundScenarioV1(launcher, 'launcher-ccd-stops'));

describe('physics playground smoke', () => {
  it('1. a falling object reaches the floor', async () => {
    const result = await fallingRun();
    const settle = result.checks.find((check) => check.check === 'settles-on-floor');
    expect(settle?.detail ?? '(check missing)').toContain('rest on the floor');
    expect(settle?.status).toBe('pass');
  }, 120_000);

  it('2. a resting object does not fall through the floor', async () => {
    const result = await fallingRun();
    const penetration = result.checks.find(
      (check) => check.check === 'no-floor-penetration',
    );
    expect(penetration?.status).toBe('pass');
    expect(result.maxFloorPenetration).toBeLessThan(0.02);
  }, 120_000);

  it('2b. a declared soft-CCD watch is what keeps a hard landing out of the floor', async () => {
    // The falling station's whole burial story, pinned from both sides.
    // Shipped, the droppers declare `softCcd` and the six-meter landing
    // barely dents the floor. The counter-run strips the declarations —
    // the world the studio actually showed for five weeks while the twin
    // silently blanketed the watch onto everything (the resolved KNOWN
    // DIVERGENCE) — and the same landing buries more than a tenth of a
    // meter. Both numbers measured 2026-08-27: 0.0034 against 0.1643.
    const declared = await fallingRun();
    expect(declared.maxImpactBurial).toBeLessThan(0.01);
    const stripped = {
      ...falling,
      bodies: falling.bodies.map((body) => {
        const { softCcd, ...rest } = body;
        void softCcd;
        return rest;
      }),
    };
    const bare = await runPlaygroundScenarioV1(stripped, 'falling-settle');
    expect(bare.maxImpactBurial).toBeGreaterThan(0.1);
  }, 120_000);

  it('2c. both lanes read the same soft-CCD declarations', () => {
    // The parity half of the resolved divergence: the live profile must
    // carry the watch exactly where the body defs declare it, so the
    // studio and the twin land the same drop. A dropper carries the one
    // shared distance; a trebuchet brick and the ball carry none.
    const fallingProfile = createPhysicsPlaygroundProfileV1(falling);
    for (const id of ['cube-stone-solid', 'cube-wood', 'beam']) {
      const plan = fallingProfile.bodies.find(
        (body) => body.placementId === id);
      expect(plan?.softCcdPrediction, `${id} watches`)
        .toBe(SOLVER_SOFT_CCD_PREDICTION_V1);
    }
    const treb = station('studio:scene:physics-trebuchet');
    const trebProfile = createPhysicsPlaygroundProfileV1(treb);
    for (const id of ['ball', 'brick-0-0']) {
      const plan = trebProfile.bodies.find(
        (body) => body.placementId === id);
      expect(plan, `${id} exists`).toBeDefined();
      expect(plan?.softCcdPrediction, `${id} declares no watch`)
        .toBeUndefined();
    }
  });

  it('3. a stationary stack does not immediately explode', async () => {
    const result = await structuresRun();
    const held = result.checks.find((check) => check.check === 'holds-still');
    expect(held?.status, held?.detail).toBe('pass');
  }, 120_000);

  it('4. a fast projectile does not pass through the test wall', async () => {
    const result = await ccdRun();
    const stopped = result.checks.find((check) => check.check === 'crossed-plane');
    expect(stopped?.status, stopped?.detail).toBe('pass');
  }, 120_000);

  it('5. resetting a scenario restores its original state', async () => {
    await initPlaygroundRapierV1();
    const first = PlaygroundWorldV1.create(falling);
    const opening = first.snapshot();
    for (let tick = 0; tick < 120; tick += 1) first.step();
    const disturbed = first.snapshot();
    first.free();

    // Reset is a rebuild: the fresh world must match the original opening
    // frame exactly, not the disturbed one.
    const second = PlaygroundWorldV1.create(falling);
    const reopened = second.snapshot();
    second.free();

    // Compare bodies, not whole frames: the frame embeds the tick counter,
    // which would satisfy an inequality even if stepping were a no-op.
    expect(disturbed.bodies).not.toEqual(opening.bodies);
    expect(reopened.bodies.length).toBe(opening.bodies.length);
    for (const [index, body] of reopened.bodies.entries()) {
      const original = opening.bodies[index]!;
      expect(body.placementId).toBe(original.placementId);
      for (const axis of [0, 1, 2] as const) {
        expect(body.translation[axis]).toBeCloseTo(original.translation[axis], 9);
        expect(body.linearVelocity[axis]).toBeCloseTo(original.linearVelocity[axis], 9);
      }
    }
  }, 60_000);

  it('6. no tested object produces NaN or infinite values', async () => {
    const results = await Promise.all([fallingRun(), structuresRun(), ccdRun()]);
    for (const result of results) {
      expect(result.nonFiniteSamples, playgroundResultLineV1(result)).toBe(0);
      const finite = result.checks.find((check) => check.check === 'all-finite');
      expect(finite?.status).toBe('pass');
    }
  }, 120_000);

  it('7. deleting an object mid-run leaves no invalid physics references', async () => {
    await initPlaygroundRapierV1();
    const world = PlaygroundWorldV1.create(structures);
    try {
      for (let tick = 0; tick < 60; tick += 1) world.step();
      world.remove('bridge-pier-mid');
      for (let tick = 0; tick < 120; tick += 1) world.step();
      const frame = world.snapshot();
      expect(frame.bodies.some((body) => body.placementId === 'bridge-pier-mid'))
        .toBe(false);
      for (const body of frame.bodies) {
        for (const value of [...body.translation, ...body.linearVelocity]) {
          expect(Number.isFinite(value)).toBe(true);
        }
      }
      // Removing it twice must be a named error, not a crash or a silence.
      expect(() => { world.remove('bridge-pier-mid'); })
        .toThrow(/never spawned or was already removed/);
    } finally {
      world.free();
    }
  }, 60_000);

  it('8. the same deterministic scenario twice gives the same result', async () => {
    const again = await runPlaygroundScenarioV1(falling, 'falling-settle');
    const original = await fallingRun();
    // The verdict is a pure function of the physics now: timing is reported
    // but no longer decides it, so two runs of one scenario must agree
    // exactly rather than merely both avoiding 'fail'.
    expect(again.status).toBe(original.status);
    expect(again.status).toBe('pass');
    expect(again.finalBodies.length).toBe(original.finalBodies.length);
    for (const [index, body] of again.finalBodies.entries()) {
      const reference = original.finalBodies[index]!;
      expect(body.placementId).toBe(reference.placementId);
      for (const axis of [0, 1, 2] as const) {
        // Same wasm build, same inputs, same order: agreement should be far
        // tighter than any physical tolerance.
        expect(body.translation[axis]).toBeCloseTo(reference.translation[axis], 6);
      }
    }
  }, 120_000);
});
