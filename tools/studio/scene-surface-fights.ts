import { modelCenterV1 } from './build.js';
import { setVoxelSize } from './edit.js';
import { modelVoxelSizeV1, type StudioModelV1 } from './model.js';
import { buildRecipe, mixSeed, type PartShelfV1, type RecipeBookV1 } from './recipe.js';
import { placementVoxelsV1 } from './scene-overlap.js';
import type { ScenePoseReplayV1OrV2 } from './scene-pose-replay.js';
import {
  sampleValidatedScenePoseReplayV1OrV2,
  scenePoseReplayDurationMsV1OrV2,
} from './scene-pose-replay-sampling.js';
import { validateSceneV1, type SceneV1 } from './scene.js';

/**
 * Finds surfaces that would compete for visibility between a replay-driven
 * placement and the still scenery around it.
 *
 * sceneOverlapsV1 keeps authored placements out of each other's space, but it
 * deliberately does not judge placements a pose replay moves — their presented
 * poses come from the recorded trace, not from `at`. That left a gap the owner
 * saw twice: when a moving piece's surface lands exactly on the same plane as
 * a still surface, facing the same way and covering the same area, the two
 * pictures flicker per pixel ("weird surfaces where different models compete
 * for visibility"). Machine Works had exactly this — the conveyor slats' top
 * faces shared the y=9 plane with the foundation's bridge-pad tops.
 *
 * Only same-facing coincident surfaces fight. Two solids resting flush —
 * a foot's bottom on a pad's top — put opposite-facing faces on the shared
 * plane, and single-sided rendering culls the hidden one, so flush contact
 * stays allowed exactly as the overlap check promises. Faces buried inside a
 * body never render either, so only faces open to air are judged.
 *
 * The replay is sampled at recorded frame times: always the opening frame (the
 * pose a scene presents at rest and Interact seeds from), then evenly through
 * the recording. A sampled pose that is not an axis-aligned turn cannot hold a
 * shared plane across an area, so tilted poses are skipped and reported as
 * unchecked rather than silently passed.
 *
 * The verdict is therefore about the sampled times, not every presented
 * instant: a fight must dwell for at least one sampling stride to be caught at
 * any phase, and a moving face that crosses a still plane between samples (or
 * between recorded frames, since presentation interpolates) can slip through.
 * That matches the complaint this guards — a surface that flickers where the
 * owner can look at it — while a single-frame transit crossing stays below
 * anything a person can see.
 */

/** Planes closer than this render as the same float32 depth, so they fight. */
const PLANE_EPSILON = 1e-4;
/** How far a rotation column may drift from a unit axis and still be axis-aligned. */
const AXIS_EPSILON = 1e-6;
/** Sampled poses per replay, spread evenly, plus the exact final frame. */
const SAMPLES_PER_REPLAY = 96;

export interface SceneSurfaceFightV1 {
  /** The replay-driven placement whose surface lands on a still surface. */
  readonly moving: string;
  /** The still placement it fights. */
  readonly still: string;
  readonly axis: 'x' | 'y' | 'z';
  /** +1 when both faces look toward +axis, -1 toward -axis. */
  readonly facing: 1 | -1;
  /** The shared world plane. */
  readonly plane: number;
  /** Overlapping same-facing face pairs found on this plane, over all samples. */
  readonly facePairs: number;
  /** The first sampled replay time that showed the fight. */
  readonly firstTimeMs: number;
  /** How many sampled times showed it. */
  readonly sampledTimes: number;
}

export interface SceneSurfaceUncheckedV1 {
  readonly placementId: string;
  /** Why the placement could not be judged, e.g. a tilted recorded pose. */
  readonly reason: string;
  /** How many sampled times were skipped for this reason. */
  readonly sampledTimes: number;
}

export interface SceneSurfaceFightReportV1 {
  readonly fights: readonly SceneSurfaceFightV1[];
  readonly unchecked: readonly SceneSurfaceUncheckedV1[];
}

interface BuiltModel {
  readonly model: StudioModelV1;
  readonly grain: number;
  readonly filled: Set<number>;
  readonly topFilm: boolean;
}

type Axis = 0 | 1 | 2;
interface FaceRect {
  readonly plane: number;
  readonly u0: number;
  readonly u1: number;
  readonly v0: number;
  readonly v1: number;
  readonly placementId: string;
}

const AXIS_NAMES = ['x', 'y', 'z'] as const;
/** The six model-space face directions as [dx, dy, dz]. */
const DIRECTIONS: readonly (readonly [number, number, number])[] = [
  [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1],
];

function cellKey(x: number, y: number, z: number, sx: number, sy: number): number {
  return x + sx * (y + sy * z);
}

function buildModels(
  scene: SceneV1,
  recipes: RecipeBookV1,
  parts: PartShelfV1,
): Map<string, BuiltModel> {
  const byKey = new Map<string, BuiltModel>();
  for (const placement of scene.placements) {
    const recipe = recipes[placement.model];
    if (!recipe) continue;
    const grain = placement.grain ?? modelVoxelSizeV1(recipe);
    const seed = placement.seed ?? 0;
    const key = `${placement.model}@${String(grain)}@${String(seed)}`;
    if (byKey.has(key)) continue;
    const seeded = seed === 0 ? recipe : { ...recipe, seed: mixSeed(recipe.seed, seed) };
    let model = buildRecipe(seeded, parts, recipes).model;
    if (modelVoxelSizeV1(model) !== grain) model = setVoxelSize(model, grain);
    const [sx, sy] = model.size;
    const filled = new Set<number>();
    for (let index = 0; index < model.voxels.length; index += 1) {
      if ((model.voxels[index] ?? 0) !== 0) {
        const x = index % sx;
        const y = Math.floor(index / sx) % sy;
        const z = Math.floor(index / (sx * sy));
        filled.add(cellKey(x, y, z, sx, sy));
      }
    }
    byKey.set(key, { model, grain, filled, topFilm: recipe.surface === 'top-film' });
  }
  return byKey;
}

function modelKeyOf(placement: SceneV1['placements'][number], recipes: RecipeBookV1): string {
  const recipe = recipes[placement.model];
  const grain = placement.grain ?? (recipe ? modelVoxelSizeV1(recipe) : 1);
  return `${placement.model}@${String(grain)}@${String(placement.seed ?? 0)}`;
}

/** Whether the model leaves the cell next to (x, y, z) along `direction` empty. */
function faceOpen(
  built: BuiltModel,
  x: number,
  y: number,
  z: number,
  direction: readonly [number, number, number],
): boolean {
  const [sx, sy, sz] = built.model.size;
  const nx = x + direction[0];
  const ny = y + direction[1];
  const nz = z + direction[2];
  if (nx < 0 || ny < 0 || nz < 0 || nx >= sx || ny >= sy || nz >= sz) return true;
  return !built.filled.has(cellKey(nx, ny, nz, sx, sy));
}

/** World face direction of a model face after the placement's quarter-turns. */
function turnDirection(
  direction: readonly [number, number, number],
  turns: number,
): readonly [number, number, number] {
  const quarter = ((turns % 4) + 4) % 4;
  let [dx, dy, dz] = direction;
  for (let step = 0; step < quarter; step += 1) {
    const next = [dz, dy, -dx] as const;
    [dx, dy, dz] = next;
  }
  return [dx, dy, dz];
}

function planeBucket(plane: number): number {
  return Math.round(plane / PLANE_EPSILON);
}

function faceBucketKey(axis: Axis, facing: 1 | -1, bucket: number): string {
  return `${String(axis)}:${String(facing)}:${String(bucket)}`;
}

/**
 * Every face of the still placements that is open to air, bucketed by world
 * axis, facing, and plane so a moving face can find coincident candidates.
 */
function stillFaceIndex(
  scene: SceneV1,
  stillIds: ReadonlySet<string>,
  models: Map<string, BuiltModel>,
  recipes: RecipeBookV1,
): Map<string, FaceRect[]> {
  const index = new Map<string, FaceRect[]>();
  for (const placement of scene.placements) {
    if (!stillIds.has(placement.id)) continue;
    const built = models.get(modelKeyOf(placement, recipes));
    if (!built) continue;
    const boxes = placementVoxelsV1(placement, built.model, built.grain);
    const turns = placement.turns ?? 0;
    for (const box of boxes) {
      for (const direction of DIRECTIONS) {
        if (built.topFilm && direction[1] !== 1) continue;
        if (!faceOpen(built, box.index.x, box.index.y, box.index.z, direction)) continue;
        const world = turnDirection(direction, turns);
        const axis: Axis = world[0] !== 0 ? 0 : world[1] !== 0 ? 1 : 2;
        const facing: 1 | -1 = world[axis] > 0 ? 1 : -1;
        const low = [box.x, box.y, box.z] as const;
        const plane = facing === 1 ? low[axis] + box.size : low[axis];
        const uAxis: Axis = axis === 0 ? 1 : 0;
        const vAxis: Axis = axis === 2 ? 1 : 2;
        const rect: FaceRect = {
          plane,
          u0: low[uAxis],
          u1: low[uAxis] + box.size,
          v0: low[vAxis],
          v1: low[vAxis] + box.size,
          placementId: placement.id,
        };
        const key = faceBucketKey(axis, facing, planeBucket(plane));
        const bucket = index.get(key);
        if (bucket) bucket.push(rect);
        else index.set(key, [rect]);
      }
    }
  }
  return index;
}

/** A rotation column snapped to a signed axis, or null when it is tilted. */
function snapColumn(x: number, y: number, z: number): readonly [number, number, number] | null {
  const sx = Math.abs(Math.abs(x) - 1) <= AXIS_EPSILON && Math.abs(y) <= AXIS_EPSILON && Math.abs(z) <= AXIS_EPSILON;
  const sy = Math.abs(x) <= AXIS_EPSILON && Math.abs(Math.abs(y) - 1) <= AXIS_EPSILON && Math.abs(z) <= AXIS_EPSILON;
  const sz = Math.abs(x) <= AXIS_EPSILON && Math.abs(y) <= AXIS_EPSILON && Math.abs(Math.abs(z) - 1) <= AXIS_EPSILON;
  if (sx) return [x > 0 ? 1 : -1, 0, 0];
  if (sy) return [0, y > 0 ? 1 : -1, 0];
  if (sz) return [0, 0, z > 0 ? 1 : -1];
  return null;
}

/** The pose's rotation as an exact signed-axis matrix, or null when tilted. */
function axisAlignedRotation(
  quaternion: readonly [number, number, number, number],
): readonly (readonly [number, number, number])[] | null {
  const [x, y, z, w] = quaternion;
  const columns = [
    snapColumn(1 - 2 * (y * y + z * z), 2 * (x * y + w * z), 2 * (x * z - w * y)),
    snapColumn(2 * (x * y - w * z), 1 - 2 * (x * x + z * z), 2 * (y * z + w * x)),
    snapColumn(2 * (x * z + w * y), 2 * (y * z - w * x), 1 - 2 * (x * x + y * y)),
  ];
  return columns.every((column) => column !== null) ? columns : null;
}

function rotate(
  rotation: readonly (readonly [number, number, number])[],
  vector: readonly [number, number, number],
): readonly [number, number, number] {
  return [
    rotation[0]![0] * vector[0] + rotation[1]![0] * vector[1] + rotation[2]![0] * vector[2],
    rotation[0]![1] * vector[0] + rotation[1]![1] * vector[1] + rotation[2]![1] * vector[2],
    rotation[0]![2] * vector[0] + rotation[1]![2] * vector[1] + rotation[2]![2] * vector[2],
  ];
}

/** Evenly spread recorded frame indices: always the first and last frame. */
function sampleFrames(frameCount: number): number[] {
  const last = Math.max(0, frameCount - 1);
  const stride = Math.max(1, Math.ceil(last / (SAMPLES_PER_REPLAY - 1)));
  const frames: number[] = [];
  for (let frame = 0; frame <= last; frame += stride) frames.push(frame);
  if (frames[frames.length - 1] !== last) frames.push(last);
  return frames;
}

export function sceneSurfaceFightsV1(
  scene: SceneV1,
  replay: ScenePoseReplayV1OrV2,
  recipes: RecipeBookV1,
  parts: PartShelfV1,
): SceneSurfaceFightReportV1 {
  if (validateSceneV1(scene).length > 0) return { fights: [], unchecked: [] };
  const movingIds = new Set(replay.tracks.map(({ placementId }) => placementId));
  const stillIds = new Set(
    scene.placements.map(({ id }) => id).filter((id) => !movingIds.has(id)),
  );
  const models = buildModels(scene, recipes, parts);
  const stillFaces = stillFaceIndex(scene, stillIds, models, recipes);
  const placementsById = new Map(scene.placements.map((placement) => [placement.id, placement]));

  const durationMs = scenePoseReplayDurationMsV1OrV2(replay);
  const stepMs = replay.frameCount > 0 ? durationMs / replay.frameCount : 0;
  const fights = new Map<string, {
    moving: string; still: string; axis: Axis; facing: 1 | -1; plane: number;
    facePairs: number; firstTimeMs: number; sampledTimes: Set<number>;
  }>();
  const unchecked = new Map<string, { reason: string; sampledTimes: number }>();

  for (const frame of sampleFrames(replay.frameCount)) {
    const timeMs = frame * stepMs;
    const sample = sampleValidatedScenePoseReplayV1OrV2(replay, timeMs);
    for (const pose of sample.placements) {
      const placement = placementsById.get(pose.placementId);
      if (!placement) continue;
      const built = models.get(modelKeyOf(placement, recipes));
      if (!built) continue;
      const rotation = axisAlignedRotation(pose.quaternion);
      if (rotation === null) {
        const entry = unchecked.get(pose.placementId)
          ?? { reason: 'the recorded pose is tilted off the world axes, so it cannot hold a shared plane', sampledTimes: 0 };
        entry.sampledTimes += 1;
        unchecked.set(pose.placementId, entry);
        continue;
      }
      const middle = modelCenterV1(built.model);
      const grain = built.grain;
      const [sx, sy, sz] = built.model.size;
      for (let z = 0; z < sz; z += 1) {
        for (let y = 0; y < sy; y += 1) {
          for (let x = 0; x < sx; x += 1) {
            if (!built.filled.has(cellKey(x, y, z, sx, sy))) continue;
            const local: readonly [number, number, number] = [
              (x - middle.x) * grain,
              (y - middle.y) * grain,
              (z - middle.z) * grain,
            ];
            const a = rotate(rotation, local);
            const b = rotate(rotation, [local[0] + grain, local[1] + grain, local[2] + grain]);
            const low = [
              pose.translation[0] + Math.min(a[0], b[0]),
              pose.translation[1] + Math.min(a[1], b[1]),
              pose.translation[2] + Math.min(a[2], b[2]),
            ] as const;
            for (const direction of DIRECTIONS) {
              if (built.topFilm && direction[1] !== 1) continue;
              if (!faceOpen(built, x, y, z, direction)) continue;
              const world = rotate(rotation, direction);
              const axis: Axis = world[0] !== 0 ? 0 : world[1] !== 0 ? 1 : 2;
              const facing: 1 | -1 = world[axis] > 0 ? 1 : -1;
              const plane = facing === 1 ? low[axis] + grain : low[axis];
              const uAxis: Axis = axis === 0 ? 1 : 0;
              const vAxis: Axis = axis === 2 ? 1 : 2;
              const u0 = low[uAxis];
              const u1 = u0 + grain;
              const v0 = low[vAxis];
              const v1 = v0 + grain;
              const bucket = planeBucket(plane);
              for (let probe = bucket - 1; probe <= bucket + 1; probe += 1) {
                for (const still of stillFaces.get(faceBucketKey(axis, facing, probe)) ?? []) {
                  if (Math.abs(still.plane - plane) > PLANE_EPSILON) continue;
                  if (Math.min(u1, still.u1) - Math.max(u0, still.u0) <= PLANE_EPSILON) continue;
                  if (Math.min(v1, still.v1) - Math.max(v0, still.v0) <= PLANE_EPSILON) continue;
                  const key = `${pose.placementId}|${still.placementId}|${String(axis)}|${String(facing)}|${String(planeBucket(still.plane))}`;
                  const fight = fights.get(key) ?? {
                    moving: pose.placementId,
                    still: still.placementId,
                    axis,
                    facing,
                    plane: still.plane,
                    facePairs: 0,
                    firstTimeMs: timeMs,
                    sampledTimes: new Set<number>(),
                  };
                  fight.facePairs += 1;
                  fight.sampledTimes.add(frame);
                  fights.set(key, fight);
                }
              }
            }
          }
        }
      }
    }
  }

  return {
    fights: [...fights.values()].map((fight) => ({
      moving: fight.moving,
      still: fight.still,
      axis: AXIS_NAMES[fight.axis],
      facing: fight.facing,
      plane: fight.plane,
      facePairs: fight.facePairs,
      firstTimeMs: fight.firstTimeMs,
      sampledTimes: fight.sampledTimes.size,
    })),
    unchecked: [...unchecked.entries()].map(([placementId, entry]) => ({
      placementId,
      reason: entry.reason,
      sampledTimes: entry.sampledTimes,
    })),
  };
}
