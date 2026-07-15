import type { RenderWorld } from '../core/index.js';
import { renderWorldOwnershipMetricsInternal } from '../core/render-world.js';
import type { RuntimePresentationSurfaceMetricsInternal } from './runtimePresentationSurface.js';
import type { RenderInfoSnapshotInternal } from './runtimeRenderInfo.js';
import type { ThreeRenderMetrics } from './runtimeTypes.js';

export interface RuntimeMetricsInputInternal {
  readonly state: ThreeRenderMetrics['state'];
  readonly world: RenderWorld;
  readonly frames: number;
  readonly presentation: RuntimePresentationSurfaceMetricsInternal;
  readonly renderInfo: RenderInfoSnapshotInternal;
  readonly contextLosses: number;
  readonly contextRestorations: number;
  readonly presentationStagingBytes: number;
  readonly peakPresentationStagingBytes: number;
}

export function collectRuntimeMetricsInternal(
  input: RuntimeMetricsInputInternal,
): ThreeRenderMetrics {
  const ownership = renderWorldOwnershipMetricsInternal(input.world);
  const presentation = input.presentation;
  return {
    state: input.state,
    acceptedEpoch: input.world.epoch,
    acceptedRevision: input.world.acceptedRevision,
    presentedEpoch: input.world.presentedEpoch,
    presentedRevision: input.world.presentedRevision,
    frames: input.frames,
    materialResources: presentation.materialResources,
    geometryResources: presentation.geometryResources,
    chunks: presentation.chunks,
    visibleChunks: presentation.visibleChunks,
    instanceBatches: presentation.instanceBatches,
    instances: presentation.instances,
    animatedBatches: presentation.animatedBatches,
    animatedInstances: presentation.animatedInstances,
    animationMatrixUpdates: presentation.animationMatrixUpdates,
    instancePresentationMatrixWrites: presentation.instancePresentationMatrixWrites,
    instancePresentationColorWrites: presentation.instancePresentationColorWrites,
    instancePresentationUpdateRanges: presentation.instancePresentationUpdateRanges,
    drawCalls: input.renderInfo.drawCalls,
    triangles: input.renderInfo.triangles,
    points: input.renderInfo.points,
    lines: input.renderInfo.lines,
    rendererGeometries: input.renderInfo.geometries,
    rendererTextures: input.renderInfo.textures,
    contextLosses: input.contextLosses,
    contextRestorations: input.contextRestorations,
    snapshotInputTypedArrayBytes: ownership.snapshotInputTypedArrayBytes,
    snapshotCopiedTypedArrayBytes: ownership.snapshotCopiedTypedArrayBytes,
    snapshotCopyOperations: ownership.snapshotCopyOperations,
    deltaInputTypedArrayBytes: ownership.deltaInputTypedArrayBytes,
    deltaCopiedTypedArrayBytes: ownership.deltaCopiedTypedArrayBytes,
    deltaCopyOperations: ownership.deltaCopyOperations,
    defensiveSnapshotCopyBytes: ownership.defensiveSnapshotCopyBytes,
    retainedTypedArrayBytes: ownership.retainedTypedArrayBytes,
    peakRetainedTypedArrayBytes: ownership.peakRetainedTypedArrayBytes,
    presentationStagingBytes: input.presentationStagingBytes,
    peakPresentationStagingBytes: input.peakPresentationStagingBytes,
  };
}
