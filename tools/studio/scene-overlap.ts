import { modelCenterV1 } from './build.js';
import { setVoxelSize } from './edit.js';
import { modelVoxelSizeV1, type StudioModelV1 } from './model.js';
import { buildRecipe, mixSeed, type PartShelfV1, type RecipeBookV1 } from './recipe.js';
import { validateSceneV1, type ScenePlacementV1, type SceneV1 } from './scene.js';

/**
 * A scene has no occupancy check the way a recipe does: a recipe merges parts
 * into one grid and rejects any cross-occurrence overlap, but a scene composes
 * independent finished models in world space and simply instances them, so two
 * placements can end up filling the same voxels — and where their solid
 * surfaces coincide, the picture z-fights.
 *
 * This finds those overlaps. It rasterizes each placement's filled voxels into
 * the world cells they occupy, exactly as the scene builder places them —
 * centred on the model's middle, lifted so the base sits at `at.y`, turned by
 * quarter-turns — and reports every pair of placements that share cells. It is
 * a check the scene editor can warn with and the built-in scenes are pinned
 * against, not a hard build error: two models are allowed to touch, only not
 * to occupy the same space.
 */

export interface SceneOverlapV1 {
  /** The two placement ids that share world cells, in scene order. */
  readonly a: string;
  readonly b: string;
  /** How many world cells the two share — a measure of how deep the overlap is. */
  readonly cells: number;
}

export interface PlacedVoxelBoxV1 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly size: number;
  /** The voxel's model-grid index, so a caller can look up grid neighbours. */
  readonly index: { readonly x: number; readonly y: number; readonly z: number };
}

type VoxelBox = PlacedVoxelBoxV1;

interface VoxelBounds {
  readonly minX: number;
  readonly maxX: number;
  readonly minY: number;
  readonly maxY: number;
  readonly minZ: number;
  readonly maxZ: number;
}

interface FilledPlacement {
  readonly id: string;
  readonly order: number;
  readonly voxels: readonly VoxelBox[];
  readonly bounds: VoxelBounds;
}

/**
 * A placement's filled voxels as world cubes, matching how buildSceneSnapshot
 * places it. Exported so companion checks (scene-surface-fights) judge the
 * same placed geometry this check does, instead of re-deriving it.
 */
export function placementVoxelsV1(
  placement: ScenePlacementV1,
  model: StudioModelV1,
  grain: number,
): PlacedVoxelBoxV1[] {
  const [sx, sy, sz] = model.size;
  const middle = modelCenterV1(model);
  // The lowest filled row, so the base can be lifted to sit on the floor.
  let baseRow = Infinity;
  for (let index = 0; index < model.voxels.length; index += 1) {
    if ((model.voxels[index] ?? 0) === 0) continue;
    const y = Math.floor(index / sx) % sy;
    if (y < baseRow) baseRow = y;
  }
  const turns = (((placement.turns ?? 0) % 4) + 4) % 4;
  const [ax, ay, az] = placement.at;
  const voxels: VoxelBox[] = [];
  for (let z = 0; z < sz; z += 1) {
    for (let y = 0; y < sy; y += 1) {
      for (let x = 0; x < sx; x += 1) {
        if ((model.voxels[x + sx * (y + sy * z)] ?? 0) === 0) continue;
        // Low corner of the voxel, centred on the model's middle and scaled by grain.
        const localX = (x - middle.x) * grain;
        const localZ = (z - middle.z) * grain;
        // Rotate about the up axis by quarter-turns (matching the placement matrix).
        // A rotated cube's low corner is its min corner, so quarter-turns pick the
        // corner that stays lowest after the turn.
        const cornerX = turns === 0 ? localX : turns === 1 ? localZ : turns === 2 ? -localX - grain : -localZ - grain;
        const cornerZ = turns === 0 ? localZ : turns === 1 ? -localX - grain : turns === 2 ? -localZ - grain : localX;
        voxels.push({
          x: ax + cornerX,
          y: ay + (y - baseRow) * grain,
          z: az + cornerZ,
          size: grain,
          index: { x, y, z },
        });
      }
    }
  }
  return voxels;
}

/** Whether two axis-aligned voxel cubes overlap with positive volume (touching is not overlap). */
function cubesOverlap(a: VoxelBox, b: VoxelBox): boolean {
  return a.x < b.x + b.size && b.x < a.x + a.size
    && a.y < b.y + b.size && b.y < a.y + a.size
    && a.z < b.z + b.size && b.z < a.z + a.size;
}

function voxelBounds(voxels: readonly VoxelBox[]): VoxelBounds | null {
  if (voxels.length === 0) return null;
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;
  for (const voxel of voxels) {
    minX = Math.min(minX, voxel.x);
    minY = Math.min(minY, voxel.y);
    minZ = Math.min(minZ, voxel.z);
    maxX = Math.max(maxX, voxel.x + voxel.size);
    maxY = Math.max(maxY, voxel.y + voxel.size);
    maxZ = Math.max(maxZ, voxel.z + voxel.size);
  }
  return { minX, maxX, minY, maxY, minZ, maxZ };
}

function boundsOverlap(a: VoxelBounds, b: VoxelBounds): boolean {
  return a.minX < b.maxX && b.minX < a.maxX
    && a.minY < b.maxY && b.minY < a.maxY
    && a.minZ < b.maxZ && b.minZ < a.maxZ;
}

/** How many of A's voxels overlap any of B's, via a unit-cell hash of B's low corners. */
function sharedVoxels(a: readonly VoxelBox[], b: readonly VoxelBox[]): number {
  const byCell = new Map<string, VoxelBox[]>();
  for (const box of b) {
    const key = `${String(Math.floor(box.x))},${String(Math.floor(box.y))},${String(Math.floor(box.z))}`;
    const bucket = byCell.get(key);
    if (bucket) bucket.push(box);
    else byCell.set(key, [box]);
  }
  let shared = 0;
  for (const box of a) {
    // A cube spanning [x, x+size] can only meet B cubes whose low corner falls in
    // the neighbouring unit cells, so only those are tested.
    const spanLo = -Math.ceil(box.size);
    let hit = false;
    for (let dx = spanLo; dx <= 0 && !hit; dx += 1) {
      for (let dy = spanLo; dy <= 0 && !hit; dy += 1) {
        for (let dz = spanLo; dz <= 0 && !hit; dz += 1) {
          const key = `${String(Math.floor(box.x) + dx)},${String(Math.floor(box.y) + dy)},${String(Math.floor(box.z) + dz)}`;
          for (const other of byCell.get(key) ?? []) {
            if (cubesOverlap(box, other)) { hit = true; break; }
          }
        }
      }
    }
    if (hit) shared += 1;
  }
  return shared;
}

/**
 * Every pair of placements that occupy the same world cells. Empty when the
 * scene is clean. Unknown models are skipped (buildSceneSnapshot reports those).
 */
export function sceneOverlapsV1(
  scene: SceneV1,
  recipes: RecipeBookV1,
  parts: PartShelfV1,
): readonly SceneOverlapV1[] {
  if (validateSceneV1(scene).length > 0) return [];
  const byModel = new Map<string, { model: StudioModelV1; grain: number }>();
  const filled: FilledPlacement[] = [];
  for (const [order, placement] of scene.placements.entries()) {
    const recipe = recipes[placement.model];
    if (!recipe) continue;
    const grain = placement.grain ?? modelVoxelSizeV1(recipe);
    const seed = placement.seed ?? 0;
    // Keyed by seed too, and built with it folded in, so the check sees the same
    // varied body the scene renders — not the model's default.
    const key = `${placement.model}@${String(grain)}@${String(seed)}`;
    let entry = byModel.get(key);
    if (!entry) {
      const seeded = seed === 0 ? recipe : { ...recipe, seed: mixSeed(recipe.seed, seed) };
      let model = buildRecipe(seeded, parts, recipes).model;
      if (modelVoxelSizeV1(model) !== grain) model = setVoxelSize(model, grain);
      entry = { model, grain };
      byModel.set(key, entry);
    }
    const voxels = placementVoxelsV1(placement, entry.model, entry.grain);
    const bounds = voxelBounds(voxels);
    if (bounds) filled.push({ id: placement.id, order, voxels, bounds });
  }
  // Sweep the x interval so separated placements never pay the voxel hash
  // cost. The former all-pairs loop made a clean 1,000-instance scene perform
  // 499,500 maps even though almost every pair was many cells apart.
  const byMinX = [...filled].sort((a, b) =>
    a.bounds.minX - b.bounds.minX || a.order - b.order);
  const active: FilledPlacement[] = [];
  const overlaps: (SceneOverlapV1 & { readonly aOrder: number; readonly bOrder: number })[] = [];
  for (const current of byMinX) {
    for (let index = active.length - 1; index >= 0; index -= 1) {
      if (active[index]!.bounds.maxX <= current.bounds.minX) active.splice(index, 1);
    }
    for (const candidate of active) {
      if (!boundsOverlap(candidate.bounds, current.bounds)) continue;
      const [a, b] = candidate.order < current.order
        ? [candidate, current]
        : [current, candidate];
      const [small, big] = a.voxels.length <= b.voxels.length
        ? [a.voxels, b.voxels]
        : [b.voxels, a.voxels];
      const shared = sharedVoxels(small, big);
      if (shared > 0) {
        overlaps.push({
          a: a.id,
          b: b.id,
          cells: shared,
          aOrder: a.order,
          bOrder: b.order,
        });
      }
    }
    active.push(current);
  }
  overlaps.sort((a, b) => a.aOrder - b.aOrder || a.bOrder - b.bOrder);
  return overlaps.map(({ a, b, cells }) => ({ a, b, cells }));
}
