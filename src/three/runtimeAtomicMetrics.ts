import { Frustum, Matrix4, type Camera } from 'three';

import type { ChunkPresenter } from './chunkPresenter.js';
import type { RuntimeAtomicSetupInternal } from './runtimeAtomicSetup.js';
import type { ThreeAtomicPipelineMetricsV1 } from './runtimeTypes.js';

/** Scratch for the read-time frustum test; metrics are read single-threaded. */
const ATOMIC_FRUSTUM_INTERNAL = new Frustum();
const ATOMIC_FRUSTUM_MATRIX_INTERNAL = new Matrix4();

/**
 * Chunks the camera can actually see. The frustum is derived from the live
 * camera at read time, which is the same test Three runs internally: the
 * renderer reports one total draw count and cannot attribute draws to this
 * lane, so this is the only way to report the lane's own culling.
 */
function inFrustumChunkCountInternal(
  bundle: { readonly chunkPresenterInternal: ChunkPresenter } | null | undefined,
  camera: Camera,
): number {
  if (!bundle) return 0;
  camera.updateMatrixWorld();
  ATOMIC_FRUSTUM_MATRIX_INTERNAL.multiplyMatrices(
    camera.projectionMatrix,
    camera.matrixWorldInverse,
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
