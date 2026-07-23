import type {
  PartSettingsV1,
  PartShelfV1,
  RecipeBookV1,
  RecipeStepV1,
  RecipeV1,
} from './recipe.js';

/**
 * One visible entry in the recursive component tree for a recipe. Unlike a
 * construction stage, this does not flatten away nested recipes: each use of
 * a shared recipe remains a separate node with its own children.
 */
export interface RecipeComponentV1 {
  /** One-based step indexes from the root recipe, e.g. [2, 1]. */
  readonly path: readonly number[];
  readonly ownerRecipeId: string;
  readonly kind: RecipeStepV1['kind'];
  /** The reusable recipe, part, or primitive operation being used. */
  readonly name: string;
  /** The author's explanation of what this occurrence contributes. */
  readonly summary: string;
  readonly at?: readonly [number, number, number];
  readonly settings?: PartSettingsV1;
  readonly recipeId?: string;
  readonly size?: readonly [number, number, number];
  readonly voxelCount?: number;
  readonly axis?: 'x' | 'z';
  readonly children: readonly RecipeComponentV1[];
}

/** A contributing item in an aggregated recipe bill of materials. Layout
 * operations such as mirrors are applied to the counts rather than presented
 * as if they were parts. Nested children describe the saved reusable recipe,
 * scaled across every surviving parent assembly occurrence. The builder
 * rejects cross-occurrence overlap before inventory is counted, so an outer
 * recipe cannot clip or repaint one of its reusable children. */
export interface RecipePartV1 {
  readonly kind: Exclude<RecipeStepV1['kind'], 'mirror'>;
  readonly name: string;
  readonly summary: string;
  readonly count: number;
  readonly settings?: PartSettingsV1;
  readonly recipeId?: string;
  readonly size: readonly [number, number, number];
  readonly voxelCount?: number;
  readonly children: readonly RecipePartV1[];
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
    case 'recipe':
      return `Adds the ${step.recipe} recipe`;
  }
}

/**
 * Describes every component a recipe uses, recursively and in build order.
 * Repeated nested recipes are intentionally not deduplicated: three Flower
 * placements are three visible occurrences whose identical children make the
 * reuse legible. A cycle is left as a named leaf; the builder reports the
 * actual error when construction is attempted.
 */
export function listRecipeComponentsV1(
  recipe: RecipeV1,
  book: RecipeBookV1 = {},
): readonly RecipeComponentV1[] {
  function visit(
    current: RecipeV1,
    prefix: readonly number[],
    ancestry: readonly string[],
  ): readonly RecipeComponentV1[] {
    return current.steps.map((step, index) => {
      const path = [...prefix, index + 1];
      const shared = {
        path,
        ownerRecipeId: current.id,
        kind: step.kind,
        summary: describeRecipeStepV1(step),
      } as const;
      switch (step.kind) {
        case 'part':
          return {
            ...shared,
            name: step.part,
            at: [step.at[0], step.at[1], step.at[2]] as const,
            settings: { ...step.settings },
            children: [],
          };
        case 'voxels': {
          let voxelCount = 0;
          for (const slot of step.voxels) if (slot !== 0) voxelCount += 1;
          return {
            ...shared,
            name: 'Hand-placed voxels',
            at: [step.at[0], step.at[1], step.at[2]] as const,
            size: [step.size[0], step.size[1], step.size[2]] as const,
            voxelCount,
            children: [],
          };
        }
        case 'mirror':
          return {
            ...shared,
            name: `Mirror ${step.axis.toUpperCase()}`,
            axis: step.axis,
            children: [],
          };
        case 'recipe': {
          const nested = book[step.recipe];
          const nextAncestry = [...ancestry, current.id];
          const cyclic = nested ? nextAncestry.includes(nested.id) : false;
          return {
            ...shared,
            name: nested?.label ?? step.recipe,
            at: [step.at[0], step.at[1], step.at[2]] as const,
            recipeId: step.recipe,
            children: nested && !cyclic
              ? visit(nested, path, nextAncestry)
              : [],
          };
        }
      }
    });
  }

  return visit(recipe, [], []);
}

interface RecipePartInstanceV1 {
  readonly groupKey: string;
  readonly kind: RecipePartV1['kind'];
  readonly name: string;
  readonly summary: string;
  readonly at: readonly [number, number, number];
  readonly size: readonly [number, number, number];
  readonly settings?: PartSettingsV1;
  readonly recipeId?: string;
  readonly nested?: RecipeV1;
}

interface RecipePartInventoryV1 {
  readonly instances: readonly RecipePartInstanceV1[];
  /** Final voxel ownership, indexed by instance position in `instances`. */
  readonly contributedVoxels: ReadonlyMap<number, number>;
  /** For every grid cell of this recipe, the instance that finally owns it, or
   * -1. This is the per-cell truth the aggregated counts are folded from, kept
   * so a caller can light up exactly the cells one part group placed. */
  readonly owners: readonly number[];
}

interface RecipePartsDependenciesV1 {
  readonly buildRecipe: (
    recipe: RecipeV1,
    parts: PartShelfV1,
    book: RecipeBookV1,
  ) => { readonly model: { readonly voxels: readonly number[] } };
  readonly mixSeed: (seed: number, salt: number) => number;
}

function partSettingsKey(settings: PartSettingsV1): string {
  return Object.entries(settings)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, value]) => `${name}:${JSON.stringify(value)}`)
    .join('|');
}

function scaleRecipePartsV1(
  parts: readonly RecipePartV1[],
  factor: number,
): readonly RecipePartV1[] {
  return parts.map((part) => ({
    ...part,
    count: part.count * factor,
    ...(part.voxelCount === undefined ? {} : { voxelCount: part.voxelCount * factor }),
    children: scaleRecipePartsV1(part.children, factor),
  }));
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
export interface RecipePartsWithCellsV1 {
  readonly parts: readonly RecipePartV1[];
  /**
   * For each top-level part in `parts`, the flat grid cells it owns in the
   * root model, in the same order. This is only the top level: a nested part
   * lives in its own sub-grid and is not addressed here. Empty arrays are
   * kept so the two lists stay index-aligned.
   */
  readonly cells: readonly (readonly number[])[];
}

export function listRecipePartsWithCellsInternalV1(
  recipe: RecipeV1,
  parts: PartShelfV1,
  book: RecipeBookV1,
  dependencies: RecipePartsDependenciesV1,
): RecipePartsWithCellsV1 {
  const { buildRecipe, mixSeed } = dependencies;

  // Counting is only meaningful for a recipe that can actually build. This
  // also lets the inventory pass below stay focused on provenance rather than
  // duplicating the builder's validation and error aggregation.
  buildRecipe(recipe, parts, book);

  function instances(current: RecipeV1): RecipePartInventoryV1 {
    const [sx, sy, sz] = current.size;
    const grid = (x: number, y: number, z: number): number => x + sx * (y + sy * z);
    const collected: RecipePartInstanceV1[] = [];
    const owners = new Array<number>(sx * sy * sz).fill(-1);
    const placements = new Map<string, number[]>();
    const add = (instance: RecipePartInstanceV1): number => {
      const id = collected.length;
      const placementKey = `${instance.groupKey}@${instance.at.join(',')}`;
      collected.push(instance);
      const ids = placements.get(placementKey) ?? [];
      ids.push(id);
      placements.set(placementKey, ids);
      return id;
    };

    current.steps.forEach((step) => {
      if (step.kind === 'mirror') {
        const axis = step.axis === 'x' ? 0 : 2;
        const before = owners.slice();
        const occupiedBefore = new Set(before.filter((owner) => owner >= 0));
        const mirrored = new Map<number, number>();
        for (let z = 0; z < sz; z += 1) {
          for (let y = 0; y < sy; y += 1) {
            for (let x = 0; x < sx; x += 1) {
              const cell = grid(x, y, z);
              if ((before[cell] ?? -1) >= 0) continue;
              const twin = step.axis === 'x'
                ? grid(sx - 1 - x, y, z)
                : grid(x, y, sz - 1 - z);
              const sourceId = before[twin] ?? -1;
              if (sourceId < 0) continue;

              let mirroredId = mirrored.get(sourceId);
              if (mirroredId === undefined) {
                const existing = collected[sourceId]!;
                const at: [number, number, number] = [
                  existing.at[0], existing.at[1], existing.at[2],
                ];
                at[axis] = current.size[axis] - existing.at[axis] - existing.size[axis];
                const placementKey = `${existing.groupKey}@${at.join(',')}`;
                mirroredId ??= placements.get(placementKey)
                  ?.find((candidate) => occupiedBefore.has(candidate));
                mirroredId ??= add({ ...existing, at });
                mirrored.set(sourceId, mirroredId);
              }
              owners[cell] = mirroredId;
            }
          }
        }
        return;
      }

      const paint = (
        id: number,
        at: readonly [number, number, number],
        size: readonly [number, number, number],
        voxels: readonly number[],
      ): void => {
        const [ax, ay, az] = at;
        const [px, py, pz] = size;
        for (let z = 0; z < pz; z += 1) {
          for (let y = 0; y < py; y += 1) {
            for (let x = 0; x < px; x += 1) {
              if ((voxels[x + px * (y + py * z)] ?? 0) === 0) continue;
              owners[grid(ax + x, ay + y, az + z)] = id;
            }
          }
        }
      };

      const at = [step.at[0], step.at[1], step.at[2]] as const;
      const summary = describeRecipeStepV1(step);
      if (step.kind === 'part') {
        const make = parts[step.part];
        if (!make) return;
        const effectiveSeed = mixSeed(current.seed, step.seedSalt ?? 0);
        const fragment = make(step.settings, effectiveSeed);
        const size = [fragment.size[0], fragment.size[1], fragment.size[2]] as const;
        const id = add({
          groupKey: `part:${step.part}:${summary}:${partSettingsKey(step.settings)}:${String(effectiveSeed)}`,
          kind: 'part',
          name: step.part,
          summary,
          at,
          size,
          settings: { ...step.settings },
        });
        paint(
          id,
          at,
          size,
          fragment.voxels.map((role) => current.roles.indexOf(fragment.roles[role] ?? '')),
        );
        return;
      }
      if (step.kind === 'voxels') {
        const size = [step.size[0], step.size[1], step.size[2]] as const;
        const id = add({
          groupKey: `voxels:${summary}:${step.size.join(',')}:${step.voxels.join(',')}`,
          kind: 'voxels',
          name: 'Hand-placed voxels',
          summary,
          at,
          size,
        });
        paint(id, at, size, step.voxels);
        return;
      }

      const nested = book[step.recipe];
      if (!nested) return;
      const effective = (step.seedSalt ?? 0) !== 0
        ? { ...nested, seed: mixSeed(nested.seed, step.seedSalt ?? 0) }
        : nested;
      const size = [effective.size[0], effective.size[1], effective.size[2]] as const;
      const name = effective.label;
      const id = add({
        groupKey: `recipe:${step.recipe}:${String(effective.seed)}`,
        kind: 'recipe',
        name,
        summary: `Reusable ${name} recipe`,
        at,
        size,
        recipeId: step.recipe,
        nested: effective,
      });
      const built = buildRecipe(effective, parts, book);
      paint(
        id,
        at,
        size,
        built.model.voxels.map((role) => current.roles.indexOf(effective.roles[role] ?? '')),
      );
    });

    const contributedVoxels = new Map<number, number>();
    for (const owner of owners) {
      if (owner < 0) continue;
      contributedVoxels.set(owner, (contributedVoxels.get(owner) ?? 0) + 1);
    }
    return { instances: collected, contributedVoxels, owners };
  }

  function grouped(
    current: RecipeV1,
    ancestry: readonly string[],
  ): readonly RecipePartV1[] {
    const inventory = instances(current);
    const groups = new Map<string, { instance: RecipePartInstanceV1; id: number }[]>();
    inventory.instances.forEach((instance, id) => {
      if (!inventory.contributedVoxels.has(id)) return;
      const group = groups.get(instance.groupKey) ?? [];
      group.push({ instance, id });
      groups.set(instance.groupKey, group);
    });

    return [...groups.values()].map((group) => {
      const first = group[0]!.instance;
      const cyclic = first.nested ? ancestry.includes(first.nested.id) : false;
      const children = first.nested && !cyclic
        ? scaleRecipePartsV1(grouped(first.nested, [...ancestry, current.id]), group.length)
        : [];
      return {
        kind: first.kind,
        name: first.name,
        summary: first.summary,
        count: group.length,
        size: [first.size[0], first.size[1], first.size[2]],
        children,
        ...(first.settings ? { settings: { ...first.settings } } : {}),
        ...(first.recipeId ? { recipeId: first.recipeId } : {}),
        ...(first.kind !== 'voxels'
          ? {}
          : {
              voxelCount: group.reduce(
                (total, entry) => total + (inventory.contributedVoxels.get(entry.id) ?? 0),
                0,
              ),
            }),
      };
    });
  }

  /**
   * The root cells each top-level part group owns, index-aligned with the
   * top-level `grouped(recipe)` result. It replays that grouping's exact
   * order — first contributing instance per group key — over the same
   * inventory, then reads the per-cell owners back into a cell list per group.
   */
  function topLevelCells(): readonly (readonly number[])[] {
    const inventory = instances(recipe);
    const order: string[] = [];
    const idsByKey = new Map<string, number[]>();
    inventory.instances.forEach((instance, id) => {
      if (!inventory.contributedVoxels.has(id)) return;
      let ids = idsByKey.get(instance.groupKey);
      if (!ids) {
        ids = [];
        idsByKey.set(instance.groupKey, ids);
        order.push(instance.groupKey);
      }
      ids.push(id);
    });
    return order.map((key) => {
      const idSet = new Set(idsByKey.get(key));
      const cells: number[] = [];
      inventory.owners.forEach((owner, cell) => {
        if (idSet.has(owner)) cells.push(cell);
      });
      return cells;
    });
  }

  return { parts: grouped(recipe, []), cells: topLevelCells() };
}

export function listRecipePartsInternalV1(
  recipe: RecipeV1,
  parts: PartShelfV1,
  book: RecipeBookV1,
  dependencies: RecipePartsDependenciesV1,
): readonly RecipePartV1[] {
  return listRecipePartsWithCellsInternalV1(recipe, parts, book, dependencies).parts;
}
