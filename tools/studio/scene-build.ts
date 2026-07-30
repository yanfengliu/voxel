import type { RenderSnapshotV1 } from '../../src/core/index.js';

import { buildSnapshot, filledGridBoundsV1 } from './build.js';
import { setVoxelSize } from './edit.js';
import { modelVoxelSizeV1, type GenomeIssueV1 } from './model.js';
import { buildRecipe, mixSeed, type PartShelfV1, type RecipeBookV1 } from './recipe.js';
import { validateSceneV1, type ScenePlacementV1, type SceneV1 } from './scene.js';

/**
 * Turns a scene into one render snapshot the engine draws in a single world.
 * Each distinct model is built and meshed once, then placed as instances — so a
 * street of the same house is one geometry and many transforms, not many
 * copies. Every model keeps its own grain (voxel size), so a fine flower and a
 * coarse building stand side by side without one grid trying to hold two
 * resolutions. This is the mechanism the studio's scene view and editor drive,
 * and it is pure: the same scene builds the same snapshot every time.
 *
 * It reuses the model builder rather than re-meshing: a placed model's geometry
 * and material are exactly the ones the studio shows for that model on its own,
 * re-keyed and re-instanced. That keeps a model in a scene identical to the
 * model by itself, which is the whole point of a scene being an arrangement of
 * finished models. Two stated exceptions, both about water: a translucent
 * placement never draws study edges, and a recipe declared 'top-film' meshes
 * as only its up-facing skin — in both cases the full look would paint tile
 * seams through what a scene presents as one continuous liquid. The third
 * water device lives past this builder, in the scene session's runtime
 * decoration: every translucent material is marked single-layer so all of a
 * scene's water blends exactly once per pixel behind a depth-only prepass.
 */

const SCENE_WORLD_ID = 'world:maker-scene';

export interface SceneLookV1 {
  readonly edges?: boolean;
  readonly lit?: boolean;
  readonly wireframe?: boolean;
}

export class SceneBuildError extends Error {
  constructor(readonly issues: readonly GenomeIssueV1[]) {
    super(`Scene cannot build: ${issues.map((i) => `${i.path} ${i.message}`).join('; ')}`);
    this.name = 'SceneBuildError';
  }
}

/**
 * A column-major transform that rotates a placement by quarter-turns about the
 * up axis and sets it at its world spot. The grain is already baked into the
 * geometry, so an instance carries only place and turn — never scale — which
 * keeps rotation exact and the same model shareable across placements.
 */
function writePlacementMatrix(
  target: Float32Array,
  offset: number,
  at: readonly [number, number, number],
  turns: number,
): void {
  const quarter = ((turns % 4) + 4) % 4;
  const cos = quarter === 0 ? 1 : quarter === 2 ? -1 : 0;
  const sin = quarter === 1 ? 1 : quarter === 3 ? -1 : 0;
  target[offset] = cos; target[offset + 1] = 0; target[offset + 2] = -sin; target[offset + 3] = 0;
  target[offset + 4] = 0; target[offset + 5] = 1; target[offset + 6] = 0; target[offset + 7] = 0;
  target[offset + 8] = sin; target[offset + 9] = 0; target[offset + 10] = cos; target[offset + 11] = 0;
  target[offset + 12] = at[0]; target[offset + 13] = at[1]; target[offset + 14] = at[2]; target[offset + 15] = 1;
}

/** Repeats one instance's animation array across `count` instances. */
function tile(source: Float32Array, count: number): Float32Array {
  const out = new Float32Array(source.length * count);
  for (let i = 0; i < count; i += 1) out.set(source, i * source.length);
  return out;
}

type SceneAnimation = NonNullable<RenderSnapshotV1['batches'][number]['animation']>;

/** The model's per-instance motion, tiled so every placement of it moves alike. */
function tileAnimation(one: SceneAnimation, count: number): SceneAnimation {
  return {
    schemaVersion: one.schemaVersion,
    ...(one.rotationMode === undefined ? {} : { rotationMode: one.rotationMode }),
    periodsMs: tile(one.periodsMs, count),
    phasesRadians: tile(one.phasesRadians, count),
    translationAmplitudes: tile(one.translationAmplitudes, count),
    rotationAmplitudesRadians: tile(one.rotationAmplitudesRadians, count),
    scaleAmplitudes: tile(one.scaleAmplitudes, count),
  };
}

/** Generous world limits for a scene: many models and many instances, still within the engine's hard ceilings. */
function sceneDescriptor(id: string): RenderSnapshotV1['descriptor'] {
  return {
    schemaVersion: 'voxel.world/1',
    worldId: SCENE_WORLD_ID,
    epoch: `epoch:scene:${id}`,
    coordinates: {
      handedness: 'right',
      upAxis: '+y',
      forwardAxis: '-z',
      chunkRounding: 'floor',
      metersPerWorldUnit: 1,
      worldUnitsPerVoxel: { x: 1, y: 1, z: 1 },
    },
    colorEncoding: 'srgb8-straight-alpha',
    capabilities: ['geometry-resources', 'instance-batches'],
    limits: {
      maxResources: 2_048,
      maxPaletteEntries: 256,
      maxChunks: 4,
      maxBatches: 1_024,
      maxVoxelsPerChunk: 262_144,
      maxGeometryVertices: 2_000_000,
      maxGeometryIndices: 6_000_000,
      maxInstancesPerBatch: 100_000,
      maxTotalBytes: 256_000_000,
    },
  };
}

interface PlacementGroupV1 {
  readonly recipe: RecipeBookV1[string];
  readonly grain: number;
  /** The placement seed shared by this group; 0 means the model's own version. */
  readonly seed: number;
  /** The placement opacity shared by this group; 1 means fully opaque. */
  readonly opacity: number;
  readonly placements: ScenePlacementV1[];
}

export function buildSceneSnapshot(
  scene: SceneV1,
  recipes: RecipeBookV1,
  parts: PartShelfV1,
  look: SceneLookV1 = {},
  revision = 1,
): RenderSnapshotV1 {
  const issues = validateSceneV1(scene);
  if (issues.length > 0) throw new SceneBuildError(issues);

  // Group by model and grain so identical placements share one geometry.
  // A Map keeps first-seen order, which keeps the snapshot deterministic.
  const groups = new Map<string, PlacementGroupV1>();
  const missing: GenomeIssueV1[] = [];
  scene.placements.forEach((placement, index) => {
    const recipe = recipes[placement.model];
    if (!recipe) {
      missing.push({
        path: `$.placements[${String(index)}].model`,
        message: `No model in the book is called '${placement.model}'.`,
      });
      return;
    }
    const grain = placement.grain ?? modelVoxelSizeV1(recipe);
    const seed = placement.seed ?? 0;
    const opacity = placement.opacity ?? 1;
    // Placements that share a model, grain, seed, and opacity build the same
    // geometry and material, so they group and instance together; a different
    // seed builds its own body, and a different opacity needs its own material.
    const key = `${placement.model}@${String(grain)}@${String(seed)}@${String(opacity)}`;
    const group = groups.get(key);
    if (group) group.placements.push(placement);
    else groups.set(key, { recipe, grain, seed, opacity, placements: [placement] });
  });
  if (missing.length > 0) throw new SceneBuildError(missing);

  const resources: RenderSnapshotV1['resources'][number][] = [];
  const batches: RenderSnapshotV1['batches'][number][] = [];
  let index = 0;
  for (const group of groups.values()) {
    // The placed model is exactly the model shown on its own, at this grain.
    // The whole book is the resolver, so a placed recipe that itself nests
    // sub-recipes (a flower pot placing pots and flowers) builds correctly.
    // Fold the placement seed into the recipe's own, so a seed-varying recipe
    // builds a different body here while a seed of 0 leaves it unchanged.
    const seeded = group.seed === 0
      ? group.recipe
      : { ...group.recipe, seed: mixSeed(group.recipe.seed, group.seed) };
    let model = buildRecipe(seeded, parts, recipes).model;
    if (modelVoxelSizeV1(model) !== group.grain) model = setVoxelSize(model, group.grain);
    // Translucent water never draws study edges: outlines exist to separate
    // faces on flat colour, and through a see-through liquid they read as
    // seams cutting one body into tiles. The solid world keeps the toggle.
    // A recipe declared 'top-film' meshes as just its up-facing skin here,
    // because a scene is where the body the film rides on actually exists.
    const built = buildSnapshot(model, {
      revision: 1,
      ...(group.opacity < 1
        ? { edges: false }
        : look.edges === undefined ? {} : { edges: look.edges }),
      ...(look.lit === undefined ? {} : { lit: look.lit }),
      ...(look.wireframe === undefined ? {} : { wireframe: look.wireframe }),
      ...(group.recipe.surface === undefined ? {} : { surface: group.recipe.surface }),
    });
    const geometry = built.resources.find((resource) => resource.kind === 'geometry');
    const material = built.resources.find((resource) => resource.kind === 'material');
    const sourceBatch = built.batches[0];
    // An empty model draws nothing; it simply contributes no body to the scene.
    if (geometry?.kind !== 'geometry' || material?.kind !== 'material' || !sourceBatch) continue;
    const filled = filledGridBoundsV1(model);
    if (filled === null) continue;

    const geometryKey = `geometry:${String(index)}`;
    const materialKey = `material:${String(index)}`;
    resources.push({
      ...geometry,
      key: geometryKey,
      incarnation: 1,
      revision,
      groups: geometry.groups.map((entry) => ({ ...entry, materialKey })),
    });
    // A translucent group carries the model's own material at the placement's
    // declared opacity. The presenter marks any sub-one opacity transparent,
    // and opaque geometry draws first, so what stands inside or behind the
    // water stays visible through it.
    resources.push({
      ...material,
      key: materialKey,
      incarnation: 1,
      revision,
      ...(group.opacity < 1
        ? { transparent: true, opacity: material.opacity * group.opacity }
        : {}),
    });

    const count = group.placements.length;
    const matrices = new Float32Array(count * 16);
    const instanceKeys: string[] = [];
    // A scene stands the occupied voxel solid on the floor. Presentation-only
    // face outlines extend past that solid, so deriving the lift from meshed
    // bounds would move every instance when edges are toggled and would make an
    // authoritative pose replay depend on a view preference.
    const baseLift = (
      (filled.max.y - filled.min.y + 1) * modelVoxelSizeV1(model)
    ) / 2;
    group.placements.forEach((placement, slot) => {
      writePlacementMatrix(
        matrices,
        slot * 16,
        [placement.at[0], placement.at[1] + baseLift, placement.at[2]],
        placement.turns ?? 0,
      );
      instanceKeys.push(placement.id);
    });
    batches.push({
      key: `batch:${String(index)}`,
      incarnation: 1,
      revision,
      geometryKey,
      materialKey,
      instanceKeys,
      matrices,
      ...(sourceBatch.animation ? { animation: tileAnimation(sourceBatch.animation, count) } : {}),
    });
    index += 1;
  }

  return {
    schemaVersion: 'voxel.render-snapshot/1',
    descriptor: sceneDescriptor(scene.id),
    revision,
    resources,
    chunks: [],
    batches,
  };
}
