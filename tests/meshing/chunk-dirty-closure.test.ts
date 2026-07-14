import { describe, expect, it } from 'vitest';

import type {
  MaterialResourceV1,
  PaletteResourceV1,
  UniformVoxelChunkProfileV1,
  VoxelChunkV1,
} from '../../src/core/index.js';
import {
  ChunkIndexV1,
  DEFAULT_MAX_CHUNK_INVALIDATION_CHANGES_V1,
  FACE_NEIGHBOR_OFFSETS_V1,
  deriveChunkDirtyClosureV1,
} from '../../src/meshing/index.js';

const profile: UniformVoxelChunkProfileV1 = {
  layout: 'uniform-grid',
  size: { x: 1, y: 1, z: 1 },
  gridOrigin: { x: 0, y: 0, z: 0 },
  emptyPaletteIndex: 0,
  surfaceModel: 'opaque',
  missingNeighbor: 'empty',
};

interface Coordinate {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

function chunk(
  key: string,
  coordinate: Coordinate,
  voxel = 1,
  paletteKey = 'palette:terrain',
  materialKey = 'material:terrain',
): VoxelChunkV1 {
  return {
    key,
    incarnation: 1,
    revision: 1,
    origin: { ...coordinate },
    size: { x: 1, y: 1, z: 1 },
    voxels: new Uint16Array([voxel]),
    paletteKey,
    materialKey,
  };
}

function palette(
  key: string,
  colors: readonly (readonly [number, number, number, number])[],
): PaletteResourceV1 {
  return {
    kind: 'palette',
    key,
    incarnation: 1,
    revision: 1,
    entries: colors.map(([r, g, b, a]) => ({ color: { r, g, b, a } })),
  };
}

function material(key: string): MaterialResourceV1 {
  return {
    kind: 'material',
    key,
    incarnation: 1,
    revision: 1,
    shading: 'lambert',
    color: { r: 255, g: 255, b: 255, a: 255 },
    vertexColors: true,
    transparent: false,
    opacity: 1,
    doubleSided: false,
    roughness: 1,
    metalness: 0,
  };
}

function coordinates(result: ReturnType<typeof deriveChunkDirtyClosureV1>): string[][] {
  return result.groups.map((group) => group.targets.map((target) => target.coordinateKey));
}

function target(
  result: ReturnType<typeof deriveChunkDirtyClosureV1>,
  coordinateKey: string,
) {
  return result.groups.flatMap((group) => group.targets)
    .find((candidate) => candidate.coordinateKey === coordinateKey);
}

describe('deriveChunkDirtyClosureV1', () => {
  it('rebuilds the source and all six declared reverse-dependency boundaries', () => {
    const center = chunk('center', { x: 0, y: 0, z: 0 });
    const neighbors = FACE_NEIGHBOR_OFFSETS_V1.map((offset, index) => chunk(
      `neighbor:${String(index)}`,
      offset,
    ));
    const oldIndex = ChunkIndexV1.build(profile, [center, ...neighbors]);
    const changedCenter = { ...center, revision: 2, voxels: new Uint16Array([2]) };
    const newIndex = ChunkIndexV1.build(profile, [changedCenter, ...neighbors], oldIndex);
    const result = deriveChunkDirtyClosureV1({
      oldIndex,
      newIndex,
      dependencyOffsets: FACE_NEIGHBOR_OFFSETS_V1,
      changes: { chunkKeys: ['center'] },
    });

    expect(result.groups).toHaveLength(1);
    expect(result.targetCount).toBe(7);
    expect(new Set(coordinates(result)[0])).toEqual(new Set([
      '0,0,0', '-1,0,0', '1,0,0', '0,-1,0', '0,1,0', '0,0,-1', '0,0,1',
    ]));
    expect(target(result, '0,0,0')).toMatchObject({
      direct: true,
      invalidation: 'topology',
      reasons: ['chunk-updated'],
    });
    for (const neighbor of neighbors) {
      const coordinateKey = [
        String(neighbor.origin.x),
        String(neighbor.origin.y),
        String(neighbor.origin.z),
      ].join(',');
      expect(target(result, coordinateKey))
        .toMatchObject({
          direct: false,
          invalidation: 'topology',
          reasons: ['dependency-changed'],
        });
    }
  });

  it('derives create and delete closures from old/new availability', () => {
    const center = chunk('center', { x: 0, y: 0, z: 0 });
    const right = chunk('right', { x: 1, y: 0, z: 0 });
    const beforeCreate = ChunkIndexV1.build(profile, [center]);
    const afterCreate = ChunkIndexV1.build(profile, [center, right], beforeCreate);
    const created = deriveChunkDirtyClosureV1({
      oldIndex: beforeCreate,
      newIndex: afterCreate,
      dependencyOffsets: FACE_NEIGHBOR_OFFSETS_V1,
      changes: { chunkKeys: ['right'] },
    });
    expect(coordinates(created)).toEqual([['0,0,0', '1,0,0']]);
    expect(target(created, '1,0,0')).toMatchObject({
      direct: true,
      reasons: ['chunk-created'],
    });
    expect(target(created, '1,0,0')?.oldEntry).toBeUndefined();

    const afterDelete = ChunkIndexV1.build(profile, [center], afterCreate);
    const deleted = deriveChunkDirtyClosureV1({
      oldIndex: afterCreate,
      newIndex: afterDelete,
      dependencyOffsets: FACE_NEIGHBOR_OFFSETS_V1,
      changes: { chunkKeys: ['right'] },
    });
    expect(coordinates(deleted)).toEqual([['0,0,0', '1,0,0']]);
    expect(target(deleted, '1,0,0')).toMatchObject({
      direct: true,
      reasons: ['chunk-deleted'],
    });
    expect(target(deleted, '1,0,0')?.newEntry).toBeUndefined();
  });

  it('keeps distant moved-from and moved-to closures separate', () => {
    const mover = chunk('mover', { x: -3, y: 0, z: 0 });
    const oldNeighbor = chunk('old-neighbor', { x: -2, y: 0, z: 0 });
    const newNeighbor = chunk('new-neighbor', { x: 2, y: 0, z: 0 });
    const oldIndex = ChunkIndexV1.build(profile, [mover, oldNeighbor, newNeighbor]);
    const moved = { ...mover, revision: 2, origin: { x: 3, y: 0, z: 0 } };
    const newIndex = ChunkIndexV1.build(profile, [moved, oldNeighbor, newNeighbor], oldIndex);
    const result = deriveChunkDirtyClosureV1({
      oldIndex,
      newIndex,
      dependencyOffsets: FACE_NEIGHBOR_OFFSETS_V1,
      changes: { chunkKeys: ['mover'] },
    });

    expect(coordinates(result)).toEqual([
      ['-3,0,0', '-2,0,0'],
      ['2,0,0', '3,0,0'],
    ]);
    expect(target(result, '-3,0,0')?.reasons).toEqual(['chunk-moved-from']);
    expect(target(result, '3,0,0')?.reasons).toEqual(['chunk-moved-to']);
  });

  it('treats unavailable-to-present neighbor creation as a topology dependency change', () => {
    const unavailableProfile = { ...profile, missingNeighbor: 'unavailable' as const };
    const center = chunk('center', { x: 0, y: 0, z: 0 });
    const right = chunk('right', { x: 1, y: 0, z: 0 });
    const oldIndex = ChunkIndexV1.build(unavailableProfile, [center]);
    const newIndex = ChunkIndexV1.build(unavailableProfile, [center, right], oldIndex);
    const result = deriveChunkDirtyClosureV1({
      oldIndex,
      newIndex,
      dependencyOffsets: FACE_NEIGHBOR_OFFSETS_V1,
      changes: { chunkKeys: ['right'] },
    });

    expect(target(result, '0,0,0')).toMatchObject({
      direct: false,
      invalidation: 'topology',
      reasons: ['dependency-changed'],
    });
  });

  it('separates palette attributes, opacity topology, and material-only rebinds', () => {
    const left = chunk('left', { x: 0, y: 0, z: 0 });
    const right = chunk('right', { x: 1, y: 0, z: 0 });
    const index = ChunkIndexV1.build(profile, [left, right]);
    const oldPalette = palette('palette:terrain', [
      [0, 0, 0, 0],
      [20, 40, 60, 255],
    ]);
    const recolored = palette('palette:terrain', [
      [255, 255, 255, 255],
      [21, 41, 61, 255],
    ]);
    const attributes = deriveChunkDirtyClosureV1({
      oldIndex: index,
      newIndex: index,
      dependencyOffsets: FACE_NEIGHBOR_OFFSETS_V1,
      changes: {
        paletteChanges: [{ key: oldPalette.key, before: oldPalette, after: recolored }],
      },
    });
    expect(coordinates(attributes)).toEqual([['0,0,0'], ['1,0,0']]);
    expect(target(attributes, '0,0,0')).toMatchObject({
      invalidation: 'attributes',
      reasons: ['palette-attributes'],
    });

    const transparent = palette('palette:terrain', [
      [0, 0, 0, 0],
      [20, 40, 60, 100],
    ]);
    const topology = deriveChunkDirtyClosureV1({
      oldIndex: index,
      newIndex: index,
      dependencyOffsets: FACE_NEIGHBOR_OFFSETS_V1,
      changes: {
        paletteChanges: [{ key: oldPalette.key, before: oldPalette, after: transparent }],
      },
    });
    expect(coordinates(topology)).toEqual([['0,0,0', '1,0,0']]);
    expect(target(topology, '0,0,0')?.invalidation).toBe('topology');
    expect(target(topology, '1,0,0')?.invalidation).toBe('topology');

    const rebound = deriveChunkDirtyClosureV1({
      oldIndex: index,
      newIndex: index,
      dependencyOffsets: FACE_NEIGHBOR_OFFSETS_V1,
      changes: { materialChanges: [{ key: material('material:terrain').key }] },
    });
    expect(coordinates(rebound)).toEqual([['0,0,0'], ['1,0,0']]);
    expect(target(rebound, '0,0,0')).toMatchObject({
      invalidation: 'material-only',
      reasons: ['material-rebound'],
    });
  });

  it('classifies chunk palette and material binding changes without topology rebuilds', () => {
    const before = chunk('center', { x: 0, y: 0, z: 0 });
    const oldIndex = ChunkIndexV1.build(profile, [before]);
    const after = {
      ...before,
      revision: 2,
      voxels: new Uint16Array(before.voxels),
      paletteKey: 'palette:other',
      materialKey: 'material:other',
    };
    const newIndex = ChunkIndexV1.build(profile, [after], oldIndex);
    const result = deriveChunkDirtyClosureV1({
      oldIndex,
      newIndex,
      dependencyOffsets: FACE_NEIGHBOR_OFFSETS_V1,
      changes: { chunkKeys: ['center'] },
    });

    expect(result.targetCount).toBe(1);
    expect(target(result, '0,0,0')).toMatchObject({
      invalidation: 'attributes',
      reasons: ['palette-rebound', 'material-rebound'],
    });
  });

  it('treats a revision-only chunk update as a direct dependency-identity change', () => {
    const center = chunk('center', { x: 0, y: 0, z: 0 });
    const right = chunk('right', { x: 1, y: 0, z: 0 });
    const oldIndex = ChunkIndexV1.build(profile, [center, right]);
    const revised = { ...center, revision: 2, voxels: new Uint16Array(center.voxels) };
    const newIndex = ChunkIndexV1.build(profile, [revised, right], oldIndex);
    const result = deriveChunkDirtyClosureV1({
      oldIndex,
      newIndex,
      dependencyOffsets: FACE_NEIGHBOR_OFFSETS_V1,
      changes: { chunkKeys: ['center'] },
    });

    expect(coordinates(result)).toEqual([['0,0,0', '1,0,0']]);
    expect(target(result, '0,0,0')?.reasons).toEqual(['chunk-updated']);
  });

  it('unions only overlapping closures and emits canonical groups independent of input order', () => {
    const chunks = [0, 1, 2, 3, 10].map((x) => chunk(`chunk:${String(x)}`, { x, y: 0, z: 0 }));
    const oldIndex = ChunkIndexV1.build(profile, chunks);
    const changed = chunks.map((value) => value.key === 'chunk:0' || value.key === 'chunk:2'
      ? { ...value, revision: 2, voxels: new Uint16Array([2]) }
      : value);
    const newIndex = ChunkIndexV1.build(profile, changed, oldIndex);
    const forward = deriveChunkDirtyClosureV1({
      oldIndex,
      newIndex,
      dependencyOffsets: FACE_NEIGHBOR_OFFSETS_V1,
      changes: { chunkKeys: ['chunk:0', 'chunk:2'] },
    });
    const reverse = deriveChunkDirtyClosureV1({
      oldIndex,
      newIndex,
      dependencyOffsets: [...FACE_NEIGHBOR_OFFSETS_V1].reverse(),
      changes: { chunkKeys: ['chunk:2', 'chunk:0'] },
    });

    expect(coordinates(forward)).toEqual([['0,0,0', '1,0,0', '2,0,0', '3,0,0']]);
    expect(coordinates(reverse)).toEqual(coordinates(forward));
    expect(forward.groups.map((group) => group.groupKey))
      .toEqual(reverse.groups.map((group) => group.groupKey));
    expect(target(forward, '1,0,0')).toMatchObject({
      direct: false,
      reasons: ['dependency-changed'],
    });
    expect(target(forward, '10,0,0')).toBeUndefined();
  });

  it('does not recursively expand a derived dependency target', () => {
    const chunks = [0, 1, 2].map((x) => chunk(`chunk:${String(x)}`, { x, y: 0, z: 0 }));
    const oldIndex = ChunkIndexV1.build(profile, chunks);
    const newIndex = ChunkIndexV1.build(profile, [
      { ...chunks[0]!, revision: 2, voxels: new Uint16Array([2]) },
      chunks[1]!,
      chunks[2]!,
    ], oldIndex);
    const result = deriveChunkDirtyClosureV1({
      oldIndex,
      newIndex,
      dependencyOffsets: [{ x: 1, y: 0, z: 0 }],
      changes: { chunkKeys: ['chunk:0'] },
    });

    // A source depends on source + offset. Changing 0 invalidates source -1,
    // which is absent; source +1 must not be reached by recursively expanding.
    expect(coordinates(result)).toEqual([['0,0,0']]);
    expect(target(result, '1,0,0')).toBeUndefined();
    expect(target(result, '2,0,0')).toBeUndefined();
  });

  it('rejects ambiguous, duplicate, unsafe, and over-budget change sets', () => {
    const center = chunk('center', { x: 0, y: 0, z: 0 });
    const oldIndex = ChunkIndexV1.build(profile, [center]);
    const changed = { ...center, revision: 2, voxels: new Uint16Array([2]) };
    const newIndex = ChunkIndexV1.build(profile, [changed], oldIndex);
    const common = { oldIndex, newIndex, dependencyOffsets: FACE_NEIGHBOR_OFFSETS_V1 };

    expect(() => deriveChunkDirtyClosureV1({
      ...common,
      changes: { chunkKeys: ['missing'] },
    })).toThrow(/neither index/);
    expect(() => deriveChunkDirtyClosureV1({
      ...common,
      changes: { chunkKeys: ['center', 'center'] },
    })).toThrow(/duplicate key/);
    expect(() => deriveChunkDirtyClosureV1({
      ...common,
      dependencyOffsets: [{ x: 1, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }],
      changes: { chunkKeys: ['center'] },
    })).toThrow(/duplicate offset/);
    expect(() => deriveChunkDirtyClosureV1({
      ...common,
      changes: { chunkKeys: ['center'] },
      limits: { maxTargets: 1 },
    })).not.toThrow();
    const right = chunk('right', { x: 1, y: 0, z: 0 });
    const oldWithNeighbor = ChunkIndexV1.build(profile, [center, right]);
    const changedRight = { ...right, revision: 2, voxels: new Uint16Array([2]) };
    const newWithNeighbor = ChunkIndexV1.build(
      profile,
      [changed, changedRight],
      oldWithNeighbor,
    );
    expect(() => deriveChunkDirtyClosureV1({
      oldIndex: oldWithNeighbor,
      newIndex: newWithNeighbor,
      dependencyOffsets: FACE_NEIGHBOR_OFFSETS_V1,
      changes: { chunkKeys: ['center', 'right'] },
      limits: { maxVoxelComparisons: 1 },
    })).toThrow(/voxel comparisons/);
    expect(() => deriveChunkDirtyClosureV1({
      oldIndex: oldWithNeighbor,
      newIndex: newWithNeighbor,
      dependencyOffsets: FACE_NEIGHBOR_OFFSETS_V1,
      changes: { chunkKeys: ['center'] },
      limits: { maxTargets: 1 },
    })).toThrow(/target count/);
    expect(() => deriveChunkDirtyClosureV1({
      ...common,
      changes: { chunkKeys: ['center'] },
      limits: { maxDependencyChecks: 5 },
    })).toThrow(/dependency checks/);
    expect(() => deriveChunkDirtyClosureV1({
      ...common,
      changes: { materialChanges: [{ key: 'material:terrain' }] },
      limits: { maxReferenceScans: 1 },
    })).toThrow(/reference scans/);
    expect(() => deriveChunkDirtyClosureV1({
      ...common,
      changes: { chunkKeys: ['center'], materialChanges: [{ key: 'material:terrain' }] },
      limits: { maxChanges: 1 },
    })).toThrow(/change count/);
    const sealedIndex = ChunkIndexV1.build(
      { ...profile, missingNeighbor: 'sealed' },
      [center],
    );
    expect(() => deriveChunkDirtyClosureV1({
      oldIndex,
      newIndex: sealedIndex,
      dependencyOffsets: FACE_NEIGHBOR_OFFSETS_V1,
      changes: { chunkKeys: ['center'] },
    })).toThrow(/profile lineage/);

    const oversized = [] as string[];
    oversized.length = DEFAULT_MAX_CHUNK_INVALIDATION_CHANGES_V1 + 1;
    expect(() => deriveChunkDirtyClosureV1({
      ...common,
      changes: { chunkKeys: oversized },
    })).toThrow(/change count/);
    const sparseKeys = new Array<string>(1);
    expect(() => deriveChunkDirtyClosureV1({
      ...common,
      changes: { chunkKeys: sparseKeys },
    })).toThrow(/dense/);
    const sparseOffsets = new Array<Coordinate>(1);
    expect(() => deriveChunkDirtyClosureV1({
      ...common,
      dependencyOffsets: sparseOffsets,
      changes: { chunkKeys: ['center'] },
    })).toThrow(/dense/);
  });
});
