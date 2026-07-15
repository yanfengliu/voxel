import type {
  OrthographicCamera,
  Scene,
  WebGLRendererParameters,
} from 'three';

import type { ThreeViewOptionsV1 } from './cameraStrategy.js';
import type { ThreeDaylightOptions } from './daylightRig.js';
import type { ThreeRuntimeHostV1 } from './hostFrameProtocol.js';
import type { IsometricViewCenter } from './orthographicView.js';
import type {
  ChunkPresentation,
  GeometryPresentation,
  InstanceBatchPresentation,
  MaterialPresentation,
} from './presentationTypes.js';
import type { RendererFactory, RendererLike } from './rendererTypes.js';

export interface ThreePresentationSnapshot {
  readonly epoch: string;
  readonly revision: number;
  readonly materials: readonly MaterialPresentation[];
  readonly geometries: readonly GeometryPresentation[];
  readonly chunks: readonly ChunkPresentation[];
  readonly batches: readonly InstanceBatchPresentation[];
}

export type ThreeRuntimeLifecycleV1 =
  | 'initializing'
  | 'running'
  | 'lost'
  | 'restoring'
  | 'failed'
  | 'disposed';

export type ThreeRuntimeFailurePhaseV1 =
  | 'restore'
  | 'prepare'
  | 'animate'
  | 'render'
  | 'commit'
  | 'resize'
  | 'capture';

export type ThreeRuntimeFailureCodeV1 =
  `three.runtime.${ThreeRuntimeFailurePhaseV1}-failed`;

export interface ThreeRuntimeFailureV1 {
  readonly code: ThreeRuntimeFailureCodeV1;
  readonly phase: ThreeRuntimeFailurePhaseV1;
  readonly name: string;
  readonly message: string;
}

export type ThreeRuntimeStatusV1 =
  | {
      readonly state: Exclude<ThreeRuntimeLifecycleV1, 'failed'>;
      readonly deviceGeneration: number;
      readonly failure: null;
    }
  | {
      readonly state: 'failed';
      readonly deviceGeneration: number;
      readonly failure: ThreeRuntimeFailureV1;
    };

export interface ThreeRenderRuntimeOptions {
  /** Additive host policy. Omission preserves the runtime-rendered options below. */
  readonly host?: ThreeRuntimeHostV1;
  readonly renderer?: RendererLike;
  readonly rendererFactory?: RendererFactory;
  readonly rendererOwnership?: 'owned' | 'borrowed';
  /** Size/DPR ownership is independent from renderer ownership. */
  readonly viewportOwnership?: 'runtime' | 'host';
  readonly rendererParameters?: WebGLRendererParameters;
  /** Optional browser-owned canvas used by the default or injected renderer factory. */
  readonly canvas?: HTMLCanvasElement;
  readonly scene?: Scene;
  /** Engine-owned daylight. Omitted borrowed scenes receive no implicit lights. */
  readonly daylight?: ThreeDaylightOptions | false;
  readonly camera?: OrthographicCamera;
  /** Additive camera policy. Omission preserves the legacy isometric options. */
  readonly view?: ThreeViewOptionsV1;
  readonly width: number;
  readonly height: number;
  readonly pixelRatio?: number;
  readonly center?: IsometricViewCenter;
  readonly zoom?: number;
  readonly tileWidthPixels?: number;
  readonly tileHeightPixels?: number;
}

export interface ThreeRenderMetrics {
  readonly state: 'running' | 'lost' | 'disposed';
  readonly acceptedEpoch: string | null;
  readonly acceptedRevision: number | null;
  readonly presentedEpoch: string | null;
  readonly presentedRevision: number | null;
  readonly frames: number;
  readonly materialResources: number;
  readonly geometryResources: number;
  readonly chunks: number;
  readonly visibleChunks: number;
  readonly instanceBatches: number;
  readonly instances: number;
  readonly animatedBatches: number;
  readonly animatedInstances: number;
  readonly animationMatrixUpdates: number;
  readonly instancePresentationMatrixWrites: number;
  readonly instancePresentationColorWrites: number;
  readonly instancePresentationUpdateRanges: number;
  readonly drawCalls: number;
  readonly triangles: number;
  readonly points: number;
  readonly lines: number;
  readonly rendererGeometries: number;
  readonly rendererTextures: number;
  readonly contextLosses: number;
  readonly contextRestorations: number;
  /** Validated snapshot lane bytes; repeated views count once per lane occurrence. */
  readonly snapshotInputTypedArrayBytes: number;
  /** Logical bytes written into canonical snapshot candidates, accepted or rejected. */
  readonly snapshotCopiedTypedArrayBytes: number;
  /** Canonical destination typed arrays initialized while preparing snapshots. */
  readonly snapshotCopyOperations: number;
  /** Validated delta lane bytes after the delta header matches accepted state. */
  readonly deltaInputTypedArrayBytes: number;
  /** Canonical copy-on-write and payload-write traffic while preparing deltas. */
  readonly deltaCopiedTypedArrayBytes: number;
  /** Canonical destination typed arrays allocated or cloned for delta work. */
  readonly deltaCopyOperations: number;
  /** Logical bytes copied by public defensive snapshot reads. */
  readonly defensiveSnapshotCopyBytes: number;
  /** Unique canonical typed-array capacity retained by live world revisions. */
  readonly retainedTypedArrayBytes: number;
  /** High-water mark of retained canonical typed-array capacity. */
  readonly peakRetainedTypedArrayBytes: number;
  /** Unique profiled-mesh buffer capacity held only by uncommitted presentations. */
  readonly presentationStagingBytes: number;
  /** High-water mark including provisional, pending, and frame-ticket overlap. */
  readonly peakPresentationStagingBytes: number;
  /** Null unless the runtime owns a worker-meshed voxel pipeline. */
  readonly atomic: ThreeAtomicPipelineMetricsV1 | null;
}

/**
 * Worker voxel pipeline occupancy. Every field is a live count or a byte total
 * that a steady world must hold flat: growth across repeated edits or epoch
 * replacements is a leak, which is the only way that claim is checkable from
 * outside the package.
 */
export interface ThreeAtomicPipelineMetricsV1 {
  /** Presentations prepared off-screen and not yet committed or aborted. */
  readonly preparedTargets: number;
  /** CPU bytes held by those prepared presentations. */
  readonly cpuStagingBytes: number;
  /** Estimated GPU bytes held by those prepared presentations. */
  readonly gpuStagingBytes: number;
  /** Superseded bundles whose disposal failed and is being retried. */
  readonly pendingRetiredBundles: number;
  /** Coordinator records still cleaning up after a terminal target. */
  readonly pendingRetirements: number;
  readonly queuedJobs: number;
  readonly queuedBytes: number;
  /** Worker transport events accepted but not yet delivered to the scheduler. */
  readonly queuedWorkerEvents: number;
  readonly liveWorkers: number;
}

export interface ThreeCaptureResult {
  readonly dataUrl: string;
  readonly width: number;
  readonly height: number;
  readonly epoch: string | null;
  readonly presentedRevision: number | null;
  readonly metrics: ThreeRenderMetrics;
}
