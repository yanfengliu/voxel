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
  readonly snapshotInputTypedArrayBytes: number;
  readonly snapshotCopiedTypedArrayBytes: number;
  readonly snapshotCopyOperations: number;
  readonly deltaInputTypedArrayBytes: number;
  readonly deltaCopiedTypedArrayBytes: number;
  readonly deltaCopyOperations: number;
  readonly defensiveSnapshotCopyBytes: number;
  readonly retainedTypedArrayBytes: number;
  readonly peakRetainedTypedArrayBytes: number;
  readonly presentationStagingBytes: number;
  readonly peakPresentationStagingBytes: number;
}

export interface ThreeCaptureResult {
  readonly dataUrl: string;
  readonly width: number;
  readonly height: number;
  readonly epoch: string | null;
  readonly presentedRevision: number | null;
  readonly metrics: ThreeRenderMetrics;
}
