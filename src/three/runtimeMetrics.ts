import type { RenderWorld } from '../core/index.js';
import { renderWorldOwnershipMetricsInternal } from '../core/render-world.js';
import type { ChunkPresenter } from './chunkPresenter.js';
import type { GeometryPresenter } from './geometryPresenter.js';
import type { InstanceBatchPresenter } from './instanceBatchPresenter.js';
import type { MaterialPresenter } from './materialPresenter.js';
import type { RenderInfoSnapshotInternal } from './runtimeRenderInfo.js';
import type { MutableSnapshotIngestMetricsInternal } from './runtimeSnapshotMetrics.js';
import type { ThreeRenderMetrics } from './runtimeTypes.js';

export interface RuntimeMetricsInputInternal {
  readonly state: ThreeRenderMetrics['state'];
  readonly world: RenderWorld;
  readonly frames: number;
  readonly materialPresenter: MaterialPresenter;
  readonly geometryPresenter: GeometryPresenter;
  readonly chunkPresenter: ChunkPresenter;
  readonly instancePresenter: InstanceBatchPresenter;
  readonly renderInfo: RenderInfoSnapshotInternal;
  readonly contextLosses: number;
  readonly contextRestorations: number;
  readonly ingest: MutableSnapshotIngestMetricsInternal;
}

export function collectRuntimeMetricsInternal(
  input: RuntimeMetricsInputInternal,
): ThreeRenderMetrics {
  const ownership = renderWorldOwnershipMetricsInternal(input.world);
  const instances = input.instancePresenter;
  return {
    state: input.state,
    acceptedEpoch: input.world.epoch,
    acceptedRevision: input.world.acceptedRevision,
    presentedEpoch: input.world.presentedEpoch,
    presentedRevision: input.world.presentedRevision,
    frames: input.frames,
    materialResources: input.materialPresenter.count,
    geometryResources: input.geometryPresenter.count,
    chunks: input.chunkPresenter.count,
    visibleChunks: input.chunkPresenter.visibleCount,
    instanceBatches: instances.count,
    instances: instances.instanceCount,
    animatedBatches: instances.animatedBatchCount,
    animatedInstances: instances.animatedInstanceCount,
    animationMatrixUpdates: instances.animationMatrixUpdates,
    instancePresentationMatrixWrites: instances.presentationMatrixWritesInternal,
    instancePresentationColorWrites: instances.presentationColorWritesInternal,
    instancePresentationUpdateRanges: instances.presentationUpdateRangesInternal,
    drawCalls: input.renderInfo.drawCalls,
    triangles: input.renderInfo.triangles,
    points: input.renderInfo.points,
    lines: input.renderInfo.lines,
    rendererGeometries: input.renderInfo.geometries,
    rendererTextures: input.renderInfo.textures,
    contextLosses: input.contextLosses,
    contextRestorations: input.contextRestorations,
    snapshotInputTypedArrayBytes: input.ingest.inputTypedArrayBytes,
    snapshotCopiedTypedArrayBytes: input.ingest.copiedTypedArrayBytes,
    snapshotCopyOperations: input.ingest.copyOperations,
    deltaInputTypedArrayBytes: ownership.deltaInputTypedArrayBytes,
    deltaCopiedTypedArrayBytes: ownership.deltaCopiedTypedArrayBytes,
    deltaCopyOperations: ownership.deltaCopyOperations,
    defensiveSnapshotCopyBytes: ownership.defensiveSnapshotCopyBytes,
    retainedTypedArrayBytes: ownership.retainedTypedArrayBytes,
    peakRetainedTypedArrayBytes: ownership.peakRetainedTypedArrayBytes,
    presentationStagingBytes: 0,
    peakPresentationStagingBytes: 0,
  };
}
