import type { OwnedRenderSnapshotV1 } from './contracts.js';
import type { RenderResourceV1, VoxelChunkV1 } from './contracts.js';
import { mergeSortWorkUpperBoundInternal } from './bounded-sort.js';
import type { DeltaWorkBudgetInternal } from './delta-work-budget.js';
import type { DeltaBatchSummaryInternal } from './delta-final-graph.js';

/** Conservative upper bound for every traversal performed by final candidate validation. */
export function chargeCandidateValidationWorkInternal(
  snapshot: OwnedRenderSnapshotV1,
  operationCount: number,
  work: DeltaWorkBudgetInternal,
): void {
  const charge = (count: number): void => work.charge(count);
  charge(operationCount + snapshot.resources.length + snapshot.chunks.length
    + snapshot.batches.length);
  for (const resource of snapshot.resources) {
    switch (resource.kind) {
      case 'palette':
        charge(resource.entries.length * 8 + 24);
        break;
      case 'material':
        charge(32);
        break;
      case 'geometry':
        charge(
          resource.positions.length * 2
          + resource.normals.length
          + (resource.uvs?.length ?? 0)
          + (resource.colors?.length ?? 0)
          + resource.indices.length
          + resource.groups.length * 10
          + 48,
        );
        break;
    }
  }
  for (const chunk of snapshot.chunks) charge(chunk.voxels.length + 32);
  for (const batch of snapshot.batches) {
    const instances = batch.instanceKeys.length;
    charge(
      instances * 4
      + batch.matrices.length
      + (batch.colors?.length ?? 0)
      + (batch.animation?.periodsMs.length ?? 0) * 4
      + (batch.animation?.phasesRadians.length ?? 0)
      + (batch.animation?.translationAmplitudes.length ?? 0) * 2
      + (batch.animation?.rotationAmplitudesRadians.length ?? 0) * 2
      + (batch.animation?.scaleAmplitudes.length ?? 0) * 2
      + (batch.animation ? instances * 15 : 0)
      + 32,
    );
  }
  charge((snapshot.resources.length + snapshot.chunks.length + snapshot.batches.length) * 4);
  charge(mergeSortWorkUpperBoundInternal(snapshot.chunks.length, 4));
  charge(Math.min(
    1_000_001,
    snapshot.chunks.length * Math.max(0, snapshot.chunks.length - 1) / 2,
  ));
}

/** Upper bound for cross-item validation when batch payloads remain paged. */
export function chargePagedCandidateValidationWorkInternal(
  resources: readonly RenderResourceV1[],
  chunks: readonly VoxelChunkV1[],
  batches: readonly DeltaBatchSummaryInternal[],
  operationCount: number,
  work: DeltaWorkBudgetInternal,
): void {
  work.charge(operationCount + resources.length * 8 + chunks.length * 8 + batches.length * 8);
  for (const resource of resources) {
    if (resource.kind === 'geometry') work.charge(resource.groups.length * 4 + 16);
    else work.charge(8);
  }
  for (const chunk of chunks) work.charge(chunk.voxels.length + 24);
  work.charge(batches.length * 12);
  work.charge(mergeSortWorkUpperBoundInternal(chunks.length, 4));
  work.charge(Math.min(
    1_000_001,
    chunks.length * Math.max(0, chunks.length - 1) / 2,
  ));
}

/** Reserves every deterministic work term that runs after typed-array ownership begins. */
export function chargeDeltaCommitWorkInternal(
  previousCounts: readonly [number, number, number],
  candidateCounts: readonly [number, number, number],
  addedCounts: readonly [number, number, number],
  changeListLengths: readonly number[],
  work: DeltaWorkBudgetInternal,
): void {
  work.charge(
    previousCounts.reduce((sum, count) => sum + count * 3, 0)
      + addedCounts.reduce(
        (sum, count) => sum + mergeSortWorkUpperBoundInternal(count, 257),
        0,
      ),
  );
  work.charge(
    candidateCounts.reduce((sum, count) => sum + count * 20, 0)
      + previousCounts.reduce((sum, count) => sum + count * 2, 0),
  );
  for (const length of changeListLengths) {
    work.charge(mergeSortWorkUpperBoundInternal(length, 257));
  }
}
