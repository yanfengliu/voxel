import {
  partBuildV1,
  partInfoV1,
  type PartFragmentV1,
  type PartShelfEntryV1,
} from './part-definition.js';
import type { GenomeColorV1, StudioModelV1 } from './model.js';
import {
  buildRecipe,
  mixSeed,
  VOXEL_RECIPE_SCHEMA_V1,
  type RecipeV1,
} from './recipe.js';

const PART_PREVIEW_SEED = 0;

const EMPTY_COLOR: GenomeColorV1 = { r: 0, g: 0, b: 0 };
const NEUTRAL_SWATCHES: readonly GenomeColorV1[] = [
  { r: 196, g: 202, b: 211 },
  { r: 119, g: 135, b: 155 },
  { r: 215, g: 177, b: 112 },
  { r: 130, g: 163, b: 137 },
  { r: 178, g: 145, b: 185 },
  { r: 196, g: 132, b: 118 },
  { r: 112, g: 158, b: 179 },
  { r: 211, g: 207, b: 190 },
];

function previewPalette(roleCount: number): readonly GenomeColorV1[] {
  return Array.from({ length: roleCount }, (_, index) =>
    index === 0 ? EMPTY_COLOR : NEUTRAL_SWATCHES[(index - 1) % NEUTRAL_SWATCHES.length]!);
}

function failureReason(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** URI escaping rejects lone UTF-16 surrogates, so retain them as fixed code-unit hex instead. */
function previewIdName(name: string): string {
  try {
    return encodeURIComponent(name);
  } catch {
    return `%u${Array.from(
      { length: name.length },
      (_, index) => name.charCodeAt(index).toString(16).padStart(4, '0'),
    ).join('')}`;
  }
}

/**
 * Builds one library part by itself, using its published defaults (or empty
 * settings for a bare part) and a fixed seed. The colours are deliberately
 * preview-only: parts publish semantic roles, while a consumer recipe remains
 * the authority on their art direction.
 */
export function buildPartPreviewModelV1(
  name: string,
  entry: PartShelfEntryV1,
  reservedModelIds: readonly string[] = [],
): StudioModelV1 {
  const settings = {};
  const input = typeof entry === 'function'
    ? 'empty settings (this bare part declares no defaults)'
    : 'its declared default settings';
  let fragment: unknown;
  try {
    fragment = partBuildV1(entry)(settings, mixSeed(PART_PREVIEW_SEED, 0));
  } catch (error) {
    throw new Error(
      `Part '${name}' cannot be rendered with ${input}: its build failed with ${failureReason(error)}. `
      + 'Fix the part\'s defaults or build function.',
      { cause: error },
    );
  }
  if (typeof fragment !== 'object' || fragment === null) {
    throw new Error(
      `Part '${name}' cannot be rendered with ${input}: its build returned ${
        fragment === null ? 'null' : typeof fragment
      }, not a fragment object with size, roles, and voxels. Fix the part's build function.`,
    );
  }
  const previewFragment = fragment as PartFragmentV1;
  const reserved = new Set(reservedModelIds);
  const idBase = `studio:part-preview:${previewIdName(name)}`;
  let id = idBase;
  for (let suffix = 2; reserved.has(id); suffix += 1) id = `${idBase}:${String(suffix)}`;

  const roleCount = Array.isArray(previewFragment.roles) ? previewFragment.roles.length : 0;
  const recipe: RecipeV1 = {
    schemaVersion: VOXEL_RECIPE_SCHEMA_V1,
    id,
    label: `Part: ${partInfoV1(name, entry).title}`,
    seed: PART_PREVIEW_SEED,
    size: previewFragment.size,
    roles: previewFragment.roles,
    palette: previewPalette(roleCount),
    steps: [{ kind: 'part', part: name, at: [0, 0, 0], settings }],
    motion: {
      periodMs: 0,
      phaseRadians: 0,
      translation: [0, 0, 0],
      rotationRadians: [0, 0, 0],
      scale: [0, 0, 0],
    },
  };

  try {
    return buildRecipe(recipe, { [name]: entry }).model;
  } catch (error) {
    throw new Error(
      `Part '${name}' cannot be rendered with ${input}: ${failureReason(error)} `
      + 'Fix the part\'s returned fragment or declared defaults.',
      { cause: error },
    );
  }
}
