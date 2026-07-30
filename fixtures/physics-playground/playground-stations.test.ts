import { describe, expect, it } from 'vitest';

import {
  createPhysicsPlaygroundStationsV1,
  physicsPlaygroundStationV1,
  type PlaygroundStationV1,
} from '../../tools/studio/physics-playground-stations.js';
import {
  playgroundBodySpecsV1,
} from '../../tools/studio/physics-playground-bodies.js';
import type {
  PlaygroundScenarioResultV1,
} from '../../tools/studio/physics-playground-checks.js';
import {
  playgroundResultLineV1,
  runPlaygroundScenarioV1,
} from './playground-run.js';
import {
  initPlaygroundRapierV1,
  PlaygroundWorldV1,
} from './playground-world.js';

/**
 * Per-station physics claims: friction thresholds, momentum direction,
 * tunneling with and without CCD, collapse on support removal, and the
 * rotational-inertia race. Each scenario runs once; its checks carry the
 * physical reasoning, so these tests mostly assert "the scenario judged
 * itself green" and print the one-line result for the log.
 */

function station(sceneId: string): PlaygroundStationV1 {
  const found = physicsPlaygroundStationV1(sceneId);
  if (!found) throw new Error(`No playground station registered for '${sceneId}'.`);
  return found;
}

function expectPass(result: PlaygroundScenarioResultV1): void {
  const line = playgroundResultLineV1(result);
  const failures = result.checks
    .filter((check) => check.status === 'fail')
    .map((check) => check.detail)
    .join(' | ');
  expect(result.status, `${line}${failures ? ` :: ${failures}` : ''}`)
    .not.toBe('fail');
}

describe('station definitions', () => {
  it('every station builds specs with unique ids and nonempty colliders', () => {
    for (const entry of createPhysicsPlaygroundStationsV1()) {
      const specs = playgroundBodySpecsV1(entry, { rampAngleDegrees: 20 });
      expect(specs.size).toBe(entry.bodies.length);
      for (const spec of specs.values()) {
        expect(
          spec.boxes.length > 0 || spec.ballRadius !== undefined,
          `'${spec.placementId}' in ${entry.sceneId} has no colliders`,
        ).toBe(true);
        expect(spec.voxelCount).toBeGreaterThan(0);
        expect(spec.tests.length).toBeGreaterThan(20);
      }
    }
  });

  it('no body spawns penetrating another', async () => {
    // The solver ejects overlapping spawns with a silent sideways shove —
    // it displaced the ramp lineup 0.17 m, the bridge decks 0.26 m, and the
    // sphere lanes 0.15 m before this guard existed. The engine's own
    // narrow phase is the oracle: after one near-motionless tick, no
    // contact between two distinct bodies may be deeper than a resting
    // tolerance. Touching is allowed; penetration is not.
    await initPlaygroundRapierV1();
    for (const entry of createPhysicsPlaygroundStationsV1()) {
      const world = PlaygroundWorldV1.create(entry, { rampAngleDegrees: 20 });
      try {
        world.step();
        const deepest = world.deepestContactPenetration();
        expect(
          deepest.depth <= 0.005,
          `${entry.sceneId}: '${deepest.a}' and '${deepest.b}' spawn with `
          + `${deepest.depth.toFixed(4)} m of contact penetration — the `
          + 'solver would silently eject them apart',
        ).toBe(true);
      } finally {
        world.free();
      }
    }
  }, 120_000);

  it('an impulse wakes a resting body and moves it', async () => {
    await initPlaygroundRapierV1();
    const falling = physicsPlaygroundStationV1('studio:scene:physics-falling');
    if (!falling) throw new Error('no falling station');
    const world = PlaygroundWorldV1.create(falling);
    try {
      for (let tick = 0; tick < 480; tick += 1) world.step();
      const before = world.snapshot().bodies
        .find((body) => body.placementId === 'cube-wood');
      // The cube weighs ~130 mass units, so 400 impulse units is a 3 m/s
      // shove; wood friction then grants about a meter of slide. (A first
      // draft used 40 and moved the cube 1 cm — impulses must scale with
      // mass, which is why the studio control derives its impulse from the
      // selected body's own mass.)
      world.impulse('cube-wood', [400, 0, 0]);
      for (let tick = 0; tick < 240; tick += 1) world.step();
      const after = world.snapshot().bodies
        .find((body) => body.placementId === 'cube-wood');
      if (!before || !after) throw new Error('cube-wood missing from snapshots');
      const moved = Math.hypot(
        after.translation[0] - before.translation[0],
        after.translation[2] - before.translation[2],
      );
      expect(moved, 'a 3 m/s impulse must visibly shove the resting cube')
        .toBeGreaterThan(0.25);
      expect(Number.isFinite(after.translation[0])).toBe(true);
    } finally {
      world.free();
    }
  }, 60_000);

  it('no case spawns a body penetrating another', async () => {
    await initPlaygroundRapierV1();
    for (const entry of createPhysicsPlaygroundStationsV1()) {
      for (const testCase of entry.cases) {
        const world = PlaygroundWorldV1.create(entry, { rampAngleDegrees: 20 });
        try {
          const lastTick = Math.max(
            ...testCase.actions.map((action) => action.atTick));
          for (let tick = 0; tick <= lastTick; tick += 1) {
            const spawnedNow = testCase.actions
              .filter((action) => action.atTick === tick)
              .map((action) => {
                if (action.kind === 'spawn') {
                  world.spawn(action.placementId, {
                    centre: action.centre,
                    ...(action.velocity ? { velocity: action.velocity } : {}),
                    ...(action.ccd ? { ccd: true } : {}),
                  });
                  return action.placementId;
                }
                if (action.kind === 'remove') world.remove(action.placementId);
                else if (action.kind === 'impulse') {
                  world.impulse(action.placementId, action.impulse);
                } else world.detachJoint(action.jointId);
                return null;
              })
              .filter((id) => id !== null);
            world.step();
            if (spawnedNow.length > 0) {
              const deepest = world.deepestContactPenetration();
              expect(
                deepest.depth <= 0.005,
                `${entry.sceneId} case '${testCase.id}': right after `
                + `spawning [${spawnedNow.join(', ')}], '${deepest.a}' and `
                + `'${deepest.b}' show ${deepest.depth.toFixed(4)} m of `
                + 'contact penetration — the spawn pose intersects something',
              ).toBe(true);
            }
          }
        } finally {
          world.free();
        }
      }
    }
  }, 120_000);

  it('every scenario names only cases and bodies that exist', () => {
    for (const entry of createPhysicsPlaygroundStationsV1()) {
      const ids = new Set(entry.bodies.map((body) => body.placementId));
      for (const scenario of entry.scenarios) {
        if (scenario.caseId !== undefined) {
          expect(
            entry.cases.some((candidate) => candidate.id === scenario.caseId),
            `${scenario.id} names missing case ${scenario.caseId}`,
          ).toBe(true);
        }
      }
      for (const testCase of entry.cases) {
        for (const action of testCase.actions) {
          if (action.kind === 'detach-joint') {
            expect(
              (entry.joints ?? []).some((joint) => joint.id === action.jointId),
              `case ${testCase.id} detaches missing joint ${action.jointId}`,
            ).toBe(true);
            continue;
          }
          expect(
            ids.has(action.placementId),
            `case ${testCase.id} names missing body ${action.placementId}`,
          ).toBe(true);
        }
      }
    }
  });
});

describe('ramp and friction', () => {
  const ramp = station('studio:scene:physics-ramp');

  it('at 10 degrees only ice slides', async () => {
    expectPass(await runPlaygroundScenarioV1(ramp, 'ramp-10-all-hold'));
  }, 120_000);

  it('at 20 degrees ice and steel slide while wood and stone hold', async () => {
    expectPass(await runPlaygroundScenarioV1(ramp, 'ramp-20-split'));
  }, 120_000);

  it('at 40 degrees every material slides', async () => {
    expectPass(await runPlaygroundScenarioV1(ramp, 'ramp-40-all-slide'));
  }, 120_000);
});

describe('collision range', () => {
  const launcher = station('studio:scene:physics-launcher');

  it('a light projectile barely moves a heavy target', async () => {
    expectPass(await runPlaygroundScenarioV1(launcher, 'launcher-light-heavy'));
  }, 120_000);

  it('a heavy projectile sends a light target flying', async () => {
    expectPass(await runPlaygroundScenarioV1(launcher, 'launcher-heavy-light'));
  }, 120_000);

  it('equal masses exchange momentum', async () => {
    expectPass(await runPlaygroundScenarioV1(launcher, 'launcher-equal'));
  }, 120_000);

  it('without CCD the fast shot tunnels through the thin wall (documented artifact)', async () => {
    expectPass(await runPlaygroundScenarioV1(launcher, 'launcher-noccd-tunnels'));
  }, 120_000);

  it('the pyramid scatters without leaking through the floor', async () => {
    expectPass(await runPlaygroundScenarioV1(launcher, 'launcher-stack'));
  }, 120_000);
});

describe('structures', () => {
  const structures = station('studio:scene:physics-structures');

  it('removing the middle pier drops both bridge spans', async () => {
    expectPass(await runPlaygroundScenarioV1(structures, 'structures-bridge-collapse'));
  }, 120_000);

  it('the lintel carries a dropped weight into its pillars', async () => {
    expectPass(await runPlaygroundScenarioV1(structures, 'structures-lintel-load'));
  }, 120_000);
});

describe('rolling and rotation', () => {
  const rolling = station('studio:scene:physics-rolling');

  it('the smooth ball beats both faceted cylinders, which both roll', async () => {
    expectPass(await runPlaygroundScenarioV1(rolling, 'rolling-inertia-race'));
  }, 180_000);

  it('the ideal ball rolls alike on both track headings; the voxel sphere still travels', async () => {
    expectPass(await runPlaygroundScenarioV1(rolling, 'rolling-grid-artifact'));
  }, 180_000);
});
