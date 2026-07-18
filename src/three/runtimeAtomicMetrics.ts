import { Frustum, Matrix4, type Camera } from 'three';

import type { ChunkPresenter } from './chunkPresenter.js';
import type { RuntimeAtomicSetupInternal } from './runtimeAtomicSetup.js';
import type { ThreeAtomicPipelineMetricsV1 } from './runtimeTypes.js';

/** Scratch for the read-time frustum test; metrics are read single-threaded. */
const ATOMIC_FRUSTUM_INTERNAL = new Frustum();
const ATOMIC_FRUSTUM_MATRIX_INTERNAL = new Matrix4();
const ATOMIC_VIEW_MATRIX_INTERNAL = new Matrix4();

/**
 * Chunks the camera can actually see. The frustum is derived from the
 * camera's matrices as they stand — the same matrices the last draw used —
 * without writing the camera: in embedded mode the camera is host-owned
 * state, and a metrics read must never recompose it or clear its dirty
 * flags. The world-matrix inverse is computed into local scratch rather than
 * read from `camera.matrixWorldInverse` for the same reason: keeping that
 * field fresh is the owner's job, not a side effect of being measured.
 */
function inFrustumChunkCountInternal(
  bundle: { readonly chunkPresenterInternal: ChunkPresenter } | null | undefined,
  camera: Camera,
): number {
  if (!bundle) return 0;
  ATOMIC_VIEW_MATRIX_INTERNAL.copy(camera.matrixWorld).invert();
  ATOMIC_FRUSTUM_MATRIX_INTERNAL.multiplyMatrices(
    camera.projectionMatrix,
    ATOMIC_VIEW_MATRIX_INTERNAL,
  );
  ATOMIC_FRUSTUM_INTERNAL.setFromProjectionMatrix(ATOMIC_FRUSTUM_MATRIX_INTERNAL);
  return bundle.chunkPresenterInternal.inFrustumCountInternal(ATOMIC_FRUSTUM_INTERNAL);
}

/**
 * The worker voxel pipeline's live occupancy, lifetime outcomes, and high-water
 * marks. Occupancy must return flat on a steady world; the counters and peaks
 * are meant to climb.
 */
export function collectAtomicPipelineMetricsInternal(
  atomic: RuntimeAtomicSetupInternal,
  camera: Camera,
): ThreeAtomicPipelineMetricsV1 {
  const staging = atomic.pipeline.stagingMetricsInternal();
  const driver = atomic.driver.metricsInternal();
  return Object.freeze({
    preparedTargets: staging.preparedTargets,
    cpuStagingBytes: staging.cpuStagingBytes,
    gpuStagingBytes: staging.gpuStagingBytes,
    peakCpuStagingBytes: staging.peakCpuStagingBytes,
    peakGpuStagingBytes: staging.peakGpuStagingBytes,
    pendingRetiredBundles: staging.pendingRetiredBundles,
    pendingRetirements: staging.pendingRetirements,
    presentedTargets: staging.presentedTargets,
    failedTargets: staging.failedTargets,
    loadedChunks: staging.displayedBundle?.chunkPresenterInternal.count ?? 0,
    nonemptyChunks: staging.displayedBundle?.chunkPresenterInternal.visibleCount ?? 0,
    inFrustumChunks: inFrustumChunkCountInternal(staging.displayedBundle, camera),
    queuedJobs: staging.scheduler.queuedJobs,
    queuedBytes: staging.scheduler.queuedBytes,
    highWaterQueuedJobs: staging.scheduler.highWaterQueuedJobs,
    highWaterQueuedBytes: staging.scheduler.highWaterQueuedBytes,
    highWaterStagingBytes: staging.scheduler.highWaterStagingBytes,
    highWaterBusyWorkers: staging.scheduler.highWaterBusyWorkers,
    queuedWorkerEvents: driver.queuedEvents,
    highWaterQueuedWorkerEvents: driver.highWaterQueuedEvents,
    liveWorkers: driver.liveWorkers,
  });
}
