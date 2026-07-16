import { Group } from 'three';

import type { Scene } from 'three';
import {
  VoxelMeshSchedulerV1,
  type MeshSchedulerWorkerContextV1,
} from '../meshing/index.js';
import { CommittedPresentedQueryAuthorityInternal } from './committedPresentedQueryAuthority.js';
import type { ThreeVoxelWorkersV1 } from './runtimeTypes.js';
import type { ProfiledWorkerTargetLimitsInternal } from './profiledWorkerTargetPlan.js';
import { RevisionAtomicPresentationStagerInternal } from './revisionAtomicStaging.js';
import { RuntimeAtomicPipelineInternal } from './runtimeAtomicPipeline.js';
import {
  RuntimeMeshWorkerDriverInternal,
  type RuntimeMeshWorkerStartupResultInternal,
} from './runtimeMeshWorkerDriver.js';

/**
 * The public worker option plus the seams tests need. Consumers configure the
 * pipeline through `ThreeVoxelWorkersV1`; the extra members here are a test
 * launcher and plan limits whose type is not part of the public surface.
 */
export interface ThreeRuntimeVoxelWorkersOptionsInternal extends ThreeVoxelWorkersV1 {
  readonly planLimits?: Partial<ProfiledWorkerTargetLimitsInternal>;
  /** Test seam replacing the browser Worker launcher. */
  readonly startWorkerInternal?: (
    context: MeshSchedulerWorkerContextV1,
  ) => RuntimeMeshWorkerStartupResultInternal;
}

export interface RuntimeAtomicSetupInternal {
  readonly pipeline: RuntimeAtomicPipelineInternal;
  readonly driver: RuntimeMeshWorkerDriverInternal;
  readonly queries: CommittedPresentedQueryAuthorityInternal;
  readonly root: Group;
}

/** Typed defaults for the runtime-owned atomic pipeline budgets. */
export const RUNTIME_ATOMIC_PIPELINE_DEFAULTS_INTERNAL = Object.freeze({
  maxQueuedJobs: 256,
  maxQueuedBytes: 64_000_000,
  maxStagingBytes: 64_000_000,
  starvationPromotionDispatches: 4,
  maxCopiedSampleBytes: 64_000_000,
  maxPreparationWorkElements: 8_000_000,
  maxTargetOutputBytes: 64_000_000,
  maxCpuStagingBytes: 64_000_000,
  maxGpuStagingBytes: 64_000_000,
  maxPreparedTargets: 2,
  maxQueuedEvents: 4_096,
});

/**
 * Constructs the driver, scheduler, off-scene stager, and pipeline for one
 * runtime, mounting the atomic scene root. Throws on invalid configuration;
 * the caller rolls back through disposeRuntimeAtomicSetupInternal.
 */
export function createRuntimeAtomicSetupInternal(
  options: ThreeRuntimeVoxelWorkersOptionsInternal,
  scene: Scene,
): RuntimeAtomicSetupInternal {
  const defaults = RUNTIME_ATOMIC_PIPELINE_DEFAULTS_INTERNAL;
  const driver = new RuntimeMeshWorkerDriverInternal({
    maxQueuedEventsInternal: options.maxQueuedEvents ?? defaults.maxQueuedEvents,
    ...(options.startWorkerInternal
      ? { startWorkerInternal: options.startWorkerInternal }
      : {}),
  });
  let scheduler: VoxelMeshSchedulerV1 | undefined;
  let root: Group | undefined;
  try {
    scheduler = new VoxelMeshSchedulerV1({
      runtimeId: 'three-runtime-atomic',
      maxQueuedJobs: defaults.maxQueuedJobs,
      maxQueuedBytes: defaults.maxQueuedBytes,
      maxStagingBytes: defaults.maxStagingBytes,
      starvationPromotionDispatches: defaults.starvationPromotionDispatches,
      ...options.scheduler,
      workerCount: options.workerCount,
    }, driver.workerFactoryInternal);
    root = new Group();
    root.name = 'voxel:atomic-presentation';
    const stager = new RevisionAtomicPresentationStagerInternal({
      root,
      maxCpuStagingBytes: options.staging?.maxCpuStagingBytes
        ?? defaults.maxCpuStagingBytes,
      maxGpuStagingBytes: options.staging?.maxGpuStagingBytes
        ?? defaults.maxGpuStagingBytes,
      maxPreparedTargets: options.staging?.maxPreparedTargets
        ?? defaults.maxPreparedTargets,
    });
    const pipeline = new RuntimeAtomicPipelineInternal({
      schedulerInternal: scheduler,
      stagerInternal: stager,
      limitsInternal: Object.freeze({
        maxJobs: options.planLimits?.maxJobs ?? defaults.maxQueuedJobs,
        maxCopiedSampleBytes: options.planLimits?.maxCopiedSampleBytes
          ?? defaults.maxCopiedSampleBytes,
        maxPreparationWorkElements: options.planLimits?.maxPreparationWorkElements
          ?? defaults.maxPreparationWorkElements,
        maxTargetOutputBytes: options.planLimits?.maxTargetOutputBytes
          ?? defaults.maxTargetOutputBytes,
      }),
    });
    driver.bindInternal(pipeline);
    scene.add(root);
    return Object.freeze({
      pipeline,
      driver,
      queries: new CommittedPresentedQueryAuthorityInternal(),
      root,
    });
  } catch (error) {
    const cleanup: unknown[] = [];
    try { driver.disposeInternal(); } catch (caught) { cleanup.push(caught); }
    if (scheduler) {
      try { scheduler.dispose(0); } catch (caught) { cleanup.push(caught); }
    }
    if (root) {
      try { scene.remove(root); } catch (caught) { cleanup.push(caught); }
    }
    if (cleanup.length > 0) {
      throw new AggregateError(
        [error, ...cleanup],
        'Runtime atomic setup rollback failed.',
        { cause: error },
      );
    }
    throw error;
  }
}

/**
 * Idempotent teardown: the driver stops worker event flow first, the pipeline
 * then disposes the coordinator with its scheduler and stager, and the atomic
 * root leaves the scene last.
 */
export function disposeRuntimeAtomicSetupInternal(
  setup: RuntimeAtomicSetupInternal,
  scene: Scene,
): void {
  const errors: unknown[] = [];
  try { setup.driver.disposeInternal(); } catch (error) { errors.push(error); }
  // Query snapshots retire before the scene bundles whose meshes they read.
  try { setup.queries.dispose(); } catch (error) { errors.push(error); }
  try { setup.pipeline.disposeInternal(); } catch (error) { errors.push(error); }
  try { scene.remove(setup.root); } catch (error) { errors.push(error); }
  if (errors.length > 0) {
    throw new AggregateError(errors, 'Runtime atomic setup disposal failed.');
  }
}
