import {
  MAX_MESHER_ID_LENGTH_V1,
  type MesherLocalBoundsV1,
  type MesherOutputBudgetV1,
  type MesherOutputCountsV1,
  type MesherOutputMetricsV1,
  type MesherSourceTokenV1,
  type PureMesherDescriptorV1,
} from './mesher-contract.js';
import {
  boundedStringMesherInternal,
  checkedAddMesherInternal,
  checkedMultiplyMesherInternal,
  failMesherValidationInternal,
  finiteMesherInternal,
  int3MesherInternal,
  objectMesherInternal,
  safeIntegerMesherInternal,
  sameInt3MesherInternal,
} from './mesher-validation-internal.js';

export function sameMesherSourceTokenV1Internal(
  left: MesherSourceTokenV1,
  right: MesherSourceTokenV1,
): boolean {
  return sameInt3MesherInternal(left.coordinate, right.coordinate)
    && left.slotGeneration === right.slotGeneration
    && left.key === right.key
    && left.incarnation === right.incarnation
    && left.sourceRevision === right.sourceRevision
    && sameInt3MesherInternal(left.size, right.size);
}

export function parseMesherOutputSourceV1Internal(value: unknown): MesherSourceTokenV1 {
  const input = objectMesherInternal(value, 'output.source');
  return Object.freeze({
    coordinate: int3MesherInternal(input.coordinate, 'output.source.coordinate'),
    slotGeneration: safeIntegerMesherInternal(
      input.slotGeneration,
      'output.source.slotGeneration',
      1,
    ),
    key: boundedStringMesherInternal(input.key, 'output.source.key', MAX_MESHER_ID_LENGTH_V1),
    incarnation: safeIntegerMesherInternal(input.incarnation, 'output.source.incarnation'),
    sourceRevision: safeIntegerMesherInternal(
      input.sourceRevision,
      'output.source.sourceRevision',
    ),
    size: int3MesherInternal(input.size, 'output.source.size', 1),
  });
}

export function parseMesherOutputCountsV1Internal(
  value: unknown,
  budget: MesherOutputBudgetV1,
  sourceVolume: number,
): MesherOutputCountsV1 {
  const input = objectMesherInternal(value, 'output.counts');
  return Object.freeze({
    sourceVoxelCount: safeIntegerMesherInternal(
      input.sourceVoxelCount,
      'output.counts.sourceVoxelCount',
      0,
      sourceVolume,
    ),
    exposedUnitFaceCount: safeIntegerMesherInternal(
      input.exposedUnitFaceCount,
      'output.counts.exposedUnitFaceCount',
      0,
      budget.maxExposedUnitFaces,
    ),
    vertexCount: safeIntegerMesherInternal(
      input.vertexCount,
      'output.counts.vertexCount',
      0,
      budget.maxVertices,
    ),
    indexCount: safeIntegerMesherInternal(
      input.indexCount,
      'output.counts.indexCount',
      0,
      budget.maxIndices,
    ),
    triangleCount: safeIntegerMesherInternal(
      input.triangleCount,
      'output.counts.triangleCount',
      0,
      Math.floor(budget.maxIndices / 3),
    ),
  });
}

export function parseMesherOutputMetricsV1Internal(
  value: unknown,
  budget: MesherOutputBudgetV1,
  outputBytes: number,
): MesherOutputMetricsV1 {
  const input = objectMesherInternal(value, 'output.metrics');
  const metrics = Object.freeze({
    workElements: safeIntegerMesherInternal(
      input.workElements,
      'output.metrics.workElements',
      0,
      budget.maxMeshingWorkElements,
    ),
    outputBytes: safeIntegerMesherInternal(
      input.outputBytes,
      'output.metrics.outputBytes',
      0,
      budget.maxTotalBytes,
    ),
  });
  if (metrics.outputBytes !== outputBytes) {
    failMesherValidationInternal(
      'mesher.limit',
      'output.metrics.outputBytes',
      'output.metrics.outputBytes must equal the exact returned typed-array bytes.',
    );
  }
  return metrics;
}

function parseTuple3(value: unknown, path: string): readonly [number, number, number] {
  if (!Array.isArray(value) || value.length !== 3) {
    failMesherValidationInternal('mesher.type', path, `${path} must be a length-three array.`);
  }
  for (let index = 0; index < 3; index += 1) {
    if (!(index in value)) {
      failMesherValidationInternal(
        'mesher.type',
        `${path}[${String(index)}]`,
        `${path} must be dense.`,
      );
    }
  }
  return Object.freeze([
    finiteMesherInternal(value[0], `${path}[0]`),
    finiteMesherInternal(value[1], `${path}[1]`),
    finiteMesherInternal(value[2], `${path}[2]`),
  ]);
}

export function parseMesherOutputBoundsV1Internal(
  value: unknown,
): MesherLocalBoundsV1 | null {
  if (value === null) return null;
  const input = objectMesherInternal(value, 'output.bounds');
  return Object.freeze({
    min: parseTuple3(input.min, 'output.bounds.min'),
    max: parseTuple3(input.max, 'output.bounds.max'),
  });
}

export function checkedMesherOutputBytesV1Internal(
  positions: Float32Array,
  normals: Float32Array,
  paletteIndices: Uint16Array,
  materialIndices: Uint16Array | undefined,
  indices: Uint32Array,
  budget: MesherOutputBudgetV1,
): number {
  for (const [bytes, maximum, path] of [
    [positions.byteLength, budget.maxPositionBytes, 'output.positions'],
    [normals.byteLength, budget.maxNormalBytes, 'output.normals'],
    [paletteIndices.byteLength, budget.maxPaletteIndexBytes, 'output.paletteIndices'],
    [materialIndices?.byteLength ?? 0, budget.maxMaterialIndexBytes, 'output.materialIndices'],
  ] as const) {
    if (bytes > maximum) {
      failMesherValidationInternal(
        'mesher.limit',
        path,
        `${path} exceeds its attribute byte budget.`,
      );
    }
  }
  let total = 0;
  for (const bytes of [
    positions.byteLength,
    normals.byteLength,
    paletteIndices.byteLength,
    materialIndices?.byteLength ?? 0,
    indices.byteLength,
  ]) {
    total = checkedAddMesherInternal(total, bytes, 'output byte total');
  }
  if (total > budget.maxTotalBytes) {
    failMesherValidationInternal(
      'mesher.limit',
      'output',
      'Returned typed arrays exceed outputBudget.maxTotalBytes.',
    );
  }
  return total;
}

export function preflightMesherResultValidationWorkV1Internal(
  positions: Float32Array,
  normals: Float32Array,
  paletteIndices: Uint16Array,
  materialIndices: Uint16Array | undefined,
  indices: Uint32Array,
  budget: MesherOutputBudgetV1,
): void {
  let work = 64;
  for (const length of [
    positions.length,
    normals.length,
    paletteIndices.length,
    materialIndices?.length ?? 0,
  ]) {
    work = checkedAddMesherInternal(work, length, 'result validation work');
  }
  work = checkedAddMesherInternal(
    work,
    checkedMultiplyMesherInternal(indices.length, 12, 'result validation work'),
    'result validation work',
  );
  if (work > budget.maxResultValidationElements) {
    failMesherValidationInternal(
      'mesher.limit',
      'outputBudget.maxResultValidationElements',
      'Result validation would exceed the declared deterministic work budget.',
    );
  }
}

export function validateMesherOutputArrayLengthsV1Internal(
  counts: MesherOutputCountsV1,
  positions: Float32Array,
  normals: Float32Array,
  paletteIndices: Uint16Array,
  materialIndices: Uint16Array | undefined,
  indices: Uint32Array,
  materialPolicy: PureMesherDescriptorV1['attributes']['materialIndices'],
): void {
  const positionLength = checkedMultiplyMesherInternal(
    counts.vertexCount,
    3,
    'output.positions.length',
  );
  if (positions.length !== positionLength) {
    failMesherValidationInternal(
      'mesher.attribute',
      'output.positions',
      'Position length must be vertexCount * 3.',
    );
  }
  if (normals.length !== positionLength) {
    failMesherValidationInternal(
      'mesher.attribute',
      'output.normals',
      'Normal length must be vertexCount * 3.',
    );
  }
  if (paletteIndices.length !== counts.vertexCount) {
    failMesherValidationInternal(
      'mesher.attribute',
      'output.paletteIndices',
      'Palette attribute length must equal vertexCount.',
    );
  }
  if (indices.length !== counts.indexCount || counts.indexCount !== counts.triangleCount * 3) {
    failMesherValidationInternal(
      'mesher.index',
      'output.indices',
      'Index length/count must equal triangleCount * 3.',
    );
  }
  if (materialPolicy === 'none' && materialIndices !== undefined) {
    failMesherValidationInternal(
      'mesher.attribute',
      'output.materialIndices',
      'The descriptor forbids a material attribute.',
    );
  }
  if (materialPolicy === 'per-triangle-u16'
    && materialIndices?.length !== counts.triangleCount) {
    failMesherValidationInternal(
      'mesher.attribute',
      'output.materialIndices',
      'Material attribute length must equal triangleCount.',
    );
  }
  if ((counts.vertexCount === 0) !== (counts.triangleCount === 0)) {
    failMesherValidationInternal(
      'mesher.topology',
      'output.counts',
      'Vertices and triangles must either both be empty or both be present.',
    );
  }
}
