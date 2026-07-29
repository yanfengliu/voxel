import { describe, expect, it } from 'vitest';

import { createStudioCatalog } from './catalog.js';
import { buildRecipe } from './recipe.js';
import { createStudioParts } from './parts.js';
import { createStudioRecipeBook } from './recipes.js';
import { modelOccupancyV1 } from './voxel-colliders.js';
import type { PhysicalAssetBookV1 } from './physical-asset.js';

/**
 * How much of the physics lane is actually made of voxels.
 *
 * Every sidecar collider in this repository is a hand-written primitive whose
 * numbers were transcribed from the recipe's box steps. That transcription can
 * drift from the geometry it describes, and nothing catches it if it does: the
 * solver happily simulates a shape the renderer never draws.
 *
 * This measures the gap rather than asserting it away. For every model with a
 * sidecar it compares the solid colliders' total volume against the model's
 * own occupied-voxel volume, and reports where they disagree. The chain is the
 * one asset that derives its colliders from the voxels directly, so it is the
 * control: it should agree exactly.
 */

interface CoverageV1 {
  readonly recipeId: string;
  /** Solid voxels no collider covers: the solver can be passed through here. */
  readonly uncovered: number;
  /** Cells a collider fills where the model draws nothing. */
  readonly overreach: number;
  readonly occupied: number;
}

/**
 * Which model cells a sidecar's solid colliders actually fill.
 *
 * Summing collider volumes is the wrong measure: compound colliders on one
 * body are allowed to overlap, and the table lamp deliberately covers its
 * five-voxel plus crown with two crossed bars that share a centre cell. Union
 * coverage is what matters, so the boxes are rasterized into the model's own
 * grid. A collider's model-space box is its body pose plus its own pose, and
 * cell (i,j,k) spans [i, i+1] on each axis.
 */
function coveredCellsV1(asset: PhysicalAssetBookV1[string]): ReadonlySet<string> {
  const bodies = new Map(asset.bodies.map((body) => [body.key, body]));
  const cells = new Set<string>();

  for (const collider of asset.colliders) {
    if (collider.role === 'sensor') continue;
    if (collider.shape.kind !== 'box') continue;
    const body = bodies.get(collider.body);
    if (body === undefined) continue;
    const origin = body.pose.position;
    const local = collider.pose.position;
    const half = collider.shape.halfExtents;

    const min = [0, 1, 2].map((axis) =>
      origin[axis]! + local[axis]! - half[axis]!);
    const max = [0, 1, 2].map((axis) =>
      origin[axis]! + local[axis]! + half[axis]!);

    for (let x = Math.round(min[0]!); x < Math.round(max[0]!); x += 1) {
      for (let y = Math.round(min[1]!); y < Math.round(max[1]!); y += 1) {
        for (let z = Math.round(min[2]!); z < Math.round(max[2]!); z += 1) {
          cells.add(`${String(x)},${String(y)},${String(z)}`);
        }
      }
    }
  }
  return cells;
}

function coverage(book: PhysicalAssetBookV1): readonly CoverageV1[] {
  const recipes = createStudioRecipeBook();
  const parts = createStudioParts();
  const rows: CoverageV1[] = [];

  for (const asset of Object.values(book)) {
    const recipe = recipes[asset.recipeId];
    if (recipe === undefined) continue;
    const model = buildRecipe(recipe, parts, recipes).model;
    const occupancy = modelOccupancyV1(model);
    const [sx, sy, sz] = occupancy.size;
    const covered = coveredCellsV1(asset);

    let occupied = 0;
    let uncovered = 0;
    const solid = new Set<string>();
    for (let z = 0; z < sz; z += 1) {
      for (let y = 0; y < sy; y += 1) {
        for (let x = 0; x < sx; x += 1) {
          if (!occupancy.filled(x, y, z)) continue;
          occupied += 1;
          const key = `${String(x)},${String(y)},${String(z)}`;
          solid.add(key);
          if (!covered.has(key)) uncovered += 1;
        }
      }
    }
    if (occupied === 0) continue;

    let overreach = 0;
    for (const key of covered) if (!solid.has(key)) overreach += 1;

    rows.push({ recipeId: asset.recipeId, uncovered, overreach, occupied });
  }
  return rows;
}

/** Every sidecar the shelf carries, gathered from each model's own book. */
function allSidecarsV1(): PhysicalAssetBookV1 {
  const merged: Record<string, PhysicalAssetBookV1[string]> = {};
  for (const section of createStudioCatalog().sections) {
    for (const model of section.models) {
      const book = model.howItsMade().physical;
      if (book === undefined) continue;
      for (const [recipeId, asset] of Object.entries(book)) {
        merged[recipeId] = asset;
      }
    }
  }
  return merged;
}

describe('the physics lane against the voxels it claims to describe', () => {
  const book = allSidecarsV1();

  it('has sidecars to audit', () => {
    expect(Object.keys(book).length).toBeGreaterThan(0);
  });

  it('never fills a cell the model draws nothing in', () => {
    const rows = coverage(book);
    expect(rows.length).toBeGreaterThan(0);

    // A collider in empty space blocks room nothing occupies, so a body
    // collides with things the picture says it should miss.
    expect(
      rows.filter((row) => row.overreach > 0)
        .map((row) => `${row.recipeId}: ${String(row.overreach)} empty cells filled`),
      'these sidecars are solid where their model is not',
    ).toEqual([]);
  });

  it('leaves no solid voxel without a collider', () => {
    const rows = coverage(book);

    // The opposite failure, and the quieter one: a solid cell no collider
    // covers is a hole other bodies pass through while the picture shows steel.
    expect(
      rows.filter((row) => row.uncovered > 0)
        .map((row) =>
          `${row.recipeId}: ${String(row.uncovered)} of `
          + `${String(row.occupied)} solid voxels uncovered`),
      'these sidecars leave drawn geometry with no collider behind it',
    ).toEqual([]);
  });

  it('records that every sidecar collider is still hand-written', () => {
    // Every shape in the book is a primitive somebody typed. `decomposeVoxelsV1`
    // can now derive an exact box set from a model's own cells, and the chain
    // uses it, but no sidecar does yet. This test is the standing reminder:
    // when a sidecar becomes derived, its entry leaves this count.
    const shapes = Object.values(book)
      .flatMap((asset) => asset.colliders.map((collider) => collider.shape.kind));

    expect(new Set(shapes), 'only hand-written primitives so far')
      .toEqual(new Set(['box']));
    expect(shapes.length).toBeGreaterThan(0);
  });
});
