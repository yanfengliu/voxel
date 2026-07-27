import { setVoxelSize } from './edit.js';
import { renderHashV1 } from './model-diversity-shape.js';
import { modelVoxelSizeV1 } from './model.js';
import {
  buildRecipe,
  mixSeed,
  type PartShelfV1,
  type RecipeBookV1,
} from './recipe.js';
import type { SceneV1 } from './scene.js';

/**
 * Resolves the same seeded/grained recipe groups as SceneSession and returns
 * hashes of their actual render content. Persisted annotations therefore go
 * stale when a recipe or part changes its presented voxels, palette, scale, or
 * motion even if SceneV1 still names the same model ids.
 */
export function sceneResolvedContentHashesV1(
  scene: SceneV1,
  recipes: RecipeBookV1,
  parts: PartShelfV1,
): readonly string[] {
  const hashes = new Map<string, string>();
  for (const placement of scene.placements) {
    const recipe = recipes[placement.model];
    if (recipe === undefined) {
      throw new Error(
        `Scene '${scene.id}' cannot fingerprint placement '${placement.id}' because recipe `
        + `'${placement.model}' is missing from this Studio catalog.`,
      );
    }
    const grain = placement.grain ?? modelVoxelSizeV1(recipe);
    const seed = placement.seed ?? 0;
    const key = `${placement.model}@${String(grain)}@${String(seed)}`;
    if (hashes.has(key)) continue;
    const seeded = seed === 0
      ? recipe
      : { ...recipe, seed: mixSeed(recipe.seed, seed) };
    let model = buildRecipe(seeded, parts, recipes).model;
    if (modelVoxelSizeV1(model) !== grain) model = setVoxelSize(model, grain);
    hashes.set(key, renderHashV1(model));
  }
  return [...hashes].map(([key, hash]) => `${key}:${hash}`);
}
