import {
  validateModelV1,
  VOXEL_GENOME_SCHEMA_V1,
  type GenomeColorV1,
  type GenomeIssueV1,
  type ModelMotionV1,
  type StudioModelV1,
} from './model.js';
import { partBuildV1, type PartDefinitionV1 } from './part-definition.js';
import {
  describeRecipeStepV1,
  listRecipeComponentsV1,
  listRecipePartsInternalV1,
  listRecipePartsWithCellsInternalV1,
  type RecipeComponentV1,
  type RecipePartsWithCellsV1,
  type RecipePartV1,
} from './recipe-inspection.js';

export { describeRecipeStepV1, listRecipeComponentsV1 };
export type { RecipeComponentV1, RecipePartsWithCellsV1, RecipePartV1 };

/**
 * A recipe is how a model was made: an ordered list of steps — hand-placed
 * voxels, parts run with settings and a seed, mirrors. Running a recipe
 * rebuilds the exact grid, every time. That is the whole point: once the
 * recipe is the source and the grid is derived, improving a part improves
 * every model whose recipe uses it, instead of dying inside the one model it
 * was made in.
 *
 * The baked model stays saved beside its recipe as the record of what was
 * accepted, so building a recipe never changes any art by itself — comparing
 * the fresh build against the baked grid is how a part improvement is judged.
 *
 * Same ground rules as the model: plain data, no functions, no typed arrays.
 * A recipe must survive JSON, `structuredClone`, and an IndexedDB round trip.
 */
export const VOXEL_RECIPE_SCHEMA_V1 = 'studio.voxel-recipe/1' as const;

/** Settings are flat and printable, so a recipe file reads like a sentence. */
export type PartSettingValueV1 = number | string | boolean;
export type PartSettingsV1 = Readonly<Record<string, PartSettingValueV1>>;

/**
 * What a part hands back: its own little grid, painted with role *names* so
 * the part stays game-neutral — the recipe's palette decides what 'mortar'
 * looks like. Index 0 is the empty slot here too; 0 cells leave the model
 * untouched, which is what lets parts be sparse.
 */
export interface PartFragmentV1 {
  readonly size: readonly [number, number, number];
  readonly roles: readonly string[];
  readonly voxels: readonly number[];
}

/**
 * A part is a pure function: settings and a seed in, a fragment out, the same
 * fragment for the same input, always. Parts that have no random choice to
 * make simply ignore the seed; the builder hands one down regardless, so a
 * part that gains variation later never changes its call shape.
 */
export type PartV1 = (settings: PartSettingsV1, seed: number) => PartFragmentV1;

/**
 * The parts a builder may call, by the name a recipe step uses. An entry is
 * either a bare `PartV1` function or a self-describing `PartDefinitionV1`; the
 * builder runs both the same way through `partBuildV1`, so a game can publish
 * described parts for discovery without changing how a recipe places them.
 */
export type PartShelfV1 = Readonly<Record<string, PartV1 | PartDefinitionV1>>;

/** Hand-sculpted voxels, layered wherever parts do not reach. Load-bearing:
 * without this step, the first corner no part can express forces a model back
 * to a plain grid and out of the recipe system entirely. Values are the
 * recipe's own role slots; 0 leaves whatever is already there. */
export interface VoxelsStepV1 {
  readonly kind: 'voxels';
  /** Plain words for what this step is for; shown while the model builds. */
  readonly note?: string;
  readonly at: readonly [number, number, number];
  readonly size: readonly [number, number, number];
  readonly voxels: readonly number[];
}

export interface PartStepV1 {
  readonly kind: 'part';
  /** Plain words for what this step is for; shown while the model builds. */
  readonly note?: string;
  readonly part: string;
  readonly at: readonly [number, number, number];
  readonly settings: PartSettingsV1;
  /** Distinguishes repeated steps of one part; omitted means 0, so identical
   * steps are identical on purpose and variation is asked for by name. */
  readonly seedSalt?: number;
}

/** Makes what is placed so far symmetric across the grid's middle plane.
 * Filled cells in the same object win over their mirrored twin. A reflected
 * object that would be clipped by another occurrence fails the build. */
export interface MirrorStepV1 {
  readonly kind: 'mirror';
  /** Plain words for what this step is for; shown while the model builds. */
  readonly note?: string;
  readonly axis: 'x' | 'z';
}

/**
 * Places another recipe inside this one. Two houses with the same roof share
 * the roof recipe; improving it improves both, and neither owns it.
 *
 * A sub-recipe is placed as it is, with no settings. That is the line between
 * the two kinds of reuse and it is worth keeping sharp: a *part* is a
 * function, so it varies by its settings; a *recipe* is a value, so it is the
 * same thing everywhere it appears. Wanting a roof in three sizes means a
 * roof part; wanting one roof on three houses means a roof recipe.
 *
 * It paints in roles, exactly as a part does, so the recipe placing it
 * decides the colours. The same roof lands red on a brick cottage and grey on
 * a sandstone one without either owning a copy.
 */
export interface SubRecipeStepV1 {
  readonly kind: 'recipe';
  /** Plain words for what this step is for; shown while the model builds. */
  readonly note?: string;
  /** Which recipe, by its id, from the book the build was given. */
  readonly recipe: string;
  readonly at: readonly [number, number, number];
  /**
   * Varies a seeded sub-recipe between its uses. Omitted means the sub-recipe
   * builds exactly as it does on its own, which is what sharing usually
   * means: the same roof, not a roof of the same kind.
   */
  readonly seedSalt?: number;
}

export type RecipeStepV1 = VoxelsStepV1 | PartStepV1 | MirrorStepV1 | SubRecipeStepV1;

/**
 * The recipes a build may place inside other recipes, by id.
 *
 * A game's book is its own; the engine never holds one. Sharing happens by a
 * game putting a recipe in its book and more than one of its recipes naming
 * it — at any level, since a shared recipe may itself be composed.
 */
export type RecipeBookV1 = Readonly<Record<string, RecipeV1>>;

export interface RecipeV1 {
  readonly schemaVersion: typeof VOXEL_RECIPE_SCHEMA_V1;
  readonly id: string;
  readonly label: string;
  /** Every random choice in the build flows from this, salted per step. */
  readonly seed: number;
  readonly size: readonly [number, number, number];
  /**
   * World units per voxel for the whole recipe; omitted means one. Scaling
   * this scales the built model without changing a single step — a flower
   * recipe at a tenth of a unit and a wall recipe at a whole one are the same
   * kind of thing at different grains.
   */
  readonly voxelSize?: number;
  /** One line on what this recipe makes, for browsing. Optional. */
  readonly summary?: string;
  /** Free tags for search, e.g. ['furniture', 'seating']. Optional. */
  readonly tags?: readonly string[];
  /** One name per palette slot; `roles[0]` is always 'empty'. Parts paint
   * names, the palette gives the names colours: shared bones, per-game skin. */
  readonly roles: readonly string[];
  readonly palette: readonly GenomeColorV1[];
  readonly steps: readonly RecipeStepV1[];
  /** Whole-model harmonic motion, carried so a recipe rebuilds the entire
   * model. Per-part motion roles are a later schema, not a reserved field. */
  readonly motion: ModelMotionV1;
}

/** The step-kind menu is deliberately capped: power lives in parts and
 * arrangement, not in a rich step language. Adding a kind is an owner
 * decision, recorded in the design doc, never a convenience. */
const STEP_KINDS = ['voxels', 'part', 'mirror', 'recipe'] as const;
/** How deep composition may nest before it is treated as a mistake. */
const MAX_RECIPE_DEPTH = 8;
const MAX_STEPS = 256;
const MAX_PART_DIMENSION = 64;
/** A step label is a line, not a paragraph; it has to read in a list. */
const MAX_NOTE = 120;

/**
 * Folds a per-step salt into the recipe seed. The formula is part of the
 * schema: changing it re-rolls every seeded model ever saved, so it may only
 * change together with `schemaVersion`.
 */
export function mixSeed(seed: number, salt: number): number {
  let mixed = (Math.imul(seed | 0, 0x9e3779b1) + (salt | 0)) | 0;
  mixed = Math.imul(mixed ^ (mixed >>> 16), 0x85ebca6b);
  mixed = Math.imul(mixed ^ (mixed >>> 13), 0xc2b2ae35);
  return (mixed ^ (mixed >>> 16)) >>> 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function checkPlacement(
  value: unknown,
  path: string,
  issues: GenomeIssueV1[],
): value is readonly [number, number, number] {
  if (!Array.isArray(value) || value.length !== 3
    || !value.every((entry: unknown) => typeof entry === 'number' && Number.isInteger(entry) && entry >= 0)) {
    issues.push({ path, message: 'Expected three integers, each at least 0.' });
    return false;
  }
  return true;
}

/**
 * Rejects a recipe that could not build. Same stance as the model validator:
 * a recipe reaching the builder from this studio's own tools should always be
 * valid, so anything found here arrived from outside — and it gets the whole
 * list of what is wrong, not just the first thing.
 */
export function validateRecipeV1(value: unknown): readonly GenomeIssueV1[] {
  if (typeof value !== 'object' || value === null) {
    return [{ path: '$', message: 'Expected an object.' }];
  }
  const recipe = value as Record<string, unknown>;
  if (recipe.schemaVersion !== VOXEL_RECIPE_SCHEMA_V1) {
    return [{
      path: '$.schemaVersion',
      message: `Expected ${VOXEL_RECIPE_SCHEMA_V1}; unknown versions need migration, never a silent misbuild.`,
    }];
  }

  // id, label, seed, size, palette, and motion obey exactly the model's own
  // rules, so the model validator is the one authority on them: a synthetic
  // still model carries the shared fields through it. Its `$.voxels` findings
  // are artifacts of the synthetic empty grid — a recipe has no voxels — and
  // are dropped.
  const issues: GenomeIssueV1[] = validateModelV1({
    schemaVersion: VOXEL_GENOME_SCHEMA_V1,
    id: recipe.id,
    label: recipe.label,
    seed: recipe.seed,
    size: recipe.size,
    voxelSize: recipe.voxelSize,
    palette: recipe.palette,
    voxels: [],
    motion: recipe.motion,
  }).filter((issue) => !issue.path.startsWith('$.voxels'));

  if (recipe.summary !== undefined && typeof recipe.summary !== 'string') {
    issues.push({ path: '$.summary', message: 'Expected a string, or omit it.' });
  }
  if (recipe.tags !== undefined
    && (!Array.isArray(recipe.tags) || !recipe.tags.every((tag) => typeof tag === 'string'))) {
    issues.push({ path: '$.tags', message: 'Expected an array of strings, or omit it.' });
  }

  const paletteLength = Array.isArray(recipe.palette) ? recipe.palette.length : 0;
  const roles: unknown = recipe.roles;
  let roleCount = 0;
  if (!Array.isArray(roles)) {
    issues.push({ path: '$.roles', message: 'Expected one role name per palette entry.' });
  } else {
    roleCount = roles.length;
    if (roles.length !== paletteLength) {
      issues.push({
        path: '$.roles',
        message: `Expected ${String(paletteLength)} names to match the palette; found ${String(roles.length)}.`,
      });
    }
    roles.forEach((role: unknown, index) => {
      if (typeof role !== 'string' || role.length === 0) {
        issues.push({ path: `$.roles[${String(index)}]`, message: 'Expected a non-empty name.' });
      }
    });
    if (roles.length > 0 && roles[0] !== 'empty') {
      issues.push({ path: '$.roles[0]', message: "Expected 'empty'; slot 0 is the empty slot everywhere." });
    }
    const seen = new Set<unknown>();
    roles.forEach((role: unknown, index) => {
      if (seen.has(role)) {
        issues.push({ path: `$.roles[${String(index)}]`, message: 'Expected each role to appear once.' });
      }
      seen.add(role);
    });
  }

  const size: unknown = recipe.size;
  const sizeKnown = Array.isArray(size) && size.length === 3
    && size.every((d: unknown) => typeof d === 'number' && Number.isInteger(d) && d >= 1);

  const steps: unknown = recipe.steps;
  if (!Array.isArray(steps)) {
    issues.push({ path: '$.steps', message: 'Expected a list of steps.' });
    return issues;
  }
  if (steps.length > MAX_STEPS) {
    issues.push({ path: '$.steps', message: `Expected at most ${String(MAX_STEPS)} steps.` });
  }
  steps.forEach((entry: unknown, index) => {
    const path = `$.steps[${String(index)}]`;
    if (typeof entry !== 'object' || entry === null) {
      issues.push({ path, message: 'Expected a step object.' });
      return;
    }
    const step = entry as Record<string, unknown>;
    if (step.note !== undefined
      && (typeof step.note !== 'string' || step.note.length === 0 || step.note.length > MAX_NOTE)) {
      issues.push({
        path: `${path}.note`,
        message: `Expected a non-empty label of at most ${String(MAX_NOTE)} characters.`,
      });
    }
    switch (step.kind) {
      case 'voxels': {
        const atOk = checkPlacement(step.at, `${path}.at`, issues);
        const patchSize: unknown = step.size;
        const sizeOk = Array.isArray(patchSize) && patchSize.length === 3
          && patchSize.every((d: unknown) => typeof d === 'number' && Number.isInteger(d) && d >= 1);
        if (!sizeOk) {
          issues.push({ path: `${path}.size`, message: 'Expected three integers, each at least 1.' });
        }
        if (atOk && sizeOk && sizeKnown) {
          const at = step.at as readonly number[];
          const patch = patchSize as readonly number[];
          const grid = size as readonly number[];
          for (let axis = 0; axis < 3; axis += 1) {
            if ((at[axis] ?? 0) + (patch[axis] ?? 0) > (grid[axis] ?? 0)) {
              issues.push({ path: `${path}.at`, message: 'The patch reaches outside the grid.' });
              break;
            }
          }
        }
        const voxels: unknown = step.voxels;
        if (!Array.isArray(voxels)) {
          issues.push({ path: `${path}.voxels`, message: 'Expected an array of role slots.' });
          break;
        }
        if (sizeOk) {
          const patch = patchSize as readonly number[];
          const expected = (patch[0] ?? 0) * (patch[1] ?? 0) * (patch[2] ?? 0);
          if (voxels.length !== expected) {
            issues.push({
              path: `${path}.voxels`,
              message: `Expected ${String(expected)} entries for the declared size; found ${String(voxels.length)}.`,
            });
          }
        }
        for (let cell = 0; cell < voxels.length; cell += 1) {
          const slot: unknown = voxels[cell];
          if (typeof slot !== 'number' || !Number.isInteger(slot) || slot < 0 || slot >= roleCount) {
            issues.push({ path: `${path}.voxels[${String(cell)}]`, message: 'Expected a role slot that exists.' });
            break;
          }
        }
        break;
      }
      case 'part': {
        if (typeof step.part !== 'string' || step.part.length === 0) {
          issues.push({ path: `${path}.part`, message: 'Expected a part name.' });
        }
        checkPlacement(step.at, `${path}.at`, issues);
        const settings: unknown = step.settings;
        if (typeof settings !== 'object' || settings === null || Array.isArray(settings)) {
          issues.push({ path: `${path}.settings`, message: 'Expected a settings object; {} means defaults.' });
        } else {
          for (const [key, setting] of Object.entries(settings)) {
            const ok = typeof setting === 'string' || typeof setting === 'boolean' || isFiniteNumber(setting);
            if (!ok) {
              issues.push({ path: `${path}.settings.${key}`, message: 'Expected a finite number, a string, or a boolean.' });
            }
          }
        }
        if (step.seedSalt !== undefined
          && (typeof step.seedSalt !== 'number' || !Number.isInteger(step.seedSalt))) {
          issues.push({ path: `${path}.seedSalt`, message: 'Expected an integer.' });
        }
        break;
      }
      case 'mirror': {
        if (step.axis !== 'x' && step.axis !== 'z') {
          issues.push({ path: `${path}.axis`, message: "Expected 'x' or 'z'." });
        }
        break;
      }
      case 'recipe': {
        if (typeof step.recipe !== 'string' || step.recipe.length === 0) {
          issues.push({ path: `${path}.recipe`, message: 'Expected the id of a recipe to place.' });
        }
        checkPlacement(step.at, `${path}.at`, issues);
        if (step.seedSalt !== undefined
          && (typeof step.seedSalt !== 'number' || !Number.isInteger(step.seedSalt))) {
          issues.push({ path: `${path}.seedSalt`, message: 'Expected an integer.' });
        }
        break;
      }
      default:
        issues.push({ path: `${path}.kind`, message: `Expected one of: ${STEP_KINDS.join(', ')}.` });
    }
  });
  return issues;
}

export class RecipeBuildError extends Error {
  constructor(readonly issues: readonly GenomeIssueV1[]) {
    super(
      `Recipe cannot build: ${issues.map((i) => `${i.path} ${i.message}`).join('; ')}`,
    );
    this.name = 'RecipeBuildError';
  }
}

export interface BuiltRecipeV1 {
  readonly model: StudioModelV1;
  /**
   * For every grid cell, the index of the step that placed its voxel; -1 for
   * empty cells. Mirrored copies carry the step of their source cell, because
   * a note pinned on either side should reach the part that made the shape —
   * fixing the part heals both sides, and the mirror has nothing to fix.
   */
  readonly placedBy: readonly number[];
  /**
   * For every grid cell, the id of the recipe that actually placed its voxel;
   * empty string where nothing did. For a voxel from a sub-recipe this is the
   * sub-recipe, however deeply nested — so a note pinned on a shared roof
   * names the roof recipe rather than the house that borrowed it, and the fix
   * lands where every user of it benefits.
   */
  readonly placedByRecipe: readonly string[];
  /**
   * For every grid cell, the deterministic path of the physical recipe
   * occurrence that owns it; empty string where nothing did. Direct voxel
   * and part steps belong to the recipe occurrence they run inside, so they
   * may repaint one another. Every nested recipe step creates a distinct
   * occurrence, even when it names the same saved recipe as another step.
   * A landed mirror copy's path inserts `/mirrors[step:axis]` directly
   * after the path of the recipe whose mirror made it, so equal step
   * numbers at different depths can never name the same copy. This is
   * Studio provenance, not a renderer or simulation contract.
   */
  readonly placedByOccurrence: readonly string[];
  /**
   * Every recipe occurrence this build contains, in build order: the root,
   * each placed sub-recipe with its whole subtree, and — for each mirror
   * copy that landed — the copied subtree under the mirroring recipe's
   * `/mirrors[...]` marker.
   * Unlike `placedByOccurrence`, this also names occurrences that own no
   * voxels themselves, such as a recipe made only of other recipes. The
   * builder is the one authority on which occurrences exist; consumers such
   * as the physical compile must read this rather than re-deriving it.
   */
  readonly occurrences: readonly string[];
}

interface OccupancyConflictV1 {
  readonly existing: string;
  readonly incoming: string;
  readonly first: readonly [number, number, number];
  count: number;
}

function recordOccupancyConflict(
  conflicts: Map<string, OccupancyConflictV1>,
  existing: string,
  incoming: string,
  coordinate: readonly [number, number, number],
): void {
  const key = `${existing}\u0000${incoming}`;
  const conflict = conflicts.get(key);
  if (conflict) {
    conflict.count += 1;
    return;
  }
  conflicts.set(key, {
    existing,
    incoming,
    first: [coordinate[0], coordinate[1], coordinate[2]],
    count: 1,
  });
}

function appendOccupancyIssues(
  conflicts: ReadonlyMap<string, OccupancyConflictV1>,
  path: string,
  issues: GenomeIssueV1[],
  mirrored: boolean,
): void {
  for (const conflict of conflicts.values()) {
    const [x, y, z] = conflict.first;
    issues.push({
      path,
      message: `${mirrored ? 'The mirrored occurrence' : 'The occurrence'} '${conflict.incoming}' `
        + `intersects '${conflict.existing}' at voxel (${String(x)}, ${String(y)}, ${String(z)})`
        + `; ${String(conflict.count)} overlapping ${conflict.count === 1 ? 'voxel' : 'voxels'} total. `
        + 'A voxel may belong to at most one recipe occurrence.',
    });
  }
}

/**
 * Runs a recipe: steps in order, later paint over earlier, 0 leaves what is
 * there. Pure and deterministic — same recipe, same parts, identical model —
 * because every guarantee downstream (parity with the baked grid, honest
 * before/after sheets, note routing) stands on that.
 *
 * A nested recipe step is also a physical occurrence boundary. Distinct
 * occurrences may touch faces, edges, or corners, but may not paint the same
 * voxel; the build fails with stable occurrence paths when they do. Direct
 * part and voxel steps remain internal paint for their containing occurrence.
 *
 * Bad steps do not stop the run: each is recorded and skipped, and the whole
 * list is thrown at the end, because a caller fixing a recipe file wants
 * everything that is wrong, not the first thing.
 */
export function buildRecipe(
  recipe: RecipeV1,
  parts: PartShelfV1,
  book: RecipeBookV1 = {},
): BuiltRecipeV1 {
  return buildRecipeInternal(recipe, parts, book, [], recipe.id);
}

/**
 * `ancestry` is the chain of recipe ids being built, innermost last. It is
 * what makes a cycle a named error rather than a stack overflow: a recipe
 * that reaches itself, directly or through others, is a mistake in the book
 * and the message has to say which loop.
 */
function buildRecipeInternal(
  recipe: RecipeV1,
  parts: PartShelfV1,
  book: RecipeBookV1,
  ancestry: readonly string[],
  occurrencePath: string,
): BuiltRecipeV1 {
  const recipeIssues = validateRecipeV1(recipe);
  if (recipeIssues.length > 0) throw new RecipeBuildError(recipeIssues);

  const [sx, sy, sz] = recipe.size;
  const voxels = new Array<number>(sx * sy * sz).fill(0);
  const placedBy = new Array<number>(sx * sy * sz).fill(-1);
  const placedByRecipe = new Array<string>(sx * sy * sz).fill('');
  const placedByOccurrence = new Array<string>(sx * sy * sz).fill('');
  // Mirror operations act atomically on the objects placed directly in this
  // recipe. Descendants of one nested recipe remain one assembly here even
  // though placedByOccurrence retains their deeper diagnostic ownership.
  const placedByMirrorGroup = new Array<string>(sx * sy * sz).fill('');
  const grid = (x: number, y: number, z: number): number => x + sx * (y + sy * z);
  const issues: GenomeIssueV1[] = [];
  // The build's own ledger of every occurrence it contains, voxel-owning or
  // not. Steps append as they land, so the list is authoritative and ordered.
  const occurrences: string[] = [occurrencePath];

  recipe.steps.forEach((step, stepIndex) => {
    const path = `$.steps[${String(stepIndex)}]`;
    if (step.kind === 'voxels') {
      const conflicts = new Map<string, OccupancyConflictV1>();
      const writes: { readonly cell: number; readonly slot: number }[] = [];
      const [ax, ay, az] = step.at;
      const [px, py, pz] = step.size;
      for (let z = 0; z < pz; z += 1) {
        for (let y = 0; y < py; y += 1) {
          for (let x = 0; x < px; x += 1) {
            const slot = step.voxels[x + px * (y + py * z)] ?? 0;
            if (slot === 0) continue;
            const cell = grid(ax + x, ay + y, az + z);
            const existing = placedByOccurrence[cell] ?? '';
            if ((voxels[cell] ?? 0) !== 0 && existing !== occurrencePath) {
              recordOccupancyConflict(
                conflicts,
                existing,
                occurrencePath,
                [ax + x, ay + y, az + z],
              );
            }
            writes.push({ cell, slot });
          }
        }
      }
      appendOccupancyIssues(conflicts, `${path}.at`, issues, false);
      if (conflicts.size > 0) return;
      for (const { cell, slot } of writes) {
        voxels[cell] = slot;
        placedBy[cell] = stepIndex;
        placedByRecipe[cell] = recipe.id;
        placedByOccurrence[cell] = occurrencePath;
        placedByMirrorGroup[cell] = occurrencePath;
      }
      return;
    }
    if (step.kind === 'part') {
      const entry = parts[step.part];
      if (!entry) {
        issues.push({ path: `${path}.part`, message: `No part on the shelf is called '${step.part}'.` });
        return;
      }
      let fragment: PartFragmentV1;
      try {
        fragment = partBuildV1(entry)(step.settings, mixSeed(recipe.seed, step.seedSalt ?? 0));
      } catch (error) {
        issues.push({
          path,
          message: `The part '${step.part}' failed: ${error instanceof Error ? error.message : String(error)}`,
        });
        return;
      }
      if (!checkFragment(fragment, step.part, path, issues)) return;
      const [ax, ay, az] = step.at;
      const [fx, fy, fz] = fragment.size;
      if (ax + fx > sx || ay + fy > sy || az + fz > sz) {
        issues.push({
          path: `${path}.at`,
          message: `The part '${step.part}' is ${String(fx)}x${String(fy)}x${String(fz)} and reaches outside the grid.`,
        });
        return;
      }
      // Role names resolve to the recipe's slots; a name the recipe does not
      // colour is an error naming every missing role, because the recipe is
      // the skin and a part must never invent colours of its own.
      const slots = new Array<number>(fragment.roles.length).fill(0);
      const missing: string[] = [];
      for (let role = 1; role < fragment.roles.length; role += 1) {
        const name = fragment.roles[role] ?? '';
        const slot = recipe.roles.indexOf(name);
        if (slot < 0) missing.push(name);
        else slots[role] = slot;
      }
      if (missing.length > 0) {
        issues.push({
          path,
          message: `The part '${step.part}' uses roles the recipe does not colour: ${missing.join(', ')}.`,
        });
        return;
      }
      const conflicts = new Map<string, OccupancyConflictV1>();
      const writes: { readonly cell: number; readonly slot: number }[] = [];
      for (let z = 0; z < fz; z += 1) {
        for (let y = 0; y < fy; y += 1) {
          for (let x = 0; x < fx; x += 1) {
            const role = fragment.voxels[x + fx * (y + fy * z)] ?? 0;
            if (role === 0) continue;
            const cell = grid(ax + x, ay + y, az + z);
            const existing = placedByOccurrence[cell] ?? '';
            if ((voxels[cell] ?? 0) !== 0 && existing !== occurrencePath) {
              recordOccupancyConflict(
                conflicts,
                existing,
                occurrencePath,
                [ax + x, ay + y, az + z],
              );
            }
            writes.push({ cell, slot: slots[role] ?? 0 });
          }
        }
      }
      appendOccupancyIssues(conflicts, `${path}.at`, issues, false);
      if (conflicts.size > 0) return;
      for (const { cell, slot } of writes) {
        voxels[cell] = slot;
        placedBy[cell] = stepIndex;
        placedByRecipe[cell] = recipe.id;
        placedByOccurrence[cell] = occurrencePath;
        placedByMirrorGroup[cell] = occurrencePath;
      }
      return;
    }
    if (step.kind === 'recipe') {
      const sub = book[step.recipe];
      if (!sub) {
        issues.push({
          path: `${path}.recipe`,
          message: `No recipe in the book is called '${step.recipe}'.`,
        });
        return;
      }
      // A recipe that reaches itself would recur forever. Naming the loop is
      // the only useful thing to say about it.
      if (sub.id === recipe.id || ancestry.includes(sub.id)) {
        issues.push({
          path,
          message: `'${sub.id}' contains itself: `
            + `${[...ancestry, recipe.id, sub.id].join(' -> ')}.`,
        });
        return;
      }
      if (ancestry.length + 1 > MAX_RECIPE_DEPTH) {
        issues.push({
          path,
          message: `Recipes nest deeper than ${String(MAX_RECIPE_DEPTH)}; this is a mistake, not a model.`,
        });
        return;
      }

      const salt = step.seedSalt ?? 0;
      // Salt 0 builds the sub-recipe exactly as it builds alone, so a shared
      // roof on a house is the same roof the shelf shows.
      const seeded = salt === 0 ? sub : { ...sub, seed: mixSeed(sub.seed, salt) };
      const childOccurrencePath = `${occurrencePath}/steps[${String(stepIndex)}]<${sub.id}>`;
      let built: BuiltRecipeV1;
      try {
        built = buildRecipeInternal(
          seeded,
          parts,
          book,
          [...ancestry, recipe.id],
          childOccurrencePath,
        );
      } catch (error) {
        if (error instanceof RecipeBuildError) {
          // Carry the inner findings out under a path that says which step
          // reached them, so a broken shared recipe is traceable from the
          // model that failed rather than only from itself.
          for (const issue of error.issues) {
            issues.push({
              path: `${path} -> ${step.recipe}${issue.path.replace(/^\$/, '')}`,
              message: issue.message,
            });
          }
          return;
        }
        throw error;
      }

      const [ax, ay, az] = step.at;
      const [bx, by, bz] = built.model.size;
      if (ax + bx > sx || ay + by > sy || az + bz > sz) {
        issues.push({
          path: `${path}.at`,
          message: `The recipe '${step.recipe}' is ${String(bx)}x${String(by)}x${String(bz)} `
            + 'and reaches outside the grid.',
        });
        return;
      }

      // Roles again, exactly as for a part: the sub-recipe's palette is not
      // used, so the recipe placing it decides every colour.
      const slots = new Array<number>(sub.roles.length).fill(0);
      const missing: string[] = [];
      for (let role = 1; role < sub.roles.length; role += 1) {
        const name = sub.roles[role] ?? '';
        const slot = recipe.roles.indexOf(name);
        if (slot < 0) missing.push(name);
        else slots[role] = slot;
      }
      if (missing.length > 0) {
        issues.push({
          path,
          message: `The recipe '${step.recipe}' uses roles this recipe does not colour: ${missing.join(', ')}.`,
        });
        return;
      }

      const conflicts = new Map<string, OccupancyConflictV1>();
      const writes: {
        readonly cell: number;
        readonly slot: number;
        readonly subCell: number;
        readonly incoming: string;
      }[] = [];
      for (let z = 0; z < bz; z += 1) {
        for (let y = 0; y < by; y += 1) {
          for (let x = 0; x < bx; x += 1) {
            const subCell = x + bx * (y + by * z);
            const role = built.model.voxels[subCell] ?? 0;
            if (role === 0) continue;
            const cell = grid(ax + x, ay + y, az + z);
            const incoming = built.placedByOccurrence[subCell] ?? childOccurrencePath;
            const existing = placedByOccurrence[cell] ?? '';
            if ((voxels[cell] ?? 0) !== 0 && existing !== incoming) {
              recordOccupancyConflict(
                conflicts,
                existing,
                incoming,
                [ax + x, ay + y, az + z],
              );
            }
            writes.push({ cell, slot: slots[role] ?? 0, subCell, incoming });
          }
        }
      }
      appendOccupancyIssues(conflicts, `${path}.at`, issues, false);
      if (conflicts.size > 0) return;
      // The sub-build's ledger is already rooted at this step's path, so it
      // carries over whole — including its own voxel-less compositions.
      occurrences.push(...built.occurrences);
      for (const { cell, slot, subCell, incoming } of writes) {
        voxels[cell] = slot;
        placedBy[cell] = stepIndex;
        // The deepest owner wins, so a voxel from a roof inside a house still
        // names the roof.
        placedByRecipe[cell] = built.placedByRecipe[subCell] ?? sub.id;
        placedByOccurrence[cell] = incoming;
        placedByMirrorGroup[cell] = childOccurrencePath;
      }
      return;
    }

    // Mirror reads a snapshot of the grid as it stood, so the result is a
    // simultaneous union and running the same mirror twice changes nothing
    // more. Root-owned paint remains one object. A nested occurrence that
    // gains any reflected cells is a new physical occurrence; if only part of
    // that copy fits, report the blocked cells instead of silently producing
    // a clipped, intersecting object. A fully covered reflection remains the
    // established no-op (for example an explicitly authored symmetric pair).
    const before = voxels.slice();
    const beforePlaced = placedBy.slice();
    const beforeOwner = placedByRecipe.slice();
    const beforeOccurrence = placedByOccurrence.slice();
    const beforeMirrorGroup = placedByMirrorGroup.slice();
    const reflected = new Map<string, {
      source: number;
      target: number;
      coordinate: readonly [number, number, number];
      sourceOccurrence: string;
    }[]>();
    for (let z = 0; z < sz; z += 1) {
      for (let y = 0; y < sy; y += 1) {
        for (let x = 0; x < sx; x += 1) {
          const source = grid(x, y, z);
          if ((before[source] ?? 0) === 0) continue;
          const sourceOccurrence = beforeOccurrence[source] ?? occurrencePath;
          const mirrorGroup = beforeMirrorGroup[source] ?? occurrencePath;
          const tx = step.axis === 'x' ? sx - 1 - x : x;
          const tz = step.axis === 'z' ? sz - 1 - z : z;
          const cells = reflected.get(mirrorGroup) ?? [];
          cells.push({
            source,
            target: grid(tx, y, tz),
            coordinate: [tx, y, tz],
            sourceOccurrence,
          });
          reflected.set(mirrorGroup, cells);
        }
      }
    }
    const conflicts = new Map<string, OccupancyConflictV1>();
    const writes: {
      readonly source: number;
      readonly target: number;
      readonly incomingOccurrence: string;
      readonly incomingMirrorGroup: string;
    }[] = [];
    // A copy's path inserts the mirror marker directly after this recipe's
    // own occurrence path — the level whose mirror ran. Appending it at the
    // deep end instead would let a same-numbered mirror step inside a nested
    // recipe spell the identical path for a different physical occurrence.
    const mirrorMarker = `${occurrencePath}/mirrors[${String(stepIndex)}:${step.axis}]`;
    const landedGroups: string[] = [];
    for (const [sourceMirrorGroup, cells] of reflected) {
      const addsCells = cells.some(({ target }) => (before[target] ?? 0) === 0);
      if (addsCells && sourceMirrorGroup !== occurrencePath) {
        landedGroups.push(sourceMirrorGroup);
      }
      const incomingMirrorGroup = sourceMirrorGroup === occurrencePath
        ? occurrencePath
        : `${mirrorMarker}${sourceMirrorGroup.slice(occurrencePath.length)}`;
      for (const { source, target, coordinate, sourceOccurrence } of cells) {
        const incomingOccurrence = sourceMirrorGroup === occurrencePath
          ? occurrencePath
          : `${mirrorMarker}${sourceOccurrence.slice(occurrencePath.length)}`;
        if ((before[target] ?? 0) !== 0) {
          const existingOccurrence = beforeOccurrence[target] ?? '';
          const existingMirrorGroup = beforeMirrorGroup[target] ?? '';
          if (sourceMirrorGroup === occurrencePath) {
            if (existingOccurrence !== occurrencePath) {
              recordOccupancyConflict(
                conflicts,
                existingOccurrence,
                incomingOccurrence,
                coordinate,
              );
            }
          } else if (addsCells) {
            // A copied assembly is all-or-none. Even a matching occupied leaf
            // would make this a partial copy while another leaf is added.
            recordOccupancyConflict(
              conflicts,
              existingOccurrence,
              incomingOccurrence,
              coordinate,
            );
          } else {
            // A fully covered reflection is the established no-op when the
            // same assembly covers itself or an already-authored counterpart
            // has the identical voxel and deepest recipe provenance.
            const isEquivalentCounterpart = (before[target] ?? 0) === (before[source] ?? 0)
              && (beforeOwner[target] ?? '') === (beforeOwner[source] ?? '');
            if (existingMirrorGroup !== sourceMirrorGroup && !isEquivalentCounterpart) {
              recordOccupancyConflict(
                conflicts,
                existingOccurrence,
                incomingOccurrence,
                coordinate,
              );
            }
          }
          continue;
        }
        writes.push({ source, target, incomingOccurrence, incomingMirrorGroup });
      }
    }
    appendOccupancyIssues(conflicts, path, issues, true);
    if (conflicts.size > 0) return;
    // Each landed copy is a whole new assembly, so its entire subtree —
    // including voxel-less compositions — joins the ledger under the copy's
    // suffix. The snapshot keeps this step's own copies from re-copying.
    const establishedOccurrences = occurrences.slice();
    for (const group of landedGroups) {
      for (const established of establishedOccurrences) {
        if (established !== group && !established.startsWith(`${group}/`)) continue;
        occurrences.push(`${mirrorMarker}${established.slice(occurrencePath.length)}`);
      }
    }
    for (const { source, target, incomingOccurrence, incomingMirrorGroup } of writes) {
      voxels[target] = before[source] ?? 0;
      placedBy[target] = beforePlaced[source] ?? -1;
      placedByRecipe[target] = beforeOwner[source] ?? '';
      placedByOccurrence[target] = incomingOccurrence;
      placedByMirrorGroup[target] = incomingMirrorGroup;
    }
  });

  if (issues.length > 0) throw new RecipeBuildError(issues);

  const model: StudioModelV1 = {
    schemaVersion: VOXEL_GENOME_SCHEMA_V1,
    id: recipe.id,
    label: recipe.label,
    seed: recipe.seed,
    size: [sx, sy, sz],
    // Fresh copies, field by field: a built model must not share structure
    // with the recipe object, and unknown keys from a JSON file must not ride
    // along into saved models.
    palette: recipe.palette.map((color) => ({ r: color.r, g: color.g, b: color.b })),
    voxels,
    motion: normalizedMotion(recipe.motion),
    // Carried through so the built model draws at the recipe's grain. A shared
    // roof recipe placed as-is keeps its own grain here; a scaled placement is
    // the second slice, not this one.
    ...(recipe.voxelSize === undefined ? {} : { voxelSize: recipe.voxelSize }),
  };
  // The builder's own output through the model's own validator. This should
  // never fire — a validated recipe and checked steps cannot produce an
  // invalid model — so if it does, it is a builder bug, and it should say so
  // rather than hand a misbuilt model onward.
  const modelIssues = validateModelV1(model);
  if (modelIssues.length > 0) throw new RecipeBuildError(modelIssues);
  return { model, placedBy, placedByRecipe, placedByOccurrence, occurrences };
}

/**
 * One moment in a model's construction: the grid as it stood after a step,
 * and plain words for what that step did.
 */
export interface RecipeStageV1 {
  /** 0 is the empty grid; stage n is the model after step n-1 has run. */
  readonly index: number;
  readonly step: RecipeStepV1 | null;
  readonly summary: string;
  readonly model: StudioModelV1;
  readonly voxelsAfter: number;
  /** Change from the previous stage. Zero when a step only repaints. */
  readonly voxelsAdded: number;
}

/**
 * Returns an aggregated list of contributing recipe parts. Occurrence
 * ownership follows the built voxels through same-occurrence repainting and
 * mirrors, so an erased internal step or a mirror that fills no new voxel
 * adds no item. Cross-occurrence overlap is rejected by the builder. Repeated
 * sub-recipes are grouped by identity, so the dining set says Chair ×6 instead
 * of three chairs plus a mirror operation. Children remain the reusable
 * recipe's own inventory, scaled by surviving assembly count. Procedural
 * operations remain visible in the construction stages.
 */
export function listRecipePartsV1(
  recipe: RecipeV1,
  parts: PartShelfV1,
  book: RecipeBookV1 = {},
): readonly RecipePartV1[] {
  return listRecipePartsInternalV1(recipe, parts, book, { buildRecipe, mixSeed });
}

/**
 * The parts list plus, for each top-level part, the exact grid cells it placed
 * — so the studio can light up a clicked part where it sits in the model.
 */
export function listRecipePartsWithCellsV1(
  recipe: RecipeV1,
  parts: PartShelfV1,
  book: RecipeBookV1 = {},
): RecipePartsWithCellsV1 {
  return listRecipePartsWithCellsInternalV1(recipe, parts, book, { buildRecipe, mixSeed });
}

function countFilledInternal(model: StudioModelV1): number {
  let filled = 0;
  for (const slot of model.voxels) if (slot !== 0) filled += 1;
  return filled;
}

/**
 * The whole construction, one stage per step, for watching a model being
 * made.
 *
 * Each stage replays the recipe from the start rather than masking the
 * finished grid by which step placed each voxel: a later step may repaint an
 * earlier one, and masking would erase the earlier state that was genuinely
 * there. Replaying is the only way to show what the model actually looked
 * like at that moment. Recipes are small and the builder is pure, so the
 * repeated work is cheap and the result is identical every time.
 */
export function buildRecipeStages(
  recipe: RecipeV1,
  parts: PartShelfV1,
  book: RecipeBookV1 = {},
): readonly RecipeStageV1[] {
  const stages: RecipeStageV1[] = [];
  let previousVoxels = 0;
  for (let count = 0; count <= recipe.steps.length; count += 1) {
    const built = buildRecipe({ ...recipe, steps: recipe.steps.slice(0, count) }, parts, book);
    const step = count === 0 ? null : recipe.steps[count - 1] ?? null;
    const voxelsAfter = countFilledInternal(built.model);
    stages.push({
      index: count,
      step,
      summary: step ? describeRecipeStepV1(step) : 'Starts with an empty grid',
      model: built.model,
      voxelsAfter,
      voxelsAdded: voxelsAfter - previousVoxels,
    });
    previousVoxels = voxelsAfter;
  }
  return stages;
}

function checkFragment(
  fragment: PartFragmentV1,
  part: string,
  path: string,
  issues: GenomeIssueV1[],
): boolean {
  const size: unknown = fragment.size;
  const sizeOk = Array.isArray(size) && size.length === 3
    && size.every((d: unknown) => typeof d === 'number' && Number.isInteger(d)
      && d >= 1 && d <= MAX_PART_DIMENSION);
  if (!sizeOk) {
    issues.push({ path, message: `The part '${part}' returned a broken size.` });
    return false;
  }
  if (!Array.isArray(fragment.roles) || fragment.roles[0] !== 'empty') {
    issues.push({ path, message: `The part '${part}' must name its roles with 'empty' in slot 0.` });
    return false;
  }
  const [fx, fy, fz] = fragment.size;
  const cells: unknown = fragment.voxels;
  if (!Array.isArray(cells) || cells.length !== fx * fy * fz) {
    issues.push({ path, message: `The part '${part}' returned voxels that do not match its size.` });
    return false;
  }
  for (const role of cells as readonly unknown[]) {
    if (typeof role !== 'number' || !Number.isInteger(role) || role < 0 || role >= fragment.roles.length) {
      issues.push({ path, message: `The part '${part}' painted a role slot it never named.` });
      return false;
    }
  }
  return true;
}

/** Mirrors `setMotion`'s rule: 'swing' is stored as absence, so a recipe-built
 * model compares equal to the same model reached through edits. */
function normalizedMotion(motion: ModelMotionV1): ModelMotionV1 {
  const [tx, ty, tz] = motion.translation;
  const [rx, ry, rz] = motion.rotationRadians;
  const [gx, gy, gz] = motion.scale;
  return {
    periodMs: motion.periodMs,
    phaseRadians: motion.phaseRadians,
    translation: [tx, ty, tz],
    rotationRadians: [rx, ry, rz],
    scale: [gx, gy, gz],
    ...(motion.rotationStyle === 'turn' ? { rotationStyle: 'turn' as const } : {}),
  };
}
