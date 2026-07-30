import { describe, expect, it } from 'vitest';

import { buildRecipe } from '../../tools/studio/recipe.js';
import { createStudioParts } from '../../tools/studio/parts.js';
import { createPhysicsPlaygroundRecipeBook } from '../../tools/studio/physics-playground-recipes.js';
import { modelOccupancyV1 } from '../../tools/studio/voxel-colliders.js';
import { PLAYGROUND_FLOOR_TOP_V1 } from '../../tools/studio/physics-playground-types.js';
import { playgroundBodySpecsV1 } from '../../tools/studio/physics-playground-bodies.js';
import { createTrebuchetPurposeGraphV1 } from '../../tools/studio/scene-purpose-trebuchet.js';
import {
  createTrebuchetStationV1,
  trebuchetCockedPosesV1,
  TREBUCHET_ARM_LOCAL_V1,
  TREBUCHET_AXLE_Y_V1,
  TREBUCHET_AXLE_Z_V1,
  TREBUCHET_COCKED_DEGREES_V1,
  TREBUCHET_HANGER_REACH_V1,
  TREBUCHET_LONG_ARM_V1,
  TREBUCHET_TRIGGER_ROPE_V1,
} from '../../tools/studio/physics-playground-trebuchet.js';
import {
  playgroundResultLineV1,
  runPlaygroundScenarioV1,
} from './playground-run.js';
import {
  type PlaygroundScenarioResultV1,
} from '../../tools/studio/physics-playground-checks.js';
import { initPlaygroundRapierV1, PlaygroundWorldV1 } from './playground-world.js';

/**
 * The trebuchet: the playground's first jointed machine. These tests bind
 * the four deterministic scenarios (fire, hold, and the two subtraction
 * runs), the drawn-geometry-to-joint-anchor alignment that keeps the
 * bearings honest, the cocked pose's clearances, double-run determinism,
 * and the joint lifecycle around removal and detachment.
 */

function expectPass(result: PlaygroundScenarioResultV1): void {
  const line = playgroundResultLineV1(result);
  const failures = result.checks
    .filter((check) => check.status === 'fail')
    .map((check) => check.detail)
    .join(' | ');
  expect(result.status, `${line}${failures ? ` :: ${failures}` : ''}`)
    .not.toBe('fail');
}

const station = createTrebuchetStationV1();

function occupied(recipeId: string): (x: number, y: number, z: number) => boolean {
  const book = createPhysicsPlaygroundRecipeBook();
  const recipe = book[recipeId];
  if (!recipe) throw new Error(`no recipe ${recipeId} in the playground book`);
  const occupancy = modelOccupancyV1(
    buildRecipe(recipe, createStudioParts(), book).model);
  return occupancy.filled;
}

describe('the trebuchet scenarios', () => {
  it('holds cocked: the trigger rope carries the torque', async () => {
    expectPass(await runPlaygroundScenarioV1(station, 'treb-hold'));
  }, 120_000);

  it('fires: the whip throws the ball far downrange', async () => {
    expectPass(await runPlaygroundScenarioV1(station, 'treb-fire'));
  }, 180_000);

  it('subtraction: without the counterweight the fire case is inert', async () => {
    expectPass(await runPlaygroundScenarioV1(station, 'treb-fire-no-cw'));
  }, 120_000);

  it('subtraction: without the sling the swing carries nothing', async () => {
    expectPass(await runPlaygroundScenarioV1(station, 'treb-fire-no-sling'));
  }, 180_000);

  it('without the catch berm the ball leaves the world', async () => {
    // The berm's removal failure, executed. `treb-fire` passes with it;
    // the same fire without it must fail the floor-penetration check,
    // because a ball that rolls off the last tile keeps falling.
    const result = await runPlaygroundScenarioV1(station, 'treb-fire-no-berm');
    expect(result.status, playgroundResultLineV1(result)).toBe('fail');
    const dip = result.checks.find(
      (check) => check.detail.includes('below the floor top'));
    expect(dip, 'expected the floor-penetration check to be what fails')
      .toBeDefined();
  }, 300_000);

  it('fires identically twice', async () => {
    const first = await runPlaygroundScenarioV1(station, 'treb-fire');
    const second = await runPlaygroundScenarioV1(station, 'treb-fire');
    const ballOf = (result: PlaygroundScenarioResultV1) =>
      result.finalBodies.find((body) => body.placementId === 'ball');
    const a = ballOf(first);
    const b = ballOf(second);
    expect(a, 'first run lost its ball').toBeDefined();
    expect(b, 'second run lost its ball').toBeDefined();
    for (let axis = 0; axis < 3; axis += 1) {
      expect(
        Math.abs((a?.translation[axis] ?? 0) - (b?.translation[axis] ?? 0)),
        `ball final position axis ${String(axis)} diverged between identical runs`,
      ).toBeLessThan(1e-9);
    }
  }, 300_000);
});

describe('drawn geometry carries the joints', () => {
  it('the frame bearing holes are open where the axle joint anchors', () => {
    const filled = occupied('studio:pg-treb-frame');
    // The joint anchors the axle at frame-local (0, +1.375, 0): world
    // (0, 3.625, axle z), which is cell row y 13, z 7 in the 16x15 frame.
    // The hole must be open there and one cell around it on the hinge
    // plane, and the ring must be closed just outside.
    for (const x of [0, 9]) {
      for (const y of [12, 13, 14]) {
        for (const z of [6, 7, 8]) {
          expect(filled(x, y, z),
            `bearing hole cell ${String(x)},${String(y)},${String(z)} must be open`)
            .toBe(false);
        }
      }
      expect(filled(x, 11, 7), 'ring floor closed').toBe(true);
      expect(filled(x, 15, 7), 'ring roof closed').toBe(true);
      expect(filled(x, 13, 5), 'ring fore cheek closed').toBe(true);
      expect(filled(x, 13, 9), 'ring aft cheek closed').toBe(true);
    }
  });

  it('the arm rods sit exactly on the joint anchor lines', () => {
    const filled = occupied('studio:pg-treb-arm');
    // Axle local z -1.5 => cell z 6 of 25; hanger -3.0 => cell 0; tip
    // +3.0 => cell 24. Rods run along x at those rows.
    expect(filled(0, 0, 6), 'axle rod reaches the west ring').toBe(true);
    expect(filled(10, 0, 6), 'axle rod reaches the east ring').toBe(true);
    expect(filled(2, 0, 0), 'hanger rod west end').toBe(true);
    expect(filled(8, 0, 0), 'hanger rod east end').toBe(true);
    expect(filled(2, 0, 24), 'tip crossbar west end').toBe(true);
    expect(filled(8, 0, 24), 'tip crossbar east end').toBe(true);
    const local = TREBUCHET_ARM_LOCAL_V1;
    expect(local.axle[2]).toBeCloseTo((6.5 - 12.5) * 0.25, 10);
    expect(local.hanger[2]).toBeCloseTo((0.5 - 12.5) * 0.25, 10);
    expect(local.tip[2]).toBeCloseTo((24.5 - 12.5) * 0.25, 10);
  });

  it('the counterweight eye and sling hook are open where their joints anchor', () => {
    // These two anchors were literals no test read. The cw hinge anchors
    // at cw-local (0, +0.5, 0) and the sling pivot at sling-local
    // (0, 0, -1.5); both must fall inside an open ring on drawn geometry,
    // with the ring closed just outside.
    const station = createTrebuchetStationV1();
    const specs = playgroundBodySpecsV1(station);
    const hinge = station.joints?.find((joint) => joint.id === 'cw-hinge');
    const pivot = station.joints?.find((joint) => joint.id === 'sling-pivot');
    expect(hinge, 'the cw hinge must exist').toBeDefined();
    expect(pivot, 'the sling pivot must exist').toBeDefined();

    // Counterweight: model 7x9x5, so local (0, 0.5, 0) is cell
    // (3, 6.5, 2) — the eye-hole row between the ring's two bars.
    const cw = occupied('studio:pg-treb-cw');
    const cwSize = specs.get('cw')?.modelSize ?? [0, 0, 0];
    const cwCell = (local: readonly [number, number, number]) => [
      Math.floor(cwSize[0] / 2 + local[0] / 0.25),
      Math.floor(cwSize[1] / 2 + local[1] / 0.25),
      Math.floor(cwSize[2] / 2 + local[2] / 0.25),
    ] as const;
    const [hx, hy, hz] = cwCell(hinge!.anchorB);
    for (const x of [0, 6]) {
      expect(cw(x, hy, hz),
        `cw eye hole must be open at ${String(x)},${String(hy)},${String(hz)}`)
        .toBe(false);
      expect(cw(x, hy - 2, hz), 'cw eye ring lower bar').toBe(true);
      expect(cw(x, hy + 2, hz), 'cw eye ring upper bar').toBe(true);
    }
    expect(hx, 'the hinge anchors on the model centreline').toBe(3);

    // Sling: model 5x5x17, local (0, 0, -1.5) is cell (2, 2, 2) — inside
    // the C-hook, which is open toward the arm shaft by design.
    const sling = occupied('studio:pg-treb-sling');
    const slingSize = specs.get('sling')?.modelSize ?? [0, 0, 0];
    const pz = Math.floor(slingSize[2] / 2 + pivot!.anchorB[2] / 0.25);
    expect(sling(2, 2, pz), 'sling hook interior must be open').toBe(false);
    expect(sling(2, 0, pz), 'sling hook lower bar').toBe(true);
    expect(sling(2, 4, pz), 'sling hook upper bar').toBe(true);
    expect(sling(2, 2, pz + 2), 'sling hook bearing cheek').toBe(true);
  });

  it('the cocked crossbar clears the trigger post it is lashed to', () => {
    // Emergent, and previously unasserted: if the arm ever settled onto
    // the post, the post — not the lashing — would carry the torque and
    // `treb-hold` would still pass. Pin the gap.
    const poses = trebuchetCockedPosesV1();
    const crossbarLowest = poses.tip[1] - 0.125;
    const postTop = PLAYGROUND_FLOOR_TOP_V1 + 0.75;
    expect(crossbarLowest - postTop,
      'cocked tip crossbar must hang clear above the trigger post')
      .toBeGreaterThan(0.01);
  });

  it('the cocked pose clears the floor and keeps the rope taut', () => {
    const poses = trebuchetCockedPosesV1();
    // The sling hook is 1.25 m tall around the tip; its lowest wood must
    // clear the floor — the 38.4-degree first cut buried it 4 cm deep.
    expect(poses.tip[1] - 0.75, 'sling eye bottom vs floor top')
      .toBeGreaterThan(0.25 + 0.02);
    // The counterweight hangs plumb; its crate bottom sits 1.625 below
    // the hinge and must clear the floor at the lowest point of a swing.
    const hingeLowest = TREBUCHET_AXLE_Y_V1 - TREBUCHET_HANGER_REACH_V1;
    expect(hingeLowest - 1.625, 'counterweight lowest-swing clearance')
      .toBeGreaterThan(0.25 + 0.05);
    // The trigger tie must be within its rope length at the cocked pose
    // (taut, small slack) — a slack rope lets the arm sag into the post.
    const tieFrom: readonly [number, number, number] = [
      poses.arm.centre[0] + 0.75,
      poses.tip[1],
      poses.tip[2],
    ];
    const tieTo: readonly [number, number, number] =
      [poses.anchorAt[0], 0.25 + 0.75, poses.anchorAt[2]];
    const distance = Math.hypot(
      tieFrom[0] - tieTo[0], tieFrom[1] - tieTo[1], tieFrom[2] - tieTo[2]);
    expect(distance, 'trigger tie distance vs rope length')
      .toBeLessThanOrEqual(TREBUCHET_TRIGGER_ROPE_V1 + 0.005);
    expect(distance, 'trigger tie should be nearly taut')
      .toBeGreaterThan(TREBUCHET_TRIGGER_ROPE_V1 - 0.08);
    // The station's authored world places the axle datum where the frame
    // draws its bearings.
    expect(poses.tip[2]).toBeCloseTo(
      TREBUCHET_AXLE_Z_V1 + TREBUCHET_LONG_ARM_V1
        * Math.cos((TREBUCHET_COCKED_DEGREES_V1 * Math.PI) / 180), 6);
  });
});

describe('joint lifecycle', () => {
  it('removal forgets joints and detach reports honestly', async () => {
    await initPlaygroundRapierV1();
    const world = PlaygroundWorldV1.create(station);
    expect(world.jointCount(), 'axle, hinge, pivot, trigger').toBe(4);
    world.detachJoint('trigger');
    expect(world.jointCount()).toBe(3);
    expect(() => { world.detachJoint('trigger'); }).toThrowError(
      /no live joint carries that id/);
    world.remove('cw');
    expect(world.jointCount(), 'the hinge left with the crate').toBe(2);
    expect(() => { world.detachJoint('cw-hinge'); }).toThrowError(
      /no live joint/);
    for (let tick = 0; tick < 240; tick += 1) world.step();
    const snapshot = world.snapshot();
    for (const body of snapshot.bodies) {
      for (const value of [...body.translation, ...body.quaternion]) {
        expect(Number.isFinite(value),
          `${body.placementId} went non-finite after removal mid-machine`)
          .toBe(true);
      }
    }
  }, 120_000);
});

describe('the trebuchet ledger against the live station', () => {
  // The hole this closes: a `provenBy` string is free text, so a binding
  // can name a scenario that asserts nothing of the kind. An adversarial
  // review found five such overreaches in the first draft of this graph.
  // Every vitest binding must now name a scenario the station actually
  // declares, and every scenario must be named by something.
  const graph = createTrebuchetPurposeGraphV1();
  const scenarioIds = new Set(station.scenarios.map((entry) => entry.id));

  function vitestProofIds(): readonly string[] {
    return graph.nodes
      .map((node) => node.evidence)
      .filter((evidence) => evidence.kind === 'bound')
      .map((evidence) => evidence.proofId)
      .filter((proofId) => proofId.startsWith('vitest '));
  }

  it('binds only to scenarios this station declares', () => {
    for (const proofId of vitestProofIds()) {
      const named = [...scenarioIds].filter((id) => proofId.includes(id));
      // A proof may name more than one scenario when its claim spans
      // them ('treb-hold and treb-fire'), but it must name at least one,
      // and geometry proofs must point at the test file instead.
      expect(
        named.length > 0 || proofId.includes('playground-trebuchet.test.ts'),
        `'${proofId}' names no scenario this station declares`,
      ).toBe(true);
    }
  });

  it('leaves no scenario unclaimed by the ledger', () => {
    const allProofs = vitestProofIds().join(' | ');
    for (const id of scenarioIds) {
      expect(allProofs.includes(id), `no ledger node cites '${id}'`)
        .toBe(true);
    }
  });

  it('states an open obligation where nothing proves the claim', () => {
    // The frame's geometry is legibility, not load — measured. A ledger
    // in which everything is 'bound' is the smell this guards against.
    const open = graph.nodes.filter((node) => node.evidence.kind === 'open');
    expect(open.length, 'something here should still be unproven')
      .toBeGreaterThan(0);
    for (const node of open) {
      const evidence = node.evidence;
      if (evidence.kind !== 'open') continue;
      expect(evidence.wouldBeClosedBy.length,
        `${node.id} must say what would close it`).toBeGreaterThan(20);
    }
  });
});
