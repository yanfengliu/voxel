import { createHash, type Hash } from 'node:crypto';

import {
  canonicalRiverfallFluidJsonV1,
} from './riverfall-fluid-config.js';
import type {
  RiverfallFluidStateV1,
} from './riverfall-pbf.js';
import type {
  RiverfallFluidTraceDiagnosticsV1,
  RiverfallFluidTraceSummaryV1,
} from './riverfall-fluid-simulation.js';

function littleEndianBytes(values: ArrayBufferView): Uint8Array {
  const bytesPerElement = values instanceof Float32Array
    ? Float32Array.BYTES_PER_ELEMENT
    : values instanceof Uint16Array
      ? Uint16Array.BYTES_PER_ELEMENT
      : Uint8Array.BYTES_PER_ELEMENT;
  const count = values.byteLength / bytesPerElement;
  const bytes = new Uint8Array(values.byteLength);
  const output = new DataView(bytes.buffer);
  if (values instanceof Float32Array) {
    for (let index = 0; index < count; index += 1) {
      output.setFloat32(index * 4, values[index]!, true);
    }
  } else if (values instanceof Uint16Array) {
    for (let index = 0; index < count; index += 1) {
      output.setUint16(index * 2, values[index]!, true);
    }
  } else if (values instanceof Uint8Array) {
    bytes.set(values);
  } else {
    throw new Error(
      `Cannot hash Riverfall fluid ${values.constructor.name}; expected `
      + 'Float32Array, Uint16Array, or Uint8Array.',
    );
  }
  return bytes;
}

function hashField(
  hash: Hash,
  name: string,
  value: string | ArrayBufferView,
): void {
  const nameBytes = new TextEncoder().encode(name);
  const valueBytes = typeof value === 'string'
    ? new TextEncoder().encode(value)
    : littleEndianBytes(value);
  const length = new Uint8Array(8);
  const view = new DataView(length.buffer);
  view.setUint32(0, nameBytes.length, true);
  view.setUint32(4, valueBytes.length, true);
  hash.update(length);
  hash.update(nameBytes);
  hash.update(valueBytes);
}

export function finalRiverfallFluidTraceHashV1(
  inputHash: string,
  translations: Float32Array,
  rotations: Float32Array,
  linearVelocities: Float32Array,
  angularVelocities: Float32Array,
  diagnostics: RiverfallFluidTraceDiagnosticsV1,
  summary: RiverfallFluidTraceSummaryV1,
  finalState: RiverfallFluidStateV1,
  witnessParticleIndices: Uint16Array,
  recordingInitialLongitudinal: Float32Array,
  recordingInitialLateral: Float32Array,
  visibleWitnesses: Uint8Array,
  placementIds: readonly string[],
): string {
  const hash = createHash('sha256');
  hashField(hash, 'domain', 'studio.riverfall-fluid-trace/1');
  hashField(hash, 'inputHash', inputHash);
  hashField(hash, 'witnessParticleIndices', witnessParticleIndices);
  hashField(
    hash,
    'recordingInitialLongitudinal',
    recordingInitialLongitudinal,
  );
  hashField(hash, 'recordingInitialLateral', recordingInitialLateral);
  hashField(hash, 'visibleWitnesses', visibleWitnesses);
  hashField(hash, 'placementIds', canonicalRiverfallFluidJsonV1(placementIds));
  for (const [name, values] of Object.entries({
    translations,
    rotations,
    linearVelocities,
    angularVelocities,
    ...diagnostics,
    finalLongitudinal: finalState.longitudinal,
    finalLateral: finalState.lateral,
    finalLongitudinalVelocity: finalState.longitudinalVelocity,
    finalLateralVelocity: finalState.lateralVelocity,
  })) {
    hashField(hash, name, values);
  }
  hashField(hash, 'summary', JSON.stringify(summary));
  return hash.digest('hex');
}
