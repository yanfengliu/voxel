import type { RenderWorld } from '../core/index.js';
import {
  renderWorldOwnershipMetricsInternal,
  resetRenderWorldOwnershipMetricsInternal,
} from '../core/render-world.js';

export interface RenderWorldOwnershipMetricsForTesting {
  readonly snapshotInputTypedArrayBytes: number;
  readonly snapshotCopiedTypedArrayBytes: number;
  readonly snapshotCopyOperations: number;
  readonly deltaInputTypedArrayBytes: number;
  readonly deltaCopiedTypedArrayBytes: number;
  readonly deltaCopyOperations: number;
  readonly defensiveSnapshotCopyBytes: number;
  readonly retainedTypedArrayBytes: number;
  readonly peakRetainedTypedArrayBytes: number;
}

/** Reads deterministic per-world ownership counters for regression tests. */
export function readRenderWorldOwnershipMetricsForTesting(
  world: RenderWorld,
): RenderWorldOwnershipMetricsForTesting {
  return renderWorldOwnershipMetricsInternal(world);
}

/** Resets cumulative counters while preserving truthful current retention. */
export function resetRenderWorldOwnershipMetricsForTesting(world: RenderWorld): void {
  resetRenderWorldOwnershipMetricsInternal(world);
}
