import { describe, expect, it } from 'vitest';

import {
  RENDER_DELTA_SCHEMA_V1,
  RenderWorld,
  type InstanceBatchV1,
  type RenderDeltaV1,
  type RenderOperationV1,
  type RenderSnapshotV1,
} from '../../src/core/index.js';
import { CanonicalRenderStateV1 } from '../../src/core/canonical-store.js';
import { prepareRenderDeltaInternal } from '../../src/core/delta-reducer.js';
import { INSTANCE_BATCH_PAGE_SIZE_INTERNAL } from '../../src/core/paged-instance-batch.js';
import { validateAndCopySnapshotV1 } from '../../src/core/snapshot-validation.js';
import {
  readRenderWorldOwnershipMetricsForTesting,
  resetRenderWorldOwnershipMetricsForTesting,
} from '../../src/testing/index.js';
import { validSnapshot } from './fixtures.js';

function matrices(count: number, seed = 0): Float32Array {
  const values = new Float32Array(count * 16);
  for (let index = 0; index < count; index += 1) {
    const offset = index * 16;
    values[offset] = 1;
    values[offset + 5] = 1;
    values[offset + 10] = 1;
    values[offset + 12] = seed + index;
    values[offset + 15] = 1;
  }
  return values;
}

function colors(count: number, seed = 0): Uint8Array {
  const values = new Uint8Array(count * 4);
  for (let index = 0; index < count; index += 1) {
    values.set([(seed + index) % 256, 2, 3, 255], index * 4);
  }
  return values;
}

function numberedBatch(count: number, revision = 1): InstanceBatchV1 {
  return {
    key: 'batch:triangle',
    incarnation: 1,
    revision,
    geometryKey: 'geometry:triangle',
    materialKey: 'material:terrain',
    instanceKeys: Array.from(
      { length: count },
      (_, index) => `instance:${String(index).padStart(6, '0')}`,
    ),
    matrices: matrices(count),
    colors: colors(count),
  };
}

function snapshotWithBatch(count: number, maxInstances = Math.max(1_024, count + 1)) {
  const snapshot = validSnapshot(1);
  const batch = numberedBatch(count);
  snapshot.batches = [{ ...batch, instanceKeys: [...batch.instanceKeys] }];
  snapshot.descriptor.limits.maxInstancesPerBatch = maxInstances;
  snapshot.descriptor.limits.maxTotalBytes = 64_000_000;
  snapshot.descriptor.transactionLimits = {
    maxOperations: 64,
    maxInstanceChanges: Math.max(1_024, count + 1),
    maxInputTypedArrayBytes: 64_000_000,
    maxValidationElements: 32_000_000,
    maxTombstones: 1_024,
    maxPresentationWaiters: 32,
  };
  return snapshot;
}

function delta(operations: readonly RenderOperationV1[]): RenderDeltaV1 {
  return {
    schemaVersion: RENDER_DELTA_SCHEMA_V1,
    worldId: 'world:test',
    epoch: 'epoch:one',
    baseRevision: 1,
    revision: 2,
    operations,
  };
}

function owned(snapshot: RenderSnapshotV1): CanonicalRenderStateV1 {
  const result = validateAndCopySnapshotV1(snapshot);
  if (!result.ok) throw new Error(`${result.issue.code}: ${result.issue.message}`);
  return CanonicalRenderStateV1.fromSnapshot(result.value);
}

function logicalTypedArrayBytes(snapshot: RenderSnapshotV1): number {
  let bytes = snapshot.chunks.reduce((total, chunk) => total + chunk.voxels.byteLength, 0);
  for (const resource of snapshot.resources) {
    if (resource.kind !== 'geometry') continue;
    bytes += resource.positions.byteLength + resource.normals.byteLength
      + (resource.uvs?.byteLength ?? 0) + (resource.colors?.byteLength ?? 0)
      + resource.indices.byteLength;
  }
  for (const batch of snapshot.batches) {
    bytes += batch.matrices.byteLength + (batch.colors?.byteLength ?? 0);
  }
  return bytes;
}

describe('paged canonical delta integration', () => {
  it.each([255, 256, 257])(
    'retains %i instances in fixed pages and materializes a compatible snapshot',
    (count) => {
      const source = snapshotWithBatch(count);
      const canonical = owned(source);
      expect(canonical.batchStateInternal('batch:triangle')?.pageCountInternal).toBe(
        Math.ceil(count / INSTANCE_BATCH_PAGE_SIZE_INTERNAL),
      );
      expect(canonical.snapshotView()).toEqual(source);
      expect(canonical.snapshotView()).not.toBe(canonical.snapshotView());
    },
  );

  it('patches both sides of the 255/256 boundary with exact page-copy metrics', () => {
    const canonical = owned(snapshotWithBatch(257));
    const prepared = prepareRenderDeltaInternal(canonical, delta([{
      op: 'patch-batch-instances',
      key: 'batch:triangle',
      incarnation: 1,
      revision: 2,
      removeInstanceKeys: [],
      upserts: {
        instanceKeys: ['instance:000255', 'instance:000256'],
        matrices: matrices(2, 900),
        colors: colors(2, 90),
      },
    }]));
    expect(prepared.status).toBe('prepared');
    if (prepared.status !== 'prepared') return;
    const update = prepared.prepared.pagedBatchPatches[0]!;
    expect(update.effect.dirtyPageIndices).toEqual([0, 1]);
    expect(update.metrics).toMatchObject({
      clonedPages: 2,
      allocatedPages: 0,
      clonedPageTypedArrayBytes: 2 * 256 * 68,
      writtenTypedArrayBytes: 2 * 68,
      copiedTypedArrayBytes: 2 * 256 * 68 + 2 * 68,
    });
    const value = prepared.prepared.candidate.batch('batch:triangle')!;
    expect(value.matrices[255 * 16 + 12]).toBe(900);
    expect(value.matrices[256 * 16 + 12]).toBe(901);
  });

  it('keeps sparse copy work independent of untouched pages and deduplicates retention', () => {
    const count = 25_600;
    const world = new RenderWorld();
    const snapshot = snapshotWithBatch(count);
    expect(world.acceptSnapshot(snapshot).status).toBe('accepted');
    expect(world.markPresented(1, 'epoch:one', 'world:test')).toBe(true);
    const retainedBefore = readRenderWorldOwnershipMetricsForTesting(world)
      .retainedTypedArrayBytes;
    resetRenderWorldOwnershipMetricsForTesting(world);

    expect(world.acceptDelta(delta([{
      op: 'patch-batch-instances',
      key: 'batch:triangle',
      incarnation: 1,
      revision: 2,
      removeInstanceKeys: [],
      upserts: {
        instanceKeys: ['instance:000000'],
        matrices: matrices(1, 700),
        colors: colors(1, 70),
      },
    }])).status).toBe('accepted');
    const metrics = readRenderWorldOwnershipMetricsForTesting(world);
    expect(metrics).toMatchObject({
      deltaInputTypedArrayBytes: 68,
      deltaCopiedTypedArrayBytes: 256 * 68 + 68,
      deltaCopyOperations: 2,
      retainedTypedArrayBytes: retainedBefore + 256 * 68,
    });
  });

  it('rejects growth of a live full batch before cloning a page', () => {
    const world = new RenderWorld();
    const snapshot = snapshotWithBatch(257, 257);
    expect(world.acceptSnapshot(snapshot).status).toBe('accepted');
    resetRenderWorldOwnershipMetricsForTesting(world);

    expect(world.acceptDelta(delta([{
      op: 'patch-batch-instances',
      key: 'batch:triangle',
      incarnation: 1,
      revision: 2,
      removeInstanceKeys: [],
      upserts: {
        instanceKeys: ['instance:new'],
        matrices: matrices(1, 500),
        colors: colors(1, 50),
      },
    }]))).toMatchObject({ status: 'rejected', code: 'limit.batch-instances' });
    expect(readRenderWorldOwnershipMetricsForTesting(world)).toMatchObject({
      deltaInputTypedArrayBytes: 68,
      deltaCopiedTypedArrayBytes: 0,
      deltaCopyOperations: 0,
    });
    expect(world.acceptedRevision).toBe(1);
  });

  it('rejects final maxTotalBytes overflow before cloning a page', () => {
    const world = new RenderWorld();
    const snapshot = snapshotWithBatch(256, 257);
    snapshot.descriptor.limits.maxTotalBytes = logicalTypedArrayBytes(snapshot);
    expect(world.acceptSnapshot(snapshot).status).toBe('accepted');
    resetRenderWorldOwnershipMetricsForTesting(world);

    expect(world.acceptDelta(delta([{
      op: 'patch-batch-instances',
      key: 'batch:triangle',
      incarnation: 1,
      revision: 2,
      removeInstanceKeys: [],
      upserts: {
        instanceKeys: ['instance:new'],
        matrices: matrices(1, 500),
        colors: colors(1, 50),
      },
    }]))).toMatchObject({ status: 'rejected', code: 'limit.total-bytes' });
    expect(readRenderWorldOwnershipMetricsForTesting(world)).toMatchObject({
      deltaInputTypedArrayBytes: 68,
      deltaCopiedTypedArrayBytes: 0,
      deltaCopyOperations: 0,
    });
    expect(world.acceptedRevision).toBe(1);
  });

  it('creates a paged full put only after validation and owns it independently', () => {
    const world = new RenderWorld();
    expect(world.acceptSnapshot(snapshotWithBatch(1)).status).toBe('accepted');
    resetRenderWorldOwnershipMetricsForTesting(world);
    const put = numberedBatch(257, 2);

    expect(world.acceptDelta(delta([{ op: 'put-batch', batch: put }])).status)
      .toBe('accepted');
    put.matrices.fill(999);
    put.colors!.fill(0);
    expect(world.acceptedSnapshot()?.batches[0]?.matrices[12]).toBe(0);
    expect(readRenderWorldOwnershipMetricsForTesting(world)).toMatchObject({
      deltaInputTypedArrayBytes: 257 * 68,
      deltaCopiedTypedArrayBytes: 257 * 68,
      deltaCopyOperations: 4,
    });
  });
});
