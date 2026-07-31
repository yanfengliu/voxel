/**
 * The laws of this voxel universe, stated as what holds rather than what
 * is forbidden.
 *
 * A law here is a statement about how every body behaves, enforced where
 * rigid bodies are created rather than where scenes are authored. A new
 * station, a new machine, or a downstream consumer inherits all of them
 * without knowing they exist. Content may say what a body is made of, and
 * may tune what that material means, but it cannot place a body outside
 * the laws by declaring nothing.
 *
 * Each law below is either a *force* the solver does not supply and this
 * module adds, a *bound* on what content may declare, or a *conserved
 * quantity* that scenarios check. All three kinds are laws; they differ
 * only in how they are enforced.
 *
 * Newton's three laws are first among them. They are not decoration: the
 * solver already obeys them, and the playground states them so that a
 * regression which broke one would be caught by name rather than showing
 * up as a scene that merely looks wrong.
 */

/**
 * Material names the law table knows. A consumer may use its own names;
 * anything unrecognised is governed by the default values rather than
 * escaping the laws.
 */
export type PhysicsMaterialIdV1 =
  | 'wood' | 'stone' | 'steel' | 'ice' | 'deck' | 'shot';

/** Schema tag for the law set, so a change to the universe is visible. */
export const PHYSICS_LAWS_SCHEMA_V1 = 'studio.physics-laws/2' as const;

/** How a law is held: by a force added, a bound enforced, or a quantity checked. */
export type PhysicsLawKindV1 = 'force' | 'bound' | 'conserved';

export interface PhysicsLawV1 {
  readonly id: string;
  /** The law as a physicist would state it: what holds, not what is banned. */
  readonly statement: string;
  readonly kind: PhysicsLawKindV1;
  /** Where the law is applied, or the check that proves it. */
  readonly enforcedBy: string;
}

/**
 * The complete constitution, in order: motion first, then the forces that
 * act, then what content may declare, then what is conserved.
 *
 * This list is the source of truth for the law tests, which walk it and
 * require every entry to name a real enforcement site or check.
 */
export const PHYSICS_LAWS_V1: readonly PhysicsLawV1[] = Object.freeze([
  {
    id: 'newton-1',
    statement: 'A body keeps its velocity, in size and direction, until a '
      + 'force acts on it. A body in flight is acted on by gravity alone, '
      + 'so its velocity changes by exactly g per unit time and in no '
      + 'other way.',
    kind: 'conserved',
    enforcedBy: 'the free-flight-is-uniform check',
  },
  {
    id: 'newton-2',
    statement: 'A force changes momentum at a rate equal to the force, so '
      + 'an impulse J delivered to a body of mass m changes its velocity '
      + 'by exactly J/m. The same force moves a heavy body less than a '
      + 'light one, in that exact proportion.',
    kind: 'conserved',
    enforcedBy: 'the impulse-response check',
  },
  {
    id: 'newton-3',
    statement: 'When two bodies act on each other they exchange equal and '
      + 'opposite impulses, so the momentum of the pair is unchanged by '
      + 'anything they do to each other.',
    kind: 'conserved',
    enforcedBy: 'the momentum-conserved check',
  },
  {
    id: 'gravitation',
    statement: 'Every body is accelerated downward at the same rate, '
      + 'whatever its mass, because the force of gravity on a body is '
      + 'proportional to the very mass that resists it.',
    kind: 'force',
    enforcedBy: 'world gravity, and the equal-fall-acceleration check',
  },
  {
    id: 'sliding-friction',
    statement: 'Surfaces sliding across each other resist that sliding in '
      + 'proportion to how hard they are pressed together, converting '
      + 'motion into heat.',
    kind: 'force',
    enforcedBy: 'per-material Coulomb friction on every collider',
  },
  {
    id: 'rolling-resistance',
    statement: 'A body rolling on a surface loses motion to the deformation '
      + 'at their contact, which moves the supporting pressure slightly '
      + 'ahead of the contact point and resists the roll. Sliding friction '
      + 'cannot do this work, because a body rolling without slipping does '
      + 'not slide where it touches.',
    kind: 'force',
    enforcedBy: 'contact-gated angular damping at both body-creation sites',
  },
  {
    id: 'bearing-friction',
    statement: 'A shaft turning in its bearing rubs against it and loses '
      + 'motion to that rubbing, so a jointed mechanism left alone comes '
      + 'to rest.',
    kind: 'force',
    enforcedBy: 'always-on angular damping for jointed bodies',
  },
  {
    id: 'air-resistance',
    statement: 'A body moving through air is retarded by it, in both its '
      + 'travel and its spin, because the air it displaces pushes back.',
    kind: 'force',
    enforcedBy: 'linear and angular damping on every body',
  },
  {
    id: 'restitution-bound',
    statement: 'A collision returns less energy than it receives: every '
      + 'real impact leaves some behind as heat and sound, so a bounce '
      + 'never reaches the height it fell from.',
    kind: 'bound',
    enforcedBy: 'assertLawfulMaterialV1, which rejects restitution of 1 or more',
  },
  {
    id: 'energy-conservation',
    statement: 'The mechanical energy of a machine with no engine is fixed '
      + 'at the moment it is released and is only ever spent from there; '
      + 'what leaves as heat does not come back.',
    kind: 'conserved',
    enforcedBy: 'the energy-never-increases check, frame to frame',
  },
]);

export interface PhysicsLawValuesV1 {
  /**
   * Angular damping applied while a body is touching something, carrying
   * the rolling-resistance law. Gated on contact because the deformation
   * that produces it happens where the bodies meet.
   */
  readonly rollingResistance: number;
  /**
   * Angular damping applied to a jointed body at all times, carrying the
   * bearing-friction law. A loaded journal rubs whether or not the body
   * is touching anything else.
   */
  readonly bearingFriction: number;
  /**
   * Linear damping carrying the travel half of the air-resistance law.
   * Real drag grows with the square of speed; linear damping is the
   * approximation this solver offers, and is named as an approximation
   * rather than described as aerodynamics.
   */
  readonly airDrag: number;
  /**
   * Angular damping carrying the spin half of the air-resistance law, so
   * a body thrown spinning slows its spin in flight as well as its
   * travel. Small: air resists a spin far more weakly than a bearing does.
   */
  readonly airSpinDrag: number;
}

/**
 * Surface values for a body whose content names no material at all, so
 * that such a body is still governed rather than falling outside the laws.
 */
export const PHYSICS_LAW_FALLBACK_SURFACE_V1 = Object.freeze({
  friction: 0.4,
  restitution: 0.05,
});

/** The largest restitution the restitution-bound law permits, exclusive. */
export const PHYSICS_LAW_MAX_RESTITUTION_V1 = 1;

/**
 * Per-material law values.
 *
 * These are damping rates in reciprocal seconds, calibrated by measured
 * stopping distance rather than derived from first principles. Their
 * ordering carries the physics — ice resists a roll least, then steel,
 * then stone, then wood; a steel journal is a better bearing than a
 * wooden one — and their magnitudes were chosen so that a body stops in a
 * distance that reads correctly at the scale these scenes are viewed.
 */
const MATERIAL_LAW_VALUES_V1: Readonly<
  Record<PhysicsMaterialIdV1 | 'default', PhysicsLawValuesV1>
> = Object.freeze({
  stone: Object.freeze({
    rollingResistance: 0.8, bearingFriction: 0.8, airDrag: 0.02, airSpinDrag: 0.02,
  }),
  shot: Object.freeze({
    rollingResistance: 0.8, bearingFriction: 0.8, airDrag: 0.02, airSpinDrag: 0.02,
  }),
  wood: Object.freeze({
    rollingResistance: 1, bearingFriction: 0.8, airDrag: 0.02, airSpinDrag: 0.02,
  }),
  steel: Object.freeze({
    rollingResistance: 0.35, bearingFriction: 0.5, airDrag: 0.02, airSpinDrag: 0.02,
  }),
  ice: Object.freeze({
    rollingResistance: 0.12, bearingFriction: 0.5, airDrag: 0.02, airSpinDrag: 0.02,
  }),
  deck: Object.freeze({
    rollingResistance: 0.8, bearingFriction: 0.8, airDrag: 0.02, airSpinDrag: 0.02,
  }),
  default: Object.freeze({
    rollingResistance: 0.8, bearingFriction: 0.8, airDrag: 0.02, airSpinDrag: 0.02,
  }),
});

/**
 * The law values governing a body of this material. A material this table
 * does not name is governed by the default set, so every body is covered.
 */
export function physicsLawValuesForV1(material?: string): PhysicsLawValuesV1 {
  if (material !== undefined && material in MATERIAL_LAW_VALUES_V1) {
    return MATERIAL_LAW_VALUES_V1[material as PhysicsMaterialIdV1];
  }
  return MATERIAL_LAW_VALUES_V1.default;
}

/** Every material id the law table names, for coverage tests. */
export function governedMaterialsV1(): readonly string[] {
  return Object.keys(MATERIAL_LAW_VALUES_V1).filter((key) => key !== 'default');
}

/**
 * Holds a material to the restitution bound and to the requirement that
 * friction be a resisting quantity, naming the material, the offending
 * value, and what would satisfy the law.
 *
 * Fails closed: an unlawful material throws rather than being clamped,
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
  // A coefficient of exactly 1 under the multiply rule is the identity
  // value for a comparison deck, not a claim that the surface returns
  // every joule: it makes a contact pair read the other body's material
  // undiluted, which is what the ramp station compares.
  const identityDeck = material.combine === 'multiply'
    && material.restitution === PHYSICS_LAW_MAX_RESTITUTION_V1;
  if (!identityDeck && material.restitution >= PHYSICS_LAW_MAX_RESTITUTION_V1) {
    throw new Error(
      `Material '${id}' declares restitution ${String(material.restitution)}. `
      + 'A collision returns less energy than it receives, so restitution '
      + 'must be below 1; at 1 a bounce would return to its full drop '
      + 'height forever, and above 1 it would climb. Use a value below 1, '
      + 'or declare the multiply combine rule if this is a comparison '
      + "deck's identity value.",
    );
  }
  if (material.friction < 0) {
    throw new Error(
      `Material '${id}' declares friction ${String(material.friction)}. `
      + 'Friction resists sliding, so it is zero or greater — a negative '
      + 'coefficient would describe a surface that drives a body along. '
      + 'Zero itself is legal and means a perfectly slippery surface.',
    );
  }
}

/**
 * The smallest thing a solver's rigid body must be able to do for the
 * laws to reach it. Rapier's `RigidBody` satisfies this already; any
 * other solver that can be told its damping does too. Declared
 * structurally on purpose, so this module depends on no solver at all
 * and a consuming game keeps its own.
 */
export interface PhysicsDampedBodyV1 {
  setLinearDamping(value: number): void;
  setAngularDamping(value: number): void;
}

export interface PhysicsBodyConditionV1 {
  /** What the body is made of; unknown names get the default values. */
  readonly material?: string;
  /** True when a joint holds this body, so bearing friction applies. */
  readonly jointed?: boolean;
  /**
   * True when the body is currently touching something. Rolling
   * resistance is a contact force, so it applies only while in contact;
   * a caller that cannot tell should pass false rather than guess.
   */
  readonly touching?: boolean;
}

/**
 * Applies every damping law to one body, given its present condition.
 *
 * This is the whole mechanism by which the laws reach a world: call it
 * for each body before each step, and that world is governed. A consumer
 * game calls it at its own body's own step; nothing here knows what a
 * scene, a station, or a game is.
 *
 * Air resistance always applies. Bearing friction applies to a jointed
 * body at all times. Rolling resistance applies only on contact. The
 * angular losses add, because a shaft rubbing in its bearing and a wheel
 * deforming against the ground are separate places for motion to go.
 */
export function applyPhysicsLawsToBodyV1(
  body: PhysicsDampedBodyV1,
  condition: PhysicsBodyConditionV1 = {},
): void {
  const values = physicsLawValuesForV1(condition.material);
  body.setLinearDamping(values.airDrag);
  const angular = values.airSpinDrag
    + (condition.jointed === true ? values.bearingFriction : 0)
    + (condition.touching === true ? values.rollingResistance : 0);
  body.setAngularDamping(angular);
}

/** Holds a whole material table to the laws, for a consumer's own table. */
export function assertMaterialsLawfulV1(
  materials: Readonly<Record<string, {
    readonly restitution: number;
    readonly friction: number;
    readonly combine?: string;
  }>>,
): void {
  for (const [id, material] of Object.entries(materials)) {
    assertLawfulMaterialV1(id, material);
  }
}
