import {
  PLAYGROUND_MATERIALS_V1,
  type PlaygroundMaterialIdV1,
} from './physics-playground-materials.js';

/**
 * The laws of this voxel universe.
 *
 * A physics flaw is never fixed for one scene. When something is found
 * missing — a force the solver does not produce, a value that would let
 * energy appear — the repair belongs here, applied to every body in every
 * scene by the code that builds worlds, and tunable per material but never
 * absent. Content may state that a body is wooden; it may not state that a
 * body is exempt from friction.
 *
 * That is a rule about where code lives, and it has a shape: these values
 * are read at the two places a rigid body is created — the studio's live
 * session and the headless fixture world — not at the places scenes are
 * authored. A new station, a new machine, or a downstream game inherits
 * every law here without knowing it exists, and cannot opt out by
 * forgetting to opt in.
 *
 * Every law below was found by watching something behave impossibly:
 *
 * - Rolling resistance: a ball rolled at a constant 6.19 m/s for as long
 *   as it was watched and left the world. Coulomb friction cannot slow a
 *   rolling sphere, because a sphere rolling without slipping has no
 *   sliding at its contact.
 * - Joint friction: a trebuchet's arm and counterweight swept 896 and
 *   1,398 degrees over 60 simulated seconds and never slept, because a
 *   revolute joint in this solver is frictionless.
 * - Air drag: nothing anywhere lost anything to the air it moved through.
 *
 * None of those were solver defects. In each case nothing had ever been
 * asked to slow the motion down, and the fix is to ask, universally.
 */

/** Schema tag for the law set, so a change to the universe is visible. */
export const PHYSICS_LAWS_SCHEMA_V1 = 'studio.physics-laws/1' as const;

export interface PhysicsLawsV1 {
  /**
   * Angular damping applied while a body is touching something, standing
   * in for rolling resistance: real bodies and real ground deform where
   * they meet, moving the pressure ahead of the contact centre and
   * producing a retarding torque. Rigid bodies do not deform, so the
   * torque must be supplied.
   *
   * Gated on contact because that is where the force comes from — a body
   * in flight is not rolling on anything.
   */
  readonly rollingResistance: number;
  /**
   * Angular damping applied always, standing in for the friction of an
   * axle turning in its bearing. A jointed body is always loaded against
   * whatever holds it, so unlike rolling resistance this is never gated.
   */
  readonly jointFriction: number;
  /**
   * Linear damping applied always, standing in for air drag. Real drag
   * grows with the square of speed; linear damping is the cheap
   * approximation every rigid-body engine offers, and is stated as such
   * rather than described as aerodynamics.
   */
  readonly airDrag: number;
}

/**
 * Surface values for a body whose content declares no material at all.
 *
 * Content that names no material still gets a lawful one. Before these
 * laws existed the live session answered that case with a bare
 * `friction 0.4, restitution 0.05` written inline at the body-creation
 * site, which meant the two lanes could disagree and nothing said what
 * the numbers were for.
 */
export const PHYSICS_LAW_FALLBACK_SURFACE_V1 = Object.freeze({
  friction: 0.4,
  restitution: 0.05,
});

/**
 * No material may be perfectly elastic. A restitution of exactly 1 returns
 * every joule of an impact, so a body bounces to its original height
 * forever; above 1 it climbs, which is energy from nothing and would break
 * the conservation law this universe also enforces.
 *
 * The one legal exception is a coefficient of exactly 1 declared with the
 * `multiply` combine rule, which is not a claim about a surface at all: it
 * is the identity value, chosen so a contact pair reads the *other* body's
 * material undiluted. The comparison decks use it for exactly that reason.
 */
export const PHYSICS_LAW_MAX_RESTITUTION_V1 = 1;

/**
 * Per-material law values.
 *
 * These are damping rates in reciprocal seconds, not textbook rolling
 * resistance coefficients, and they are calibrated by measured stopping
 * distance rather than derived from first principles. Their *ordering*
 * carries the physics: ice resists rolling least, steel on steel little,
 * stone more, wood most. Their magnitudes were chosen so a body stops in
 * a distance that reads correctly at the scale these scenes are viewed.
 */
const MATERIAL_LAWS_V1: Readonly<
  Record<PlaygroundMaterialIdV1 | 'default', PhysicsLawsV1>
> = Object.freeze({
  // Calibrated on the trebuchet's stone ball: 4.37 m/s one second after
  // impact, 1.74 m/s at five seconds, stopping after 23.2 m of roll.
  stone: Object.freeze({ rollingResistance: 0.8, jointFriction: 0.8, airDrag: 0.02 }),
  shot: Object.freeze({ rollingResistance: 0.8, jointFriction: 0.8, airDrag: 0.02 }),
  // Timber on timber is the lossiest pairing here, and a wooden axle in a
  // wooden bearing is the lossiest joint.
  wood: Object.freeze({ rollingResistance: 1, jointFriction: 0.8, airDrag: 0.02 }),
  // A steel wheel on a steel rail is the classic low-resistance case; a
  // steel journal is also the smoothest bearing in this table.
  steel: Object.freeze({ rollingResistance: 0.35, jointFriction: 0.5, airDrag: 0.02 }),
  // Ice resists rolling least of all. It keeps its slipperiness under this
  // law: the ramp station compares sliding, which this does not touch.
  ice: Object.freeze({ rollingResistance: 0.12, jointFriction: 0.5, airDrag: 0.02 }),
  // The comparison deck is a floor, never a rolling or jointed body; its
  // entry exists so the table is total rather than because it is used.
  deck: Object.freeze({ rollingResistance: 0.8, jointFriction: 0.8, airDrag: 0.02 }),
  // Content that names no material — the chain's links, the ball drop's
  // balls — is still governed.
  default: Object.freeze({ rollingResistance: 0.8, jointFriction: 0.8, airDrag: 0.02 }),
});

/**
 * The laws governing a body of this material. An unknown or absent
 * material gets the default set rather than an exemption.
 */
export function physicsLawsForV1(material?: string): PhysicsLawsV1 {
  if (material !== undefined && material in MATERIAL_LAWS_V1) {
    return MATERIAL_LAWS_V1[material as PlaygroundMaterialIdV1];
  }
  return MATERIAL_LAWS_V1.default;
}

/** Every material id the law table governs, for coverage tests. */
export function governedMaterialsV1(): readonly string[] {
  return Object.keys(MATERIAL_LAWS_V1).filter((key) => key !== 'default');
}

/**
 * Rejects a material that would break a law, naming the material, the
 * offending value, and what would satisfy the law.
 *
 * Fails closed on purpose: an unlawful material is not clamped quietly,
 * because a silently corrected coefficient is how a scene ends up
 * behaving differently from the numbers its author is reading.
 */
export function assertLawfulMaterialV1(
  id: string,
  material: {
    readonly restitution: number;
    readonly friction: number;
    readonly combine?: string;
  },
): void {
  const identityDeck = material.combine === 'multiply'
    && material.restitution === PHYSICS_LAW_MAX_RESTITUTION_V1;
  if (!identityDeck && material.restitution >= PHYSICS_LAW_MAX_RESTITUTION_V1) {
    throw new Error(
      `Material '${id}' declares restitution ${String(material.restitution)}, `
      + 'but nothing in this universe is perfectly elastic: a coefficient of '
      + '1 returns every joule of an impact and above 1 creates energy from '
      + 'nothing. Use a value below 1, or declare the multiply combine rule '
      + 'if this is the identity value for a comparison deck.',
    );
  }
  if (material.friction < 0) {
    throw new Error(
      `Material '${id}' declares friction ${String(material.friction)}. `
      + 'Friction is never negative — a surface cannot push a body along. '
      + 'Use zero or more; zero itself is legal but means a perfectly '
      + 'slippery surface, which nothing real is.',
    );
  }
}

/**
 * Every material in the playground table obeys the laws. Called by the
 * law tests, so an unlawful material fails the gate rather than reaching
 * a scene.
 */
export function assertAllMaterialsLawfulV1(): void {
  for (const [id, material] of Object.entries(PLAYGROUND_MATERIALS_V1)) {
    assertLawfulMaterialV1(id, material);
  }
}
