import { describe, expect, it } from 'vitest';

import { LIVE_TIMESTEP_SECONDS_V1 } from './live-physics.js';
import { RiverfallLiveSurfaceV1 } from './riverfall-live-surface.js';
import { createRiverfallFluidConfigV1 } from './riverfall-fluid-config.js';
import {
  RIVERFALL_SPRAY_CLEARANCE_V1,
  RIVERFALL_SPRAY_COUNT_V1,
  RIVERFALL_SPRAY_CURTAIN_COUNT_V1,
  RIVERFALL_SPRAY_HALF_EXTENT_V1,
  RIVERFALL_SPRAY_PLACEMENT_IDS_V1,
  RiverfallSprayFieldV1,
  riverfallSprayIsCurtainV1,
} from './riverfall-spray.js';
import {
  cloneRiverfallFluidStateV1,
  createRiverfallFluidWorkspaceV1,
} from './riverfall-pbf-support.js';
import { stepRiverfallFluidV1 } from './riverfall-pbf.js';
import { RIVERFALL_FLUID_WARM_STATE_V1 } from './generated-riverfall-fluid-warm-state.js';

/**
 * The foam that carries Riverfall's motion.
 *
 * The scene's flat blue sheet only ever showed its outline moving, so the
 * flecks are the visible channel now. What has to hold: every one of them is
 * on real solved water, no two are on the same parcel of it, and they travel.
 */
describe('Riverfall foam flecks', () => {
  const config = createRiverfallFluidConfigV1();

  it('never runs out of water to sit on across a minute of play', () => {
    // This is the gate under both pool sizes. They were chosen from a measured
    // supply floor — 79 particles in the curtain band, 511 in the drawn reach,
    // at their emptiest across this same minute — and a floor is a measurement
    // that can move when the solver, the domain, or the bands change. If it
    // moves under the pool, a fleck has nowhere to be, and the first anyone
    // would know is a white cube hanging still in the air on someone's screen.
    const state = cloneRiverfallFluidStateV1(RIVERFALL_FLUID_WARM_STATE_V1);
    const workspace = createRiverfallFluidWorkspaceV1(config.particles.count);
    const field = new RiverfallSprayFieldV1(config);
    let worstAssigned = RIVERFALL_SPRAY_COUNT_V1;
    for (let frame = 0; frame <= 3_600; frame += 1) {
      if (frame > 0) {
        for (let substep = 0; substep < config.recording.substepsPerFrame; substep += 1) {
          stepRiverfallFluidV1(state, config, workspace);
        }
      }
      field.update(state);
      const held = field.heldParticles();
      worstAssigned = Math.min(
        worstAssigned,
        held.filter((particle) => particle >= 0).length,
      );
      if (worstAssigned < RIVERFALL_SPRAY_COUNT_V1) {
        throw new Error(
          `A Riverfall foam fleck had no particle to ride at frame ${String(frame)} `
          + `(${(frame / 60).toFixed(1)} s of play): ${String(worstAssigned)} of `
          + `${String(RIVERFALL_SPRAY_COUNT_V1)} flecks were assigned. Either a pool `
          + 'is larger than its band\'s measured supply floor, or the band no longer '
          + 'holds the water it was measured against.',
        );
      }
    }
    expect(worstAssigned).toBe(RIVERFALL_SPRAY_COUNT_V1);
  }, 600_000);

  it('gives every fleck its own parcel of water', () => {
    const state = cloneRiverfallFluidStateV1(RIVERFALL_FLUID_WARM_STATE_V1);
    const workspace = createRiverfallFluidWorkspaceV1(config.particles.count);
    const field = new RiverfallSprayFieldV1(config);
    for (let frame = 0; frame < 240; frame += 1) {
      for (let substep = 0; substep < config.recording.substepsPerFrame; substep += 1) {
        stepRiverfallFluidV1(state, config, workspace);
      }
      field.update(state);
      const held = field.heldParticles().filter((particle) => particle >= 0);
      expect(new Set(held).size, `frame ${String(frame)} double-claimed a particle`)
        .toBe(held.length);
    }
  }, 600_000);

  it('keeps every fleck over drawn water, clear of the surface it rides', () => {
    // A fleck outside the drawn reach would be floating in the sky behind the
    // cliff, where the fluid is simulated but nothing is rendered. One below
    // the clearance would be inside the tile it is meant to sit on, which the
    // scene's own solidity rule forbids.
    const surface = new RiverfallLiveSurfaceV1();
    const half = RIVERFALL_SPRAY_HALF_EXTENT_V1;
    for (let frame = 0; frame < 600; frame += 1) {
      surface.advance(LIVE_TIMESTEP_SECONDS_V1);
      for (const id of RIVERFALL_SPRAY_PLACEMENT_IDS_V1) {
        const pose = surface.poses().get(id);
        expect(pose, `${id} has no pose at frame ${String(frame)}`).toBeDefined();
        const [x, y, z] = pose!.translation;
        expect(Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)).toBe(true);
        expect(x, `${id} left the drawn reach in x`).toBeGreaterThan(-17);
        expect(x, `${id} left the drawn reach in x`).toBeLessThan(17);
        expect(z, `${id} left the drawn reach in z`).toBeGreaterThan(-33);
        expect(z, `${id} left the drawn reach in z`).toBeLessThan(31);
        // Nothing rides below the pond floor or above the canyon rim.
        expect(y, `${id} sank below the pond`).toBeGreaterThan(2.5);
        expect(y, `${id} floated over the rim`)
          .toBeLessThan(13.5 + RIVERFALL_SPRAY_CLEARANCE_V1 + half);
      }
    }
  }, 600_000);

  it('travels, in both pools', () => {
    // The whole point: a fleck that stayed put would be a decoration.
    //
    // Not "the curtain pool travels furthest", which was the first thing this
    // test claimed and is false — measured over one second, curtain flecks
    // averaged 1.80 world units against the stream's 4.46. The curtain pool is
    // mostly the plunge pool, where water arrives and slows down, while the
    // stream pool is mostly the river, which runs at its inlet speed the whole
    // way. The fall is the fastest place in the scene and the emptiest; those
    // are the same fact.
    const surface = new RiverfallLiveSurfaceV1();
    const sample = (): [number, number, number][] =>
      RIVERFALL_SPRAY_PLACEMENT_IDS_V1.map((id) => {
        const [x, y, z] = surface.poses().get(id)!.translation;
        return [x, y, z];
      });
    const opening = sample();
    for (let frame = 0; frame < 60; frame += 1) {
      surface.advance(LIVE_TIMESTEP_SECONDS_V1);
    }
    const later = sample();
    const travelled = opening.map(([x, y, z], index) => {
      const [nx, ny, nz] = later[index]!;
      return Math.hypot(nx - x, ny - y, nz - z);
    });
    const curtain = travelled.filter((_, index) => riverfallSprayIsCurtainV1(index));
    const stream = travelled.filter((_, index) => !riverfallSprayIsCurtainV1(index));
    expect(curtain).toHaveLength(RIVERFALL_SPRAY_CURTAIN_COUNT_V1);
    // Over a second, the average fleck has to have gone somewhere visible.
    const mean = (values: number[]): number =>
      values.reduce((total, value) => total + value, 0) / values.length;
    expect(mean(travelled)).toBeGreaterThan(0.5);
    expect(mean(curtain)).toBeGreaterThan(0.5);
    expect(mean(stream)).toBeGreaterThan(0.5);
  }, 600_000);

  it('reads the solver and nothing else, so the same water gives the same foam', () => {
    // No clock, no frame counter, no random draw: two fields handed the same
    // state must agree exactly, which is what lets any of the above assert.
    const state = cloneRiverfallFluidStateV1(RIVERFALL_FLUID_WARM_STATE_V1);
    const workspace = createRiverfallFluidWorkspaceV1(config.particles.count);
    for (let substep = 0; substep < 300; substep += 1) {
      stepRiverfallFluidV1(state, config, workspace);
    }
    const first = new RiverfallSprayFieldV1(config);
    const second = new RiverfallSprayFieldV1(config);
    first.update(state);
    second.update(state);
    expect([...second.poses()]).toEqual([...first.poses()]);
    expect(second.heldParticles()).toEqual(first.heldParticles());
  }, 600_000);
});
