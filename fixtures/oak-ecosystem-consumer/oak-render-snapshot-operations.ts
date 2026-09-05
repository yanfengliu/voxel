import type {
  InstanceBatchV1,
  PatchBatchInstancesV1,
  RenderDeltaV1,
  RenderOperationV1,
  RenderSnapshotV1,
  VoxelChunkV1,
} from '../../src/core/index.js';
import type { OakRenderBatchDefinitionV1 } from './oak-render-batch-definitions.js';
import type { OakRenderFrameV1 } from './oak-render-adapter.js';
import type { OakRenderInstanceRecordV1 } from './oak-render-projection.js';
import { assertOakRenderFrameIntegrityV1 } from './oak-render-frame-integrity.js';

export function batchFromRecords(
  definition: OakRenderBatchDefinitionV1,
  records: readonly OakRenderInstanceRecordV1[],
  revision: number,
): InstanceBatchV1 {
  const matrices = new Float32Array(records.length * 16);
  const colors = new Uint8Array(records.length * 4);
  records.forEach((record, index) => {
    matrices.set(record.matrix, index * 16);
    colors.set([record.color.r, record.color.g, record.color.b, record.color.a], index * 4);
  });
  return {
    key: definition.key,
    incarnation: 1,
    revision,
    geometryKey: definition.geometryKey,
    materialKey: definition.materialKey,
    instanceKeys: records.map((record) => record.key),
    matrices,
    colors,
    presentation: {
      castShadow: definition.castShadow,
      receiveShadow: definition.receiveShadow,
    },
  };
}

export function recordsInPatchOrder(
  records: readonly OakRenderInstanceRecordV1[],
  previous: InstanceBatchV1 | undefined,
): readonly OakRenderInstanceRecordV1[] {
  if (previous === undefined) return records;
  if (records.length === previous.instanceKeys.length
    && records.every((record, index) => record.key === previous.instanceKeys[index])) {
    return records;
  }
  const byKey = new Map(records.map((record) => [record.key, record]));
  const retained = previous.instanceKeys.flatMap((key) => {
    const record = byKey.get(key);
    if (record !== undefined) byKey.delete(key);
    return record === undefined ? [] : [record];
  });
  const appended = [...byKey.values()].sort((left, right) =>
    left.key < right.key ? -1 : left.key > right.key ? 1 : 0);
  return [...retained, ...appended];
}

function arrayEqual(left: ArrayLike<number>, right: ArrayLike<number>): boolean {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

function orderedKeysEqual(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((key, index) => key === right[index]);
}

function batchPatchLayoutEqual(left: InstanceBatchV1, right: InstanceBatchV1): boolean {
  return left.key === right.key
    && left.incarnation === right.incarnation
    && left.geometryKey === right.geometryKey
    && left.materialKey === right.materialKey
    && left.colors !== undefined
    && right.colors !== undefined
    && left.animation === undefined
    && right.animation === undefined
    && (left.presentation?.castShadow ?? false) === (right.presentation?.castShadow ?? false)
    && (left.presentation?.receiveShadow ?? false) === (right.presentation?.receiveShadow ?? false);
}

/**
 * Compare canonical records directly with the accepted typed batch. This lets
 * a stable batch retain its typed arrays without first allocating an identical
 * candidate. `Math.fround` mirrors `Float32Array#set` exactly for matrices.
 */
export function batchCanReuseRecords(
  definition: OakRenderBatchDefinitionV1,
  records: readonly OakRenderInstanceRecordV1[],
  previous: InstanceBatchV1,
): boolean {
  if (previous.key !== definition.key
    || previous.incarnation !== 1
    || previous.geometryKey !== definition.geometryKey
    || previous.materialKey !== definition.materialKey
    || previous.colors === undefined
    || previous.animation !== undefined
    || (previous.presentation?.castShadow ?? false) !== definition.castShadow
    || (previous.presentation?.receiveShadow ?? false) !== definition.receiveShadow
    || previous.instanceKeys.length !== records.length) return false;
  for (let slot = 0; slot < records.length; slot += 1) {
    const record = records[slot]!;
    if (previous.instanceKeys[slot] !== record.key) return false;
    const matrixOffset = slot * 16;
    for (let index = 0; index < 16; index += 1) {
      if (previous.matrices[matrixOffset + index] !== Math.fround(record.matrix[index]!)) {
        return false;
      }
    }
    const colorOffset = slot * 4;
    if (previous.colors[colorOffset] !== record.color.r
      || previous.colors[colorOffset + 1] !== record.color.g
      || previous.colors[colorOffset + 2] !== record.color.b
      || previous.colors[colorOffset + 3] !== record.color.a) return false;
  }
  return true;
}

export function batchContentEqual(left: InstanceBatchV1, right: InstanceBatchV1): boolean {
  return batchPatchLayoutEqual(left, right)
    && orderedKeysEqual(left.instanceKeys, right.instanceKeys)
    && arrayEqual(left.matrices, right.matrices)
    && arrayEqual(left.colors!, right.colors!);
}

export function typedArrayBytes(snapshot: RenderSnapshotV1): number {
  let bytes = 0;
  for (const resource of snapshot.resources) {
    if (resource.kind !== 'geometry') continue;
    bytes += resource.positions.byteLength + resource.normals.byteLength + resource.indices.byteLength;
    bytes += resource.uvs?.byteLength ?? 0;
    bytes += resource.colors?.byteLength ?? 0;
  }
  for (const batch of snapshot.batches) {
    bytes += batch.matrices.byteLength + (batch.colors?.byteLength ?? 0);
  }
  for (const chunk of snapshot.chunks) bytes += chunk.voxels.byteLength;
  return bytes;
}

function vectorEqual(
  left: Readonly<{ x: number; y: number; z: number }>,
  right: Readonly<{ x: number; y: number; z: number }>,
): boolean {
  return left.x === right.x && left.y === right.y && left.z === right.z;
}

function chunkLayoutEqual(left: VoxelChunkV1, right: VoxelChunkV1): boolean {
  return left.key === right.key
    && left.incarnation === right.incarnation
    && left.paletteKey === right.paletteKey
    && left.materialKey === right.materialKey
    && vectorEqual(left.origin, right.origin)
    && vectorEqual(left.size, right.size);
}

export function chunkContentEqual(left: VoxelChunkV1, right: VoxelChunkV1): boolean {
  return chunkLayoutEqual(left, right) && arrayEqual(left.voxels, right.voxels);
}

export function visibleVoxelFaceCount(chunk: VoxelChunkV1): number {
  const { x: sizeX, y: sizeY, z: sizeZ } = chunk.size;
  const occupied = (x: number, y: number, z: number): boolean => {
    if (x < 0 || y < 0 || z < 0 || x >= sizeX || y >= sizeY || z >= sizeZ) return false;
    return chunk.voxels[x + sizeX * (z + sizeZ * y)] !== 0;
  };
  let faces = 0;
  for (let y = 0; y < sizeY; y += 1) {
    for (let z = 0; z < sizeZ; z += 1) {
      for (let x = 0; x < sizeX; x += 1) {
        if (!occupied(x, y, z)) continue;
        if (!occupied(x - 1, y, z)) faces += 1;
        if (!occupied(x + 1, y, z)) faces += 1;
        if (!occupied(x, y - 1, z)) faces += 1;
        if (!occupied(x, y + 1, z)) faces += 1;
        if (!occupied(x, y, z - 1)) faces += 1;
        if (!occupied(x, y, z + 1)) faces += 1;
      }
    }
  }
  return faces;
}

function slots(batch: InstanceBatchV1): Map<string, number> {
  return new Map(batch.instanceKeys.map((key, index) => [key, index]));
}

function rangeEqual(
  left: ArrayLike<number>,
  right: ArrayLike<number>,
  leftOffset: number,
  rightOffset: number,
  count: number,
): boolean {
  for (let index = 0; index < count; index += 1) {
    if (left[leftOffset + index] !== right[rightOffset + index]) return false;
  }
  return true;
}

function patchBetween(
  previous: InstanceBatchV1,
  next: InstanceBatchV1,
): PatchBatchInstancesV1 | null {
  const previousSlots = slots(previous);
  const nextSlots = slots(next);
  const removed = previous.instanceKeys.filter((key) => !nextSlots.has(key));
  const changed = next.instanceKeys.filter((key, nextSlot) => {
    const previousSlot = previousSlots.get(key);
    if (previousSlot === undefined) return true;
    return !rangeEqual(previous.matrices, next.matrices, previousSlot * 16, nextSlot * 16, 16)
      || !rangeEqual(previous.colors!, next.colors!, previousSlot * 4, nextSlot * 4, 4);
  });
  if (removed.length === 0 && changed.length === 0) return null;
  const matrices = new Float32Array(changed.length * 16);
  const colors = new Uint8Array(changed.length * 4);
  changed.forEach((key, targetSlot) => {
    const sourceSlot = nextSlots.get(key)!;
    matrices.set(next.matrices.subarray(sourceSlot * 16, sourceSlot * 16 + 16), targetSlot * 16);
    colors.set(next.colors!.subarray(sourceSlot * 4, sourceSlot * 4 + 4), targetSlot * 4);
  });
  return {
    op: 'patch-batch-instances',
    key: next.key,
    incarnation: next.incarnation,
    revision: next.revision,
    removeInstanceKeys: removed,
    upserts: { instanceKeys: changed, matrices, colors },
  };
}

/** Build changed tissue slots and soil chunks; static resources never churn. */
export function buildOakRenderDeltaV1(
  previous: OakRenderFrameV1,
  next: OakRenderFrameV1,
): RenderDeltaV1 {
  assertOakRenderFrameIntegrityV1(previous, 'previous delta frame');
  assertOakRenderFrameIntegrityV1(next, 'next delta frame');
  if (previous.snapshot.descriptor.epoch !== next.snapshot.descriptor.epoch) {
    throw new Error('Oak render deltas cannot cross simulation epochs; accept a replacement snapshot.');
  }
  if (next.snapshot.revision <= previous.snapshot.revision) {
    throw new Error('Oak render delta revision must advance beyond the accepted frame.');
  }
  const previousByKey = new Map(previous.snapshot.batches.map((batch) => [batch.key, batch]));
  const operations: RenderOperationV1[] = [];
  const previousChunks = new Map(previous.snapshot.chunks.map((chunk) => [chunk.key, chunk]));
  const nextChunkKeys = new Set(next.snapshot.chunks.map((chunk) => chunk.key));
  for (const chunk of next.snapshot.chunks) {
    const before = previousChunks.get(chunk.key);
    if (!before) {
      operations.push({ op: 'put-chunk', chunk });
      continue;
    }
    if (chunkContentEqual(before, chunk)) {
      if (chunk.revision !== before.revision) {
        throw new Error(
          `Unchanged oak chunk '${chunk.key}' changed revision from ${String(before.revision)} `
          + `to ${String(chunk.revision)}; build the next frame with previousFrame so content `
          + 'revisions remain truthful.',
        );
      }
      continue;
    }
    if (chunk.revision <= before.revision) {
      throw new Error(
        `Changed oak chunk '${chunk.key}' revision must advance beyond ${String(before.revision)}.`,
      );
    }
    operations.push({ op: 'put-chunk', chunk });
  }
  for (const chunk of previous.snapshot.chunks) {
    if (!nextChunkKeys.has(chunk.key)) {
      operations.push({ op: 'remove-chunk', key: chunk.key, incarnation: chunk.incarnation });
    }
  }
  for (const batch of next.snapshot.batches) {
    const before = previousByKey.get(batch.key);
    if (!before) operations.push({ op: 'put-batch', batch });
    else {
      if (batchContentEqual(before, batch)) {
        if (batch.revision !== before.revision) {
          throw new Error(
            `Unchanged oak batch '${batch.key}' changed revision from `
            + `${String(before.revision)} to ${String(batch.revision)}; build the next frame `
            + 'with previousFrame so content revisions remain truthful.',
          );
        }
        continue;
      }
      if (batch.revision <= before.revision) {
        throw new Error(
          `Changed oak batch '${batch.key}' revision must advance beyond ${String(before.revision)}.`,
        );
      }
      if (!batchPatchLayoutEqual(before, batch)) {
        operations.push({ op: 'put-batch', batch });
        continue;
      }
      const patch = patchBetween(before, batch);
      if (patch) operations.push(patch);
    }
  }
  return {
    schemaVersion: 'voxel.render-delta/1',
    worldId: next.snapshot.descriptor.worldId,
    epoch: next.snapshot.descriptor.epoch,
    baseRevision: previous.snapshot.revision,
    revision: next.snapshot.revision,
    operations,
  };
}
