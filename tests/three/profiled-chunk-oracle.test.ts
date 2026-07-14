import { describe, expect, it } from 'vitest';

import {
  DEFAULT_RENDER_TRANSACTION_LIMITS_V1,
  validateAndCopySnapshotV1,
} from '../../src/core/index.js';
import { meshProfiledSnapshotChunksInternal } from '../../src/three/profiledChunkOracle.js';
import { validSnapshot } from '../core/fixtures.js';

function profiledSnapshot(chunkCount: number) {
  const snapshot = validSnapshot();
  const source = snapshot.chunks[0]!;
  const candidate = {
    ...snapshot,
    descriptor: {
      ...snapshot.descriptor,
      chunkProfile: {
        layout: 'uniform-grid' as const,
        size: source.size,
        gridOrigin: { x: 0, y: 0, z: 0 },
        emptyPaletteIndex: 0 as const,
        surfaceModel: 'opaque' as const,
        missingNeighbor: 'empty' as const,
      },
      limits: {
        ...snapshot.descriptor.limits,
        maxChunks: chunkCount,
      },
    },
    chunks: Array.from({ length: chunkCount }, (_, index) => ({
      ...source,
      key: `chunk:${String(index)}`,
      origin: { x: index * source.size.x, y: 0, z: 0 },
      voxels: source.voxels.slice(),
    })),
  };
  const result = validateAndCopySnapshotV1(candidate);
  if (!result.ok) throw new Error(`${result.issue.code}: ${result.issue.path}`);
  return result.value;
}

describe('profiled snapshot synchronous oracle bridge', () => {
  it('meshes more than the legacy 512-chunk cap under declared budgets', () => {
    const world = meshProfiledSnapshotChunksInternal(profiledSnapshot(513));

    expect(world.chunks.size).toBe(513);
    expect(world.metrics.chunkCount).toBe(513);
    expect(world.metrics.outputBytes).toBeGreaterThan(0);
    expect(world.metrics.projectedCopiedSampleBytes).toBeLessThan(4_000_000);
    expect(world.metrics.projectedPreparationWorkElements).toBeLessThan(16_777_216);
    const last = world.chunks.get('chunk:512')!;
    expect(last.mesh.bounds).toEqual({ min: [0, 0, 0], max: [1, 1, 1] });
    expect(Math.min(...last.mesh.positions)).toBe(0);
    expect(Math.max(...last.mesh.positions)).toBe(1);
  });

  it('uses declared copied-byte and work ceilings instead of a fixed adapter count', () => {
    const snapshot = profiledSnapshot(2);
    expect(() => meshProfiledSnapshotChunksInternal({
      ...snapshot,
      descriptor: {
        ...snapshot.descriptor,
        limits: { ...snapshot.descriptor.limits, maxTotalBytes: 1 },
      },
    })).toThrow(/maxCopiedSampleBytes/);

    expect(() => meshProfiledSnapshotChunksInternal({
      ...snapshot,
      descriptor: {
        ...snapshot.descriptor,
        transactionLimits: {
          ...DEFAULT_RENDER_TRANSACTION_LIMITS_V1,
          maxValidationElements: 1,
        },
      },
    })).toThrow(/maxPreparationWorkElements/);
  });

  it('spends one aggregate ledger across index, halo, meshing, and result validation', () => {
    const snapshot = profiledSnapshot(2);
    const baseline = meshProfiledSnapshotChunksInternal(snapshot);
    const metrics = baseline.metrics;
    expect(metrics.totalWorkElements).toBe(
      metrics.indexBuildWorkElements
      + metrics.projectedPreparationWorkElements
      + metrics.meshingWorkElements
      + metrics.resultValidationWorkElements,
    );
    const withWorkLimit = (maxValidationElements: number) => ({
      ...snapshot,
      descriptor: {
        ...snapshot.descriptor,
        transactionLimits: {
          ...DEFAULT_RENDER_TRANSACTION_LIMITS_V1,
          maxValidationElements,
        },
      },
    });

    expect(meshProfiledSnapshotChunksInternal(
      withWorkLimit(metrics.totalWorkElements),
    ).metrics.totalWorkElements).toBe(metrics.totalWorkElements);
    expect(() => meshProfiledSnapshotChunksInternal(
      withWorkLimit(metrics.totalWorkElements - 1),
    )).toThrow(/combined world work budget/);
  });

  it('rejects an unfunded index before traversing the chunk collection', () => {
    const snapshot = profiledSnapshot(2);
    const chunks = new Proxy(snapshot.chunks, {
      get(target, property, receiver): unknown {
        if (property === Symbol.iterator) {
          throw new Error('index traversal occurred before work preflight');
        }
        return Reflect.get(target, property, receiver) as unknown;
      },
    });
    expect(() => meshProfiledSnapshotChunksInternal({
      ...snapshot,
      chunks,
      descriptor: {
        ...snapshot.descriptor,
        transactionLimits: {
          ...DEFAULT_RENDER_TRANSACTION_LIMITS_V1,
          maxValidationElements: 1,
        },
      },
    })).toThrow(/index build/);
  });
});
