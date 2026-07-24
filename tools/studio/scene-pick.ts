import { modelCenterV1 } from './build.js';
import { setVoxelSize } from './edit.js';
import { modelVoxelSizeV1, type StudioModelV1 } from './model.js';
import { buildRecipe, mixSeed, type PartShelfV1, type RecipeBookV1 } from './recipe.js';
import { validateSceneV1, type SceneV1 } from './scene.js';

/**
 * A scene placement reduced to the world box it fills, so a click can pick the
 * model under the cursor and a selection can be drawn around it. The box is
 * derived exactly as buildSceneSnapshot places the model — centred on its
 * middle, lifted so the base sits at `at.y`, turned by quarter-turns, scaled by
 * grain, and seeded per placement — so it lines up with what is drawn.
 */
export interface PlacementBoxV1 {
  readonly id: string;
  readonly min: readonly [number, number, number];
  readonly max: readonly [number, number, number];
}

/** The bounds of a model's filled cells, or null when it is empty. */
function filledBounds(
  model: StudioModelV1,
): { readonly min: [number, number, number]; readonly max: [number, number, number] } | null {
  const [sx, sy, sz] = model.size;
  let minX = Infinity; let minY = Infinity; let minZ = Infinity;
  let maxX = -Infinity; let maxY = -Infinity; let maxZ = -Infinity;
  for (let z = 0; z < sz; z += 1) {
    for (let y = 0; y < sy; y += 1) {
      for (let x = 0; x < sx; x += 1) {
        if ((model.voxels[x + sx * (y + sy * z)] ?? 0) === 0) continue;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (z < minZ) minZ = z;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
        if (z > maxZ) maxZ = z;
      }
    }
  }
  if (minX === Infinity) return null;
  return { min: [minX, minY, minZ], max: [maxX, maxY, maxZ] };
}

/** Every placement's world box, in scene order. Unknown or empty models are skipped. */
export function placementWorldBoxesV1(
  scene: SceneV1,
  recipes: RecipeBookV1,
  parts: PartShelfV1,
): readonly PlacementBoxV1[] {
  if (validateSceneV1(scene).length > 0) return [];
  const byModel = new Map<string, StudioModelV1>();
  const boxes: PlacementBoxV1[] = [];
  for (const placement of scene.placements) {
    const recipe = recipes[placement.model];
    if (!recipe) continue;
    const grain = placement.grain ?? modelVoxelSizeV1(recipe);
    const seed = placement.seed ?? 0;
    const key = `${placement.model}@${String(grain)}@${String(seed)}`;
    let model = byModel.get(key);
    if (!model) {
      const seeded = seed === 0 ? recipe : { ...recipe, seed: mixSeed(recipe.seed, seed) };
      model = buildRecipe(seeded, parts, recipes).model;
      if (modelVoxelSizeV1(model) !== grain) model = setVoxelSize(model, grain);
      byModel.set(key, model);
    }
    const bounds = filledBounds(model);
    if (!bounds) continue;
    const middle = modelCenterV1(model);
    // Local box: centred on the model's middle, scaled by grain. A filled cell
    // spans one unit, so the high corner runs one past the last filled cell.
    const lxMin = (bounds.min[0] - middle.x) * grain;
    const lxMax = (bounds.max[0] + 1 - middle.x) * grain;
    const lzMin = (bounds.min[2] - middle.z) * grain;
    const lzMax = (bounds.max[2] + 1 - middle.z) * grain;
    const height = (bounds.max[1] + 1 - bounds.min[1]) * grain;
    const [ax, ay, az] = placement.at;
    const turns = (((placement.turns ?? 0) % 4) + 4) % 4;
    // Quarter-turn the local box about the up axis, then take its new extent.
    let xMin: number; let xMax: number; let zMin: number; let zMax: number;
    if (turns === 0) { xMin = lxMin; xMax = lxMax; zMin = lzMin; zMax = lzMax; }
    else if (turns === 1) { xMin = lzMin; xMax = lzMax; zMin = -lxMax; zMax = -lxMin; }
    else if (turns === 2) { xMin = -lxMax; xMax = -lxMin; zMin = -lzMax; zMax = -lzMin; }
    else { xMin = -lzMax; xMax = -lzMin; zMin = lxMin; zMax = lxMax; }
    boxes.push({
      id: placement.id,
      min: [ax + xMin, ay, az + zMin],
      max: [ax + xMax, ay + height, az + zMax],
    });
  }
  return boxes;
}

/** A ray in world space; the direction need not be unit length. */
export interface RayV1 {
  readonly origin: readonly [number, number, number];
  readonly direction: readonly [number, number, number];
}

/** How near a coordinate must be to count as on a plane the ray runs parallel to. */
const RAY_EPSILON = 1e-9;

/** The entry distance where a ray meets an axis box, or null when it misses. */
function rayBoxEntry(ray: RayV1, box: PlacementBoxV1): number | null {
  let near = -Infinity;
  let far = Infinity;
  for (let axis = 0; axis < 3; axis += 1) {
    const origin = ray.origin[axis]!;
    const direction = ray.direction[axis]!;
    const lo = box.min[axis]!;
    const hi = box.max[axis]!;
    if (Math.abs(direction) < RAY_EPSILON) {
      // Parallel to this pair of faces: a miss unless it starts between them.
      if (origin < lo || origin > hi) return null;
      continue;
    }
    let t1 = (lo - origin) / direction;
    let t2 = (hi - origin) / direction;
    if (t1 > t2) { const swap = t1; t1 = t2; t2 = swap; }
    if (t1 > near) near = t1;
    if (t2 < far) far = t2;
    if (near > far) return null;
  }
  // A box wholly behind the ray's start is not met.
  if (far < 0) return null;
  return near;
}

/**
 * The id of the smallest-volume box the ray enters, or null when it meets none.
 * Smallest wins, not nearest, so a chair inside a house is picked over the house
 * shell whose box encloses it; the shell is still picked where only it is met.
 */
export function pickPlacementV1(ray: RayV1, boxes: readonly PlacementBoxV1[]): string | null {
  let best: string | null = null;
  let bestVolume = Infinity;
  for (const box of boxes) {
    if (rayBoxEntry(ray, box) === null) continue;
    const volume = (box.max[0] - box.min[0]) * (box.max[1] - box.min[1]) * (box.max[2] - box.min[2]);
    if (volume < bestVolume) { bestVolume = volume; best = box.id; }
  }
  return best;
}

/**
 * Where the ray meets the horizontal plane at height `y`, or null when it runs
 * parallel to the ground or would only meet it behind the start — the plane a
 * scene model slides across while dragged.
 */
export function groundHitV1(ray: RayV1, y: number): { readonly x: number; readonly z: number } | null {
  const dy = ray.direction[1];
  if (Math.abs(dy) < RAY_EPSILON) return null;
  const t = (y - ray.origin[1]) / dy;
  if (t < 0) return null;
  return { x: ray.origin[0] + t * ray.direction[0], z: ray.origin[2] + t * ray.direction[2] };
}

/** The twelve edges of a world box, for drawing a selection outline. */
export function boxEdgesV1(
  box: PlacementBoxV1,
): readonly { readonly a: readonly [number, number, number]; readonly b: readonly [number, number, number] }[] {
  const { min, max } = box;
  const c: [number, number, number][] = [
    [min[0], min[1], min[2]], [max[0], min[1], min[2]], [max[0], min[1], max[2]], [min[0], min[1], max[2]],
    [min[0], max[1], min[2]], [max[0], max[1], min[2]], [max[0], max[1], max[2]], [min[0], max[1], max[2]],
  ];
  const pairs: [number, number][] = [
    [0, 1], [1, 2], [2, 3], [3, 0], // bottom
    [4, 5], [5, 6], [6, 7], [7, 4], // top
    [0, 4], [1, 5], [2, 6], [3, 7], // uprights
  ];
  return pairs.map(([i, j]) => ({ a: c[i]!, b: c[j]! }));
}
