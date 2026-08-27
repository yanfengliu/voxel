import { describe, expect, it } from 'vitest';

import {
  createPhysicsPlaygroundStationsV1,
  physicsPlaygroundStationV1,
  type PlaygroundStationV1,
} from '../../tools/studio/physics-playground-stations.js';
import {
  playgroundBodySpecsV1,
} from '../../tools/studio/physics-playground-bodies.js';
import {
  solverTicksForSecondsV1,
} from '../../tools/studio/solver-rate.js';
import {
  PLAYGROUND_FLOOR_TOP_V1,
  type PlaygroundActionV1,
} from '../../tools/studio/physics-playground-types.js';
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
          // Actions declare seconds; this probe walks ticks of the shared
          // rate, so the schedule converts the same way the runner does.
          const lastTick = Math.max(...testCase.actions.map(
            (action) => solverTicksForSecondsV1(action.atSeconds)));
          for (let tick = 0; tick <= lastTick; tick += 1) {
            const spawnedNow = testCase.actions
              .filter((action) =>
                solverTicksForSecondsV1(action.atSeconds) === tick)
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
                } else if (action.kind === 'motor-velocity') {
                  // A drive command, not a release: the old trailing else
                  // detached the cart's four axles here and nothing said so.
                  world.setJointMotorVelocity(action.jointId, {
                    target: action.target, factor: action.factor,
                  });
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

  it('every scenario names only cases, bodies, and joints that exist', () => {
    for (const entry of createPhysicsPlaygroundStationsV1()) {
      const ids = new Set(entry.bodies.map((body) => body.placementId));
      const joints = entry.joints ?? [];
      const checkActions = (owner: string, actions: readonly PlaygroundActionV1[]): void => {
        for (const action of actions) {
          if (action.kind === 'detach-joint') {
            expect(
              joints.some((joint) => joint.id === action.jointId),
              `${owner} detaches missing joint ${action.jointId}`,
            ).toBe(true);
            continue;
          }
          if (action.kind === 'motor-velocity') {
            const joint = joints.find((entry2) => entry2.id === action.jointId);
            expect(
              joint !== undefined,
              `${owner} commands missing joint ${action.jointId}`,
            ).toBe(true);
            // A command retargets an existing drive; a joint with no
            // declared motor has nothing to retarget.
            expect(
              joint?.motorVelocity !== undefined,
              `${owner} commands joint ${action.jointId}, which declares no `
              + 'motorVelocity',
            ).toBe(true);
            continue;
          }
          expect(
            ids.has(action.placementId),
            `${owner} names missing body ${action.placementId}`,
          ).toBe(true);
        }
      };
      for (const scenario of entry.scenarios) {
        if (scenario.caseId !== undefined) {
          expect(
            entry.cases.some((candidate) => candidate.id === scenario.caseId),
            `${scenario.id} names missing case ${scenario.caseId}`,
          ).toBe(true);
        }
        checkActions(`scenario ${scenario.id}`, scenario.actions ?? []);
        for (const locked of scenario.lockJoints ?? []) {
          expect(
            joints.some((joint) => joint.id === locked),
            `${scenario.id} locks missing joint ${locked}`,
          ).toBe(true);
        }
      }
      for (const testCase of entry.cases) {
        checkActions(`case ${testCase.id}`, testCase.actions);
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

  it('without the berm ice slides off the world, which is why it stays', async () => {
    // This station's berm survived the same subtraction test the rolling
    // station's berms failed. Nothing is missing from the physics here:
    // ice is declared at friction 0.04 and behaves like it.
    expectPass(await runPlaygroundScenarioV1(ramp, 'ramp-berm-control'));
  }, 120_000);

  it('with the berm the same ice arrives at the wall and is stopped there', async () => {
    // The other half of the control, and it has to say more than "the ice
    // is still above the floor" — the scenario's own floor-penetration
    // check already covers that, and covers it harder.
    //
    // What this pins is where the ice ends up, because that is what shows
    // the wall is doing the stopping. Measured: it reaches the ramp foot
    // at x -4.5 doing 6.17 m/s, and one sampling interval later it is at
    // -4.76 with 0.04 m/s left. That is an impact, not friction running
    // out. It comes to rest at x -4.799, and its furthest west point is
    // -4.833 — a 1 m cube still tilted off the 20-degree ramp, so its
    // leading corner reaches x -5.47, just past the berm's east face at
    // -5.45. It touches the wall and stops; it does not coast to a halt
    // short of it, and it does not ride over it.
    const held = await runPlaygroundScenarioV1(ramp, 'ramp-20-split');
    const ice = held.finalBodies.find((body) => body.placementId === 'block-ice');
    expect(ice, 'the 20-degree run lost its ice block').toBeDefined();
    const line = playgroundResultLineV1(held);
    const x = ice?.translation[0] ?? 0;
    expect(x, `${line} :: ice should end past the ramp foot at x -4.5`)
      .toBeLessThan(-4.5);
    expect(x, `${line} :: ice should end against the berm, not past it`)
      .toBeGreaterThan(-5.45);
    expect(ice?.translation[1] ?? -99, `${line} :: ice should end on the floor`)
      .toBeGreaterThan(0);
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
  }, 60_000);

  it("conserves momentum when two shots meet in mid-air (Newton's third)", async () => {
    // The one arrangement here where the third law is checkable exactly:
    // both bodies airborne, gravity the only outside force and removed
    // exactly. Measured drift is 0.002 against a momentum of ~2,968.
    expectPass(await runPlaygroundScenarioV1(launcher, 'launcher-midair-momentum'));
  }, 60_000);

  it('does not find momentum conserved for one body of the pair', async () => {
    // The control that makes the law above mean something: the same
    // collision, one body accounted instead of two, must fail — and
    // does, drifting 427 against the same 1% allowance.
    const result = await runPlaygroundScenarioV1(launcher, 'launcher-midair-one-body');
    expect(result.status, playgroundResultLineV1(result)).toBe('fail');
    // 'drifted' specifically: the missing-body diagnostic also contains
    // the word 'momentum', so matching that alone would let this pass
    // when the scenario never collided at all.
    expect(
      result.checks.some((check) => check.detail.includes('drifted')),
      'expected the momentum drift check to be what fails',
    ).toBe(true);
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

  it('every racer stops on the apron under its own rolling resistance', async () => {
    // Nothing walls this station in any more. Rolling resistance is what
    // ends every run: the smooth ball takes 19.7 m and 14.5 s from
    // 5.09 m/s at the slope foot, and the faceted racers stop far sooner.
    expectPass(await runPlaygroundScenarioV1(rolling, 'rolling-run-out'));
  }, 180_000);

  it('putting the catch berms back falsifies the run-out result', async () => {
    // The counter-run for deleting them, and the reason they went.
    //
    // The berms were built when a rigid ball never stopped, and stood
    // 1.25 m at x -15.5 and z 7.6. Rolling resistance stops the ball now:
    // it used to come to rest against the west wall at x -14.37 and now
    // rests at -29.13, so the wall no longer catches a runaway, it
    // truncates a measurement. Measured against the berms
    // the smooth ball finished 0.177 m ahead of the voxel sphere; measured
    // on ground long enough, 14.644 m ahead. Re-standing them must fail
    // this scenario, or the deletion bought nothing.
    const walled: PlaygroundStationV1 = {
      ...rolling,
      bodies: [
        ...rolling.bodies,
        {
          placementId: 'berm-west',
          recipeId: 'studio:pg-berm',
          kind: 'fixed',
          material: 'stone',
          at: [-15.5, PLAYGROUND_FLOOR_TOP_V1, 0],
          tests: 'counter-run only: the deleted catch wall, put back',
        },
        {
          placementId: 'berm-north',
          recipeId: 'studio:pg-berm',
          kind: 'fixed',
          material: 'stone',
          at: [0, PLAYGROUND_FLOOR_TOP_V1, 7.6],
          turns: 1,
          tests: 'counter-run only: the deleted catch wall, put back',
        },
      ],
    };
    const result = await runPlaygroundScenarioV1(walled, 'rolling-run-out');
    expect(result.status, playgroundResultLineV1(result)).toBe('fail');
    const truncated = result.checks.filter(
      (check) => check.status === 'fail' && check.detail.includes('ahead of'));
    expect(
      truncated.map((check) => check.detail).join(' | '),
      'expected the walled run to fail on the lead the berms truncate',
    ).not.toBe('');
  }, 180_000);
});
