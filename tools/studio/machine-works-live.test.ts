import { describe, expect, it } from 'vitest';

import { timeoutForMeasuredWorkMs } from '../../tests/testing/test-timeout.js';

import { createStudioCatalog } from './catalog.js';
import {
  LIVE_TICKS_PER_SECOND_V1,
  LIVE_TIMESTEP_SECONDS_V1,
  LivePhysicsSessionV1,
  type LivePlacementSourceV1,
} from './live-physics.js';
import { MACHINE_WORKS_SCENE_LAYOUT_V1 } from './machine-works-layout.js';
import {
  MACHINE_WORKS_LIVE_PLACEMENT_IDS_V1 as IDS,
  MachineWorksLiveControllerV1,
} from './machine-works-live.js';
import {
  MACHINE_WORKS_LIVE_PROFILE_V1,
  MACHINE_WORKS_LIVE_SCENE_ID_V1,
} from './machine-works-live-profile.js';
import { MACHINE_WORKS_LAYOUT, MACHINE_WORKS_TICKS } from './machine-works-machine.js';
import { buildRecipe } from './recipe.js';
import { createStudioScenes } from './scenes.js';
import { catalogPartsV1, catalogRecipesV1 } from './studio-library.js';

/**
 * The machine making one thing, solved rather than replayed.
 *
 * Every failure this caught was invisible in the numbers until the run was
 * watched: a belt commanded at the machine's tick rather than the solver's
 * threw the carrier off at 36 m/s; heads aimed at the base's centre drove
 * their parts through it; a seat that released without welding let the stack
 * come apart the moment the belt moved again.
 */

const TICKS_PER_SECOND = LIVE_TICKS_PER_SECOND_V1;
const RUN_SECONDS = 32;
/**
 * One 32-second solve, measured on the owner's machine: 623 ms and 732 ms for
 * the two cases here.
 *
 * These carried a bare `900_000` before — fifteen minutes for two thirds of a
 * second of work, which is above the shared floor and so never tripped the
 * meta-scan, but loose enough that a fourteen-minute regression would have
 * passed silently. `timeoutForMeasuredWorkMs` states the measurement and lets
 * the contention allowance do the rest.
 */
const MACHINE_WORKS_SOLVE_WORK_MS = 750;
const BUCKET = MACHINE_WORKS_SCENE_LAYOUT_V1.bucket;
const BUCKET_X = [
  BUCKET.at[0] - (BUCKET.sizeVoxels[0] * BUCKET.grain) / 2,
  BUCKET.at[0] + (BUCKET.sizeVoxels[0] * BUCKET.grain) / 2,
] as const;
const BUCKET_TOP = BUCKET.at[1] + BUCKET.sizeVoxels[1] * BUCKET.grain;

interface RunV1 {
  readonly at: (id: string, second: number) => readonly [number, number, number];
  readonly seconds: number;
}

async function runMachine(): Promise<RunV1> {
  const catalog = createStudioCatalog();
  const recipes = catalogRecipesV1(catalog);
  const parts = catalogPartsV1(catalog);
  const scene = createStudioScenes().find(({ id }) => id === MACHINE_WORKS_LIVE_SCENE_ID_V1);
  expect(scene, 'the machine scene is in the catalog').toBeDefined();
  const planned = new Set(MACHINE_WORKS_LIVE_PROFILE_V1.bodies.map((body) => body.placementId));
  const sources: LivePlacementSourceV1[] = scene!.placements
    .filter((placement) => planned.has(placement.id))
    .map((placement) => {
      const model = buildRecipe(recipes[placement.model]!, parts, recipes).model;
      const grain = placement.grain ?? 1;
      // The profile's opening pose wins over the authored anchor, exactly as
      // the studio's own source builder does it. Without this the belt's
      // slats start on the grid instead of on their path, and the test
      // exercises a world the studio never builds.
      const opening = MACHINE_WORKS_LIVE_PROFILE_V1.poses?.[placement.id];
      return {
        placementId: placement.id,
        model,
        grain,
        centre: opening?.centre ?? [
          placement.at[0],
          placement.at[1] + (model.size[1] * grain) / 2,
          placement.at[2],
        ] as const,
        ...(opening?.rotation === undefined ? {} : { rotation: opening.rotation }),
      };
    });
  const session = await LivePhysicsSessionV1.create(MACHINE_WORKS_LIVE_PROFILE_V1, sources);
  const controller = new MachineWorksLiveControllerV1();
  const samples = new Map<number, Map<string, readonly [number, number, number]>>();
  try {
    for (let tick = 0; tick < TICKS_PER_SECOND * RUN_SECONDS; tick += 1) {
      session.stepOnce();
      controller.advance(session, LIVE_TIMESTEP_SECONDS_V1 * 1_000);
      if (tick % TICKS_PER_SECOND === 0) {
        const poses = session.poses();
        const second = tick / TICKS_PER_SECOND;
        samples.set(second, new Map([...poses].map(([id, pose]) => [id, pose.translation])));
      }
    }
  } finally {
    session.dispose();
  }
  return {
    seconds: RUN_SECONDS,
    at: (id, second) => {
      const found = samples.get(second)?.get(id);
      if (found === undefined) {
        throw new Error(`No sample for '${id}' at ${String(second)} s.`);
      }
      return found;
    },
  };
}

describe('Machine Works, solved live', () => {
  it('carries, assembles, releases, and collects one product', {
    timeout: timeoutForMeasuredWorkMs(MACHINE_WORKS_SOLVE_WORK_MS),
  }, async () => {
    const run = await runMachine();
    const coreStationSecond = Math.ceil(MACHINE_WORKS_TICKS.coreAttached / 60) + 1;
    const capStationSecond = Math.ceil(MACHINE_WORKS_TICKS.assembled / 60) + 1;
    const releasedSecond = Math.ceil(MACHINE_WORKS_TICKS.released / 60) + 1;

    // The belt carries the carrier off its entry mark. It is not driven
    // directly — only the slats are — so this is friction transport working.
    expect(run.at(IDS.carriage, 0)[0]).toBeCloseTo(MACHINE_WORKS_LAYOUT.entryX, 1);
    expect(run.at(IDS.carriage, 3)[0]).toBeGreaterThan(MACHINE_WORKS_LAYOUT.entryX + 2);

    // The core comes down onto the base and rides with it afterwards.
    const coreSeated = run.at(IDS.core, coreStationSecond);
    const baseSeated = run.at(IDS.base, coreStationSecond);
    expect(coreSeated[1]).toBeGreaterThan(baseSeated[1]);
    expect(coreSeated[0]).toBeCloseTo(baseSeated[0], 1);

    // The cap goes on top, and the finished stack is three parts in a column.
    const capSeated = run.at(IDS.cap, capStationSecond);
    expect(capSeated[1]).toBeGreaterThan(run.at(IDS.core, capStationSecond)[1]);
    expect(capSeated[0]).toBeCloseTo(run.at(IDS.base, capStationSecond)[0], 1);

    // Welded rather than merely stacked: the assembled product stays a column
    // while the belt accelerates it toward the tip station.
    const travelling = releasedSecond - 2;
    const spread = [IDS.base, IDS.core, IDS.cap]
      .map((id) => run.at(id, travelling)[0]);
    expect(Math.max(...spread) - Math.min(...spread)).toBeLessThan(1);

    // Released: the product leaves the carrier rather than riding it back.
    const settled = run.seconds - 1;
    const carriageEnd = run.at(IDS.carriage, settled)[0];
    for (const id of [IDS.base, IDS.core, IDS.cap]) {
      expect(run.at(id, settled)[0], `${id} left the carrier`)
        .toBeGreaterThan(carriageEnd + 5);
    }

    // Collected: every part comes to rest inside the bucket.
    for (const id of [IDS.base, IDS.core, IDS.cap]) {
      const [x, y] = run.at(id, settled);
      expect(x, `${id} x inside the bucket`).toBeGreaterThan(BUCKET_X[0]);
      expect(x, `${id} x inside the bucket`).toBeLessThan(BUCKET_X[1]);
      expect(y, `${id} sits below the bucket rim`).toBeLessThan(BUCKET_TOP);
      expect(y, `${id} did not fall through the world`).toBeGreaterThan(0);
    }
  });

  it('comes to rest instead of drifting', {
    timeout: timeoutForMeasuredWorkMs(MACHINE_WORKS_SOLVE_WORK_MS),
  }, async () => {
    const run = await runMachine();
    const last = run.seconds - 1;
    for (const id of [IDS.base, IDS.core, IDS.cap]) {
      const early = run.at(id, last - 3);
      const late = run.at(id, last);
      const moved = Math.hypot(late[0] - early[0], late[1] - early[1], late[2] - early[2]);
      expect(moved, `${id} settled`).toBeLessThan(0.05);
    }
  });
});
