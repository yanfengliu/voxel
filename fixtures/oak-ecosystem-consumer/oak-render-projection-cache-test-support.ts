import { isDeepStrictEqual } from 'node:util';

import type { OakRenderFrameV1 } from './oak-render-adapter.js';

export function oakArraysEqualForRenderCacheTestV1(
  left: ArrayLike<number>,
  right: ArrayLike<number>,
): boolean {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (!Object.is(left[index], right[index])) return false;
  }
  return true;
}

function recordMapsEqual(
  left: OakRenderFrameV1['projectionCache']['tissue']['records'],
  right: OakRenderFrameV1['projectionCache']['tissue']['records'],
): boolean {
  if (left.size !== right.size) return false;
  for (const [batchKey, leftRecords] of left) {
    const rightRecords = right.get(batchKey);
    if (rightRecords === undefined || leftRecords.length !== rightRecords.length) return false;
    for (let index = 0; index < leftRecords.length; index += 1) {
      const before = leftRecords[index]!;
      const after = rightRecords[index]!;
      if (before.key !== after.key
        || !oakArraysEqualForRenderCacheTestV1(before.matrix, after.matrix)
        || before.color.r !== after.color.r || before.color.g !== after.color.g
        || before.color.b !== after.color.b || before.color.a !== after.color.a) return false;
    }
  }
  return true;
}

function batchesEqualByInstanceKey(left: OakRenderFrameV1, right: OakRenderFrameV1): boolean {
  if (left.snapshot.batches.length !== right.snapshot.batches.length) return false;
  for (const leftBatch of left.snapshot.batches) {
    const rightBatch = right.snapshot.batches.find(({ key }) => key === leftBatch.key);
    if (rightBatch === undefined || leftBatch.instanceKeys.length !== rightBatch.instanceKeys.length
      || leftBatch.geometryKey !== rightBatch.geometryKey
      || leftBatch.materialKey !== rightBatch.materialKey) return false;
    const rightSlots = new Map(rightBatch.instanceKeys.map((key, index) => [key, index]));
    for (let leftIndex = 0; leftIndex < leftBatch.instanceKeys.length; leftIndex += 1) {
      const rightIndex = rightSlots.get(leftBatch.instanceKeys[leftIndex]!);
      if (rightIndex === undefined) return false;
      if (!oakArraysEqualForRenderCacheTestV1(
        leftBatch.matrices.subarray(leftIndex * 16, leftIndex * 16 + 16),
        rightBatch.matrices.subarray(rightIndex * 16, rightIndex * 16 + 16),
      )) return false;
      if (leftBatch.colors !== undefined && rightBatch.colors !== undefined
        && !oakArraysEqualForRenderCacheTestV1(
          leftBatch.colors.subarray(leftIndex * 4, leftIndex * 4 + 4),
          rightBatch.colors.subarray(rightIndex * 4, rightIndex * 4 + 4),
        )) return false;
    }
  }
  return true;
}

export function oakExactProjectionContentEqualForTestV1(
  left: OakRenderFrameV1,
  right: OakRenderFrameV1,
): boolean {
  const leftTissue = left.projectionCache.tissue;
  const rightTissue = right.projectionCache.tissue;
  return recordMapsEqual(leftTissue.records, rightTissue.records)
    && isDeepStrictEqual(leftTissue.organMetrics, rightTissue.organMetrics)
    && isDeepStrictEqual([...leftTissue.materialCells], [...rightTissue.materialCells])
    && isDeepStrictEqual([...leftTissue.sourceAssignments], [...rightTissue.sourceAssignments])
    && isDeepStrictEqual(leftTissue.ports, rightTissue.ports)
    && isDeepStrictEqual(
      { ...leftTissue, records: null, materialCells: null, sourceAssignments: null, ports: null },
      { ...rightTissue, records: null, materialCells: null, sourceAssignments: null, ports: null },
    )
    && isDeepStrictEqual(left.projectionCache.soil.contactVoxels,
      right.projectionCache.soil.contactVoxels)
    && isDeepStrictEqual(left.projectionCache.soil.metrics, right.projectionCache.soil.metrics)
    && isDeepStrictEqual(left.projectionCache.litter, right.projectionCache.litter)
    && isDeepStrictEqual(left.snapshot.resources, right.snapshot.resources)
    && isDeepStrictEqual(left.metrics, right.metrics)
    && oakArraysEqualForRenderCacheTestV1(
      left.snapshot.chunks[0]!.voxels,
      right.snapshot.chunks[0]!.voxels,
    )
    && batchesEqualByInstanceKey(left, right);
}
