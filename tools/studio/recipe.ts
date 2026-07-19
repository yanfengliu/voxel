import {
  validateModelV1,
  VOXEL_GENOME_SCHEMA_V1,
  type GenomeColorV1,
  type GenomeIssueV1,
  type ModelMotionV1,
  type StudioModelV1,
} from './model.js';

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

/** The parts a builder may call, by the name a recipe step uses. */
export type PartShelfV1 = Readonly<Record<string, PartV1>>;

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
 * Cells that are already filled win over their mirrored twin. */
export interface MirrorStepV1 {
  readonly kind: 'mirror';
  /** Plain words for what this step is for; shown while the model builds. */
  readonly note?: string;
  readonly axis: 'x' | 'z';
}

export type RecipeStepV1 = VoxelsStepV1 | PartStepV1 | MirrorStepV1;

export interface RecipeV1 {
  readonly schemaVersion: typeof VOXEL_RECIPE_SCHEMA_V1;
  readonly id: string;
  readonly label: string;
  /** Every random choice in the build flows from this, salted per step. */
  readonly seed: number;
  readonly size: readonly [number, number, number];
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
const STEP_KINDS = ['voxels', 'part', 'mirror'] as const;
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
    palette: recipe.palette,
    voxels: [],
    motion: recipe.motion,
  }).filter((issue) => !issue.path.startsWith('$.voxels'));

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
}

/**
 * Runs a recipe: steps in order, later paint over earlier, 0 leaves what is
 * there. Pure and deterministic — same recipe, same parts, identical model —
 * because every guarantee downstream (parity with the baked grid, honest
 * before/after sheets, note routing) stands on that.
 *
 * Bad steps do not stop the run: each is recorded and skipped, and the whole
 * list is thrown at the end, because a caller fixing a recipe file wants
 * everything that is wrong, not the first thing.
 */
export function buildRecipe(recipe: RecipeV1, parts: PartShelfV1): BuiltRecipeV1 {
  const recipeIssues = validateRecipeV1(recipe);
  if (recipeIssues.length > 0) throw new RecipeBuildError(recipeIssues);

  const [sx, sy, sz] = recipe.size;
  const voxels = new Array<number>(sx * sy * sz).fill(0);
  const placedBy = new Array<number>(sx * sy * sz).fill(-1);
  const grid = (x: number, y: number, z: number): number => x + sx * (y + sy * z);
  const issues: GenomeIssueV1[] = [];

  recipe.steps.forEach((step, stepIndex) => {
    const path = `$.steps[${String(stepIndex)}]`;
    if (step.kind === 'voxels') {
      const [ax, ay, az] = step.at;
      const [px, py, pz] = step.size;
      for (let z = 0; z < pz; z += 1) {
        for (let y = 0; y < py; y += 1) {
          for (let x = 0; x < px; x += 1) {
            const slot = step.voxels[x + px * (y + py * z)] ?? 0;
            if (slot === 0) continue;
            const cell = grid(ax + x, ay + y, az + z);
            voxels[cell] = slot;
            placedBy[cell] = stepIndex;
          }
        }
      }
      return;
    }
    if (step.kind === 'part') {
      const make = parts[step.part];
      if (!make) {
        issues.push({ path: `${path}.part`, message: `No part on the shelf is called '${step.part}'.` });
        return;
      }
      let fragment: PartFragmentV1;
      try {
        fragment = make(step.settings, mixSeed(recipe.seed, step.seedSalt ?? 0));
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
      for (let z = 0; z < fz; z += 1) {
        for (let y = 0; y < fy; y += 1) {
          for (let x = 0; x < fx; x += 1) {
            const role = fragment.voxels[x + fx * (y + fy * z)] ?? 0;
            if (role === 0) continue;
            const cell = grid(ax + x, ay + y, az + z);
            voxels[cell] = slots[role] ?? 0;
            placedBy[cell] = stepIndex;
          }
        }
      }
      return;
    }
    // Mirror reads a snapshot of the grid as it stood, so the result is the
    // simultaneous union — filled cells win over their mirrored twin, and
    // running the same mirror twice changes nothing more.
    const before = voxels.slice();
    const beforePlaced = placedBy.slice();
    for (let z = 0; z < sz; z += 1) {
      for (let y = 0; y < sy; y += 1) {
        for (let x = 0; x < sx; x += 1) {
          const cell = grid(x, y, z);
          if ((before[cell] ?? 0) !== 0) continue;
          const twin = step.axis === 'x' ? grid(sx - 1 - x, y, z) : grid(x, y, sz - 1 - z);
          const slot = before[twin] ?? 0;
          if (slot === 0) continue;
          voxels[cell] = slot;
          placedBy[cell] = beforePlaced[twin] ?? -1;
        }
      }
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
  };
  // The builder's own output through the model's own validator. This should
  // never fire — a validated recipe and checked steps cannot produce an
  // invalid model — so if it does, it is a builder bug, and it should say so
  // rather than hand a misbuilt model onward.
  const modelIssues = validateModelV1(model);
  if (modelIssues.length > 0) throw new RecipeBuildError(modelIssues);
  return { model, placedBy };
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

/** What a step does, in words a person reads rather than a shape they decode. */
export function describeRecipeStepV1(step: RecipeStepV1): string {
  // The author's own words win. A generated summary can only say what a step
  // does mechanically -- "adds the brick-course part", four times over -- while
  // a note says which course and how far it shifts, which is the thing worth
  // watching. A recipe that explains itself is one a later design can borrow.
  if (step.note !== undefined && step.note.length > 0) return step.note;
  switch (step.kind) {
    case 'voxels': {
      let placed = 0;
      for (const slot of step.voxels) if (slot !== 0) placed += 1;
      return `Places ${String(placed)} cube${placed === 1 ? '' : 's'} by hand`;
    }
    case 'part':
      return `Adds the ${step.part} part`;
    case 'mirror':
      return step.axis === 'x' ? 'Mirrors left to right' : 'Mirrors front to back';
  }
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
): readonly RecipeStageV1[] {
  const stages: RecipeStageV1[] = [];
  let previousVoxels = 0;
  for (let count = 0; count <= recipe.steps.length; count += 1) {
    const built = buildRecipe({ ...recipe, steps: recipe.steps.slice(0, count) }, parts);
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
