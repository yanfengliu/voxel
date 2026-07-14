import type {
  OwnedRenderSnapshotV1,
  RenderWorld,
} from '../core/index.js';
import type { SnapshotCopyMetricsInternal } from '../core/snapshot-validation.js';
import type { ThreeRenderRuntime } from './ThreeRenderRuntime.js';

export interface SnapshotIngestMetricsInternal {
  readonly attempts: number;
  readonly accepted: number;
  readonly inputTypedArrayBytes: number;
  readonly copiedTypedArrayBytes: number;
  readonly copyOperations: number;
  readonly lastCopiedTypedArrayBytes: number;
  readonly lastCopyOperations: number;
  readonly lastInputTypedArrayBytes: number;
}

export interface MutableSnapshotIngestMetricsInternal {
  attempts: number;
  accepted: number;
  inputTypedArrayBytes: number;
  copiedTypedArrayBytes: number;
  copyOperations: number;
  lastCopiedTypedArrayBytes: number;
  lastCopyOperations: number;
  lastInputTypedArrayBytes: number;
}

const SNAPSHOT_INGEST_METRICS = new WeakMap<
  ThreeRenderRuntime,
  MutableSnapshotIngestMetricsInternal
>();
const RUNTIME_WORLDS = new WeakMap<ThreeRenderRuntime, RenderWorld>();

export function initializeRuntimeSnapshotMetricsInternal(
  runtime: ThreeRenderRuntime,
  world: RenderWorld,
): void {
  RUNTIME_WORLDS.set(runtime, world);
  SNAPSHOT_INGEST_METRICS.set(runtime, {
    attempts: 0,
    accepted: 0,
    inputTypedArrayBytes: 0,
    copiedTypedArrayBytes: 0,
    copyOperations: 0,
    lastCopiedTypedArrayBytes: 0,
    lastCopyOperations: 0,
    lastInputTypedArrayBytes: 0,
  });
}

export function recordSnapshotCopyAttemptInternal(
  runtime: ThreeRenderRuntime,
  metrics: Readonly<SnapshotCopyMetricsInternal>,
): MutableSnapshotIngestMetricsInternal {
  const aggregate = mutableSnapshotIngestMetricsInternal(runtime);
  aggregate.attempts += 1;
  aggregate.inputTypedArrayBytes += metrics.inputTypedArrayBytes;
  aggregate.copiedTypedArrayBytes += metrics.copiedTypedArrayBytes;
  aggregate.copyOperations += metrics.copyOperations;
  aggregate.lastCopiedTypedArrayBytes = metrics.copiedTypedArrayBytes;
  aggregate.lastCopyOperations = metrics.copyOperations;
  aggregate.lastInputTypedArrayBytes = metrics.inputTypedArrayBytes;
  return aggregate;
}

export function mutableSnapshotIngestMetricsInternal(
  runtime: ThreeRenderRuntime,
): MutableSnapshotIngestMetricsInternal {
  const metrics = SNAPSHOT_INGEST_METRICS.get(runtime);
  if (!metrics) throw new Error('Missing ThreeRenderRuntime ingest metrics.');
  return metrics;
}

/** Package-internal deterministic regression hook; not exported by voxel/three. */
export function snapshotIngestMetricsForTesting(
  runtime: ThreeRenderRuntime,
): SnapshotIngestMetricsInternal {
  return { ...mutableSnapshotIngestMetricsInternal(runtime) };
}

/** Package-internal defensive state view used to prove borrowed-scene isolation. */
export function acceptedSnapshotForTesting(
  runtime: ThreeRenderRuntime,
): OwnedRenderSnapshotV1 | null {
  const world = RUNTIME_WORLDS.get(runtime);
  if (!world) throw new TypeError('Invalid ThreeRenderRuntime receiver.');
  return world.acceptedSnapshot();
}
