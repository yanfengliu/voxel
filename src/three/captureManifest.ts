import {
  canonicalStringCompareInternal,
  stableMergeSortInternal,
} from '../core/bounded-sort.js';
import type { PresentationAbortSignalV1 } from '../core/index.js';
import type { ThreePresentedManifestV1 } from './hostFrameProtocol.js';
import {
  HARD_MAX_CAPTURE_DATA_URL_CHARACTERS_V1,
  HARD_MAX_CAPTURE_RESOURCE_ENTRIES_V1,
  THREE_CAPTURE_MANIFEST_SCHEMA_V1,
  ThreeCaptureProtocolError,
  type ThreeCaptureDetailV1,
  type ThreeCaptureManifestV1,
  type ThreeCaptureOptionsV1,
  type ThreeCapturePixelDimensionsV1,
  type ThreeCaptureReadbackRequestV1,
  type ThreeCaptureReadbackV1,
  type ThreeCaptureResourceEntryV1,
  type ThreeCaptureResourceLaneV1,
  type ThreeHostCaptureReadbackLeaseV1,
} from './revisionCaptureContracts.js';
import type {
  ThreeRenderMetrics,
  ThreeRuntimeLifecycleV1,
} from './runtimeTypes.js';

const MAX_CAPTURE_MIME_TYPE_CHARACTERS_INTERNAL = 256;
const MAX_CAPTURE_RESOURCE_KEY_CHARACTERS_INTERNAL = 256;
const CAPTURE_MIME_TYPE_INTERNAL = /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/;
const RESOURCE_LANES_INTERNAL: readonly ThreeCaptureResourceLaneV1[] = Object.freeze([
  'palette',
  'material',
  'geometry',
  'chunk',
  'instance-batch',
]);
const RESOURCE_LANE_ORDINAL_INTERNAL = new Map(
  RESOURCE_LANES_INTERNAL.map((lane, index) => [lane, index]),
);

export interface NormalizedCaptureOptionsInternal {
  readonly detail: ThreeCaptureDetailV1;
  readonly request: ThreeCaptureReadbackRequestV1;
  readonly hostReadbackLease: ThreeHostCaptureReadbackLeaseV1 | undefined;
}

function captureOptionError(message: string): ThreeCaptureProtocolError {
  return new ThreeCaptureProtocolError('three.capture.invalid-option', message);
}

function positiveSafeInteger(name: string, value: number, maximum: number): number {
  if (!Number.isSafeInteger(value) || value <= 0 || value > maximum) {
    throw captureOptionError(
      `${name} must be a positive safe integer no greater than ${String(maximum)}.`,
    );
  }
  return value;
}

export function normalizeCaptureOptionsInternal(
  options: ThreeCaptureOptionsV1 = {},
): NormalizedCaptureOptionsInternal {
  const detailValue: unknown = options.detail ?? 'summary';
  if (detailValue !== 'summary' && detailValue !== 'resources') {
    throw captureOptionError('detail must be summary or resources.');
  }
  const detail = detailValue;
  const mimeTypeValue: unknown = options.mimeType ?? 'image/png';
  if (
    typeof mimeTypeValue !== 'string'
    || mimeTypeValue.length === 0
    || mimeTypeValue.length > MAX_CAPTURE_MIME_TYPE_CHARACTERS_INTERNAL
  ) {
    throw captureOptionError('mimeType must be a nonempty bounded string.');
  }
  const mimeType = mimeTypeValue.toLowerCase();
  if (!CAPTURE_MIME_TYPE_INTERNAL.test(mimeType)) {
    throw captureOptionError('mimeType must be a valid media type without parameters.');
  }
  const quality = options.quality;
  if (quality !== undefined && (!Number.isFinite(quality) || quality < 0 || quality > 1)) {
    throw captureOptionError('quality must be finite and between zero and one.');
  }
  const maxDataUrlCharacters = positiveSafeInteger(
    'maxDataUrlCharacters',
    options.maxDataUrlCharacters ?? HARD_MAX_CAPTURE_DATA_URL_CHARACTERS_V1,
    HARD_MAX_CAPTURE_DATA_URL_CHARACTERS_V1,
  );
  return Object.freeze({
    detail,
    request: Object.freeze({
      mimeType,
      ...(quality === undefined ? {} : { quality }),
      maxDataUrlCharacters,
    }),
    hostReadbackLease: options.hostReadbackLease,
  });
}

function resourceEntry(value: ThreeCaptureResourceEntryV1): ThreeCaptureResourceEntryV1 {
  if (!RESOURCE_LANE_ORDINAL_INTERNAL.has(value.lane)) {
    throw new TypeError('Capture resource lane is invalid.');
  }
  if (
    typeof value.key !== 'string'
    || value.key.length === 0
    || value.key.length > MAX_CAPTURE_RESOURCE_KEY_CHARACTERS_INTERNAL
  ) {
    throw new TypeError('Capture resource key must be a nonempty bounded string.');
  }
  for (const field of ['incarnation', 'revision'] as const) {
    if (!Number.isSafeInteger(value[field]) || value[field] < 0) {
      throw new RangeError(`Capture resource ${field} must be a nonnegative safe integer.`);
    }
  }
  return Object.freeze({
    lane: value.lane,
    key: value.key,
    incarnation: value.incarnation,
    revision: value.revision,
  });
}

function compareResourceEntries(
  left: ThreeCaptureResourceEntryV1,
  right: ThreeCaptureResourceEntryV1,
): number {
  const laneDifference = RESOURCE_LANE_ORDINAL_INTERNAL.get(left.lane)!
    - RESOURCE_LANE_ORDINAL_INTERNAL.get(right.lane)!;
  if (laneDifference !== 0) return laneDifference;
  const keyDifference = canonicalStringCompareInternal(left.key, right.key);
  if (keyDifference !== 0) return keyDifference;
  const incarnationDifference = left.incarnation - right.incarnation;
  return incarnationDifference !== 0 ? incarnationDifference : left.revision - right.revision;
}

function captureResources(
  values: readonly ThreeCaptureResourceEntryV1[],
): readonly ThreeCaptureResourceEntryV1[] {
  if (values.length > HARD_MAX_CAPTURE_RESOURCE_ENTRIES_V1) {
    throw new RangeError(
      `Capture resource detail exceeds ${String(HARD_MAX_CAPTURE_RESOURCE_ENTRIES_V1)} entries.`,
    );
  }
  const sorted = stableMergeSortInternal(values.map(resourceEntry), compareResourceEntries);
  for (let index = 1; index < sorted.length; index += 1) {
    const previous = sorted[index - 1]!;
    const current = sorted[index]!;
    if (previous.lane === current.lane && previous.key === current.key) {
      throw new Error(`Capture resource detail repeats ${current.lane} ${current.key}.`);
    }
  }
  return Object.freeze(sorted);
}

export function createCaptureManifestInternal(options: {
  readonly detail: ThreeCaptureDetailV1;
  readonly presented: ThreePresentedManifestV1;
  readonly runtimeState: ThreeRuntimeLifecycleV1;
  readonly metrics: ThreeRenderMetrics;
  readonly resources?: readonly ThreeCaptureResourceEntryV1[];
}): ThreeCaptureManifestV1 {
  if (options.metrics.presentedEpoch !== options.presented.epoch
    || options.metrics.presentedRevision !== options.presented.presentedRevision) {
    throw new Error('Capture metrics do not match the committed presented manifest.');
  }
  const resources = options.detail === 'resources'
    ? captureResources(options.resources ?? [])
    : undefined;
  return Object.freeze({
    schemaVersion: THREE_CAPTURE_MANIFEST_SCHEMA_V1,
    detail: options.detail,
    presented: options.presented,
    runtimeState: options.runtimeState,
    metrics: Object.freeze({ ...options.metrics }),
    ...(resources === undefined ? {} : { resources }),
  });
}

export function validateCaptureReadbackInternal(
  value: unknown,
  presented: ThreePresentedManifestV1,
  request: ThreeCaptureReadbackRequestV1,
): ThreeCaptureReadbackV1 {
  if (typeof value !== 'object' || value === null) {
    throw new ThreeCaptureProtocolError(
      'three.capture.readback-invalid',
      'Capture readback must be an object.',
    );
  }
  const input = value as Partial<ThreeCaptureReadbackV1>;
  if (input.presented !== presented || input.kind !== 'data-url') {
    throw new ThreeCaptureProtocolError(
      'three.capture.readback-invalid',
      'Capture readback must reference the exact supplied manifest and data-url kind.',
    );
  }
  if (typeof input.dataUrl !== 'string' || !input.dataUrl.startsWith('data:')) {
    throw new ThreeCaptureProtocolError(
      'three.capture.readback-invalid',
      'Capture readback dataUrl must be a data URL.',
    );
  }
  if (input.dataUrl.length > request.maxDataUrlCharacters) {
    throw new ThreeCaptureProtocolError(
      'three.capture.readback-too-large',
      `Capture readback exceeds ${String(request.maxDataUrlCharacters)} characters.`,
    );
  }
  const comma = input.dataUrl.indexOf(',');
  const parameters = input.dataUrl.indexOf(';');
  const mimeEnd = parameters >= 0 && parameters < comma ? parameters : comma;
  const dataUrlMimeType = mimeEnd > 5 ? input.dataUrl.slice(5, mimeEnd).toLowerCase() : '';
  if (input.mimeType !== request.mimeType || dataUrlMimeType !== request.mimeType) {
    throw new ThreeCaptureProtocolError(
      'three.capture.readback-invalid',
      'Capture readback MIME evidence must exactly match the effective request.',
    );
  }
  const expected = capturePixelDimensionsV1Internal(presented);
  if (input.pixelWidth !== expected.pixelWidth || input.pixelHeight !== expected.pixelHeight) {
    throw new ThreeCaptureProtocolError(
      'three.capture.readback-invalid',
      'Capture readback pixel dimensions do not match floor(viewport * DPR).',
    );
  }
  return Object.freeze({
    presented,
    kind: 'data-url',
    dataUrl: input.dataUrl,
    mimeType: input.mimeType,
    pixelWidth: expected.pixelWidth,
    pixelHeight: expected.pixelHeight,
  });
}

/** Matches Three WebGLRenderer.setSize: floor each logical dimension times DPR. */
export function capturePixelDimensionsV1Internal(
  presented: ThreePresentedManifestV1,
): ThreeCapturePixelDimensionsV1 {
  const { width, height, pixelRatio } = presented.viewport;
  if (![width, height, pixelRatio].every((value) => Number.isFinite(value) && value > 0)) {
    throw new ThreeCaptureProtocolError(
      'three.capture.readback-invalid',
      'Capture viewport and DPR must be positive finite values.',
    );
  }
  const pixelWidth = Math.floor(width * pixelRatio);
  const pixelHeight = Math.floor(height * pixelRatio);
  if (
    !Number.isSafeInteger(pixelWidth)
    || pixelWidth <= 0
    || !Number.isSafeInteger(pixelHeight)
    || pixelHeight <= 0
  ) {
    throw new ThreeCaptureProtocolError(
      'three.capture.readback-invalid',
      'Capture floor(viewport * DPR) dimensions must be positive safe integers.',
    );
  }
  return Object.freeze({ pixelWidth, pixelHeight });
}

export function captureAbortReasonInternal(signal: PresentationAbortSignalV1): Error {
  if (signal.reason instanceof Error) return signal.reason;
  const error = new Error('The capture wait was aborted.', { cause: signal.reason });
  error.name = 'AbortError';
  return error;
}
