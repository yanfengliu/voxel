import {
  validateScenePoseReplayV1,
  validateScenePoseReplayV2,
  type ScenePoseReplayEventV1,
  type ScenePoseReplayProvenanceV1,
  type ScenePoseReplayTrackV1,
  type ScenePoseReplayV1,
  type ScenePoseReplayV2,
} from './scene-pose-replay.js';

export interface EncodedInterleavedScenePoseReplayV1 {
  readonly sceneId: string;
  readonly frameCount: number;
  readonly placementIds: readonly string[];
  readonly provenance: ScenePoseReplayProvenanceV1;
  /** Little-endian Float32 data, frame-major then placement-major. */
  readonly translationsBase64: string;
  readonly quaternionsBase64: string;
  readonly linearVelocitiesBase64: string;
  readonly angularVelocitiesBase64: string;
  readonly events: readonly ScenePoseReplayEventV1[];
}
export interface EncodedInterleavedScenePoseReplayV2
  extends EncodedInterleavedScenePoseReplayV1 {
  readonly playback: 'once';
}

/** Decodes a bounded little-endian Float32 channel used by generated fixtures. */
export function decodeFloat32LittleEndianV1(
  encoded: string,
  expectedValues: number,
  path: string,
): Float32Array {
  let binary: string;
  try {
    binary = atob(encoded);
  } catch (error) {
    throw new Error(
      `Cannot decode ${path}: expected canonical base64 for ${String(expectedValues)} Float32 values.`,
      { cause: error },
    );
  }
  const expectedBytes = expectedValues * Float32Array.BYTES_PER_ELEMENT;
  if (binary.length !== expectedBytes) {
    throw new Error(
      `Cannot decode ${path}: expected ${String(expectedBytes)} bytes for `
      + `${String(expectedValues)} Float32 values, received ${String(binary.length)}.`,
    );
  }
  const bytes = new Uint8Array(expectedBytes);
  for (let index = 0; index < expectedBytes; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  const view = new DataView(bytes.buffer);
  const values = new Float32Array(expectedValues);
  for (let index = 0; index < expectedValues; index += 1) {
    values[index] = view.getFloat32(index * Float32Array.BYTES_PER_ELEMENT, true);
  }
  return values;
}

function deinterleave(
  source: Float32Array,
  frameCount: number,
  trackCount: number,
  width: number,
  track: number,
): Float32Array {
  const values = new Float32Array(frameCount * width);
  for (let frame = 0; frame < frameCount; frame += 1) {
    const sourceOffset = (frame * trackCount + track) * width;
    values.set(source.subarray(sourceOffset, sourceOffset + width), frame * width);
  }
  return values;
}

/**
 * Expands a committed, solver-produced trace into the private Studio replay
 * contract. Decoding is mechanical: it does not integrate, infer contacts, or
 * alter the recorded observations.
 */
export function decodeInterleavedScenePoseReplayV1(
  encoded: EncodedInterleavedScenePoseReplayV1,
): ScenePoseReplayV1 {
  const trackCount = encoded.placementIds.length;
  if (trackCount === 0) {
    throw new Error('Cannot decode scene pose replay: placementIds must contain at least one track.');
  }
  const vectorValues = encoded.frameCount * trackCount * 3;
  const quaternionValues = encoded.frameCount * trackCount * 4;
  const translations = decodeFloat32LittleEndianV1(
    encoded.translationsBase64,
    vectorValues,
    'translationsBase64',
  );
  const quaternions = decodeFloat32LittleEndianV1(
    encoded.quaternionsBase64,
    quaternionValues,
    'quaternionsBase64',
  );
  const linearVelocities = decodeFloat32LittleEndianV1(
    encoded.linearVelocitiesBase64,
    vectorValues,
    'linearVelocitiesBase64',
  );
  const angularVelocities = decodeFloat32LittleEndianV1(
    encoded.angularVelocitiesBase64,
    vectorValues,
    'angularVelocitiesBase64',
  );
  const tracks: ScenePoseReplayTrackV1[] = encoded.placementIds.map((placementId, track) => ({
    placementId,
    translations: deinterleave(translations, encoded.frameCount, trackCount, 3, track),
    quaternions: deinterleave(quaternions, encoded.frameCount, trackCount, 4, track),
    linearVelocities: deinterleave(linearVelocities, encoded.frameCount, trackCount, 3, track),
    angularVelocities: deinterleave(angularVelocities, encoded.frameCount, trackCount, 3, track),
  }));
  const replay: ScenePoseReplayV1 = {
    schemaVersion: 'studio.scene-pose-replay/1',
    sceneId: encoded.sceneId,
    frameCount: encoded.frameCount,
    provenance: encoded.provenance,
    tracks,
    events: encoded.events,
  };
  const issues = validateScenePoseReplayV1(replay);
  if (issues.length > 0) {
    throw new Error(
      `Decoded scene pose replay '${encoded.sceneId}' is invalid: `
      + issues.map((issue) => `${issue.path} ${issue.message}`).join('; '),
    );
  }
  return replay;
}

/**
 * Decodes a finite observation without introducing a cyclic reset. The binary
 * channels are identical to V1; the versioned playback field changes only how
 * Studio maps time at the trace boundary.
 */
export function decodeInterleavedScenePoseReplayV2(
  encoded: EncodedInterleavedScenePoseReplayV2,
): ScenePoseReplayV2 {
  const cyclic = decodeInterleavedScenePoseReplayV1(encoded);
  const replay: ScenePoseReplayV2 = {
    ...cyclic,
    schemaVersion: 'studio.scene-pose-replay/2',
    playback: encoded.playback,
  };
  const issues = validateScenePoseReplayV2(replay);
  if (issues.length > 0) {
    throw new Error(
      `Decoded finite scene pose replay '${encoded.sceneId}' is invalid: `
      + issues.map((issue) => `${issue.path} ${issue.message}`).join('; '),
    );
  }
  return replay;
}
