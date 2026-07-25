import type { ShelfModelV1, ShelfRecipeV1, StudioCatalogV1 } from './catalog.js';
import { validateModelV1, type StudioModelV1 } from './model.js';
import { compilePhysicalModelV1 } from './physical-compile.js';
import { physicalOverlaySegmentsV1, type PhysicalOverlaySegmentV1 } from './physical-overlay.js';
import {
  buildRecipeStages,
  listRecipePartsWithCellsV1,
  type RecipePartV1,
  type RecipeStageV1,
} from './recipe.js';

/** Which catalog/library action produced the live model, independent of its model id. */
export type StudioLibrarySourceV1 =
  | { readonly kind: 'part'; readonly name: string; readonly preset: string | null }
  | { readonly kind: 'recipe'; readonly id: string }
  | { readonly kind: 'shelf'; readonly id: string }
  | null;

/** Fallible recipe-derived data prepared before a model replaces the stage. */
export interface PreparedRecipeSourceV1 {
  readonly key: string;
  readonly source: ShelfRecipeV1;
  readonly stages: readonly RecipeStageV1[];
  readonly parts: readonly RecipePartV1[];
  readonly cells: readonly (readonly number[])[];
  readonly shapes: readonly PhysicalOverlaySegmentV1[];
}

/** A uniquely resolved shelf entry whose model and construction share its id. */
export interface PreparedShelfOpenV1 {
  readonly id: string;
  readonly model: StudioModelV1;
  readonly prepared: PreparedRecipeSourceV1;
}

/** Resolves one shelf id without silently choosing between duplicate entries. */
export function requireUniqueShelfEntryV1(
  catalog: StudioCatalogV1,
  id: string,
): ShelfModelV1 {
  const matches = catalog.sections.flatMap(
    (section) => section.models.filter((entry) => entry.id === id),
  );
  if (matches.length === 0) {
    throw new Error(
      `No model on the shelf has the id '${id}', so it cannot be opened. `
      + 'Choose an id returned by shelf().',
    );
  }
  if (matches.length > 1) {
    throw new Error(
      `Model id '${id}' appears ${String(matches.length)} times on this Studio's shelf, `
      + 'so it cannot be opened; give every shelf model a unique id.',
    );
  }
  return matches[0]!;
}

/** Reads and identity-checks the construction declared by one shelf entry. */
export function readShelfRecipeV1(entry: ShelfModelV1): ShelfRecipeV1 {
  let source: ShelfRecipeV1;
  try {
    source = entry.howItsMade();
  } catch (error) {
    throw new Error(
      `Shelf model '${entry.id}' cannot be opened because reading how it is made failed: ${
        error instanceof Error ? error.message : String(error)
      }. Fix its howItsMade() catalog entry.`,
      { cause: error },
    );
  }
  if (source.recipe.id !== entry.id) {
    throw new Error(
      `Shelf model '${entry.id}' says its root recipe id is '${source.recipe.id}', so it cannot be opened; `
      + 'ShelfModelV1.id, load().id, and howItsMade().recipe.id must share one stable identity.',
    );
  }
  return source;
}

/** Builds every recipe-derived readout that the model refresh consumes. */
export function prepareRecipeSourceV1(
  key: string,
  source: ShelfRecipeV1,
  includePhysicalShapes: boolean,
): PreparedRecipeSourceV1 {
  const book = source.book ?? {};
  const stages = buildRecipeStages(source.recipe, source.parts, book);
  const inventory = listRecipePartsWithCellsV1(source.recipe, source.parts, book);
  const shapes = includePhysicalShapes && source.physical
    ? physicalOverlaySegmentsV1(compilePhysicalModelV1(
      source.recipe, source.parts, book, source.physical,
    ))
    : [];
  return {
    key,
    source,
    stages,
    parts: inventory.parts,
    cells: inventory.cells,
    shapes,
  };
}

/**
 * Loads and fully prepares one shelf entry without changing live harness or
 * renderer state. Every catalog, identity, validation, and recipe failure is
 * therefore reported before replacement begins.
 */
export function prepareShelfOpenV1(
  catalog: StudioCatalogV1,
  id: string,
): PreparedShelfOpenV1 {
  const entry = requireUniqueShelfEntryV1(catalog, id);
  let model: StudioModelV1;
  try {
    model = entry.load();
  } catch (error) {
    throw new Error(
      `Shelf model '${id}' cannot be opened because its load() failed: ${
        error instanceof Error ? error.message : String(error)
      }. Fix the catalog model loader.`,
      { cause: error },
    );
  }
  const issues = validateModelV1(model);
  if (issues.length > 0) {
    throw new Error(
      `Shelf model '${id}' loaded an invalid model: ${
        issues.map((issue) => `${issue.path} ${issue.message}`).join('; ')
      } Fix its load() result before opening it.`,
    );
  }
  if (model.id !== entry.id) {
    throw new Error(
      `Shelf model '${entry.id}' loaded model id '${model.id}', so it cannot be opened; `
      + 'ShelfModelV1.id and load().id must match to preserve recipe and scene references.',
    );
  }
  const source = readShelfRecipeV1(entry);
  return {
    id: entry.id,
    model,
    prepared: prepareRecipeSourceV1(`shelf:${entry.id}`, source, true),
  };
}
