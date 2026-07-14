import {
  HARD_RENDER_LIMITS_V1,
  MAX_EXACT_FLOAT32_VOXEL_COORDINATE_V1,
  type Int3V1,
} from '../core/contracts.js';
import { stableMergeSortInternal } from '../core/bounded-sort.js';
import {
  MAX_MESHER_DEPENDENCY_OFFSETS_V1,
  MAX_MESHER_DEPENDENCY_SIGNATURE_LENGTH_V1,
  MAX_MESHER_HALO_VOXELS_PER_AXIS_V1,
  MAX_MESHER_ID_LENGTH_V1,
  MAX_MESHER_SAMPLE_VOXELS_V1,
  MESHER_DESCRIPTOR_SCHEMA_V1,
  MESHER_INPUT_SCHEMA_V1,
  type MesherDependencyTokenV1,
  type MesherDescriptorLimitsV1,
  type MesherSourceTokenV1,
  type MesherValidationResultV1,
  type PureMesherDescriptorV1,
  type PureMesherInputV1,
} from './mesher-contract.js';
import {
  HARD_MESHER_OUTPUT_BUDGET_V1_INTERNAL,
  parseMesherAttributePolicyV1Internal,
  parseMesherOutputBudgetV1Internal,
} from './mesher-descriptor-budget-validation.js';
import {
  boundedStringMesherInternal,
  captureMesherValidationInternal,
  checkedAddMesherInternal,
  checkedMultiplyMesherInternal,
  failMesherValidationInternal,
  int3MesherInternal,
  literalMesherInternal,
  objectMesherInternal,
  safeIntegerMesherInternal,
  sameInt3MesherInternal,
  typedArrayMesherInternal,
} from './mesher-validation-internal.js';

function compareCoordinates(left: Int3V1, right: Int3V1): number {
  return left.x - right.x || left.y - right.y || left.z - right.z;
}

function parseDescriptor(value: unknown): PureMesherDescriptorV1 {
  const input = objectMesherInternal(value, 'descriptor');
  literalMesherInternal(
    input.schemaVersion,
    MESHER_DESCRIPTOR_SCHEMA_V1,
    'descriptor.schemaVersion',
  );
  const haloInput = objectMesherInternal(input.halo, 'descriptor.halo');
  const halo = Object.freeze({
    negative: int3MesherInternal(
      haloInput.negative,
      'descriptor.halo.negative',
      0,
      MAX_MESHER_HALO_VOXELS_PER_AXIS_V1,
    ),
    positive: int3MesherInternal(
      haloInput.positive,
      'descriptor.halo.positive',
      0,
      MAX_MESHER_HALO_VOXELS_PER_AXIS_V1,
    ),
  });
  if (!Array.isArray(input.dependencyOffsets)) {
    failMesherValidationInternal(
      'mesher.type',
      'descriptor.dependencyOffsets',
      'descriptor.dependencyOffsets must be an array.',
    );
  }
  if (input.dependencyOffsets.length > MAX_MESHER_DEPENDENCY_OFFSETS_V1) {
    failMesherValidationInternal(
      'mesher.limit',
      'descriptor.dependencyOffsets',
      `descriptor.dependencyOffsets exceeds ${String(MAX_MESHER_DEPENDENCY_OFFSETS_V1)} entries.`,
    );
  }
  const offsets: Int3V1[] = [];
  for (let index = 0; index < input.dependencyOffsets.length; index += 1) {
    if (!(index in input.dependencyOffsets)) {
      failMesherValidationInternal(
        'mesher.type',
        `descriptor.dependencyOffsets[${String(index)}]`,
        'descriptor.dependencyOffsets must be dense.',
      );
    }
    const offset = int3MesherInternal(
      input.dependencyOffsets[index],
      `descriptor.dependencyOffsets[${String(index)}]`,
    );
    if (offset.x === 0 && offset.y === 0 && offset.z === 0) {
      failMesherValidationInternal(
        'mesher.value',
        `descriptor.dependencyOffsets[${String(index)}]`,
        'A dependency offset cannot name the source coordinate.',
      );
    }
    offsets.push(offset);
  }
  const dependencyOffsets = stableMergeSortInternal(offsets, compareCoordinates);
  for (let index = 1; index < dependencyOffsets.length; index += 1) {
    if (sameInt3MesherInternal(dependencyOffsets[index - 1]!, dependencyOffsets[index]!)) {
      failMesherValidationInternal(
        'mesher.value',
        'descriptor.dependencyOffsets',
        'descriptor.dependencyOffsets contains a duplicate.',
      );
    }
  }
  const limitsInput = objectMesherInternal(input.limits, 'descriptor.limits');
  const maxDependencyOffsets = safeIntegerMesherInternal(
    limitsInput.maxDependencyOffsets,
    'descriptor.limits.maxDependencyOffsets',
    0,
    MAX_MESHER_DEPENDENCY_OFFSETS_V1,
  );
  if (dependencyOffsets.length > maxDependencyOffsets) {
    failMesherValidationInternal(
      'mesher.limit',
      'descriptor.dependencyOffsets',
      'The declared dependency list exceeds descriptor.limits.maxDependencyOffsets.',
    );
  }
  const limits: MesherDescriptorLimitsV1 = Object.freeze({
    maxSampleVoxels: safeIntegerMesherInternal(
      limitsInput.maxSampleVoxels,
      'descriptor.limits.maxSampleVoxels',
      1,
      MAX_MESHER_SAMPLE_VOXELS_V1,
    ),
    maxSampleBytes: safeIntegerMesherInternal(
      limitsInput.maxSampleBytes,
      'descriptor.limits.maxSampleBytes',
      1,
      HARD_RENDER_LIMITS_V1.maxTotalBytes,
    ),
    maxDependencyOffsets,
    output: parseMesherOutputBudgetV1Internal(
      limitsInput.output,
      'descriptor.limits.output',
      HARD_MESHER_OUTPUT_BUDGET_V1_INTERNAL,
      1,
    ),
  });
  return Object.freeze({
    schemaVersion: MESHER_DESCRIPTOR_SCHEMA_V1,
    id: boundedStringMesherInternal(input.id, 'descriptor.id', MAX_MESHER_ID_LENGTH_V1),
    version: boundedStringMesherInternal(
      input.version,
      'descriptor.version',
      MAX_MESHER_ID_LENGTH_V1,
    ),
    halo,
    dependencyOffsets: Object.freeze(dependencyOffsets),
    attributes: parseMesherAttributePolicyV1Internal(
      input.attributes,
      'descriptor.attributes',
    ),
    limits,
  });
}

function parseSource(value: unknown): MesherSourceTokenV1 {
  const input = objectMesherInternal(value, 'input.source');
  return Object.freeze({
    coordinate: int3MesherInternal(input.coordinate, 'input.source.coordinate'),
    slotGeneration: safeIntegerMesherInternal(
      input.slotGeneration,
      'input.source.slotGeneration',
      1,
    ),
    key: boundedStringMesherInternal(input.key, 'input.source.key', MAX_MESHER_ID_LENGTH_V1),
    incarnation: safeIntegerMesherInternal(input.incarnation, 'input.source.incarnation'),
    sourceRevision: safeIntegerMesherInternal(
      input.sourceRevision,
      'input.source.sourceRevision',
    ),
    size: int3MesherInternal(
      input.size,
      'input.source.size',
      1,
      MAX_EXACT_FLOAT32_VOXEL_COORDINATE_V1,
    ),
  });
}

function parseDependency(
  value: unknown,
  path: string,
  expectedOffset: Int3V1,
  missingNeighbor: 'empty' | 'sealed',
): MesherDependencyTokenV1 {
  const input = objectMesherInternal(value, path);
  const offset = int3MesherInternal(input.offset, `${path}.offset`);
  if (!sameInt3MesherInternal(offset, expectedOffset)) {
    failMesherValidationInternal(
      'mesher.identity',
      `${path}.offset`,
      `${path}.offset does not match descriptor canonical order.`,
    );
  }
  const slotGeneration = safeIntegerMesherInternal(
    input.slotGeneration,
    `${path}.slotGeneration`,
  );
  if (input.state === 'present') {
    return Object.freeze({
      state: 'present',
      offset,
      slotGeneration,
      key: boundedStringMesherInternal(input.key, `${path}.key`, MAX_MESHER_ID_LENGTH_V1),
      incarnation: safeIntegerMesherInternal(input.incarnation, `${path}.incarnation`),
      sourceRevision: safeIntegerMesherInternal(
        input.sourceRevision,
        `${path}.sourceRevision`,
      ),
    });
  }
  if (input.state !== 'missing') {
    failMesherValidationInternal(
      'mesher.value',
      `${path}.state`,
      `${path}.state must be present or missing.`,
    );
  }
  if (input.missingNeighbor !== missingNeighbor) {
    failMesherValidationInternal(
      'mesher.identity',
      `${path}.missingNeighbor`,
      `${path}.missingNeighbor does not match the input policy.`,
    );
  }
  return Object.freeze({ state: 'missing', offset, slotGeneration, missingNeighbor });
}

function expectedSampleVolume(
  source: MesherSourceTokenV1,
  descriptor: PureMesherDescriptorV1,
): number {
  const dimensions = (['x', 'y', 'z'] as const).map((axis) => checkedAddMesherInternal(
    checkedAddMesherInternal(
      source.size[axis],
      descriptor.halo.negative[axis],
      `input.sampleVolume.${axis}`,
    ),
    descriptor.halo.positive[axis],
    `input.sampleVolume.${axis}`,
  ));
  return checkedMultiplyMesherInternal(
    checkedMultiplyMesherInternal(dimensions[0]!, dimensions[1]!, 'input.sampleVolume.length'),
    dimensions[2]!,
    'input.sampleVolume.length',
  );
}

function parseInput(
  value: unknown,
  descriptorValue: unknown,
): PureMesherInputV1 {
  const descriptor = parseDescriptor(descriptorValue);
  const input = objectMesherInternal(value, 'input');
  literalMesherInternal(input.schemaVersion, MESHER_INPUT_SCHEMA_V1, 'input.schemaVersion');
  const mesherId = boundedStringMesherInternal(
    input.mesherId,
    'input.mesherId',
    MAX_MESHER_ID_LENGTH_V1,
  );
  const mesherVersion = boundedStringMesherInternal(
    input.mesherVersion,
    'input.mesherVersion',
    MAX_MESHER_ID_LENGTH_V1,
  );
  if (mesherId !== descriptor.id || mesherVersion !== descriptor.version) {
    failMesherValidationInternal(
      'mesher.identity',
      'input.mesherId',
      'Input mesher identity does not match the descriptor.',
    );
  }
  if (input.missingNeighbor !== 'empty' && input.missingNeighbor !== 'sealed') {
    failMesherValidationInternal(
      'mesher.value',
      'input.missingNeighbor',
      'A dispatched mesher input must resolve missing neighbors as empty or sealed.',
    );
  }
  const source = parseSource(input.source);
  if (!Array.isArray(input.dependencies)) {
    failMesherValidationInternal(
      'mesher.type',
      'input.dependencies',
      'input.dependencies must be an array.',
    );
  }
  if (input.dependencies.length !== descriptor.dependencyOffsets.length) {
    failMesherValidationInternal(
      'mesher.identity',
      'input.dependencies',
      'Input dependency count does not match the descriptor.',
    );
  }
  const dependencies: MesherDependencyTokenV1[] = [];
  for (let index = 0; index < input.dependencies.length; index += 1) {
    if (!(index in input.dependencies)) {
      failMesherValidationInternal(
        'mesher.type',
        `input.dependencies[${String(index)}]`,
        'input.dependencies must be dense.',
      );
    }
    dependencies.push(parseDependency(
      input.dependencies[index],
      `input.dependencies[${String(index)}]`,
      descriptor.dependencyOffsets[index]!,
      input.missingNeighbor,
    ));
  }
  const sampleVolume = typedArrayMesherInternal(
    input.sampleVolume,
    Uint16Array,
    'input.sampleVolume',
  );
  const expectedVolume = expectedSampleVolume(source, descriptor);
  if (sampleVolume.length !== expectedVolume) {
    failMesherValidationInternal(
      'mesher.value',
      'input.sampleVolume',
      `input.sampleVolume length must equal ${String(expectedVolume)}.`,
    );
  }
  if (sampleVolume.length > descriptor.limits.maxSampleVoxels
    || sampleVolume.byteLength > descriptor.limits.maxSampleBytes) {
    failMesherValidationInternal(
      'mesher.limit',
      'input.sampleVolume',
      'input.sampleVolume exceeds the descriptor sample budget.',
    );
  }
  const paletteEntryCount = safeIntegerMesherInternal(
    input.paletteEntryCount,
    'input.paletteEntryCount',
    1,
    descriptor.attributes.maxPaletteEntries,
  );
  const materialEntryCount = safeIntegerMesherInternal(
    input.materialEntryCount,
    'input.materialEntryCount',
    0,
    descriptor.attributes.maxMaterialEntries,
  );
  if (descriptor.attributes.materialIndices === 'none' && materialEntryCount !== 0) {
    failMesherValidationInternal(
      'mesher.attribute',
      'input.materialEntryCount',
      'The descriptor does not emit material indices.',
    );
  }
  if (descriptor.attributes.materialIndices === 'per-triangle-u16'
    && materialEntryCount === 0) {
    failMesherValidationInternal(
      'mesher.attribute',
      'input.materialEntryCount',
      'Per-triangle material output requires at least one material entry.',
    );
  }
  return Object.freeze({
    schemaVersion: MESHER_INPUT_SCHEMA_V1,
    mesherId,
    mesherVersion,
    dependencySignature: boundedStringMesherInternal(
      input.dependencySignature,
      'input.dependencySignature',
      MAX_MESHER_DEPENDENCY_SIGNATURE_LENGTH_V1,
    ),
    source,
    dependencies: Object.freeze(dependencies),
    missingNeighbor: input.missingNeighbor,
    paletteEntryCount,
    materialEntryCount,
    sampleVolume,
    outputBudget: parseMesherOutputBudgetV1Internal(
      input.outputBudget,
      'input.outputBudget',
      descriptor.limits.output,
      0,
    ),
  });
}

export function validatePureMesherDescriptorV1(
  value: unknown,
): MesherValidationResultV1<PureMesherDescriptorV1> {
  return captureMesherValidationInternal(() => parseDescriptor(value));
}

export function validatePureMesherInputV1(
  value: unknown,
  descriptor: unknown,
): MesherValidationResultV1<PureMesherInputV1> {
  return captureMesherValidationInternal(() => parseInput(value, descriptor));
}

export function parsePureMesherDescriptorV1Internal(value: unknown): PureMesherDescriptorV1 {
  return parseDescriptor(value);
}

export function parsePureMesherInputV1Internal(
  value: unknown,
  descriptor: unknown,
): PureMesherInputV1 {
  return parseInput(value, descriptor);
}
