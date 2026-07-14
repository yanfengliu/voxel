import {
  OrthographicCamera,
  PerspectiveCamera,
  type Camera,
  type Scene,
} from 'three';

import type { RenderRevisionRefV1 } from '../core/index.js';
import type { RendererLike } from './rendererTypes.js';

export const THREE_PRESENTED_MANIFEST_SCHEMA_V1 =
  'voxel.three-presented-manifest/1' as const;

export type ThreeRuntimeHostV1 =
  | {
      readonly kind: 'runtime-rendered';
      readonly viewportOwnership: 'runtime' | 'host';
    }
  | {
      readonly kind: 'embedded';
      readonly renderer: RendererLike;
      readonly scene: Scene;
      readonly camera: Camera;
      readonly drawOwnership: 'host';
      readonly viewportOwnership: 'host';
      readonly captureOwnership: 'host';
    };

export interface ThreeFrameContext {
  readonly nowMs: number;
  readonly deltaMs: number;
  readonly frameIndex: number;
}

declare const PREPARED_FRAME_TICKET_BRAND: unique symbol;

/** Opaque single-runtime, single-use acknowledgement token. */
export interface ThreePreparedFrameTicket {
  readonly [PREPARED_FRAME_TICKET_BRAND]: true;
}

export type ThreePrepareFrameResult =
  | {
      readonly status: 'prepared';
      readonly ticket: ThreePreparedFrameTicket;
      readonly target: RenderRevisionRefV1 | null;
      readonly restoration: boolean;
    }
  | {
      readonly status: 'unavailable';
      readonly reason: 'context-lost' | 'restoring';
      readonly deviceGeneration: number;
    };

export interface ThreePresentedCameraV1 {
  /** Selects exact NDC-ray origin semantics without rereading a mutable camera. */
  readonly projectionKind: 'perspective' | 'orthographic' | 'generic';
  readonly projectionMatrix: readonly number[];
  readonly projectionMatrixInverse: readonly number[];
  readonly matrixWorld: readonly number[];
  readonly matrixWorldInverse: readonly number[];
}

export interface ThreePresentedViewportV1 {
  readonly width: number;
  readonly height: number;
  readonly pixelRatio: number;
}

export interface ThreePresentedManifestV1 {
  readonly schemaVersion: typeof THREE_PRESENTED_MANIFEST_SCHEMA_V1;
  readonly worldId: string | null;
  readonly epoch: string | null;
  readonly presentedRevision: number | null;
  readonly frame: Readonly<ThreeFrameContext>;
  readonly viewport: Readonly<ThreePresentedViewportV1>;
  readonly deviceGeneration: number;
  readonly cameraGeneration: number;
  readonly camera: Readonly<ThreePresentedCameraV1>;
}

export type ThreeRuntimeProtocolErrorCodeV1 =
  | 'three.host.draw-owned'
  | 'three.host.capture-owned'
  | 'three.host.embedded-only'
  | 'three.frame-ticket.outstanding'
  | 'three.frame-ticket.foreign'
  | 'three.frame-ticket.used'
  | 'three.frame-ticket.stale-device'
  | 'three.frame-ticket.late';

export class ThreeRuntimeProtocolError extends Error {
  readonly code: ThreeRuntimeProtocolErrorCodeV1;

  constructor(code: ThreeRuntimeProtocolErrorCodeV1, message: string, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = 'ThreeRuntimeProtocolError';
    this.code = code;
  }
}

export function createPreparedFrameTicketInternal(): ThreePreparedFrameTicket {
  return Object.freeze({}) as ThreePreparedFrameTicket;
}

function frozenMatrix(name: string, values: readonly number[]): readonly number[] {
  if (values.length !== 16 || !values.every(Number.isFinite)) {
    throw new RangeError(`${name} must contain sixteen finite values.`);
  }
  return Object.freeze([...values]);
}

export function createPresentedManifestInternal(options: {
  readonly target: RenderRevisionRefV1 | null;
  readonly context: ThreeFrameContext;
  readonly width: number;
  readonly height: number;
  readonly pixelRatio: number;
  readonly deviceGeneration: number;
  readonly cameraGeneration: number;
  readonly camera: Camera;
}): ThreePresentedManifestV1 {
  const frame = Object.freeze({ ...options.context });
  const viewport = Object.freeze({
    width: options.width,
    height: options.height,
    pixelRatio: options.pixelRatio,
  });
  const camera = Object.freeze({
    projectionKind: options.camera instanceof PerspectiveCamera
      ? 'perspective' as const
      : options.camera instanceof OrthographicCamera
        ? 'orthographic' as const
        : 'generic' as const,
    projectionMatrix: frozenMatrix(
      'camera.projectionMatrix',
      options.camera.projectionMatrix.toArray(),
    ),
    projectionMatrixInverse: frozenMatrix(
      'camera.projectionMatrixInverse',
      options.camera.projectionMatrixInverse.toArray(),
    ),
    matrixWorld: frozenMatrix('camera.matrixWorld', options.camera.matrixWorld.toArray()),
    matrixWorldInverse: frozenMatrix(
      'camera.matrixWorldInverse',
      options.camera.matrixWorldInverse.toArray(),
    ),
  });
  return Object.freeze({
    schemaVersion: THREE_PRESENTED_MANIFEST_SCHEMA_V1,
    worldId: options.target?.worldId ?? null,
    epoch: options.target?.epoch ?? null,
    presentedRevision: options.target?.revision ?? null,
    frame,
    viewport,
    deviceGeneration: options.deviceGeneration,
    cameraGeneration: options.cameraGeneration,
    camera,
  });
}
