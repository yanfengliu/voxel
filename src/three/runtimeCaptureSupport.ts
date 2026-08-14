import type { RenderRevisionRefV1 } from '../core/index.js';
import type { CanonicalRenderStateV1 } from '../core/canonical-store.js';
import { capturePixelDimensionsV1Internal } from './captureManifest.js';
import type { ThreePresentedManifestV1 } from './hostFrameProtocol.js';
import type { RendererLike } from './rendererTypes.js';
import type { RevisionCaptureRuntimePortInternal } from './revisionCaptureCoordinator.js';
import {
  ThreeCaptureProtocolError,
  type ThreeCaptureReadbackRequestV1,
  type ThreeCaptureReadbackV1,
  type ThreeCaptureResourceEntryV1,
} from './revisionCaptureContracts.js';

/**
 * Enumerates the resources of exactly the presented canonical state. Returns
 * nothing when the live presented state is not the one the manifest
 * describes, so a manifest can never list resources from another revision.
 */
export function capturePresentedResourceEntriesInternal(
  presentedState: CanonicalRenderStateV1 | null,
  manifest: ThreePresentedManifestV1,
): readonly ThreeCaptureResourceEntryV1[] {
  if (
    presentedState?.worldId !== manifest.worldId
    || presentedState.epoch !== manifest.epoch
    || presentedState.revision !== manifest.presentedRevision
  ) return Object.freeze([]);
  const entries: ThreeCaptureResourceEntryV1[] = [];
  for (const resource of presentedState.resourcesViewInternal()) {
    entries.push(Object.freeze({
      lane: resource.kind,
      key: resource.key,
      incarnation: resource.incarnation,
      revision: resource.revision,
    }));
  }
  for (const chunk of presentedState.chunksViewInternal()) {
    entries.push(Object.freeze({
      lane: 'chunk',
      key: chunk.key,
      incarnation: chunk.incarnation,
      revision: chunk.revision,
    }));
  }
  for (const batch of presentedState.batchStatesViewInternal()) {
    entries.push(Object.freeze({
      lane: 'instance-batch',
      key: batch.key,
      incarnation: batch.incarnation,
      revision: batch.revision,
    }));
  }
  return Object.freeze(entries);
}

/** The runtime state the capture port reads. All of it is committed state. */
export interface RuntimeCapturePortSourceInternal {
  /**
   * Read lazily: the coordinator is built in a field initializer, before the
   * constructor body has resolved the host kind, so an eagerly captured value
   * would call every runtime — embedded ones included — runtime-owned.
   */
  captureOwnership(): 'runtime' | 'host';
  /** Lazy: the runtime binds its renderer after field initialization. */
  renderer(): RendererLike;
  runtimeStatus: RevisionCaptureRuntimePortInternal['runtimeStatus'];
  presentationReadiness: RevisionCaptureRuntimePortInternal['presentationReadiness'];
  awaitPresented: RevisionCaptureRuntimePortInternal['awaitPresented'];
  metrics: RevisionCaptureRuntimePortInternal['metrics'];
  /** The canonical state the canvas currently shows, never accepted state. */
  presentedState(): CanonicalRenderStateV1 | null;
  /** The exact manifest of the frame the canvas last presented. */
  presentedManifest(): ThreePresentedManifestV1 | null;
  isRunning(): boolean;
  deviceGeneration(): number;
  isRunningAttempt(generation: number): boolean;
  renderCurrent(): void;
  failCapture(reason: unknown): void;
}

/**
 * Issues the single fenced compatibility readback runtime-owned capture is
 * permitted. The draw is fenced to the committed manifest and its device
 * generation, so a frame change or context transition can never publish
 * foreign pixels under a committed frame's identity.
 */
function fencedRuntimeReadbackInternal(
  source: RuntimeCapturePortSourceInternal,
  presented: ThreePresentedManifestV1,
  request: ThreeCaptureReadbackRequestV1,
): ThreeCaptureReadbackV1 {
  if (
    source.presentedManifest() !== presented
    || presented.deviceGeneration !== source.deviceGeneration()
    || !source.isRunning()
  ) {
    throw new ThreeCaptureProtocolError(
      'three.capture.readback-invalid',
      'The committed frame changed before its capture readback ran.',
    );
  }
  const generation = source.deviceGeneration();
  try {
    source.renderCurrent();
  } catch (error) {
    if (source.isRunningAttempt(generation)) source.failCapture(error);
    throw error;
  }
  return captureRuntimeReadbackDataUrlInternal(source.renderer(), presented, request);
}

function revisionRefOf(state: CanonicalRenderStateV1): RenderRevisionRefV1 {
  return Object.freeze({
    worldId: state.worldId,
    epoch: state.epoch,
    revision: state.revision,
  });
}

/**
 * Adapts the runtime to the revision-aware capture port. Every accessor reads
 * the frame the canvas actually shows, so a capture manifest can never
 * describe a revision the viewer has not seen.
 */
export function createRuntimeCapturePortInternal(
  source: RuntimeCapturePortSourceInternal,
): RevisionCaptureRuntimePortInternal {
  return {
    get captureOwnership(): 'runtime' | 'host' { return source.captureOwnership(); },
    runtimeStatus: () => source.runtimeStatus(),
    presentationReadiness: (target) => source.presentationReadiness(target),
    awaitPresented: (target, signal) => source.awaitPresented(target, signal),
    currentPresented: () => {
      const presented = source.presentedState();
      return presented ? revisionRefOf(presented) : null;
    },
    currentManifest: () => source.presentedManifest(),
    metrics: () => source.metrics(),
    presentedResourceEntries: (presented) => capturePresentedResourceEntriesInternal(
      source.presentedState(),
      presented,
    ),
    runtimeReadback: (presented, request) => fencedRuntimeReadbackInternal(
      source,
      presented,
      request,
    ),
  };
}

/**
 * Reads the renderer's canvas back as a data URL for one committed frame. The
 * caller fences the draw; this only encodes and bounds the result.
 */
/**
 * The only output colour space a capture may claim.
 *
 * `SRGBColorSpace` from Three, spelled here so `voxel/three`'s capture path
 * does not depend on the constant's identity across releases.
 */
const CAPTURE_OUTPUT_COLOR_SPACE_V1 = 'srgb';

export function captureRuntimeReadbackDataUrlInternal(
  renderer: RendererLike,
  presented: ThreePresentedManifestV1,
  request: ThreeCaptureReadbackRequestV1,
): ThreeCaptureReadbackV1 {
  // A borrowed renderer decides its own output encoding, and the capture
  // contract promises sRGB. Checked before the readback so the refusal names
  // the configuration rather than shipping mis-encoded pixels that pass every
  // MIME and dimension check.
  const colorSpace = renderer.outputColorSpace;
  if (colorSpace !== undefined && colorSpace !== CAPTURE_OUTPUT_COLOR_SPACE_V1) {
    throw new ThreeCaptureProtocolError(
      'three.capture.output-color-space',
      `Capture requires a renderer whose outputColorSpace is `
      + `'${CAPTURE_OUTPUT_COLOR_SPACE_V1}'; this renderer reports `
      + `'${colorSpace}', so its pixels would not be the sRGB the capture `
      + `contract promises. Set outputColorSpace on the borrowed renderer, or `
      + `let the runtime own one.`,
    );
  }
  const dimensions = capturePixelDimensionsV1Internal(presented);
  const toDataURL = renderer.domElement.toDataURL;
  if (typeof toDataURL !== 'function') {
    throw new ThreeCaptureProtocolError(
      'three.capture.runtime-readback-missing',
      'The runtime canvas does not support data-URL readback.',
    );
  }
  const dataUrl = toDataURL.call(renderer.domElement, request.mimeType, request.quality);
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) {
    throw new ThreeCaptureProtocolError(
      'three.capture.readback-invalid',
      'The runtime canvas did not produce a data URL.',
    );
  }
  if (dataUrl.length > request.maxDataUrlCharacters) {
    throw new ThreeCaptureProtocolError(
      'three.capture.readback-too-large',
      `The capture data URL exceeds ${String(request.maxDataUrlCharacters)} characters.`,
    );
  }
  return Object.freeze({
    presented,
    kind: 'data-url',
    dataUrl,
    mimeType: request.mimeType,
    pixelWidth: dimensions.pixelWidth,
    pixelHeight: dimensions.pixelHeight,
  });
}
