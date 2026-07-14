import type { Int3V1 } from '../core/contracts.js';
import { FACE_NEIGHBOR_OFFSETS_V1 } from '../meshing/chunk-index.js';
import {
  MESHER_DESCRIPTOR_SCHEMA_V1,
  MESHER_INPUT_SCHEMA_V1,
  type MesherDependencyTokenV1,
  type MesherOutputBudgetV1,
  type PureMesherDescriptorV1,
  type PureMesherInputV1,
} from '../meshing/mesher-contract.js';
import {
  validatePureMesherDescriptorV1,
  validatePureMesherInputV1,
} from '../meshing/mesher-contract-validation.js';

export type MesherCorpusNameV1 =
  | 'empty'
  | 'solid'
  | 'hollow'
  | 'checkerboard'
  | 'staircase'
  | 'stripes'
  | 'negative-coordinate'
  | 'all-neighbor'
  | 'seeded-random'
  | 'aoe-like'
  | 'city-like'
  | 'column'
  | 'worst-output';

export interface MesherCorpusFixtureV1 {
  readonly name: MesherCorpusNameV1;
  readonly description: string;
  readonly seed: number | null;
  readonly input: PureMesherInputV1;
  readonly expectedSourceVoxelCount: number;
  readonly expectedExposedUnitFaceCount: number;
}

const CORPUS_OUTPUT_BUDGET: Readonly<MesherOutputBudgetV1> = Object.freeze({
  maxExposedUnitFaces: 100_000,
  maxVertices: 400_000,
  maxIndices: 600_000,
  maxPositionBytes: 4_800_000,
  maxNormalBytes: 4_800_000,
  maxPaletteIndexBytes: 800_000,
  maxMaterialIndexBytes: 1,
  maxTotalBytes: 12_800_000,
  maxMeshingWorkElements: 10_000_000,
  maxResultValidationElements: 20_000_000,
});

const RAW_CORPUS_DESCRIPTOR: PureMesherDescriptorV1 = {
  schemaVersion: MESHER_DESCRIPTOR_SCHEMA_V1,
  id: 'voxel.testing/opaque-corpus',
  version: '1',
  halo: {
    negative: { x: 1, y: 1, z: 1 },
    positive: { x: 1, y: 1, z: 1 },
  },
  dependencyOffsets: FACE_NEIGHBOR_OFFSETS_V1,
  attributes: {
    normals: 'flat-axis-aligned-f32x3',
    paletteIndices: 'per-vertex-u16',
    materialIndices: 'none',
    maxPaletteEntries: 65_536,
    maxMaterialEntries: 0,
  },
  limits: {
    maxSampleVoxels: 1_000_000,
    maxSampleBytes: 2_000_000,
    maxDependencyOffsets: 6,
    output: CORPUS_OUTPUT_BUDGET,
  },
};

const descriptorResult = validatePureMesherDescriptorV1(RAW_CORPUS_DESCRIPTOR);
if (!descriptorResult.ok) {
  throw new Error(`Invalid built-in mesher corpus descriptor: ${descriptorResult.issue.message}`);
}

/** Canonical descriptor shared by every frozen corpus fixture. */
export const MESHER_CORPUS_DESCRIPTOR_V1 = descriptorResult.value;

interface FixtureRecipe {
  readonly name: MesherCorpusNameV1;
  readonly description: string;
  readonly size: Int3V1;
  readonly coordinate?: Int3V1;
  readonly seed?: number;
  readonly source: (x: number, y: number, z: number) => number;
  readonly neighbor?: (x: number, y: number, z: number) => number;
  readonly presentDependencies?: boolean;
}

function sampleDimensions(size: Int3V1): Int3V1 {
  return {
    x: size.x
      + MESHER_CORPUS_DESCRIPTOR_V1.halo.negative.x
      + MESHER_CORPUS_DESCRIPTOR_V1.halo.positive.x,
    y: size.y
      + MESHER_CORPUS_DESCRIPTOR_V1.halo.negative.y
      + MESHER_CORPUS_DESCRIPTOR_V1.halo.positive.y,
    z: size.z
      + MESHER_CORPUS_DESCRIPTOR_V1.halo.negative.z
      + MESHER_CORPUS_DESCRIPTOR_V1.halo.positive.z,
  };
}

function sampleIndex(x: number, y: number, z: number, dimensions: Int3V1): number {
  return x + dimensions.x * (z + dimensions.z * y);
}

function createSampleVolume(recipe: FixtureRecipe): Uint16Array {
  const descriptor = MESHER_CORPUS_DESCRIPTOR_V1;
  const dimensions = sampleDimensions(recipe.size);
  const volume = new Uint16Array(dimensions.x * dimensions.y * dimensions.z);
  for (let sampleY = 0; sampleY < dimensions.y; sampleY += 1) {
    for (let sampleZ = 0; sampleZ < dimensions.z; sampleZ += 1) {
      for (let sampleX = 0; sampleX < dimensions.x; sampleX += 1) {
        const localX = sampleX - descriptor.halo.negative.x;
        const localY = sampleY - descriptor.halo.negative.y;
        const localZ = sampleZ - descriptor.halo.negative.z;
        const inSource = localX >= 0
          && localY >= 0
          && localZ >= 0
          && localX < recipe.size.x
          && localY < recipe.size.y
          && localZ < recipe.size.z;
        volume[sampleIndex(sampleX, sampleY, sampleZ, dimensions)] = inSource
          ? recipe.source(localX, localY, localZ)
          : (recipe.neighbor?.(localX, localY, localZ) ?? 0);
      }
    }
  }
  return volume;
}

function createDependencies(recipe: FixtureRecipe): readonly MesherDependencyTokenV1[] {
  return Object.freeze(MESHER_CORPUS_DESCRIPTOR_V1.dependencyOffsets.map((offset, index) => (
    recipe.presentDependencies
      ? Object.freeze({
          state: 'present' as const,
          offset,
          slotGeneration: 1,
          key: `neighbor-${recipe.name}-${String(index)}`,
          incarnation: 1,
          sourceRevision: 1,
        })
      : Object.freeze({
          state: 'missing' as const,
          offset,
          slotGeneration: 0,
          missingNeighbor: 'empty' as const,
        })
  )));
}

function sourceSample(
  sampleVolume: Uint16Array,
  size: Int3V1,
  x: number,
  y: number,
  z: number,
): number {
  const descriptor = MESHER_CORPUS_DESCRIPTOR_V1;
  const dimensions = sampleDimensions(size);
  return sampleVolume[sampleIndex(
    x + descriptor.halo.negative.x,
    y + descriptor.halo.negative.y,
    z + descriptor.halo.negative.z,
    dimensions,
  )]!;
}

function expectedCounts(sampleVolume: Uint16Array, size: Int3V1): {
  readonly voxels: number;
  readonly faces: number;
} {
  let voxels = 0;
  let faces = 0;
  for (let y = 0; y < size.y; y += 1) {
    for (let z = 0; z < size.z; z += 1) {
      for (let x = 0; x < size.x; x += 1) {
        if (sourceSample(sampleVolume, size, x, y, z) === 0) continue;
        voxels += 1;
        for (const offset of FACE_NEIGHBOR_OFFSETS_V1) {
          if (sourceSample(
            sampleVolume,
            size,
            x + offset.x,
            y + offset.y,
            z + offset.z,
          ) === 0) {
            faces += 1;
          }
        }
      }
    }
  }
  return { voxels, faces };
}

function createFixture(recipe: FixtureRecipe): MesherCorpusFixtureV1 {
  const sampleVolume = createSampleVolume(recipe);
  const rawInput: PureMesherInputV1 = {
    schemaVersion: MESHER_INPUT_SCHEMA_V1,
    mesherId: MESHER_CORPUS_DESCRIPTOR_V1.id,
    mesherVersion: MESHER_CORPUS_DESCRIPTOR_V1.version,
    dependencySignature: `voxel.testing/corpus-dependency/1:${recipe.name}`,
    source: {
      coordinate: recipe.coordinate ?? { x: 0, y: 0, z: 0 },
      slotGeneration: 1,
      key: `corpus-${recipe.name}`,
      incarnation: 1,
      sourceRevision: 1,
      size: recipe.size,
    },
    dependencies: createDependencies(recipe),
    missingNeighbor: 'empty',
    paletteEntryCount: 16,
    materialEntryCount: 0,
    sampleVolume,
    outputBudget: CORPUS_OUTPUT_BUDGET,
  };
  const validation = validatePureMesherInputV1(rawInput, MESHER_CORPUS_DESCRIPTOR_V1);
  if (!validation.ok) {
    throw new Error(`Invalid built-in fixture ${recipe.name}: ${validation.issue.message}`);
  }
  const counts = expectedCounts(sampleVolume, recipe.size);
  return Object.freeze({
    name: recipe.name,
    description: recipe.description,
    seed: recipe.seed ?? null,
    input: validation.value,
    expectedSourceVoxelCount: counts.voxels,
    expectedExposedUnitFaceCount: counts.faces,
  });
}

function seededRandomSource(seed: number): (x: number, y: number, z: number) => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state / 0x1_0000_0000 < 0.43 ? 1 + (state % 7) : 0;
  };
}

function recipes(): readonly FixtureRecipe[] {
  const seed = 0x5eeda11;
  return Object.freeze([
    {
      name: 'empty',
      description: 'No occupied source or halo cells.',
      size: { x: 4, y: 4, z: 4 },
      source: () => 0,
    },
    {
      name: 'solid',
      description: 'A completely solid rectangular source with empty neighbors.',
      size: { x: 4, y: 4, z: 4 },
      source: () => 1,
    },
    {
      name: 'hollow',
      description: 'A shell with both exterior and interior exposed faces.',
      size: { x: 5, y: 5, z: 5 },
      source: (x, y, z) => (
        x === 0 || y === 0 || z === 0 || x === 4 || y === 4 || z === 4 ? 2 : 0
      ),
    },
    {
      name: 'checkerboard',
      description: 'Alternating isolated cells exercise maximum local fragmentation.',
      size: { x: 5, y: 5, z: 5 },
      source: (x, y, z) => ((x + y + z) % 2 === 0 ? 3 : 0),
    },
    {
      name: 'staircase',
      description: 'A monotone stepped heightfield with long and short runs.',
      size: { x: 6, y: 6, z: 4 },
      source: (x, y, z) => (y <= Math.min(5, x + Math.floor(z / 2)) ? 4 : 0),
    },
    {
      name: 'stripes',
      description: 'Opaque palette stripes verify attribute preservation across mergeable faces.',
      size: { x: 6, y: 4, z: 6 },
      source: (x) => 1 + (x % 3),
    },
    {
      name: 'negative-coordinate',
      description: 'A source token in negative chunk space; geometry remains source-local.',
      size: { x: 3, y: 3, z: 3 },
      coordinate: { x: -7, y: -3, z: -11 },
      source: (x, y, z) => (x === y || z === 1 ? 5 : 0),
    },
    {
      name: 'all-neighbor',
      description: 'Every source boundary is occluded by all six present neighbors.',
      size: { x: 3, y: 3, z: 3 },
      source: () => 6,
      neighbor: () => 6,
      presentDependencies: true,
    },
    {
      name: 'seeded-random',
      description: 'Pinned pseudo-random occupancy and palette sequence.',
      size: { x: 6, y: 6, z: 6 },
      seed,
      source: seededRandomSource(seed),
    },
    {
      name: 'aoe-like',
      description: 'Stepped strategy terrain with palette-coded elevation bands.',
      size: { x: 8, y: 5, z: 8 },
      source: (x, y, z) => {
        const height = 1 + ((x * 3 + z * 5 + (x ^ z)) % 4);
        return y < height ? 1 + (height % 4) : 0;
      },
    },
    {
      name: 'city-like',
      description: 'Ground slab and separated block towers at varied heights.',
      size: { x: 8, y: 8, z: 8 },
      source: (x, y, z) => {
        if (y === 0) return 1;
        if (x % 3 === 2 || z % 3 === 2) return 0;
        const height = 2 + ((Math.floor(x / 3) * 3 + Math.floor(z / 3) * 5) % 6);
        return y < height ? 7 + ((x + z) % 3) : 0;
      },
    },
    {
      name: 'column',
      description: 'A tall one-voxel column stresses extremely thin output bounds.',
      size: { x: 1, y: 16, z: 1 },
      source: (_x, y) => 1 + (y % 5),
    },
    {
      name: 'worst-output',
      description: 'Large checkerboard where every occupied cell exposes all six faces.',
      size: { x: 8, y: 8, z: 8 },
      source: (x, y, z) => ((x + y + z) % 2 === 0 ? 11 : 0),
    },
  ]);
}

/** Returns allocation-fresh, byte-deterministic fixtures in frozen canonical order. */
export function createMesherCorpusV1(): readonly MesherCorpusFixtureV1[] {
  return Object.freeze(recipes().map(createFixture));
}
