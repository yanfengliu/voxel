import { describe, expect, it } from 'vitest';

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
import { createWindmillScene } from './windmill-scene.js';

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

async function runMill(): Promise<{
  readonly impacts: readonly number[];
  readonly rotorTurns: number;
  readonly hammerLowDegrees: number;
  readonly hammerHighDegrees: number;
  readonly spins: readonly number[];
}> {
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
  const session = await LivePhysicsSessionV1.create(WINDMILL_LIVE_PROFILE_V1, sources);
  try {
    const impacts: number[] = [];
    const spins: number[] = [];
    let struck = false;
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
      if (touching && !struck) impacts.push(tick / TICKS_PER_SECOND);
      struck = touching;
    }
    return {
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
  it('turns, lifts its hammer, and strikes the anvil repeatedly', { timeout: 600_000 }, async () => {
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
    const late = run.impacts.filter((time) => time > RUN_SECONDS / 2);
    expect(late.length, `late strikes among ${JSON.stringify(run.impacts)}`)
      .toBeGreaterThan(1);
  });

  it('settles to a loaded speed instead of running away', { timeout: 600_000 }, async () => {
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
