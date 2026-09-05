import type { OakRenderFrameV1 } from './oak-render-adapter.js';
import type { OakRenderInstanceRecordV1 } from './oak-render-projection.js';
import type { RenderResourceV1 } from '../../src/core/index.js';

interface OakBatchIntegrityV1 {
  readonly key: string;
  readonly incarnation: number;
  readonly revision: number;
  readonly geometryKey: string;
  readonly materialKey: string;
  readonly hasPresentation: boolean;
  readonly castShadow: boolean;
  readonly receiveShadow: boolean;
  readonly instanceKeys: readonly string[];
  /** Exact private copies; never returned to a caller or mutated in this module. */
  readonly matrices: Float32Array;
  readonly colors: Uint8Array;
}

interface OakChunkIntegrityV1 {
  readonly key: string;
  readonly incarnation: number;
  readonly revision: number;
  readonly paletteKey: string;
  readonly materialKey: string;
  readonly origin: readonly [number, number, number];
  readonly size: readonly [number, number, number];
  /** Exact private copy; never returned to a caller. */
  readonly voxels: Uint16Array;
}

interface OakFrameIntegrityV1 {
  readonly worldId: string;
  readonly epoch: string;
  readonly revision: number;
  readonly resources: readonly RenderResourceV1[];
  readonly batches: readonly OakBatchIntegrityV1[];
  readonly chunks: readonly OakChunkIntegrityV1[];
}

/** Caller-inaccessible exact expectations for producer-built frames. */
const OAK_FRAME_INTEGRITY_V1 = new WeakMap<OakRenderFrameV1, OakFrameIntegrityV1>();

function integrityFailure(role: string, detail: string): never {
  throw new Error(
    `Oak render ${role} integrity check failed: ${detail}. `
    + 'Pass only an unmodified frame returned by buildOakRenderFrameV1.',
  );
}

function assertEqual(
  actual: unknown,
  expected: unknown,
  role: string,
  detail: string,
): void {
  if (actual !== expected) {
    integrityFailure(role, `${detail} changed from ${String(expected)} to ${String(actual)}`);
  }
}

function exactDifference(actual: unknown, expected: unknown, path: string): string | null {
  if (Object.is(actual, expected)) return null;
  if (actual === null || expected === null
    || typeof actual !== 'object' || typeof expected !== 'object') {
    return `${path} changed from ${String(expected)} to ${String(actual)}`;
  }
  if (ArrayBuffer.isView(actual) || ArrayBuffer.isView(expected)) {
    if (!ArrayBuffer.isView(actual) || !ArrayBuffer.isView(expected)
      || actual.constructor !== expected.constructor) return `${path} typed-array layout changed`;
    const actualValues = actual as unknown as ArrayLike<number>;
    const expectedValues = expected as unknown as ArrayLike<number>;
    if (actualValues.length !== expectedValues.length) return `${path} length changed`;
    for (let index = 0; index < expectedValues.length; index += 1) {
      if (!Object.is(actualValues[index], expectedValues[index])) {
        return `${path}[${String(index)}] changed from ${String(expectedValues[index])} `
          + `to ${String(actualValues[index])}`;
      }
    }
    return null;
  }
  if (Array.isArray(actual) || Array.isArray(expected)) {
    if (!Array.isArray(actual) || !Array.isArray(expected)) return `${path} array layout changed`;
    if (actual.length !== expected.length) return `${path} length changed`;
    for (let index = 0; index < expected.length; index += 1) {
      const difference = exactDifference(actual[index], expected[index], `${path}[${String(index)}]`);
      if (difference !== null) return difference;
    }
    return null;
  }
  const actualRecord = actual as Record<string, unknown>;
  const expectedRecord = expected as Record<string, unknown>;
  const actualKeys = Object.keys(actualRecord).sort();
  const expectedKeys = Object.keys(expectedRecord).sort();
  if (actualKeys.length !== expectedKeys.length
    || actualKeys.some((key, index) => key !== expectedKeys[index])) return `${path} fields changed`;
  for (const key of expectedKeys) {
    const difference = exactDifference(actualRecord[key], expectedRecord[key], `${path}.${key}`);
    if (difference !== null) return difference;
  }
  return null;
}

/**
 * Register exact producer expectations. New typed expectations are copied
 * before the frame escapes; identity-reused batches/chunks retain their prior
 * caller-inaccessible expectations without probabilistic fingerprints.
 */
export function registerOakRenderFrameIntegrityV1(
  frame: OakRenderFrameV1,
  canonicalRecordsByBatch: ReadonlyMap<string, readonly OakRenderInstanceRecordV1[]>,
  previousFrame: OakRenderFrameV1 | undefined,
): void {
  const previousIntegrity = previousFrame === undefined
    ? undefined
    : OAK_FRAME_INTEGRITY_V1.get(previousFrame);
  const batches = frame.snapshot.batches.map((batch, index) => {
    const canonicalRecords = canonicalRecordsByBatch.get(batch.key);
    if (canonicalRecords === undefined) {
      throw new Error(`Oak render frame construction omitted canonical batch '${batch.key}'.`);
    }
    const previousBatch = previousFrame?.snapshot.batches[index];
    const previousExpectation = previousIntegrity?.batches[index];
    const retainsExactExpectation = previousBatch === batch
      && previousExpectation !== undefined;
    return Object.freeze({
      key: batch.key,
      incarnation: batch.incarnation,
      revision: batch.revision,
      geometryKey: batch.geometryKey,
      materialKey: batch.materialKey,
      hasPresentation: batch.presentation !== undefined,
      castShadow: batch.presentation?.castShadow ?? false,
      receiveShadow: batch.presentation?.receiveShadow ?? false,
      instanceKeys: retainsExactExpectation
        ? previousExpectation.instanceKeys
        : Object.freeze(canonicalRecords.map((record) => record.key)),
      matrices: retainsExactExpectation
        ? previousExpectation.matrices
        : batch.matrices.slice(),
      colors: retainsExactExpectation
        ? previousExpectation.colors
        : batch.colors!.slice(),
    });
  });
  const chunks = frame.snapshot.chunks.map((chunk, index) => {
    const previousChunk = previousFrame?.snapshot.chunks[index];
    const previousExpectation = previousIntegrity?.chunks[index];
    const exactVoxels = previousChunk?.voxels === chunk.voxels
      && previousExpectation !== undefined
      ? previousExpectation.voxels
      : chunk.voxels.slice();
    return Object.freeze({
      key: chunk.key,
      incarnation: chunk.incarnation,
      revision: chunk.revision,
      paletteKey: chunk.paletteKey,
      materialKey: chunk.materialKey,
      origin: Object.freeze([chunk.origin.x, chunk.origin.y, chunk.origin.z] as const),
      size: Object.freeze([chunk.size.x, chunk.size.y, chunk.size.z] as const),
      voxels: exactVoxels,
    });
  });
  OAK_FRAME_INTEGRITY_V1.set(frame, Object.freeze({
    worldId: frame.snapshot.descriptor.worldId,
    epoch: frame.snapshot.descriptor.epoch,
    revision: frame.snapshot.revision,
    resources: structuredClone(frame.snapshot.resources),
    batches: Object.freeze(batches),
    chunks: Object.freeze(chunks),
  }));
}

/** Validate every mutable public field relied on by identity reuse or deltas. */
export function assertOakRenderFrameIntegrityV1(
  frame: OakRenderFrameV1,
  role: string,
): void {
  const expected = OAK_FRAME_INTEGRITY_V1.get(frame);
  if (expected === undefined) {
    integrityFailure(role, 'the producer integrity record is missing');
  }
  assertEqual(frame.snapshot.descriptor.worldId, expected.worldId, role, 'world id');
  assertEqual(frame.snapshot.descriptor.epoch, expected.epoch, role, 'epoch');
  assertEqual(frame.snapshot.revision, expected.revision, role, 'snapshot revision');
  const resourceDifference = exactDifference(
    frame.snapshot.resources,
    expected.resources,
    'resources',
  );
  if (resourceDifference !== null) integrityFailure(role, resourceDifference);
  assertEqual(frame.snapshot.batches.length, expected.batches.length, role, 'batch count');
  for (let batchIndex = 0; batchIndex < expected.batches.length; batchIndex += 1) {
    const actual = frame.snapshot.batches[batchIndex];
    const batch = expected.batches[batchIndex]!;
    if (actual === undefined) integrityFailure(role, `batch '${batch.key}' is missing`);
    assertEqual(actual.key, batch.key, role, `batch ${String(batchIndex)} key`);
    const label = `batch '${batch.key}'`;
    assertEqual(actual.incarnation, batch.incarnation, role, `${label} incarnation`);
    assertEqual(actual.revision, batch.revision, role, `${label} revision`);
    assertEqual(actual.geometryKey, batch.geometryKey, role, `${label} geometry`);
    assertEqual(actual.materialKey, batch.materialKey, role, `${label} material`);
    assertEqual(actual.animation, undefined, role, `${label} animation`);
    assertEqual(actual.presentation !== undefined, batch.hasPresentation, role, `${label} presentation`);
    assertEqual(actual.presentation?.castShadow ?? false, batch.castShadow, role, `${label} castShadow`);
    assertEqual(
      actual.presentation?.receiveShadow ?? false,
      batch.receiveShadow,
      role,
      `${label} receiveShadow`,
    );
    assertEqual(actual.instanceKeys.length, batch.instanceKeys.length, role, `${label} key count`);
    assertEqual(actual.matrices.length, batch.matrices.length, role, `${label} matrix length`);
    if (actual.colors === undefined) integrityFailure(role, `${label} colors are missing`);
    assertEqual(actual.colors.length, batch.colors.length, role, `${label} color length`);
    for (let slot = 0; slot < batch.instanceKeys.length; slot += 1) {
      if (actual.instanceKeys[slot] !== batch.instanceKeys[slot]) {
        integrityFailure(role, `${label} ordered key at slot ${String(slot)} changed`);
      }
    }
    for (let index = 0; index < batch.matrices.length; index += 1) {
      if (actual.matrices[index] !== batch.matrices[index]) {
        integrityFailure(
          role,
          `${label} matrix component ${String(index)} changed from `
          + `${String(batch.matrices[index])} to ${String(actual.matrices[index])}`,
        );
      }
    }
    for (let index = 0; index < batch.colors.length; index += 1) {
      if (actual.colors[index] !== batch.colors[index]) {
        integrityFailure(
          role,
          `${label} color channel ${String(index)} changed from `
          + `${String(batch.colors[index])} to ${String(actual.colors[index])}`,
        );
      }
    }
  }
  assertEqual(frame.snapshot.chunks.length, expected.chunks.length, role, 'chunk count');
  for (let chunkIndex = 0; chunkIndex < expected.chunks.length; chunkIndex += 1) {
    const actual = frame.snapshot.chunks[chunkIndex];
    const chunk = expected.chunks[chunkIndex]!;
    if (actual === undefined) integrityFailure(role, `chunk '${chunk.key}' is missing`);
    assertEqual(actual.key, chunk.key, role, `chunk ${String(chunkIndex)} key`);
    const label = `chunk '${chunk.key}'`;
    assertEqual(actual.incarnation, chunk.incarnation, role, `${label} incarnation`);
    assertEqual(actual.revision, chunk.revision, role, `${label} revision`);
    assertEqual(actual.paletteKey, chunk.paletteKey, role, `${label} palette`);
    assertEqual(actual.materialKey, chunk.materialKey, role, `${label} material`);
    assertEqual(actual.origin.x, chunk.origin[0], role, `${label} origin x`);
    assertEqual(actual.origin.y, chunk.origin[1], role, `${label} origin y`);
    assertEqual(actual.origin.z, chunk.origin[2], role, `${label} origin z`);
    assertEqual(actual.size.x, chunk.size[0], role, `${label} size x`);
    assertEqual(actual.size.y, chunk.size[1], role, `${label} size y`);
    assertEqual(actual.size.z, chunk.size[2], role, `${label} size z`);
    assertEqual(actual.voxels.length, chunk.voxels.length, role, `${label} voxel count`);
    for (let index = 0; index < chunk.voxels.length; index += 1) {
      if (actual.voxels[index] !== chunk.voxels[index]) {
        integrityFailure(
          role,
          `${label} voxel ${String(index)} changed from ${String(chunk.voxels[index])} `
          + `to ${String(actual.voxels[index])}`,
        );
      }
    }
  }
}
