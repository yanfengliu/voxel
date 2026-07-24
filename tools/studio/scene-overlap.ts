import { modelCenterV1 } from './build.js';
import { setVoxelSize } from './edit.js';
import { modelVoxelSizeV1, type StudioModelV1 } from './model.js';
import { buildRecipe, type PartShelfV1, type RecipeBookV1 } from './recipe.js';
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

/** The world cells a placement fills, keyed 'x,y,z', matching buildSceneSnapshot. */
function placementCells(placement: ScenePlacementV1, model: StudioModelV1, grain: number): Set<string> {
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
  const cells = new Set<string>();
  for (let z = 0; z < sz; z += 1) {
    for (let y = 0; y < sy; y += 1) {
      for (let x = 0; x < sx; x += 1) {
        if ((model.voxels[x + sx * (y + sy * z)] ?? 0) === 0) continue;
        // Voxel centre, centred on the model's middle and scaled by grain.
        const localX = (x + 0.5 - middle.x) * grain;
        const localZ = (z + 0.5 - middle.z) * grain;
        // Rotate about the up axis by quarter-turns (matching the placement matrix).
        const worldX = ax + (turns === 0 ? localX : turns === 1 ? localZ : turns === 2 ? -localX : -localZ);
        const worldZ = az + (turns === 0 ? localZ : turns === 1 ? -localX : turns === 2 ? -localZ : localX);
        const worldY = ay + (y - baseRow + 0.5) * grain;
        cells.add(`${String(Math.floor(worldX))},${String(Math.floor(worldY))},${String(Math.floor(worldZ))}`);
      }
    }
  }
  return cells;
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
  const filled: { id: string; cells: Set<string> }[] = [];
  for (const placement of scene.placements) {
    const recipe = recipes[placement.model];
    if (!recipe) continue;
    const grain = placement.grain ?? modelVoxelSizeV1(recipe);
    const key = `${placement.model}@${String(grain)}`;
    let entry = byModel.get(key);
    if (!entry) {
      let model = buildRecipe(recipe, parts, recipes).model;
      if (modelVoxelSizeV1(model) !== grain) model = setVoxelSize(model, grain);
      entry = { model, grain };
      byModel.set(key, entry);
    }
    filled.push({ id: placement.id, cells: placementCells(placement, entry.model, entry.grain) });
  }
  const overlaps: SceneOverlapV1[] = [];
  for (let i = 0; i < filled.length; i += 1) {
    for (let j = i + 1; j < filled.length; j += 1) {
      const a = filled[i]!;
      const b = filled[j]!;
      const [small, big] = a.cells.size <= b.cells.size ? [a.cells, b.cells] : [b.cells, a.cells];
      let shared = 0;
      for (const cell of small) if (big.has(cell)) shared += 1;
      if (shared > 0) overlaps.push({ a: a.id, b: b.id, cells: shared });
    }
  }
  return overlaps;
}
