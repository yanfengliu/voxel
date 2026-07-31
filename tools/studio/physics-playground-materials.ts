/**
 * The physics playground's material vocabulary and world constants.
 *
 * Every value here is a declared testing constant, not a hidden tuning knob:
 * the playground exists to compare materials, so the comparison axes live in
 * one table with the reasoning attached. Densities are mass units per voxel
 * cube (the same convention the sidecar Rapier adapter uses, where collider
 * density divided by grain cubed makes body mass equal density times occupied
 * voxel count). Ratios follow real materials at water = 1.0; the absolute
 * mass unit is arbitrary because nothing in the playground converts to
 * newtons outside the solver.
 *
 * Friction is a single Coulomb coefficient because Rapier's JS surface
 * exposes one value, not separate static and dynamic coefficients. The
 * resting-to-sliding transition is still testable: a block on a ramp holds
 * while tan(angle) is below the pair coefficient and slides above it.
 */

export const PHYSICS_PLAYGROUND_SCHEMA_V1 = 'studio.physics-playground/1' as const;

/** World meters per voxel, shared by every playground recipe and body. */
export const PLAYGROUND_GRAIN_V1 = 0.25;

/** Fixed solver timestep in seconds. See the note below: this lane has not reached the shared rate yet. */
/**
 * The playground's tick, which is NOT yet the live lane's 60 Hz.
 *
 * Every scene solves at `LIVE_TIMESTEP_SECONDS_V1` now, and this should be
 * that constant: the headless twin and the live session are meant to be one
 * world, and they agreed on 1/240 only because two files happened to write
 * the same literal.
 *
 * Deriving it was tried twice and backed out both times. At 60 Hz the
 * stacking stations rest about 0.05 m into the floor against a 0.02 m
 * tolerance, and none of twelve or sixteen solver iterations, a tighter
 * normalized allowed linear error, or a raised contact natural frequency
 * recovered it. That depth looks like what this solver actually does at a
 * coarser step rather than a bug to tune away, which means the station
 * thresholds and the law damping rates -- all measured at 240 Hz -- need
 * re-measuring before this constant can move. Until then the drift is stated
 * here rather than hidden.
 */
export const PLAYGROUND_TIMESTEP_S_V1 = 1 / 240;

/** Straight-down gravity, meters per second squared. */
export const PLAYGROUND_GRAVITY_V1 = -9.81;

export type PlaygroundMaterialIdV1 = 'wood' | 'stone' | 'steel' | 'ice' | 'deck' | 'shot';

export interface PlaygroundMaterialV1 {
  readonly id: PlaygroundMaterialIdV1;
  readonly label: string;
  /** Mass units per occupied voxel cube. Water would be 1.0. */
  readonly density: number;
  /** Coulomb friction coefficient of the material against itself. */
  readonly friction: number;
  /** Restitution in [0, 1]; how much normal speed survives a bounce. */
  readonly restitution: number;
  /** Palette color the recipes draw this material with. */
  readonly color: { readonly r: number; readonly g: number; readonly b: number };
  /**
   * Rapier combines a contact pair's coefficients by rule priority
   * (Max > Multiply > Min > Average). The comparison decks declare
   * `multiply` with friction and restitution 1.0, so a pair coefficient
   * equals the touching block's own material value and the ramp reads
   * material differences undiluted. Ordinary materials use the default
   * average rule.
   */
  readonly combine: 'average' | 'multiply';
}

/**
 * The four comparison materials plus the deck the comparisons run on.
 * Density ratios track real materials (pine, granite, steel, ice); friction
 * and restitution are plausible engineering values chosen for visible
 * separation, not measured constants — the playground tests ordering and
 * thresholds, never absolute agreement with a handbook.
 */
export const PLAYGROUND_MATERIALS_V1: Readonly<
  Record<PlaygroundMaterialIdV1, PlaygroundMaterialV1>
> = Object.freeze({
  // Wood restitution was first authored at 0.3, and blocks resting on the
  // ramp crept downhill ~0.17 m through contact jitter — every micro-bounce
  // re-lifted the block and friction never latched. 0.2 keeps the bounce
  // visible in the falling station without the creep artifact.
  wood: Object.freeze({
    id: 'wood',
    label: 'Wood',
    density: 0.6,
    friction: 0.45,
    restitution: 0.2,
    color: Object.freeze({ r: 176, g: 132, b: 84 }),
    combine: 'average',
  } as const),
  stone: Object.freeze({
    id: 'stone',
    label: 'Stone',
    density: 2.5,
    friction: 0.7,
    restitution: 0.08,
    color: Object.freeze({ r: 138, g: 138, b: 142 }),
    combine: 'average',
  } as const),
  steel: Object.freeze({
    id: 'steel',
    label: 'Steel',
    density: 7.8,
    friction: 0.3,
    restitution: 0.15,
    color: Object.freeze({ r: 96, g: 108, b: 126 }),
    combine: 'average',
  } as const),
  ice: Object.freeze({
    id: 'ice',
    label: 'Ice',
    density: 0.92,
    friction: 0.04,
    restitution: 0.05,
    color: Object.freeze({ r: 168, g: 214, b: 232 }),
    combine: 'average',
  } as const),
  // Physically stone, and deliberately so: the trebuchet's tuning depends
  // on the projectile's exact density, and this entry exists to make the
  // shot legible, not to model a different rock. Without it the ball is
  // drawn in the same grey as the wall it is thrown at and the same tan
  // as the machine that throws it, so at the moment of impact there is
  // nothing on screen to follow. That is a named readability job — which
  // object is the projectile — not decoration.
  shot: Object.freeze({
    id: 'shot',
    label: 'Shot',
    density: 2.5,
    friction: 0.7,
    restitution: 0.08,
    color: Object.freeze({ r: 168, g: 74, b: 58 }),
    combine: 'average',
  } as const),
  deck: Object.freeze({
    id: 'deck',
    label: 'Deck',
    density: 2.5,
    friction: 1,
    restitution: 1,
    color: Object.freeze({ r: 210, g: 180, b: 120 }),
    combine: 'multiply',
  } as const),
});

/** The block materials a comparison station lines up, in shelf order. */
export const PLAYGROUND_COMPARISON_MATERIALS_V1: readonly PlaygroundMaterialIdV1[] =
  Object.freeze(['wood', 'stone', 'steel', 'ice']);

/**
 * The angle in degrees above which a block of this material starts sliding
 * on a multiply-combine deck: atan(friction). The ramp station's angle menu
 * brackets these thresholds so each material's transition is observable.
 */
export function playgroundSlideAngleDegreesV1(id: PlaygroundMaterialIdV1): number {
  return (Math.atan(PLAYGROUND_MATERIALS_V1[id].friction) * 180) / Math.PI;
}

/** The ramp station's selectable angles, degrees from horizontal. */
export const PLAYGROUND_RAMP_ANGLES_V1: readonly number[] =
  Object.freeze([5, 10, 15, 20, 25, 30, 40]);

/** The default ramp angle: steep enough that ice and steel slide, wood and stone hold. */
export const PLAYGROUND_RAMP_DEFAULT_ANGLE_V1 = 20;
