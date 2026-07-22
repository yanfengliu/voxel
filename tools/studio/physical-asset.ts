import type { GenomeIssueV1 } from './model.js';

/**
 * A physical asset is the sidecar that says how a saved recipe behaves as a
 * thing in a world: which pieces move as one, what shape each piece blocks,
 * and where a hinge or slide is allowed. It is a separate document on
 * purpose — `RecipeV1` describes how a model looks and was made, and must
 * not silently acquire physical meaning. A recipe without a sidecar makes
 * no physical claims at all; that is a valid state, not a default guess.
 *
 * Same ground rules as recipes: plain data, no functions, no typed arrays.
 * A sidecar must survive JSON, `structuredClone`, and an IndexedDB round
 * trip. Nothing here runs physics; this is authoring data for a solver
 * that lives outside this repository.
 */
export const STUDIO_PHYSICAL_ASSET_SCHEMA_V1 = 'studio.physical-asset/1' as const;

/**
 * A pose in the sidecar's one coordinate convention: positions are voxel
 * units on the same axes as the recipe grid, measured from the grid's
 * origin corner — the corner `at` placements use. Collider and anchor
 * poses are local to their body. Rotation is a unit quaternion in
 * [x, y, z, w] order; leaving it out means identity. No implicit axis
 * swap, scale, or unit conversion anywhere.
 */
export interface PhysicalPoseV1 {
  readonly position: readonly [number, number, number];
  readonly rotation?: readonly [number, number, number, number];
}

/**
 * A body is a piece that moves as one. A chair is one body; a cart is a
 * chassis body and four wheel bodies. `fixed` never moves, `dynamic` is
 * fully simulated, `kinematic` follows driven targets.
 */
export interface PhysicalBodyV1 {
  /** The stable name everything else uses to refer to this body. */
  readonly key: string;
  readonly type: 'fixed' | 'dynamic' | 'kinematic';
  /** Relative to the recipe's grid origin corner. */
  readonly pose: PhysicalPoseV1;
  /** Overrides density-derived mass when present. Kilograms, above 0. */
  readonly mass?: number;
  readonly linearDamping?: number;
  readonly angularDamping?: number;
  readonly gravityScale?: number;
  /** Asks for swept collision checks when a solver exists. */
  readonly continuous?: boolean;
}

/**
 * The bounded shape menu. Capsules and cylinders run along local Y.
 * Convex hulls, meshes, and heightfields are named future shapes; the
 * validator rejects them rather than accepting data nothing can check.
 */
export type PhysicalShapeV1 =
  | { readonly kind: 'box'; readonly halfExtents: readonly [number, number, number] }
  | { readonly kind: 'sphere'; readonly radius: number }
  | { readonly kind: 'capsule'; readonly halfHeight: number; readonly radius: number }
  | { readonly kind: 'cylinder'; readonly halfHeight: number; readonly radius: number };

/**
 * One solid (or sensor) shape on one body. Several colliders on one body
 * make a compound rigid shape — a chair's legs, seat, and back — so no
 * separate compound kind exists. Sensors overlap without claiming space.
 */
export interface PhysicalColliderV1 {
  readonly body: string;
  readonly shape: PhysicalShapeV1;
  /** Local to the owning body. */
  readonly pose: PhysicalPoseV1;
  /** Mass per voxel-unit cube for derived mass. Above 0; 1 when omitted. */
  readonly density?: number;
  readonly friction?: number;
  readonly restitution?: number;
  /** Default 'solid'. */
  readonly role?: 'solid' | 'sensor';
}

/**
 * A constraint joins two bodies of this same asset and allows one named
 * kind of relative motion: none, a hinge, or a slide. A drawer is a second
 * body plus a limited prismatic constraint; a door is a second body plus a
 * revolute one. Anchors are body-local, so the joint moves with its bodies.
 */
export interface PhysicalConstraintV1 {
  readonly key: string;
  readonly kind: 'fixed' | 'revolute' | 'prismatic';
  readonly bodyA: string;
  readonly bodyB: string;
  readonly anchorA: PhysicalPoseV1;
  readonly anchorB: PhysicalPoseV1;
  /** Local unit axis for revolute and prismatic; forbidden on fixed. */
  readonly axis?: readonly [number, number, number];
  /** Radians for revolute, voxel units for prismatic. min at most max. */
  readonly limits?: readonly [number, number];
  readonly motor?: { readonly targetVelocity: number; readonly maxForce: number };
  readonly breakForce?: number;
}

/**
 * A named body-local frame where a future parent may attach something — a
 * socket, declared without knowing who plugs in. Wiring ports together is
 * a later slice; defining them here keeps reusable assets connectable
 * without exposing their internal geometry.
 */
export interface PhysicalPortV1 {
  readonly key: string;
  readonly body: string;
  readonly frame: PhysicalPoseV1;
}

export interface PhysicalAssetV1 {
  readonly schemaVersion: typeof STUDIO_PHYSICAL_ASSET_SCHEMA_V1;
  /** The recipe this sidecar describes; one sidecar per recipe id. */
  readonly recipeId: string;
  readonly bodies: readonly PhysicalBodyV1[];
  readonly colliders: readonly PhysicalColliderV1[];
  readonly constraints: readonly PhysicalConstraintV1[];
  readonly ports: readonly PhysicalPortV1[];
}

/**
 * The sidecars a compile may draw on, keyed by recipe id — the same shape
 * as a recipe book, and owned the same way: a game's book is its own, and
 * the engine never holds one.
 */
export type PhysicalAssetBookV1 = Readonly<Record<string, PhysicalAssetV1>>;

/** Bounds are named so a future change is a decision, not a drift. */
export const MAX_PHYSICAL_BODIES = 64;
export const MAX_PHYSICAL_COLLIDERS = 128;
export const MAX_PHYSICAL_CONSTRAINTS = 64;
export const MAX_PHYSICAL_PORTS = 32;
/** Half extents, radii, and half heights stay at or below this, in voxels. */
export const MAX_PHYSICAL_SHAPE_DIMENSION = 256;
/** Every pose position component stays within plus or minus this. */
export const MAX_PHYSICAL_POSE_POSITION = 1024;
const MAX_KEY_LENGTH = 64;
/** How far a quaternion or axis may drift from unit length and still count. */
const UNIT_LENGTH_EPSILON = 1e-6;

const BODY_TYPES = ['fixed', 'dynamic', 'kinematic'] as const;
const SHAPE_KINDS = ['box', 'sphere', 'capsule', 'cylinder'] as const;
const CONSTRAINT_KINDS = ['fixed', 'revolute', 'prismatic'] as const;
/** Keys embed into compiled occurrence names, so the separators used there
 * are banned inside a key, along with whitespace. */
const KEY_SHAPE = /^[^\s/<>#]+$/;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function checkKey(value: unknown, path: string, issues: GenomeIssueV1[]): value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_KEY_LENGTH
    || !KEY_SHAPE.test(value)) {
    issues.push({
      path,
      message: `Expected a stable name of at most ${String(MAX_KEY_LENGTH)} characters`
        + " with no whitespace or '/', '<', '>', '#'.",
    });
    return false;
  }
  return true;
}

function checkPose(value: unknown, path: string, issues: GenomeIssueV1[]): void {
  if (typeof value !== 'object' || value === null) {
    issues.push({ path, message: 'Expected a pose object.' });
    return;
  }
  const pose = value as Record<string, unknown>;
  // Every element is read by index on purpose: `every` and `forEach` skip
  // array holes, and structuredClone preserves them, so a holed array would
  // otherwise sail through and surface as NaN in compiled output.
  const position: unknown = pose.position;
  if (!Array.isArray(position) || position.length !== 3
    || ![0, 1, 2].every((index) => {
      const entry: unknown = position[index];
      return isFiniteNumber(entry) && Math.abs(entry) <= MAX_PHYSICAL_POSE_POSITION;
    })) {
    issues.push({
      path: `${path}.position`,
      message: `Expected three finite voxel-unit numbers within ±${String(MAX_PHYSICAL_POSE_POSITION)}.`,
    });
  }
  const rotation: unknown = pose.rotation;
  if (rotation === undefined) return;
  if (!Array.isArray(rotation) || rotation.length !== 4
    || ![0, 1, 2, 3].every((index) => isFiniteNumber(rotation[index]))) {
    issues.push({
      path: `${path}.rotation`,
      message: 'Expected a quaternion as four finite numbers, [x, y, z, w].',
    });
    return;
  }
  const length = Math.hypot(...(rotation as readonly number[]));
  if (Math.abs(length - 1) > UNIT_LENGTH_EPSILON) {
    issues.push({
      path: `${path}.rotation`,
      message: 'Expected a unit quaternion; normalizing silently would hide an authoring mistake.',
    });
  }
}

function checkDimension(value: unknown, path: string, issues: GenomeIssueV1[]): void {
  if (!isFiniteNumber(value) || value <= 0 || value > MAX_PHYSICAL_SHAPE_DIMENSION) {
    issues.push({
      path,
      message: `Expected a voxel-unit size above 0 and at most ${String(MAX_PHYSICAL_SHAPE_DIMENSION)}.`,
    });
  }
}

function checkShape(value: unknown, path: string, issues: GenomeIssueV1[]): void {
  if (typeof value !== 'object' || value === null) {
    issues.push({ path, message: 'Expected a shape object.' });
    return;
  }
  const shape = value as Record<string, unknown>;
  switch (shape.kind) {
    case 'box': {
      const halfExtents: unknown = shape.halfExtents;
      if (!Array.isArray(halfExtents) || halfExtents.length !== 3) {
        issues.push({ path: `${path}.halfExtents`, message: 'Expected three half extents.' });
        break;
      }
      // Indexed on purpose, so array holes fail as the undefined they are.
      for (let index = 0; index < 3; index += 1) {
        checkDimension(halfExtents[index], `${path}.halfExtents[${String(index)}]`, issues);
      }
      break;
    }
    case 'sphere':
      checkDimension(shape.radius, `${path}.radius`, issues);
      break;
    case 'capsule':
    case 'cylinder':
      checkDimension(shape.halfHeight, `${path}.halfHeight`, issues);
      checkDimension(shape.radius, `${path}.radius`, issues);
      break;
    default:
      issues.push({
        path: `${path}.kind`,
        message: `Expected one of: ${SHAPE_KINDS.join(', ')}. Convex hulls, meshes,`
          + ' and heightfields are future shapes, not yet supported.',
      });
  }
}

/** `forEach` skips array holes, and structuredClone preserves them, so a
 * holed entry would dodge the main loop entirely and crash a compile later.
 * Surfacing each hole here first keeps that impossible. */
function checkListHoles(
  list: readonly unknown[],
  name: string,
  what: string,
  issues: GenomeIssueV1[],
): void {
  for (let index = 0; index < list.length; index += 1) {
    if (!(index in list)) {
      issues.push({ path: `$.${name}[${String(index)}]`, message: `Expected a ${what} object.` });
    }
  }
}

function checkOptionalNumber(
  value: unknown,
  path: string,
  issues: GenomeIssueV1[],
  describe: string,
  ok: (entry: number) => boolean,
): void {
  if (value === undefined) return;
  if (!isFiniteNumber(value) || !ok(value)) {
    issues.push({ path, message: `Expected ${describe}.` });
  }
}

/**
 * Rejects a sidecar that could not mean anything. Same stance as the
 * recipe validator: a sidecar reaching a compile from this studio's own
 * tools should already be valid, so anything found here arrived from
 * outside — and it gets the whole list of what is wrong, not just the
 * first thing.
 */
export function validatePhysicalAssetV1(value: unknown): readonly GenomeIssueV1[] {
  if (typeof value !== 'object' || value === null) {
    return [{ path: '$', message: 'Expected an object.' }];
  }
  const asset = value as Record<string, unknown>;
  if (asset.schemaVersion !== STUDIO_PHYSICAL_ASSET_SCHEMA_V1) {
    return [{
      path: '$.schemaVersion',
      message: `Expected ${STUDIO_PHYSICAL_ASSET_SCHEMA_V1}; unknown versions need migration, never a silent misread.`,
    }];
  }
  const issues: GenomeIssueV1[] = [];
  if (typeof asset.recipeId !== 'string' || asset.recipeId.length === 0) {
    issues.push({ path: '$.recipeId', message: 'Expected the id of the recipe this sidecar describes.' });
  }

  const bodyKeys = new Set<string>();
  const bodies: unknown = asset.bodies;
  if (!Array.isArray(bodies)) {
    issues.push({ path: '$.bodies', message: 'Expected a list of bodies.' });
  } else {
    if (bodies.length > MAX_PHYSICAL_BODIES) {
      issues.push({ path: '$.bodies', message: `Expected at most ${String(MAX_PHYSICAL_BODIES)} bodies.` });
    }
    checkListHoles(bodies, 'bodies', 'body', issues);
    bodies.forEach((entry: unknown, index) => {
      const path = `$.bodies[${String(index)}]`;
      if (typeof entry !== 'object' || entry === null) {
        issues.push({ path, message: 'Expected a body object.' });
        return;
      }
      const body = entry as Record<string, unknown>;
      if (checkKey(body.key, `${path}.key`, issues)) {
        if (bodyKeys.has(body.key)) {
          issues.push({ path: `${path}.key`, message: 'Expected each body key to appear once.' });
        }
        bodyKeys.add(body.key);
      }
      if (!BODY_TYPES.includes(body.type as typeof BODY_TYPES[number])) {
        issues.push({ path: `${path}.type`, message: `Expected one of: ${BODY_TYPES.join(', ')}.` });
      }
      checkPose(body.pose, `${path}.pose`, issues);
      checkOptionalNumber(body.mass, `${path}.mass`, issues, 'a mass above 0', (mass) => mass > 0);
      checkOptionalNumber(body.linearDamping, `${path}.linearDamping`, issues,
        'a damping of at least 0', (damping) => damping >= 0);
      checkOptionalNumber(body.angularDamping, `${path}.angularDamping`, issues,
        'a damping of at least 0', (damping) => damping >= 0);
      checkOptionalNumber(body.gravityScale, `${path}.gravityScale`, issues,
        'a finite scale', () => true);
      if (body.continuous !== undefined && typeof body.continuous !== 'boolean') {
        issues.push({ path: `${path}.continuous`, message: 'Expected true or false.' });
      }
    });
  }

  const checkBodyReference = (value2: unknown, path: string): void => {
    if (typeof value2 !== 'string' || !bodyKeys.has(value2)) {
      issues.push({ path, message: 'Expected the key of a body in this asset.' });
    }
  };

  const colliders: unknown = asset.colliders;
  if (!Array.isArray(colliders)) {
    issues.push({ path: '$.colliders', message: 'Expected a list of colliders.' });
  } else {
    if (colliders.length > MAX_PHYSICAL_COLLIDERS) {
      issues.push({
        path: '$.colliders',
        message: `Expected at most ${String(MAX_PHYSICAL_COLLIDERS)} colliders.`,
      });
    }
    checkListHoles(colliders, 'colliders', 'collider', issues);
    colliders.forEach((entry: unknown, index) => {
      const path = `$.colliders[${String(index)}]`;
      if (typeof entry !== 'object' || entry === null) {
        issues.push({ path, message: 'Expected a collider object.' });
        return;
      }
      const collider = entry as Record<string, unknown>;
      checkBodyReference(collider.body, `${path}.body`);
      checkShape(collider.shape, `${path}.shape`, issues);
      checkPose(collider.pose, `${path}.pose`, issues);
      checkOptionalNumber(collider.density, `${path}.density`, issues,
        'a density above 0', (density) => density > 0);
      checkOptionalNumber(collider.friction, `${path}.friction`, issues,
        'a friction of at least 0', (friction) => friction >= 0);
      checkOptionalNumber(collider.restitution, `${path}.restitution`, issues,
        'a restitution between 0 and 1', (restitution) => restitution >= 0 && restitution <= 1);
      if (collider.role !== undefined && collider.role !== 'solid' && collider.role !== 'sensor') {
        issues.push({ path: `${path}.role`, message: "Expected 'solid' or 'sensor'." });
      }
    });
  }

  const constraintKeys = new Set<string>();
  const constraints: unknown = asset.constraints;
  if (!Array.isArray(constraints)) {
    issues.push({ path: '$.constraints', message: 'Expected a list of constraints.' });
  } else {
    if (constraints.length > MAX_PHYSICAL_CONSTRAINTS) {
      issues.push({
        path: '$.constraints',
        message: `Expected at most ${String(MAX_PHYSICAL_CONSTRAINTS)} constraints.`,
      });
    }
    checkListHoles(constraints, 'constraints', 'constraint', issues);
    constraints.forEach((entry: unknown, index) => {
      const path = `$.constraints[${String(index)}]`;
      if (typeof entry !== 'object' || entry === null) {
        issues.push({ path, message: 'Expected a constraint object.' });
        return;
      }
      const constraint = entry as Record<string, unknown>;
      if (checkKey(constraint.key, `${path}.key`, issues)) {
        if (constraintKeys.has(constraint.key)) {
          issues.push({ path: `${path}.key`, message: 'Expected each constraint key to appear once.' });
        }
        constraintKeys.add(constraint.key);
      }
      const kind = constraint.kind;
      if (!CONSTRAINT_KINDS.includes(kind as typeof CONSTRAINT_KINDS[number])) {
        issues.push({ path: `${path}.kind`, message: `Expected one of: ${CONSTRAINT_KINDS.join(', ')}.` });
      }
      checkBodyReference(constraint.bodyA, `${path}.bodyA`);
      checkBodyReference(constraint.bodyB, `${path}.bodyB`);
      if (typeof constraint.bodyA === 'string' && constraint.bodyA === constraint.bodyB) {
        issues.push({
          path: `${path}.bodyB`,
          message: 'Expected two different bodies; a body cannot be joined to itself.',
        });
      }
      checkPose(constraint.anchorA, `${path}.anchorA`, issues);
      checkPose(constraint.anchorB, `${path}.anchorB`, issues);
      const axis: unknown = constraint.axis;
      const needsAxis = kind === 'revolute' || kind === 'prismatic';
      if (needsAxis && axis === undefined) {
        issues.push({ path: `${path}.axis`, message: 'Expected a local axis; a hinge or slide needs one.' });
      }
      if (kind === 'fixed' && axis !== undefined) {
        issues.push({ path: `${path}.axis`, message: 'Expected no axis; a fixed joint allows no motion.' });
      }
      if (axis !== undefined) {
        if (!Array.isArray(axis) || axis.length !== 3
          || ![0, 1, 2].every((index2) => isFiniteNumber(axis[index2]))) {
          issues.push({ path: `${path}.axis`, message: 'Expected an axis as three finite numbers.' });
        } else if (Math.abs(Math.hypot(...(axis as readonly number[])) - 1) > UNIT_LENGTH_EPSILON) {
          issues.push({
            path: `${path}.axis`,
            message: 'Expected a unit axis; normalizing silently would hide an authoring mistake.',
          });
        }
      }
      const limits: unknown = constraint.limits;
      if (limits !== undefined) {
        if (kind === 'fixed') {
          issues.push({ path: `${path}.limits`, message: 'Expected no limits; a fixed joint allows no motion.' });
        } else if (!Array.isArray(limits) || limits.length !== 2
          || ![0, 1].every((index2) => isFiniteNumber(limits[index2]))
          || (limits[0] ?? 0) > (limits[1] ?? 0)) {
          issues.push({
            path: `${path}.limits`,
            message: 'Expected [min, max] as two finite numbers with min at most max.',
          });
        }
      }
      const motor: unknown = constraint.motor;
      if (motor !== undefined) {
        if (kind === 'fixed') {
          issues.push({ path: `${path}.motor`, message: 'Expected no motor; a fixed joint allows no motion.' });
        } else if (typeof motor !== 'object' || motor === null
          || !isFiniteNumber((motor as Record<string, unknown>).targetVelocity)
          || !isFiniteNumber((motor as Record<string, unknown>).maxForce)
          || ((motor as Record<string, unknown>).maxForce as number) <= 0) {
          issues.push({
            path: `${path}.motor`,
            message: 'Expected a finite targetVelocity and a maxForce above 0.',
          });
        }
      }
      checkOptionalNumber(constraint.breakForce, `${path}.breakForce`, issues,
        'a break force above 0', (force) => force > 0);
    });
  }

  const portKeys = new Set<string>();
  const ports: unknown = asset.ports;
  if (!Array.isArray(ports)) {
    issues.push({ path: '$.ports', message: 'Expected a list of ports.' });
  } else {
    if (ports.length > MAX_PHYSICAL_PORTS) {
      issues.push({ path: '$.ports', message: `Expected at most ${String(MAX_PHYSICAL_PORTS)} ports.` });
    }
    checkListHoles(ports, 'ports', 'port', issues);
    ports.forEach((entry: unknown, index) => {
      const path = `$.ports[${String(index)}]`;
      if (typeof entry !== 'object' || entry === null) {
        issues.push({ path, message: 'Expected a port object.' });
        return;
      }
      const port = entry as Record<string, unknown>;
      if (checkKey(port.key, `${path}.key`, issues)) {
        if (portKeys.has(port.key)) {
          issues.push({ path: `${path}.key`, message: 'Expected each port key to appear once.' });
        }
        portKeys.add(port.key);
      }
      checkBodyReference(port.body, `${path}.body`);
      checkPose(port.frame, `${path}.frame`, issues);
    });
  }

  return issues;
}
