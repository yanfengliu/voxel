import {
  MAX_MESHER_DEPENDENCY_SIGNATURE_LENGTH_V1,
  MAX_MESHER_ID_LENGTH_V1,
  MESHER_OUTPUT_SCHEMA_V1,
  type MesherOutputV1,
  type MesherValidationResultV1,
  type ValidatedMesherOutputV1,
} from './mesher-contract.js';
import {
  parsePureMesherDescriptorV1Internal,
  parsePureMesherInputV1Internal,
} from './mesher-contract-validation.js';
import {
  assertExactMesherBoundsV1Internal,
  validateMesherTriangleTopologyV1Internal,
  validateMesherVertexAttributesV1Internal,
} from './mesher-result-geometry-validation.js';
import {
  checkedMesherOutputBytesV1Internal,
  parseMesherOutputBoundsV1Internal,
  parseMesherOutputCountsV1Internal,
  parseMesherOutputMetricsV1Internal,
  parseMesherOutputSourceV1Internal,
  preflightMesherResultValidationWorkV1Internal,
  sameMesherSourceTokenV1Internal,
  validateMesherOutputArrayLengthsV1Internal,
} from './mesher-result-shape-validation.js';
import {
  boundedStringMesherInternal,
  captureMesherValidationInternal,
  checkedMultiplyMesherInternal,
  failMesherValidationInternal,
  literalMesherInternal,
  objectMesherInternal,
  typedArrayMesherInternal,
} from './mesher-validation-internal.js';

function parseOutputAgainstValidatedInput(
  value: unknown,
  descriptor: ReturnType<typeof parsePureMesherDescriptorV1Internal>,
  input: ReturnType<typeof parsePureMesherInputV1Internal>,
): ValidatedMesherOutputV1 {
  const output = objectMesherInternal(value, 'output');
  literalMesherInternal(output.schemaVersion, MESHER_OUTPUT_SCHEMA_V1, 'output.schemaVersion');
  const mesherId = boundedStringMesherInternal(
    output.mesherId,
    'output.mesherId',
    MAX_MESHER_ID_LENGTH_V1,
  );
  const mesherVersion = boundedStringMesherInternal(
    output.mesherVersion,
    'output.mesherVersion',
    MAX_MESHER_ID_LENGTH_V1,
  );
  const dependencySignature = boundedStringMesherInternal(
    output.dependencySignature,
    'output.dependencySignature',
    MAX_MESHER_DEPENDENCY_SIGNATURE_LENGTH_V1,
  );
  if (mesherId !== descriptor.id
    || mesherVersion !== descriptor.version
    || dependencySignature !== input.dependencySignature) {
    failMesherValidationInternal(
      'mesher.identity',
      'output.mesherId',
      'Output identity does not match the requested mesher and dependency signature.',
    );
  }
  const source = parseMesherOutputSourceV1Internal(output.source);
  if (!sameMesherSourceTokenV1Internal(source, input.source)) {
    failMesherValidationInternal(
      'mesher.identity',
      'output.source',
      'Output source token does not match the requested source.',
    );
  }
  const sourceVolume = checkedMultiplyMesherInternal(
    checkedMultiplyMesherInternal(source.size.x, source.size.y, 'output.source.size'),
    source.size.z,
    'output.source.size',
  );
  const counts = parseMesherOutputCountsV1Internal(
    output.counts,
    input.outputBudget,
    sourceVolume,
  );
  const positions = typedArrayMesherInternal(output.positions, Float32Array, 'output.positions');
  const normals = typedArrayMesherInternal(output.normals, Float32Array, 'output.normals');
  const paletteIndices = typedArrayMesherInternal(
    output.paletteIndices,
    Uint16Array,
    'output.paletteIndices',
  );
  const materialIndices = output.materialIndices === undefined
    ? undefined
    : typedArrayMesherInternal(output.materialIndices, Uint16Array, 'output.materialIndices');
  const indices = typedArrayMesherInternal(output.indices, Uint32Array, 'output.indices');
  for (const [array, path] of [
    [positions, 'output.positions'],
    [normals, 'output.normals'],
    [paletteIndices, 'output.paletteIndices'],
    [materialIndices, 'output.materialIndices'],
    [indices, 'output.indices'],
  ] as const) {
    if (array?.buffer === input.sampleVolume.buffer) {
      failMesherValidationInternal(
        'mesher.attribute',
        path,
        `${path} must not alias the borrowed input sample buffer.`,
      );
    }
  }
  validateMesherOutputArrayLengthsV1Internal(
    counts,
    positions,
    normals,
    paletteIndices,
    materialIndices,
    indices,
    descriptor.attributes.materialIndices,
  );
  if (indices.byteLength > input.outputBudget.maxIndices * Uint32Array.BYTES_PER_ELEMENT) {
    failMesherValidationInternal(
      'mesher.limit',
      'output.indices',
      'Index bytes exceed the output index-count budget.',
    );
  }
  const outputBytes = checkedMesherOutputBytesV1Internal(
    positions,
    normals,
    paletteIndices,
    materialIndices,
    indices,
    input.outputBudget,
  );
  preflightMesherResultValidationWorkV1Internal(
    positions,
    normals,
    paletteIndices,
    materialIndices,
    indices,
    input.outputBudget,
  );
  const metrics = parseMesherOutputMetricsV1Internal(
    output.metrics,
    input.outputBudget,
    outputBytes,
  );
  const bounds = parseMesherOutputBoundsV1Internal(output.bounds);
  const actualBounds = validateMesherVertexAttributesV1Internal(
    positions,
    normals,
    paletteIndices,
    input,
  );
  const actualFaceCount = validateMesherTriangleTopologyV1Internal(
    positions,
    normals,
    paletteIndices,
    materialIndices,
    indices,
    input,
  );
  if (actualFaceCount !== counts.exposedUnitFaceCount) {
    failMesherValidationInternal(
      'mesher.topology',
      'output.counts.exposedUnitFaceCount',
      'Declared unit-face count must equal the exact oriented surface area.',
    );
  }
  assertExactMesherBoundsV1Internal(bounds, actualBounds);

  const validated: MesherOutputV1 = Object.freeze({
    schemaVersion: MESHER_OUTPUT_SCHEMA_V1,
    mesherId,
    mesherVersion,
    dependencySignature,
    source,
    positions,
    normals,
    paletteIndices,
    ...(materialIndices ? { materialIndices } : {}),
    indices,
    bounds,
    counts,
    metrics,
  });
  return validated as ValidatedMesherOutputV1;
}

function parseOutput(
  value: unknown,
  descriptorValue: unknown,
  inputValue: unknown,
): ValidatedMesherOutputV1 {
  const descriptor = parsePureMesherDescriptorV1Internal(descriptorValue);
  const input = parsePureMesherInputV1Internal(inputValue, descriptor);
  return parseOutputAgainstValidatedInput(value, descriptor, input);
}

/**
 * Validates untrusted candidate/worker output without copying its typed arrays.
 * Callers must run this gate before allocating geometry or any GPU resource.
 */
export function validateMesherOutputV1(
  value: unknown,
  descriptor: unknown,
  input: unknown,
): MesherValidationResultV1<ValidatedMesherOutputV1> {
  return captureMesherValidationInternal(() => parseOutput(value, descriptor, input));
}

/**
 * Worker-boundary seam for a request that was fully validated before its
 * job-owned sample buffer was transferred (and therefore detached locally).
 * This intentionally remains a non-barrel internal export: callers must retain
 * the exact validated descriptor and input returned by request preparation.
 */
export function validateMesherOutputForTransferredInputV1Internal(
  value: unknown,
  descriptor: ReturnType<typeof parsePureMesherDescriptorV1Internal>,
  input: ReturnType<typeof parsePureMesherInputV1Internal>,
): MesherValidationResultV1<ValidatedMesherOutputV1> {
  return captureMesherValidationInternal(
    () => parseOutputAgainstValidatedInput(value, descriptor, input),
  );
}
