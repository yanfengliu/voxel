import { buildRecipe } from './recipe.js';
import { createStudioParts } from './parts.js';
import { decomposeVoxelsV1, modelOccupancyV1 } from './voxel-colliders.js';
import type { StudioModelV1 } from './model.js';
import {
  PLAYGROUND_GRAIN_V1,
  PLAYGROUND_MATERIALS_V1,
} from './physics-playground-materials.js';
import { createPhysicsPlaygroundRecipeBook } from './physics-playground-recipes.js';
import type {
  PlaygroundJointV1,
  PlaygroundBodyDefV1,
  PlaygroundSlopeV1,
  PlaygroundStationV1,
} from './physics-playground-stations.js';

/**
 * Turns a station definition into solver-ready body specs.
 *
 * This module is the parity seam: the live studio lane and the headless
 * fixture both build their Rapier worlds from the specs returned here, so
 * a behaviour observed in the browser is reproducible in a test by
 * construction. Everything is plain data — no Rapier import, because this
 * file is reachable from the browser bundle and Rapier may only enter
 * Studio through the live-physics dynamic import.
 *
 * Slope posing happens here too. A slope slab is authored flat and posed at
 * its angle when the world is built, so the drawn shape and the simulated
 * shape are the same smooth box in both lanes; a runtime angle change is a
 * world rebuild, never a silent collider edit.
 */

export interface PlaygroundColliderBoxV1 {
  readonly half: readonly [number, number, number];
  readonly at: readonly [number, number, number];
}

export interface PlaygroundBodySpecV1 {
  readonly placementId: string;
  readonly kind: 'fixed' | 'dynamic';
  readonly spawnOnly: boolean;
  /** World body-center position and rotation at build time. */
  readonly centre: readonly [number, number, number];
  readonly rotation: readonly [number, number, number, number];
  /** Exact voxel-decomposition boxes, model-center-relative, world-scaled. */
  readonly boxes: readonly PlaygroundColliderBoxV1[];
  /** Set when the body declares the primitive-ball simplification. */
  readonly ballRadius?: number;
  /** Coulomb friction and restitution of this body's material. */
  readonly friction: number;
  readonly restitution: number;
  /** Rapier-ready world density: material mass-per-voxel over grain cubed. */
  readonly worldDensity: number;
  readonly combine: 'average' | 'multiply';
  readonly ccd: boolean;
  /** Angular damping standing in for rolling resistance; see the body type. */
  readonly rollingResistance?: number;
  readonly pivotDamping?: number;
  readonly material: string;
  readonly voxelCount: number;
  readonly grain: number;
  readonly modelSize: readonly [number, number, number];
  readonly tests: string;
}

export interface PlaygroundBuildOptionsV1 {
  /** Ramp angle in degrees for stations with a 'ramp-angle' slope. */
  readonly rampAngleDegrees?: number;
  /** Bodies excluded from this build — scenario subtraction evidence. */
  readonly omit?: readonly string[];
}

type Vec3 = readonly [number, number, number];
type Quat = readonly [number, number, number, number];

const IDENTITY: Quat = [0, 0, 0, 1];

function quatAboutY(radians: number): Quat {
  return [0, Math.sin(radians / 2), 0, Math.cos(radians / 2)];
}

function quatAboutZ(radians: number): Quat {
  return [0, 0, Math.sin(radians / 2), Math.cos(radians / 2)];
}

function quatMultiply(a: Quat, b: Quat): Quat {
  const [ax, ay, az, aw] = a;
  const [bx, by, bz, bw] = b;
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ];
}

function rotateAboutY(vector: Vec3, radians: number): Vec3 {
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return [
    vector[0] * cos + vector[2] * sin,
    vector[1],
    -vector[0] * sin + vector[2] * cos,
  ];
}

function add(...vectors: readonly Vec3[]): Vec3 {
  let x = 0;
  let y = 0;
  let z = 0;
  for (const vector of vectors) {
    x += vector[0];
    y += vector[1];
    z += vector[2];
  }
  return [x, y, z];
}

function scale(vector: Vec3, factor: number): Vec3 {
  return [vector[0] * factor, vector[1] * factor, vector[2] * factor];
}

interface SlopeFrame {
  /** Top-surface downhill edge midpoint. */
  readonly anchor: Vec3;
  /** Unit uphill, surface normal, and across-slope directions. */
  readonly uphill: Vec3;
  readonly normal: Vec3;
  readonly lateral: Vec3;
  readonly rotation: Quat;
  readonly angleRadians: number;
}

function slopeFrame(
  slope: PlaygroundSlopeV1,
  rampAngleDegrees: number | undefined,
): SlopeFrame {
  const degrees = slope.angleDegrees === 'ramp-angle'
    ? rampAngleDegrees ?? 0
    : slope.angleDegrees;
  const angle = (degrees * Math.PI) / 180;
  const yaw = (slope.yawDegrees * Math.PI) / 180;
  const uphill = rotateAboutY([Math.cos(angle), Math.sin(angle), 0], yaw);
  const normal = rotateAboutY([-Math.sin(angle), Math.cos(angle), 0], yaw);
  const lateral = rotateAboutY([0, 0, 1], yaw);
  return {
    anchor: [
      slope.foot[0],
      slope.footY + slope.thicknessMeters * Math.cos(angle),
      slope.foot[1],
    ],
    uphill,
    normal,
    lateral,
    rotation: quatMultiply(quatAboutY(yaw), quatAboutZ(angle)),
    angleRadians: angle,
  };
}

const modelCache = new Map<string, StudioModelV1>();

function playgroundModel(recipeId: string): StudioModelV1 {
  const cached = modelCache.get(recipeId);
  if (cached) return cached;
  const book = createPhysicsPlaygroundRecipeBook();
  const recipe = book[recipeId];
  if (!recipe) {
    throw new Error(
      `The physics playground names recipe '${recipeId}', but the playground `
      + 'recipe book has no such entry. Register it in '
      + 'physics-playground-recipes.ts or fix the station definition.',
    );
  }
  const model = buildRecipe(recipe, createStudioParts(), book).model;
  modelCache.set(recipeId, model);
  return model;
}

function colliderBoxes(model: StudioModelV1, grain: number): {
  readonly boxes: readonly PlaygroundColliderBoxV1[];
  readonly cells: number;
} {
  const decomposition = decomposeVoxelsV1(modelOccupancyV1(model));
  const centre = [
    model.size[0] / 2,
    model.size[1] / 2,
    model.size[2] / 2,
  ] as const;
  return {
    cells: decomposition.cells,
    boxes: decomposition.boxes.map((box) => ({
      half: [
        (box.size[0] * grain) / 2,
        (box.size[1] * grain) / 2,
        (box.size[2] * grain) / 2,
      ] as const,
      at: [
        (box.at[0] + box.size[0] / 2 - centre[0]) * grain,
        (box.at[1] + box.size[1] / 2 - centre[1]) * grain,
        (box.at[2] + box.size[2] / 2 - centre[2]) * grain,
      ] as const,
    })),
  };
}

function bodySpec(
  body: PlaygroundBodyDefV1,
  frames: ReadonlyMap<string, SlopeFrame>,
): PlaygroundBodySpecV1 {
  const grain = PLAYGROUND_GRAIN_V1;
  const model = playgroundModel(body.recipeId);
  const { boxes, cells } = colliderBoxes(model, grain);
  const material = PLAYGROUND_MATERIALS_V1[body.material];
  const halfHeight = (model.size[1] * grain) / 2;

  let centre: Vec3;
  let rotation: Quat = IDENTITY;
  if (body.onSlope) {
    const frame = frames.get(body.onSlope.slopeId);
    if (!frame) {
      throw new Error(
        `Body '${body.placementId}' sits on slope '${body.onSlope.slopeId}', `
        + 'but the station declares no such slope. Add it to the station\'s '
        + 'slopes list or fix the body definition.',
      );
    }
    const isSlab = body.placementId === body.onSlope.slopeId;
    if (isSlab) {
      const lengthMeters = model.size[0] * grain;
      centre = add(
        frame.anchor,
        scale(frame.uphill, lengthMeters / 2),
        scale(frame.normal, -halfHeight),
      );
      rotation = frame.rotation;
    } else {
      // A slope-aligned body meets the surface at half its height. A
      // world-aligned body does not: a box corner reaches further along a
      // tilted normal than the half-height does, so its true support is the
      // deepest collider corner projected onto the surface normal —
      // otherwise the corner spawns inside the slab and the solver ejects it.
      let support = halfHeight;
      if (body.onSlope.align === 'world') {
        if (body.collider === 'ball') {
          support = (Math.max(...model.size) * grain) / 2;
        } else {
          support = 0;
          for (const box of boxes) {
            for (const sx of [-1, 1]) {
              for (const sy of [-1, 1]) {
                for (const sz of [-1, 1]) {
                  const reach = -(
                    (box.at[0] + sx * box.half[0]) * frame.normal[0]
                    + (box.at[1] + sy * box.half[1]) * frame.normal[1]
                    + (box.at[2] + sz * box.half[2]) * frame.normal[2]
                  );
                  if (reach > support) support = reach;
                }
              }
            }
          }
        }
      }
      centre = add(
        frame.anchor,
        scale(frame.uphill, body.onSlope.along),
        scale(frame.lateral, body.onSlope.lateral),
        scale(frame.normal, support + body.onSlope.gap),
      );
      rotation = body.onSlope.align === 'slope' ? frame.rotation : IDENTITY;
    }
  } else {
    centre = [body.at[0], body.at[1] + halfHeight, body.at[2]];
    if (body.turns) {
      rotation = quatAboutY((body.turns * Math.PI) / 2);
    }
  }
  if (body.poseOverride) {
    // The machine stations pose flat-authored parts — a cocked arm, a
    // plumb counterweight — with explicit numbers computed from the same
    // constants that drew them.
    centre = body.poseOverride.centre;
    rotation = body.poseOverride.quaternion;
  }

  const largestExtent = Math.max(model.size[0], model.size[1], model.size[2]);
  return {
    placementId: body.placementId,
    kind: body.kind,
    spawnOnly: body.spawnOnly ?? false,
    centre,
    rotation,
    boxes,
    ...(body.collider === 'ball'
      ? { ballRadius: (largestExtent * grain) / 2 }
      : {}),
    friction: material.friction,
    restitution: material.restitution,
    worldDensity: material.density / grain ** 3,
    combine: material.combine,
    ccd: body.ccd ?? false,
    ...(body.pivotDamping !== undefined
      ? { pivotDamping: body.pivotDamping }
      : {}),
    ...(body.rollingResistance !== undefined
      ? { rollingResistance: body.rollingResistance }
      : {}),
    material: body.material,
    voxelCount: cells,
    grain,
    modelSize: [model.size[0], model.size[1], model.size[2]],
    tests: body.tests,
  };
}

/**
 * Every body of a station as a solver-ready spec, keyed by placement id.
 * Spawn-only bodies are included but flagged; both lanes create them only
 * when a case fires.
 */
export function playgroundBodySpecsV1(
  station: PlaygroundStationV1,
  options: PlaygroundBuildOptionsV1 = {},
): ReadonlyMap<string, PlaygroundBodySpecV1> {
  const frames = new Map<string, SlopeFrame>();
  for (const slope of station.slopes) {
    frames.set(slope.slopeId, slopeFrame(slope, options.rampAngleDegrees));
  }
  const specs = new Map<string, PlaygroundBodySpecV1>();
  const omitted = new Set(options.omit ?? []);
  for (const name of omitted) {
    if (!station.bodies.some((body) => body.placementId === name)) {
      throw new Error(
        `The omit list names '${name}', but station '${station.sceneId}' `
        + 'declares no such body — subtraction evidence must remove a real '
        + "part, so fix the scenario's omit list.",
      );
    }
  }
  for (const body of station.bodies) {
    if (specs.has(body.placementId)) {
      throw new Error(
        `Station '${station.sceneId}' declares placement `
        + `'${body.placementId}' twice. Placement ids are body identities `
        + 'and must be unique within a station.',
      );
    }
    if (omitted.has(body.placementId)) continue;
    specs.set(body.placementId, bodySpec(body, frames));
  }
  return specs;
}

/**
 * The station's joints, validated against its bodies. A joint whose end
 * was omitted from this build is dropped with the omitted body; a joint
 * naming a body the station never declared, joining a body to itself, a
 * revolute without an axis, or a rope without a length is an authoring
 * error and throws. Joints require build-time bodies — a spawn-only end
 * would dangle until its case fires, which no current machine needs.
 */
export function playgroundJointSpecsV1(
  station: PlaygroundStationV1,
  specs: ReadonlyMap<string, PlaygroundBodySpecV1>,
): readonly PlaygroundJointV1[] {
  const joints: PlaygroundJointV1[] = [];
  const seen = new Set<string>();
  for (const joint of station.joints ?? []) {
    if (seen.has(joint.id)) {
      throw new Error(
        `Station '${station.sceneId}' declares joint '${joint.id}' twice; `
        + 'joint ids are identities and must be unique.',
      );
    }
    seen.add(joint.id);
    if (joint.a === joint.b) {
      throw new Error(
        `Joint '${joint.id}' joins '${joint.a}' to itself; a joint needs `
        + 'two distinct bodies.',
      );
    }
    for (const end of [joint.a, joint.b]) {
      const declared = station.bodies.find(
        (body) => body.placementId === end);
      if (declared === undefined) {
        throw new Error(
          `Joint '${joint.id}' names '${end}', but station `
          + `'${station.sceneId}' declares no such body. Joints must join `
          + 'declared placements.',
        );
      }
      if (declared.spawnOnly) {
        throw new Error(
          `Joint '${joint.id}' names spawn-only body '${end}'. Joints `
          + 'require build-time bodies; make the body ordinary or drop '
          + 'the joint.',
        );
      }
    }
    if (joint.kind === 'revolute' && joint.axis === undefined) {
      throw new Error(
        `Revolute joint '${joint.id}' declares no axis; a hinge needs its `
        + "rotation axis in body a's local frame.",
      );
    }
    if (joint.kind === 'rope' && joint.lengthMeters === undefined) {
      throw new Error(
        `Rope joint '${joint.id}' declares no lengthMeters; a rope needs `
        + 'its maximum anchor separation.',
      );
    }
    if (!specs.has(joint.a) || !specs.has(joint.b)) continue;
    joints.push(joint);
  }
  return joints;
}
