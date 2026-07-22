import type { GenomeIssueV1 } from './model.js';
import {
  validatePhysicalAssetV1,
  type PhysicalAssetBookV1,
  type PhysicalBodyV1,
  type PhysicalColliderV1,
  type PhysicalConstraintV1,
  type PhysicalPoseV1,
  type PhysicalShapeV1,
} from './physical-asset.js';
import {
  buildRecipe,
  type PartShelfV1,
  type RecipeBookV1,
  type RecipeV1,
} from './recipe.js';

/**
 * Compiling turns one recipe's arrangement into the flat physical content
 * of the built model: every placed occurrence of a recipe with a sidecar
 * contributes its bodies, colliders, constraints, and ports, moved to
 * where that occurrence stands. Occurrences without a sidecar contribute
 * nothing — no guessed boxes. Constraints stay inside their occurrence;
 * nothing infers a joint from touching.
 *
 * Compiled output is derived data, rebuilt on every compile. Only saved
 * documents must avoid step-index keys; here the occupancy occurrence
 * path is reused on purpose, so occupancy findings and physical findings
 * name the same object the same way.
 */
export interface CompiledPhysicalOccurrenceV1 {
  readonly path: string;
  readonly recipeId: string;
  /** True when the occurrence stands mirrored an odd number of times. */
  readonly reflected: boolean;
}

export interface CompiledPhysicalBodyV1 {
  /** `<occurrence path>#body:<local key>` — stable and collision-free
   * because local keys may not contain the path's own separators. */
  readonly key: string;
  readonly occurrence: string;
  readonly localKey: string;
  readonly type: PhysicalBodyV1['type'];
  /** In the compiled model's own grid frame. */
  readonly pose: PhysicalPoseV1;
  readonly mass?: number;
  readonly linearDamping?: number;
  readonly angularDamping?: number;
  readonly gravityScale?: number;
  readonly continuous?: boolean;
}

export interface CompiledPhysicalColliderV1 {
  readonly occurrence: string;
  /** The compiled key of the owning body. */
  readonly body: string;
  readonly shape: PhysicalShapeV1;
  /** Local to the owning body, reflected with its occurrence. */
  readonly pose: PhysicalPoseV1;
  readonly density?: number;
  readonly friction?: number;
  readonly restitution?: number;
  readonly role?: PhysicalColliderV1['role'];
}

export interface CompiledPhysicalConstraintV1 {
  readonly key: string;
  readonly occurrence: string;
  readonly localKey: string;
  readonly kind: PhysicalConstraintV1['kind'];
  readonly bodyA: string;
  readonly bodyB: string;
  readonly anchorA: PhysicalPoseV1;
  readonly anchorB: PhysicalPoseV1;
  readonly axis?: readonly [number, number, number];
  readonly limits?: readonly [number, number];
  readonly motor?: PhysicalConstraintV1['motor'];
  readonly breakForce?: number;
}

export interface CompiledPhysicalPortV1 {
  readonly key: string;
  readonly occurrence: string;
  readonly localKey: string;
  readonly body: string;
  readonly frame: PhysicalPoseV1;
}

export interface CompiledPhysicalModelV1 {
  /** Every occurrence that contributed physical content, in build order. */
  readonly occurrences: readonly CompiledPhysicalOccurrenceV1[];
  readonly bodies: readonly CompiledPhysicalBodyV1[];
  readonly colliders: readonly CompiledPhysicalColliderV1[];
  readonly constraints: readonly CompiledPhysicalConstraintV1[];
  readonly ports: readonly CompiledPhysicalPortV1[];
}

/** Same stance as `RecipeBuildError`: the whole list, atomically — a
 * compile never returns a partial or clipped physical model. */
export class PhysicalCompileError extends Error {
  constructor(readonly issues: readonly GenomeIssueV1[]) {
    super(
      `Physical model cannot compile: ${issues.map((i) => `${i.path} ${i.message}`).join('; ')}`,
    );
    this.name = 'PhysicalCompileError';
  }
}

/**
 * Where one occurrence stands in the compiled model's frame: a translation
 * plus one sign per mirrorable axis. Recipe steps only translate and
 * mirror, so this is the entire transform family; `dx`/`dz` are -1 after
 * an odd number of mirrors across that axis.
 */
interface OccurrenceFrame {
  readonly dx: 1 | -1;
  readonly dz: 1 | -1;
  readonly tx: number;
  readonly ty: number;
  readonly tz: number;
}

const IDENTITY_FRAME: OccurrenceFrame = { dx: 1, dz: 1, tx: 0, ty: 0, tz: 0 };

interface OccurrenceRecord {
  readonly path: string;
  readonly recipeId: string;
  readonly frame: OccurrenceFrame;
}

/** Multiplying by -1 breeds -0, which is a needless puzzle in saved-looking
 * data and in test output; keep plain 0. */
function plainZero(value: number): number {
  return value === 0 ? 0 : value;
}

/**
 * A mirrored rotation is the original conjugated through the reflection:
 * for an X mirror `(x, y, z, w)` becomes `(x, -y, -z, w)`, for a Z mirror
 * `(-x, -y, z, w)`. The two rules commute, and applying one per mirrored
 * axis handles the doubly mirrored (properly rotated) case too.
 */
function reflectRotation(
  rotation: readonly [number, number, number, number],
  frame: OccurrenceFrame,
): readonly [number, number, number, number] {
  let [x, y, z] = rotation;
  const w = rotation[3];
  if (frame.dx < 0) { y = -y; z = -z; }
  if (frame.dz < 0) { x = -x; y = -y; }
  return [plainZero(x), plainZero(y), plainZero(z), w];
}

/** A body pose lands in the compiled model's own grid frame. */
function poseToModel(pose: PhysicalPoseV1, frame: OccurrenceFrame): PhysicalPoseV1 {
  const [px, py, pz] = pose.position;
  const position = [
    plainZero(frame.dx * px + frame.tx),
    py + frame.ty,
    plainZero(frame.dz * pz + frame.tz),
  ] as const;
  return pose.rotation === undefined
    ? { position }
    : { position, rotation: reflectRotation(pose.rotation, frame) };
}

/** Collider, anchor, and port poses stay body-local; a mirror reflects
 * them about the body's own origin, with no translation part. */
function poseToBodyLocal(pose: PhysicalPoseV1, frame: OccurrenceFrame): PhysicalPoseV1 {
  const [px, py, pz] = pose.position;
  const position = [
    plainZero(frame.dx * px),
    py,
    plainZero(frame.dz * pz),
  ] as const;
  return pose.rotation === undefined
    ? { position }
    : { position, rotation: reflectRotation(pose.rotation, frame) };
}

/**
 * A slide direction is an ordinary vector and reflects with the geometry.
 * A hinge axis is an axial vector and picks up one extra sign flip per
 * mirror — that is what keeps limits and motors meaning the same thing on
 * both sides: a mirrored door swings the other way without renumbering
 * its open angle, and a mirrored wheel still rolls forward.
 */
function reflectAxis(
  axis: readonly [number, number, number],
  frame: OccurrenceFrame,
  kind: PhysicalConstraintV1['kind'],
): readonly [number, number, number] {
  const [ax, ay, az] = axis;
  const handedness = kind === 'revolute' ? frame.dx * frame.dz : 1;
  return [
    plainZero(handedness * frame.dx * ax),
    plainZero(handedness * ay),
    plainZero(handedness * frame.dz * az),
  ];
}

/** Shapes are mirror-invariant about their own frames, so a copy is a
 * plain fresh copy — built field by field like every compiled record. */
function copyShape(shape: PhysicalShapeV1): PhysicalShapeV1 {
  if (shape.kind === 'box') {
    const [hx, hy, hz] = shape.halfExtents;
    return { kind: 'box', halfExtents: [hx, hy, hz] };
  }
  if (shape.kind === 'sphere') return { kind: 'sphere', radius: shape.radius };
  return { kind: shape.kind, halfHeight: shape.halfHeight, radius: shape.radius };
}

function translated(frame: OccurrenceFrame, at: readonly [number, number, number]): OccurrenceFrame {
  return { ...frame, tx: frame.tx + at[0], ty: frame.ty + at[1], tz: frame.tz + at[2] };
}

function reflected(frame: OccurrenceFrame, axis: 'x' | 'z', size: number): OccurrenceFrame {
  return axis === 'x'
    ? { ...frame, dx: frame.dx < 0 ? 1 : -1, tx: size - frame.tx }
    : { ...frame, dz: frame.dz < 0 ? 1 : -1, tz: size - frame.tz };
}

/**
 * Walks the recipe's structure the same way the voxel builder does,
 * emitting one record per nested occurrence with its frame in the walked
 * recipe's coordinates. Paths are constructed with exactly the builder's
 * own spelling, so they can be matched against `placedByOccurrence`.
 */
function walkOccurrences(
  recipe: RecipeV1,
  book: RecipeBookV1,
  path: string,
): OccurrenceRecord[] {
  const [sx, , sz] = recipe.size;
  const records: OccurrenceRecord[] = [];
  recipe.steps.forEach((step, stepIndex) => {
    if (step.kind === 'recipe') {
      const sub = book[step.recipe];
      // The voxel build already failed loudly on a missing recipe; this
      // guard only keeps the walk honest if it is ever called elsewhere.
      if (!sub) return;
      const childPath = `${path}/steps[${String(stepIndex)}]<${sub.id}>`;
      records.push({
        path: childPath,
        recipeId: sub.id,
        frame: translated(IDENTITY_FRAME, step.at),
      });
      for (const inner of walkOccurrences(sub, book, childPath)) {
        records.push({ ...inner, frame: translated(inner.frame, step.at) });
      }
      return;
    }
    if (step.kind === 'mirror') {
      // The marker sits at this recipe's level, exactly as the builder
      // spells it, so a nested same-numbered mirror stays a different path.
      const marker = `${path}/mirrors[${String(stepIndex)}:${step.axis}]`;
      const copies = records.map((record) => ({
        path: `${marker}${record.path.slice(path.length)}`,
        recipeId: record.recipeId,
        frame: reflected(record.frame, step.axis, step.axis === 'x' ? sx : sz),
      }));
      records.push(...copies);
    }
    // Direct voxels and part steps are the walked recipe's own paint and
    // never create an occurrence.
  });
  return records;
}

/**
 * Compiles the physical content of one built arrangement. The voxel build
 * runs first, so an invalid recipe or a cross-occurrence overlap fails as
 * `RecipeBuildError` before any physical meaning is read; sidecar findings
 * then fail together as `PhysicalCompileError`. Determinism matches the
 * builder: identical inputs compile to the identical flat model.
 */
export function compilePhysicalModelV1(
  recipe: RecipeV1,
  parts: PartShelfV1,
  book: RecipeBookV1 = {},
  physicalBook: PhysicalAssetBookV1 = {},
): CompiledPhysicalModelV1 {
  const built = buildRecipe(recipe, parts, book);

  const candidates: OccurrenceRecord[] = [
    { path: recipe.id, recipeId: recipe.id, frame: IDENTITY_FRAME },
    ...walkOccurrences(recipe, book, recipe.id),
  ];
  // The walk names every occurrence that could exist; the builder's own
  // ledger says which ones do. Recipe steps always land, and a mirror copy
  // is in the ledger exactly when the build kept it, so filtering here
  // never re-derives the builder's landing decisions.
  const exists = new Set(built.occurrences);
  const records = candidates.filter((record) => exists.has(record.path));

  const issues: GenomeIssueV1[] = [];
  const checked = new Set<string>();
  for (const record of records) {
    const asset = physicalBook[record.recipeId];
    if (!asset || checked.has(record.recipeId)) continue;
    checked.add(record.recipeId);
    for (const issue of validatePhysicalAssetV1(asset)) {
      issues.push({
        path: `physical<${record.recipeId}>${issue.path.replace(/^\$/, '')}`,
        message: issue.message,
      });
    }
    if (asset.recipeId !== record.recipeId) {
      issues.push({
        path: `physical<${record.recipeId}>.recipeId`,
        message: `Expected '${record.recipeId}'; a sidecar under one book slot may not describe another recipe.`,
      });
    }
  }
  if (issues.length > 0) throw new PhysicalCompileError(issues);

  const occurrences: CompiledPhysicalOccurrenceV1[] = [];
  const bodies: CompiledPhysicalBodyV1[] = [];
  const colliders: CompiledPhysicalColliderV1[] = [];
  const constraints: CompiledPhysicalConstraintV1[] = [];
  const ports: CompiledPhysicalPortV1[] = [];
  for (const record of records) {
    const asset = physicalBook[record.recipeId];
    if (!asset) continue;
    const { path, frame } = record;
    occurrences.push({
      path,
      recipeId: record.recipeId,
      reflected: frame.dx * frame.dz < 0,
    });
    // Fresh copies, field by field — the recipe builder's own stance:
    // compiled output must not share structure with the book, and unknown
    // fields on a hand-loaded sidecar must not ride through unvalidated.
    for (const body of asset.bodies) {
      bodies.push({
        key: `${path}#body:${body.key}`,
        occurrence: path,
        localKey: body.key,
        type: body.type,
        pose: poseToModel(body.pose, frame),
        ...(body.mass === undefined ? {} : { mass: body.mass }),
        ...(body.linearDamping === undefined ? {} : { linearDamping: body.linearDamping }),
        ...(body.angularDamping === undefined ? {} : { angularDamping: body.angularDamping }),
        ...(body.gravityScale === undefined ? {} : { gravityScale: body.gravityScale }),
        ...(body.continuous === undefined ? {} : { continuous: body.continuous }),
      });
    }
    for (const collider of asset.colliders) {
      colliders.push({
        occurrence: path,
        body: `${path}#body:${collider.body}`,
        shape: copyShape(collider.shape),
        pose: poseToBodyLocal(collider.pose, frame),
        ...(collider.density === undefined ? {} : { density: collider.density }),
        ...(collider.friction === undefined ? {} : { friction: collider.friction }),
        ...(collider.restitution === undefined ? {} : { restitution: collider.restitution }),
        ...(collider.role === undefined ? {} : { role: collider.role }),
      });
    }
    for (const constraint of asset.constraints) {
      constraints.push({
        key: `${path}#constraint:${constraint.key}`,
        occurrence: path,
        localKey: constraint.key,
        kind: constraint.kind,
        bodyA: `${path}#body:${constraint.bodyA}`,
        bodyB: `${path}#body:${constraint.bodyB}`,
        anchorA: poseToBodyLocal(constraint.anchorA, frame),
        anchorB: poseToBodyLocal(constraint.anchorB, frame),
        ...(constraint.axis === undefined
          ? {}
          : { axis: reflectAxis(constraint.axis, frame, constraint.kind) }),
        ...(constraint.limits === undefined
          ? {}
          : { limits: [constraint.limits[0], constraint.limits[1]] as const }),
        ...(constraint.motor === undefined
          ? {}
          : {
            motor: {
              targetVelocity: constraint.motor.targetVelocity,
              maxForce: constraint.motor.maxForce,
            },
          }),
        ...(constraint.breakForce === undefined ? {} : { breakForce: constraint.breakForce }),
      });
    }
    for (const port of asset.ports) {
      ports.push({
        key: `${path}#port:${port.key}`,
        occurrence: path,
        localKey: port.key,
        body: `${path}#body:${port.body}`,
        frame: poseToBodyLocal(port.frame, frame),
      });
    }
  }
  return { occurrences, bodies, colliders, constraints, ports };
}
