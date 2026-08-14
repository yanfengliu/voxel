import { RIVERFALL_FLUID_DOMAIN_V1 } from './riverfall-fluid-domain.js';
import { mapValidatedRiverfallFluidCoordinateV1 } from './riverfall-fluid-domain-sampling.js';
import type { RiverfallFluidConfigV1 } from './riverfall-fluid-config.js';
import type { RiverfallFluidStateV1 } from './riverfall-pbf.js';
import type { ScenePlacementPoseV1 } from './scene-pose-delta.js';
import type { ScenePlacementV1 } from './scene.js';

/**
 * The water you can actually see moving.
 *
 * Riverfall's tile field is one flat blue, and a flat colour has exactly one
 * visible channel: its outline. Measured on 2026-08-14, the whole sheet moved
 * 0.75–1.6% of the stage's pixels per 200 ms, and quadrupling the tile
 * displacement while tripling the tilt gain took that only to 1.8–2.7% — the
 * curtain stayed a slab, because its cells face the camera and every one of
 * them is the same colour. Displacement needs something to reveal it, and in
 * the Studio's default unlit look there is nothing.
 *
 * Foam is that something. Each parcel is a pale fleck riding one of the
 * solver's own particles, so what travels across the screen is the water the
 * fluid actually moved rather than a pattern scrolled over it. A parcel holds
 * its particle for as long as that particle stays in the parcel's band and
 * takes a newly arrived one when it leaves, which is also how foam behaves:
 * it forms where water breaks and disappears where the water calms.
 *
 * This is a presentation of the fluid, like the tiles. A parcel is not a body,
 * never collides, and carries no mass; the scene's own particle count and
 * water mass are unchanged by how many flecks are drawn.
 */

export const RIVERFALL_SPRAY_MODEL_ID = 'studio:riverfall:spray';

/**
 * Parcels that stay with the fall and the pool it lands in.
 *
 * Sized from supply, not taste. Across 60 seconds of solved time the band
 * never held fewer than 79 particles, so a pool of 32 cannot run out of water
 * to sit on: every parcel is on a real particle on every frame, and the code
 * needs no answer to the question "where does an unassigned fleck go?".
 * `riverfall-spray.test.ts` re-runs that minute and fails if the floor moves
 * under the pool.
 */
export const RIVERFALL_SPRAY_CURTAIN_COUNT_V1 = 32;

/**
 * Parcels spread over the whole drawn reach, so the river and pond travel too.
 *
 * The drawn reach never held fewer than 511 of the 576 particles across that
 * same run, and the curtain pool claims its 32 first, so 64 here is far inside
 * what remains.
 */
export const RIVERFALL_SPRAY_STREAM_COUNT_V1 = 64;

export const RIVERFALL_SPRAY_COUNT_V1 =
  RIVERFALL_SPRAY_CURTAIN_COUNT_V1 + RIVERFALL_SPRAY_STREAM_COUNT_V1;

/**
 * Grain the scene places flecks at; one voxel, so this is the fleck's size.
 *
 * The model is three voxels across, so a fleck spans three times this: about
 * two thirds of a world unit against a 10-unit-wide fall. The first pass drew
 * a single 0.7-unit voxel and the render said no — at that size a fleck reads
 * as a floating white crate, and a row of them across the plunge reads as a
 * shelf rather than as churn.
 */
export const RIVERFALL_SPRAY_GRAIN_V1 = 0.22;

/**
 * How far a fleck rides above the water surface, along that surface's normal.
 *
 * Derived, because guessing it showed: the first pass used 1.4 and the flecks
 * visibly hovered. A particle sits on the domain centreline, which the domain
 * holds 0.45 outside the drawn water surface so the fluid never solves inside
 * painted geometry. From there a tile's far face is 0.05 + 0.5 of tile plus up
 * to 0.44 of reconstructed excursion, so the tile can reach 0.54 past the
 * particle. A fleck reaches 0.33 back toward it. 0.9 therefore leaves 0.03 of
 * daylight at the worst excursion the presentation allows, and a comfortable
 * gap at the usual one.
 */
export const RIVERFALL_SPRAY_CLEARANCE_V1 = 0.9;

/** Placement ids the live driver owns, in pool order: curtain, then stream. */
export const RIVERFALL_SPRAY_PLACEMENT_IDS_V1: readonly string[] = Object.freeze(
  Array.from(
    { length: RIVERFALL_SPRAY_COUNT_V1 },
    (_, index) => `spray-${String(index).padStart(2, '0')}`,
  ),
);

/** True for a parcel index belonging to the curtain pool. */
export function riverfallSprayIsCurtainV1(index: number): boolean {
  return index < RIVERFALL_SPRAY_CURTAIN_COUNT_V1;
}

type Vec3 = readonly [number, number, number];

/**
 * The curtain band: the drop itself, plus the pool it lands in.
 *
 * World-space rather than flow-distance, because that is how the question is
 * asked — is this parcel of water in the part of the scene that churns? Two
 * boxes, because the churn is two shapes: the waterfall opening, which is
 * narrow and tall, and the near pond it lands in, which is wide and shallow.
 *
 * The drop itself is thin water. It is 8 of the loop's 168 units and the
 * fastest place in the scene, so it holds only about 7 particles at a time —
 * measured, and steady across a minute of play. Including the plunge takes the
 * band to 79 at its emptiest, which is what makes a pool of 32 safe.
 */
const CURTAIN_BOXES: readonly { minimum: Vec3; maximum: Vec3 }[] = Object.freeze([
  { minimum: [-5, 4, -1.5], maximum: [5, 12.6, 3] },
  { minimum: [-10, 3.5, 3], maximum: [10, 6, 12] },
]);

/**
 * Everywhere the scene draws water. Anything outside it is the hidden return
 * leg or the unrendered upstream lead-in, and a fleck must never be there.
 */
const DRAWN_BAND = Object.freeze({
  minimum: [-16, 2.5, -32] as Vec3,
  maximum: [16, 13.5, 30] as Vec3,
});

/** Half a fleck, for the clearance arithmetic and the tests that check it. */
export const RIVERFALL_SPRAY_HALF_EXTENT_V1 = (RIVERFALL_SPRAY_GRAIN_V1 * 3) / 2;

function inside(band: { minimum: Vec3; maximum: Vec3 }, at: Vec3): boolean {
  return at[0] >= band.minimum[0] && at[0] <= band.maximum[0]
    && at[1] >= band.minimum[1] && at[1] <= band.maximum[1]
    && at[2] >= band.minimum[2] && at[2] <= band.maximum[2];
}

function insideCurtain(at: Vec3): boolean {
  return CURTAIN_BOXES.some((box) => inside(box, at));
}

/**
 * Authored resting spots, used only for the frames before the first live pose.
 *
 * They are laid out where foam plausibly sits — a spread across the pond just
 * clear of its film — so the opening frame reads as still water with froth on
 * it rather than as a grid of hovering cubes. Spacing is a whole world unit
 * against a 0.7-unit fleck, which keeps the authored scene free of overlap;
 * `sceneOverlapsV1` judges these positions even though nobody watches them for
 * long, because the live profile lists the flecks as posed elsewhere.
 */
export const RIVERFALL_SPRAY_PLACEMENTS_V1: readonly ScenePlacementV1[] =
  Object.freeze(RIVERFALL_SPRAY_PLACEMENT_IDS_V1.map((id, index) => {
    const column = index % 12;
    const row = Math.floor(index / 12);
    return {
      id,
      model: RIVERFALL_SPRAY_MODEL_ID,
      at: [
        -13.5 + column * 2.5,
        4.5 + RIVERFALL_SPRAY_CLEARANCE_V1,
        6 + row * 2.5,
      ] as Vec3,
      grain: RIVERFALL_SPRAY_GRAIN_V1,
    } satisfies ScenePlacementV1;
  }));

/** Unit surface normal at a solved particle: downstream crossed with across. */
function surfaceNormalAt(
  state: RiverfallFluidStateV1,
  particle: number,
): Vec3 {
  const sample = mapValidatedRiverfallFluidCoordinateV1(
    RIVERFALL_FLUID_DOMAIN_V1,
    state.longitudinal[particle]!,
    state.lateral[particle]!,
  );
  const [tx, ty, tz] = sample.tangent;
  const [lx, ly, lz] = sample.lateralAxis;
  const normal: Vec3 = [
    ty * lz - tz * ly,
    tz * lx - tx * lz,
    tx * ly - ty * lx,
  ];
  const length = Math.hypot(normal[0], normal[1], normal[2]);
  if (length < 1e-9) return [0, 1, 0];
  return [normal[0] / length, normal[1] / length, normal[2] / length];
}

interface ParticleReadingV1 {
  readonly position: Vec3;
  readonly longitudinal: number;
  readonly curtain: boolean;
  readonly drawn: boolean;
}

/**
 * Foam parcels riding the solved particles, rebuilt each presented frame.
 *
 * The assignment is a function of the solver state alone — no wall clock, no
 * frame counter, no random draw — so the same state produces the same flecks
 * in the same places, which is what lets a test assert on them.
 */
export class RiverfallSprayFieldV1 {
  readonly #config: RiverfallFluidConfigV1;
  /** Particle each parcel currently rides, or -1 when it has just let go. */
  readonly #held: Int16Array;
  readonly #claimed: Uint8Array;
  readonly #readings: ParticleReadingV1[] = [];
  #poses: ReadonlyMap<string, ScenePlacementPoseV1> = new Map();

  constructor(config: RiverfallFluidConfigV1) {
    this.#config = config;
    this.#held = new Int16Array(RIVERFALL_SPRAY_COUNT_V1).fill(-1);
    this.#claimed = new Uint8Array(config.particles.count);
  }

  /** This frame's fleck poses, keyed by placement id. */
  poses(): ReadonlyMap<string, ScenePlacementPoseV1> {
    return this.#poses;
  }

  /** Particles a parcel is riding right now, for tests and diagnosis. */
  heldParticles(): readonly number[] {
    return [...this.#held];
  }

  /** Re-reads the solved water and re-poses every fleck from it. */
  update(state: RiverfallFluidStateV1): void {
    this.#readParticles(state);
    this.#releaseAndClaim();
    this.#present(state);
  }

  #readParticles(state: RiverfallFluidStateV1): void {
    this.#readings.length = 0;
    for (let particle = 0; particle < this.#config.particles.count; particle += 1) {
      const sample = mapValidatedRiverfallFluidCoordinateV1(
        RIVERFALL_FLUID_DOMAIN_V1,
        state.longitudinal[particle]!,
        state.lateral[particle]!,
      );
      const { position } = sample;
      const drawn = sample.visibility === 'visible' && inside(DRAWN_BAND, position);
      this.#readings.push({
        position,
        longitudinal: sample.longitudinalDistance,
        curtain: drawn && insideCurtain(position),
        drawn,
      });
    }
  }

  #releaseAndClaim(): void {
    this.#claimed.fill(0);
    // Keep every parcel that is still on water of its own kind. A parcel that
    // is not lets go here, before anything is handed out, so the particle it
    // was on is available to whichever parcel needs one most.
    for (let parcel = 0; parcel < this.#held.length; parcel += 1) {
      const particle = this.#held[parcel]!;
      if (particle < 0) continue;
      const reading = this.#readings[particle]!;
      const stillWanted = riverfallSprayIsCurtainV1(parcel)
        ? reading.curtain
        : reading.drawn;
      if (stillWanted && this.#claimed[particle] === 0) {
        this.#claimed[particle] = 1;
        continue;
      }
      this.#held[parcel] = -1;
    }
    // Curtain parcels choose first, and both pools take the water that has
    // travelled least far — the newest arrival in the band. Foam therefore
    // appears at the lip and at the head of the river rather than blinking
    // into existence halfway down.
    this.#claimFor(true);
    this.#claimFor(false);
  }

  #claimFor(curtain: boolean): void {
    const waiting: number[] = [];
    for (let parcel = 0; parcel < this.#held.length; parcel += 1) {
      if (riverfallSprayIsCurtainV1(parcel) !== curtain) continue;
      if (this.#held[parcel]! < 0) waiting.push(parcel);
    }
    if (waiting.length === 0) return;
    const free: number[] = [];
    for (let particle = 0; particle < this.#readings.length; particle += 1) {
      if (this.#claimed[particle] !== 0) continue;
      const reading = this.#readings[particle]!;
      if (curtain ? !reading.curtain : !reading.drawn) continue;
      free.push(particle);
    }
    free.sort((a, b) =>
      this.#readings[a]!.longitudinal - this.#readings[b]!.longitudinal || a - b);
    for (let index = 0; index < waiting.length && index < free.length; index += 1) {
      const particle = free[index]!;
      this.#held[waiting[index]!] = particle;
      this.#claimed[particle] = 1;
    }
  }

  #present(state: RiverfallFluidStateV1): void {
    const poses = new Map<string, ScenePlacementPoseV1>();
    for (let parcel = 0; parcel < this.#held.length; parcel += 1) {
      const particle = this.#held[parcel]!;
      if (particle < 0) continue;
      const { position } = this.#readings[particle]!;
      const normal = surfaceNormalAt(state, particle);
      poses.set(RIVERFALL_SPRAY_PLACEMENT_IDS_V1[parcel]!, {
        translation: [
          Math.fround(position[0] + normal[0] * RIVERFALL_SPRAY_CLEARANCE_V1),
          Math.fround(position[1] + normal[1] * RIVERFALL_SPRAY_CLEARANCE_V1),
          Math.fround(position[2] + normal[2] * RIVERFALL_SPRAY_CLEARANCE_V1),
        ],
        quaternion: [0, 0, 0, 1],
      });
    }
    this.#poses = poses;
  }
}
