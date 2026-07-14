import { describe, expect, it } from 'vitest';

import type {
  UniformVoxelChunkProfileV1,
  VoxelChunkV1,
} from '../../src/core/index.js';
import {
  ChunkIndexV1,
  DensePaletteChunk,
  INDEXED_VISIBLE_FACE_ORACLE_DEFAULT_OUTPUT_BUDGET_V1,
  VISIBLE_FACE_ORACLE_DESCRIPTOR_V1,
  meshIndexedVisibleFaceOracleV1,
  meshVisibleFaces,
  prepareIndexedVisibleFaceOracleInputV1,
  validateMesherOutputV1,
} from '../../src/meshing/index.js';
import {
  compareOrientedUnitFaceCoverageV1,
  createMesherCorpusV1,
  createExpectedOrientedUnitFaceCoverageV1,
  extractOrientedUnitFaceCoverageV1,
} from '../../src/testing/index.js';

const profile: UniformVoxelChunkProfileV1 = {
  layout: 'uniform-grid',
  size: { x: 2, y: 2, z: 2 },
  gridOrigin: { x: 0, y: 0, z: 0 },
  emptyPaletteIndex: 0,
  surfaceModel: 'opaque',
  missingNeighbor: 'empty',
};

function chunk(
  key: string,
  coordinate: { readonly x: number; readonly y: number; readonly z: number },
  voxels = new Uint16Array(8),
  revision = 1,
): VoxelChunkV1 {
  return {
    key,
    incarnation: 1,
    revision,
    origin: {
      x: coordinate.x * profile.size.x,
      y: coordinate.y * profile.size.y,
      z: coordinate.z * profile.size.z,
    },
    size: profile.size,
    voxels,
    paletteKey: 'palette:terrain',
    materialKey: 'material:terrain',
  };
}

const roomyPreparationLimits = {
  maxChunks: 10_000,
  maxCopiedSampleBytes: 100_000_000,
  maxPreparationWorkElements: 100_000_000,
} as const;

function prepare(
  index: ChunkIndexV1,
  sourceCoordinate = { x: 0, y: 0, z: 0 },
  overrides: Partial<Parameters<typeof prepareIndexedVisibleFaceOracleInputV1>[0]> = {},
) {
  return prepareIndexedVisibleFaceOracleInputV1({
    index,
    sourceCoordinate,
    worldId: 'world:test',
    epoch: 'epoch:test',
    materialPolicyVersion: 'opaque-v1',
    worldUnitsPerVoxel: { x: 1, y: 1, z: 1 },
    paletteEntryCount: 16,
    outputBudget: INDEXED_VISIBLE_FACE_ORACLE_DEFAULT_OUTPUT_BUDGET_V1,
    preparationLimits: roomyPreparationLimits,
    ...overrides,
  });
}

describe('indexed visible-face oracle', () => {
  it('declares enough validation work for its own maximum geometry shape', () => {
    const budget = INDEXED_VISIBLE_FACE_ORACLE_DEFAULT_OUTPUT_BUDGET_V1;
    const required = 64
      + budget.maxVertices * 3
      + budget.maxVertices * 3
      + budget.maxVertices
      + budget.maxIndices * 12;
    expect(budget.maxResultValidationElements).toBeGreaterThanOrEqual(required);
  });

  it('passes every frozen V-04 corpus case under the production oracle contract', () => {
    for (const fixture of createMesherCorpusV1()) {
      const input = {
        ...fixture.input,
        mesherId: VISIBLE_FACE_ORACLE_DESCRIPTOR_V1.id,
        mesherVersion: VISIBLE_FACE_ORACLE_DESCRIPTOR_V1.version,
      };
      const output = meshIndexedVisibleFaceOracleV1(input);
      expect(output.counts.sourceVoxelCount, fixture.name)
        .toBe(fixture.expectedSourceVoxelCount);
      expect(output.counts.exposedUnitFaceCount, fixture.name)
        .toBe(fixture.expectedExposedUnitFaceCount);
      expect(validateMesherOutputV1(
        output,
        VISIBLE_FACE_ORACLE_DESCRIPTOR_V1,
        input,
      ).ok, fixture.name).toBe(true);
    }
  });

  it('matches independent oriented-face truth with deterministic local topology', () => {
    const voxels = new Uint16Array([
      1, 2,
      0, 3,
      4, 0,
      5, 6,
    ]);
    const index = ChunkIndexV1.build(profile, [chunk('source', { x: 0, y: 0, z: 0 }, voxels)]);
    const prepared = prepare(index);

    const first = meshIndexedVisibleFaceOracleV1(prepared.input);
    const second = meshIndexedVisibleFaceOracleV1(prepared.input);
    const legacyOracle = meshVisibleFaces(new DensePaletteChunk({
      origin: { x: 0, y: 0, z: 0 },
      size: profile.size,
      voxels,
    }), { positionSpace: 'source-local' });
    expect(second.positions).toEqual(first.positions);
    expect(second.normals).toEqual(first.normals);
    expect(second.paletteIndices).toEqual(first.paletteIndices);
    expect(second.indices).toEqual(first.indices);
    expect(second.bounds).toEqual(first.bounds);
    expect(first.positions).toEqual(legacyOracle.positions);
    expect(first.normals).toEqual(legacyOracle.normals);
    expect(first.paletteIndices).toEqual(legacyOracle.paletteIndices);
    expect(first.indices).toEqual(legacyOracle.indices);

    const validated = validateMesherOutputV1(
      first,
      VISIBLE_FACE_ORACLE_DESCRIPTOR_V1,
      prepared.input,
    );
    expect(validated.ok).toBe(true);
    if (!validated.ok) return;
    const expected = createExpectedOrientedUnitFaceCoverageV1(
      prepared.input,
      VISIBLE_FACE_ORACLE_DESCRIPTOR_V1,
    );
    const actual = extractOrientedUnitFaceCoverageV1(validated.value);
    expect(compareOrientedUnitFaceCoverageV1(expected, actual)).toMatchObject({
      equal: true,
      missing: [],
      unexpected: [],
      attributeMismatches: [],
    });
  });

  it('copies face halos through the index and removes both sides of a solid seam', () => {
    const solid = new Uint16Array(8).fill(1);
    const left = chunk('left', { x: -1, y: 0, z: 0 }, solid);
    const right = chunk('right', { x: 0, y: 0, z: 0 }, solid);
    const index = ChunkIndexV1.build(profile, [left, right]);
    const leftPrepared = prepare(index, { x: -1, y: 0, z: 0 });
    const rightPrepared = prepare(index, { x: 0, y: 0, z: 0 });

    left.voxels.fill(0);
    right.voxels.fill(0);
    const leftMesh = meshIndexedVisibleFaceOracleV1(leftPrepared.input);
    const rightMesh = meshIndexedVisibleFaceOracleV1(rightPrepared.input);

    expect(leftMesh.counts.exposedUnitFaceCount).toBe(20);
    expect(rightMesh.counts.exposedUnitFaceCount).toBe(20);
    expect(leftPrepared.input.dependencies.some((token) => token.state === 'present')).toBe(true);
    expect(rightPrepared.input.dependencies.some((token) => token.state === 'present')).toBe(true);
    expect(leftPrepared.input.sampleVolume.buffer).not.toBe(left.voxels.buffer);
    expect(rightPrepared.input.sampleVolume.buffer).not.toBe(right.voxels.buffer);
  });

  it('materializes sealed missing faces as occluding halo samples', () => {
    const sealedProfile: UniformVoxelChunkProfileV1 = {
      ...profile,
      missingNeighbor: 'sealed',
    };
    const index = ChunkIndexV1.build(sealedProfile, [
      chunk('sealed', { x: 0, y: 0, z: 0 }, new Uint16Array(8).fill(1)),
    ]);
    const prepared = prepare(index);
    const mesh = meshIndexedVisibleFaceOracleV1(prepared.input);

    expect(prepared.input.missingNeighbor).toBe('sealed');
    expect(prepared.input.dependencies.every((token) => (
      token.state === 'missing' && token.missingNeighbor === 'sealed'
    ))).toBe(true);
    expect(mesh.counts.exposedUnitFaceCount).toBe(0);
    expect(mesh.bounds).toBeNull();
  });

  it('keeps negative-coordinate geometry source-local and puts scale in identity only', () => {
    const negativeProfile: UniformVoxelChunkProfileV1 = {
      ...profile,
      gridOrigin: { x: -6, y: 4, z: -10 },
    };
    const source = {
      ...chunk('negative', { x: 0, y: 0, z: 0 }, new Uint16Array(8).fill(1)),
      origin: { x: -10, y: 0, z: -14 },
    };
    const index = ChunkIndexV1.build(negativeProfile, [source]);
    const unit = prepare(index, { x: -2, y: -2, z: -2 });
    const anisotropic = prepare(index, { x: -2, y: -2, z: -2 }, {
      worldUnitsPerVoxel: { x: 0.5, y: 3, z: 7 },
    });

    const unitMesh = meshIndexedVisibleFaceOracleV1(unit.input);
    const anisotropicMesh = meshIndexedVisibleFaceOracleV1(anisotropic.input);
    expect(unitMesh.bounds).toEqual({ min: [0, 0, 0], max: [2, 2, 2] });
    expect(Math.min(...unitMesh.positions)).toBe(0);
    expect(Math.max(...unitMesh.positions)).toBe(2);
    expect(anisotropicMesh.positions).toEqual(unitMesh.positions);
    expect(anisotropic.input.dependencySignature).not.toBe(unit.input.dependencySignature);
  });

  it('rejects unavailable dependencies and output exhaustion before returning geometry', () => {
    const unavailableProfile: UniformVoxelChunkProfileV1 = {
      ...profile,
      missingNeighbor: 'unavailable',
    };
    const unavailable = ChunkIndexV1.build(unavailableProfile, [
      chunk('source', { x: 0, y: 0, z: 0 }, new Uint16Array(8).fill(1)),
    ]);
    expect(() => prepare(unavailable)).toThrow(/unavailable/);

    const index = ChunkIndexV1.build(profile, [
      chunk('source', { x: 0, y: 0, z: 0 }, new Uint16Array(8).fill(1)),
    ]);
    const prepared = prepare(index, { x: 0, y: 0, z: 0 }, {
      outputBudget: {
        ...INDEXED_VISIBLE_FACE_ORACLE_DEFAULT_OUTPUT_BUDGET_V1,
        maxExposedUnitFaces: 1,
      },
    });
    expect(() => meshIndexedVisibleFaceOracleV1(prepared.input)).toThrow(
      /maxExposedUnitFaces/,
    );
  });

  it('enforces every emitted output lane and deterministic work ceiling', () => {
    const oneVoxel = new Uint16Array(8);
    oneVoxel[0] = 1;
    const index = ChunkIndexV1.build(profile, [
      chunk('source', { x: 0, y: 0, z: 0 }, oneVoxel),
    ]);
    const exhausted = [
      ['maxExposedUnitFaces', 5],
      ['maxVertices', 23],
      ['maxIndices', 35],
      ['maxPositionBytes', 287],
      ['maxNormalBytes', 287],
      ['maxPaletteIndexBytes', 47],
      ['maxTotalBytes', 767],
      ['maxMeshingWorkElements', 27],
    ] as const;

    for (const [field, value] of exhausted) {
      const prepared = prepare(index, { x: 0, y: 0, z: 0 }, {
        outputBudget: {
          ...INDEXED_VISIBLE_FACE_ORACLE_DEFAULT_OUTPUT_BUDGET_V1,
          [field]: value,
        },
      });
      expect(() => meshIndexedVisibleFaceOracleV1(prepared.input)).toThrow(
        new RegExp(field),
      );
    }
  });

  it('accepts a zero-face budget for empty input and rejects the first emitted face', () => {
    const emptyIndex = ChunkIndexV1.build(profile, [
      chunk('empty', { x: 0, y: 0, z: 0 }),
    ]);
    const zeroFaceBudget = {
      ...INDEXED_VISIBLE_FACE_ORACLE_DEFAULT_OUTPUT_BUDGET_V1,
      maxExposedUnitFaces: 0,
      maxVertices: 0,
      maxIndices: 0,
      maxPositionBytes: 0,
      maxNormalBytes: 0,
      maxPaletteIndexBytes: 0,
      maxTotalBytes: 0,
    };
    const empty = prepare(emptyIndex, { x: 0, y: 0, z: 0 }, {
      outputBudget: zeroFaceBudget,
    });
    expect(meshIndexedVisibleFaceOracleV1(empty.input)).toMatchObject({
      bounds: null,
      counts: { sourceVoxelCount: 0, exposedUnitFaceCount: 0 },
    });

    const occupied = new Uint16Array(8);
    occupied[0] = 1;
    const occupiedIndex = ChunkIndexV1.build(profile, [
      chunk('occupied', { x: 0, y: 0, z: 0 }, occupied),
    ]);
    const full = prepare(occupiedIndex, { x: 0, y: 0, z: 0 }, {
      outputBudget: zeroFaceBudget,
    });
    expect(() => meshIndexedVisibleFaceOracleV1(full.input)).toThrow(
      /maxExposedUnitFaces/,
    );
  });

  it('preflights declared count, copied-byte, and work budgets before halo allocation', () => {
    const chunks = Array.from({ length: 700 }, (_, coordinateX) => (
      chunk(`chunk:${String(coordinateX)}`, { x: coordinateX, y: 0, z: 0 })
    ));
    const index = ChunkIndexV1.build(profile, chunks);
    const exactCopiedBytes = 700 * 4 * 4 * 4 * Uint16Array.BYTES_PER_ELEMENT;
    const exactWork = 700 * (4 * 4 * 4 + 6);

    const last = prepare(index, { x: 699, y: 0, z: 0 }, {
      preparationLimits: {
        maxChunks: 700,
        maxCopiedSampleBytes: exactCopiedBytes,
        maxPreparationWorkElements: exactWork,
      },
    });
    expect(last.metrics).toEqual({
      indexedChunkCount: 700,
      copiedSampleBytes: 128,
      preparationWorkElements: 70,
      projectedWorldCopiedSampleBytes: exactCopiedBytes,
      projectedWorldPreparationWorkElements: exactWork,
    });

    for (const field of [
      ['maxChunks', 699],
      ['maxCopiedSampleBytes', exactCopiedBytes - 1],
      ['maxPreparationWorkElements', exactWork - 1],
    ] as const) {
      expect(() => prepare(index, { x: 699, y: 0, z: 0 }, {
        preparationLimits: {
          maxChunks: field[0] === 'maxChunks' ? field[1] : 700,
          maxCopiedSampleBytes: field[0] === 'maxCopiedSampleBytes'
            ? field[1]
            : exactCopiedBytes,
          maxPreparationWorkElements: field[0] === 'maxPreparationWorkElements'
            ? field[1]
            : exactWork,
        },
      })).toThrow(new RegExp(field[0]));
    }
  });

  it('prepares a far lookup without reading unrelated indexed chunks', () => {
    const chunks = Array.from({ length: 4_096 }, (_, coordinateX) => (
      chunk(`chunk:${String(coordinateX)}`, { x: coordinateX, y: 0, z: 0 })
    ));
    const index = ChunkIndexV1.build(profile, chunks);
    Object.defineProperty(chunks[1_000]!, 'voxels', {
      configurable: true,
      get: () => { throw new Error('linear scan touched an unrelated chunk'); },
    });

    const prepared = prepare(index, { x: 4_095, y: 0, z: 0 });
    expect(prepared.input.source.key).toBe('chunk:4095');
    expect(prepared.input.dependencies.filter((token) => token.state === 'present'))
      .toHaveLength(1);
  });
});
