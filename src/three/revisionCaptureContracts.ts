import type {
  PresentationAbortSignalV1,
  RenderRevisionRefV1,
} from '../core/index.js';
import type { ThreePresentedManifestV1 } from './hostFrameProtocol.js';
import type {
  ThreeRenderMetrics,
  ThreeRuntimeLifecycleV1,
} from './runtimeTypes.js';

export const THREE_CAPTURE_MANIFEST_SCHEMA_V1 =
  'voxel.three-capture-manifest/1' as const;
export const HARD_MAX_CAPTURE_RESOURCE_ENTRIES_V1 = 300_000;
export const HARD_MAX_CAPTURE_DATA_URL_CHARACTERS_V1 = 67_108_864;

export type ThreeCaptureDetailV1 = 'summary' | 'resources';
export type ThreeCaptureResourceLaneV1 =
  | 'palette'
  | 'material'
  | 'geometry'
  | 'chunk'
  | 'instance-batch';

export interface ThreeCaptureResourceEntryV1 {
  readonly lane: ThreeCaptureResourceLaneV1;
  readonly key: string;
  readonly incarnation: number;
  readonly revision: number;
}

export interface ThreeCaptureManifestV1 {
  readonly schemaVersion: typeof THREE_CAPTURE_MANIFEST_SCHEMA_V1;
  readonly detail: ThreeCaptureDetailV1;
  /** Exact immutable object returned by the successful frame commit. */
  readonly presented: ThreePresentedManifestV1;
  readonly runtimeState: ThreeRuntimeLifecycleV1;
  readonly metrics: Readonly<ThreeRenderMetrics>;
  readonly resources?: readonly ThreeCaptureResourceEntryV1[];
}

export interface ThreeCaptureReadbackRequestV1 {
  readonly mimeType: string;
  readonly quality?: number;
  readonly maxDataUrlCharacters: number;
}

export interface ThreeCaptureReadbackV1 {
  /** Must be the same object passed to the readback implementation. */
  readonly presented: ThreePresentedManifestV1;
  readonly kind: 'data-url';
  readonly dataUrl: string;
  readonly mimeType: string;
  readonly pixelWidth: number;
  readonly pixelHeight: number;
}

export interface ThreeCapturePixelDimensionsV1 {
  readonly pixelWidth: number;
  readonly pixelHeight: number;
}

/**
 * One-shot host authority to compose/read back the supplied committed frame.
 * A failed release is terminal one-shot cleanup debt: the coordinator never
 * retries or reuses the lease because doing so could duplicate host readback.
 */
export interface ThreeHostCaptureReadbackLeaseV1 {
  readonly maxReadbacks: 1;
  readonly maxDataUrlCharacters: number;
  readback(
    presented: ThreePresentedManifestV1,
    request: ThreeCaptureReadbackRequestV1,
  ): ThreeCaptureReadbackV1;
  release(): void;
}

export interface ThreeCaptureOptionsV1 {
  readonly detail?: ThreeCaptureDetailV1;
  readonly mimeType?: string;
  readonly quality?: number;
  readonly maxDataUrlCharacters?: number;
  readonly hostReadbackLease?: ThreeHostCaptureReadbackLeaseV1;
}

export interface ThreeCaptureWhenPresentedOptionsV1 extends ThreeCaptureOptionsV1 {
  readonly signal?: PresentationAbortSignalV1;
}

export type ThreeCaptureUnavailableReasonV1 =
  | 'initializing'
  | 'no-presented-frame'
  | 'context-lost'
  | 'restoring'
  | 'failed'
  | 'disposed'
  | 'epoch-replaced'
  | 'manifest-mismatch'
  | 'presentation-changed';

export type ThreeCaptureWithManifestResultV1 =
  | {
      readonly status: 'captured';
      readonly manifest: ThreeCaptureManifestV1;
      readonly readback: ThreeCaptureReadbackV1;
    }
  | {
      readonly status: 'host-capture-owned';
      readonly manifest: ThreeCaptureManifestV1;
    }
  | {
      readonly status: 'unavailable';
      readonly reason: ThreeCaptureUnavailableReasonV1;
    };

export type ThreeCaptureTargetClassificationV1 =
  | {
      readonly status: 'ready';
      readonly target: RenderRevisionRefV1;
      readonly presentedThrough: RenderRevisionRefV1;
      readonly presented: ThreePresentedManifestV1;
    }
  | {
      readonly status: 'pending';
      readonly reason: 'not-accepted' | 'pending';
      readonly target: RenderRevisionRefV1;
      readonly accepted: RenderRevisionRefV1 | null;
      readonly presentedThrough: RenderRevisionRefV1 | null;
    }
  | {
      readonly status: 'superseded';
      readonly target: RenderRevisionRefV1;
      readonly presentedThrough: RenderRevisionRefV1;
      readonly presented: ThreePresentedManifestV1;
    }
  | {
      readonly status: 'unavailable';
      readonly reason: ThreeCaptureUnavailableReasonV1;
      readonly target: RenderRevisionRefV1;
    };

type ReadyCaptureDispositionV1 = Exclude<
  ThreeCaptureWithManifestResultV1,
  { readonly status: 'unavailable' }
>;

export type ThreeCaptureWhenPresentedResultV1 =
  | {
      readonly status: 'ready';
      readonly target: RenderRevisionRefV1;
      readonly presentedThrough: RenderRevisionRefV1;
      readonly capture: ReadyCaptureDispositionV1;
    }
  | Exclude<ThreeCaptureTargetClassificationV1, { readonly status: 'ready' }>;

export type ThreeCaptureProtocolErrorCodeV1 =
  | 'three.capture.invalid-option'
  | 'three.capture.runtime-readback-missing'
  | 'three.capture.lease-invalid'
  | 'three.capture.lease-used'
  | 'three.capture.lease-release-failed'
  | 'three.capture.reentrant'
  | 'three.capture.readback-invalid'
  | 'three.capture.readback-too-large';

export class ThreeCaptureProtocolError extends Error {
  readonly code: ThreeCaptureProtocolErrorCodeV1;

  constructor(code: ThreeCaptureProtocolErrorCodeV1, message: string, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = 'ThreeCaptureProtocolError';
    this.code = code;
  }
}

/** Both failures are retained; the consumed lease is never coordinator-retryable. */
export class ThreeCaptureLeaseCleanupError extends ThreeCaptureProtocolError {
  readonly readbackFailed: boolean;
  readonly primaryError: unknown;
  readonly releaseError: unknown;
  readonly terminalOneShotDebt = true as const;

  constructor(readbackFailed: boolean, primaryError: unknown, releaseError: unknown) {
    const errors = readbackFailed ? [primaryError, releaseError] : [releaseError];
    super(
      'three.capture.lease-release-failed',
      readbackFailed
        ? 'Capture readback and terminal lease release both failed.'
        : 'Capture lease release failed and cannot be retried safely.',
      new AggregateError(errors, 'Capture lease cleanup failed.'),
    );
    this.name = 'ThreeCaptureLeaseCleanupError';
    this.readbackFailed = readbackFailed;
    this.primaryError = primaryError;
    this.releaseError = releaseError;
  }
}
