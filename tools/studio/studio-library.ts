import type { ShelfModelV1, ShelfRecipeV1, StudioCatalogV1 } from './catalog.js';
import { partInfoV1, type PartInfoV1, type PartShelfEntryV1 } from './part-definition.js';
import type { PartShelfV1, RecipeBookV1, RecipeV1 } from './recipe.js';

/**
 * The library: what a person or an agent can browse before building anything —
 * every part on the shelf and every reusable recipe, each reduced to plain
 * data it can read, search, and act on. Models are already discoverable
 * through the shelf; this is the palette the models are made from.
 *
 * All of this lives in the engine and reads only the game's own catalog, so a
 * game gets discovery for free by declaring its parts and recipes. Nothing here
 * knows what a game's parts mean.
 */

/** A reusable recipe reduced to what discovery needs. */
export interface RecipeInfoV1 {
  readonly id: string;
  readonly label: string;
  readonly summary?: string;
  readonly tags: readonly string[];
  readonly size: readonly [number, number, number];
  /** World units per voxel; one by default. */
  readonly voxelSize: number;
  /** Part names this recipe places directly. */
  readonly parts: readonly string[];
  /** Sub-recipe ids this recipe places directly. */
  readonly recipes: readonly string[];
}

/** Every part on a shelf as discovery info, by name. */
export function partInfoListV1(shelf: PartShelfV1): readonly PartInfoV1[] {
  return Object.entries(shelf)
    .map(([name, entry]) => partInfoV1(name, entry))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** One recipe reduced to discovery info: its metadata and what it directly places. */
export function recipeInfoV1(recipe: RecipeV1): RecipeInfoV1 {
  const parts = new Set<string>();
  const recipes = new Set<string>();
  for (const step of recipe.steps) {
    if (step.kind === 'part') parts.add(step.part);
    else if (step.kind === 'recipe') recipes.add(step.recipe);
  }
  return {
    id: recipe.id,
    label: recipe.label,
    ...(recipe.summary === undefined ? {} : { summary: recipe.summary }),
    tags: recipe.tags ?? [],
    size: [recipe.size[0], recipe.size[1], recipe.size[2]],
    voxelSize: recipe.voxelSize ?? 1,
    parts: [...parts].sort((a, b) => a.localeCompare(b)),
    recipes: [...recipes].sort((a, b) => a.localeCompare(b)),
  };
}

/** Every recipe in a book as discovery info, by id. */
export function recipeInfoListV1(book: RecipeBookV1): readonly RecipeInfoV1[] {
  return Object.values(book)
    .map(recipeInfoV1)
    .sort((a, b) => a.id.localeCompare(b.id));
}

/** Whether any of the fields contains the query, case-insensitive; empty query matches all. */
function matchesQuery(fields: readonly (string | undefined)[], query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (needle === '') return true;
  return fields.some((field) => (field ?? '').toLowerCase().includes(needle));
}

export function searchPartInfoV1(parts: readonly PartInfoV1[], query: string): readonly PartInfoV1[] {
  return parts.filter((part) =>
    matchesQuery([part.name, part.title, part.summary, part.category, ...part.tags], query));
}

export function searchRecipeInfoV1(recipes: readonly RecipeInfoV1[], query: string): readonly RecipeInfoV1[] {
  return recipes.filter((recipe) =>
    matchesQuery([recipe.id, recipe.label, recipe.summary, ...recipe.tags, ...recipe.parts, ...recipe.recipes], query));
}

/** A model's construction, or null if reading it throws (catalog data can). */
function safeHowItsMade(model: ShelfModelV1): ShelfRecipeV1 | null {
  try {
    return model.howItsMade();
  } catch {
    return null;
  }
}

/**
 * The catalog's declared parts shelf, or a best-effort union of what its
 * models call when the catalog does not declare one. The union finds every
 * used part; only the declared shelf can also surface a part published for
 * reuse before its first caller.
 */
export function catalogPartsV1(catalog: StudioCatalogV1): PartShelfV1 {
  if (catalog.parts) return catalog.parts;
  const shelf: Record<string, PartShelfEntryV1> = {};
  for (const section of catalog.sections) {
    for (const model of section.models) {
      const made = safeHowItsMade(model);
      if (!made) continue;
      for (const [name, entry] of Object.entries(made.parts)) {
        if (!(name in shelf)) shelf[name] = entry;
      }
    }
  }
  return shelf;
}

/** The catalog's declared recipe book, or a best-effort union of what its models place. */
export function catalogRecipesV1(catalog: StudioCatalogV1): RecipeBookV1 {
  if (catalog.recipes) return catalog.recipes;
  const book: Record<string, RecipeV1> = {};
  for (const section of catalog.sections) {
    for (const model of section.models) {
      const made = safeHowItsMade(model);
      if (!made?.book) continue;
      for (const [id, recipe] of Object.entries(made.book)) {
        if (!(id in book)) book[id] = recipe;
      }
    }
  }
  return book;
}
