import type { OwnedRenderSnapshotV1 } from './contracts.js';
import {
  copyRenderResourceV1Internal,
  copyVoxelChunkV1Internal,
  renderSnapshotCopyBytes,
  renderSnapshotCopyOperations,
} from './snapshot-copy.js';
import {
  parseSnapshot,
  type InternalValidationResult,
  type SnapshotCopyMetricsInternal,
} from './snapshot-validation.js';
import { ValidationFailureInternal } from './snapshot-byte-budget.js';

export interface CanonicalSnapshotIngestInternal {
  readonly result: InternalValidationResult<OwnedRenderSnapshotV1>;
  readonly metrics: SnapshotCopyMetricsInternal;
}

/**
 * Validates the whole graph before copying, then owns non-batch lanes once.
 * Batch typed arrays remain borrowed only until synchronous canonical paging.
 */
export function validateSnapshotForCanonicalIngestInternal(
  value: unknown,
): CanonicalSnapshotIngestInternal {
  const metrics: SnapshotCopyMetricsInternal = {
    inputTypedArrayBytes: 0,
    copiedTypedArrayBytes: 0,
    copyOperations: 0,
  };
  try {
    const parsed = parseSnapshot(value, metrics, false);
    const nonBatchSnapshot: OwnedRenderSnapshotV1 = {
      ...parsed,
      resources: parsed.resources.map(copyRenderResourceV1Internal),
      chunks: parsed.chunks.map(copyVoxelChunkV1Internal),
      batches: [],
    };
    metrics.copiedTypedArrayBytes = renderSnapshotCopyBytes(nonBatchSnapshot);
    metrics.copyOperations = renderSnapshotCopyOperations(nonBatchSnapshot);
    return {
      result: {
        ok: true,
        value: {
          ...parsed,
          resources: nonBatchSnapshot.resources,
          chunks: nonBatchSnapshot.chunks,
        },
      },
      metrics,
    };
  } catch (error) {
    if (error instanceof ValidationFailureInternal) {
      return {
        result: {
          ok: false,
          issue: { code: error.code, path: error.path, message: error.message },
        },
        metrics,
      };
    }
    throw error;
  }
}
