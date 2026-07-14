import {
  HARD_RENDER_LIMITS_V1,
  HARD_RENDER_TRANSACTION_LIMITS_V1,
  INSTANCE_TRANSFORM_ANIMATION_SCHEMA_V1,
  MAX_INSTANCE_ANIMATION_PERIOD_MS_V1,
  MAX_INSTANCE_ANIMATION_ROTATION_RADIANS_V1,
  MAX_INSTANCE_ANIMATION_SCALE_AMPLITUDE_V1,
  MAX_INSTANCE_ANIMATION_TRANSLATION_V1,
  MAX_ACTIVE_INSTANCE_ANIMATIONS_V1,
  MAX_INSTANCE_ANIMATION_BASE_LINEAR_COMPONENT_V1,
  MAX_INSTANCES_PER_ANIMATED_BATCH_V1,
  MIN_INSTANCE_ANIMATION_PERIOD_MS_V1,
  MAX_EXACT_FLOAT32_VOXEL_COORDINATE_V1,
  MAX_GEOMETRY_GROUPS_PER_RESOURCE_V1,
  RENDER_SNAPSHOT_SCHEMA_V1,
  WORLD_SCHEMA_V1,
  type Aabb3V1,
  type GeometryResourceV1,
  type InstanceBatchV1,
  type InstanceTransformAnimationV1,
  type Int3V1,
  type MaterialResourceV1,
  type OwnedRenderSnapshotV1,
  type PaletteResourceV1,
  type RenderCapabilityV1,
  type RenderLimitsV1,
  type RenderTransactionLimitsV1,
  type RenderResourceV1,
  type SnapshotValidationResultV1,
  type Srgb8ColorV1,
  type Vec3V1,
  type VoxelChunkV1,
  type WorldDescriptorV1,
} from './contracts.js';
import {
  finiteArray as validateFiniteArray,
  float32 as validateFloat32,
  indices as validateIndices,
  uint8 as validateUint8,
  uint16 as validateUint16,
} from './snapshot-array-validation.js';
import {
  copyRenderSnapshotV1,
  renderSnapshotCopyBytes,
  renderSnapshotCopyOperations,
} from './snapshot-copy.js';
import {
  failValidationInternal as fail,
  SnapshotByteBudgetInternal,
  type SnapshotCopyMetricsInternal,
  ValidationFailureInternal,
} from './snapshot-byte-budget.js';
import { stableMergeSortInternal } from './bounded-sort.js';
import {
  assertUniformChunkProfileInternal,
  parseUniformChunkProfileInternal,
} from './uniform-profile-validation.js';

export { SnapshotByteBudgetInternal, type SnapshotCopyMetricsInternal };

const MAX_KEY_LENGTH = 256;
const CAPABILITIES = new Set<RenderCapabilityV1>([
  'voxel-chunks',
  'geometry-resources',
  'instance-batches',
]);

export interface SnapshotValidationWithMetricsInternal {
  readonly result: SnapshotValidationResultV1;
  readonly metrics: Readonly<SnapshotCopyMetricsInternal>;
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    fail('type.object', path, 'Expected an object.');
  }
  return value as Record<string, unknown>;
}

function list(
  value: unknown,
  path: string,
  maximum: number,
  limitCode: string,
  limitMessage: string,
): unknown[] {
  if (!Array.isArray(value)) fail('type.array', path, 'Expected an array.');
  if (value.length > maximum) fail(limitCode, path, limitMessage);
  return Array.from(value);
}

function literal<T extends string>(
  value: unknown,
  expected: T,
  path: string,
): T {
  if (value !== expected) {
    fail('value.literal', path, `Expected ${expected}.`);
  }
  return expected;
}

function key(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_KEY_LENGTH) {
    fail('string.key', path, `Expected a non-empty string of at most ${String(MAX_KEY_LENGTH)} characters.`);
  }
  return value;
}

function boolean(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') fail('type.boolean', path, 'Expected a boolean.');
  return value;
}

function finite(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    fail('number.non-finite', path, 'Expected a finite number.');
  }
  return value;
}

function integer(value: unknown, path: string, minimum = 0): number {
  const parsed = finite(value, path);
  if (!Number.isSafeInteger(parsed) || parsed < minimum) {
    fail('number.integer', path, `Expected a safe integer greater than or equal to ${String(minimum)}.`);
  }
  return parsed;
}

function unit(value: unknown, path: string): number {
  const parsed = finite(value, path);
  if (parsed < 0 || parsed > 1) fail('number.unit', path, 'Expected a number from zero to one.');
  return parsed;
}

function vec3(value: unknown, path: string): Vec3V1 {
  const input = record(value, path);
  return {
    x: finite(input.x, `${path}.x`),
    y: finite(input.y, `${path}.y`),
    z: finite(input.z, `${path}.z`),
  };
}

function int3(value: unknown, path: string, positive = false): Int3V1 {
  const input = record(value, path);
  const minimum = positive ? 1 : Number.MIN_SAFE_INTEGER;
  return {
    x: integer(input.x, `${path}.x`, minimum),
    y: integer(input.y, `${path}.y`, minimum),
    z: integer(input.z, `${path}.z`, minimum),
  };
}

function color(value: unknown, path: string): Srgb8ColorV1 {
  const input = record(value, path);
  const channel = (name: 'r' | 'g' | 'b' | 'a'): number => {
    const parsed = integer(input[name], `${path}.${name}`);
    if (parsed > 255) fail('color.channel', `${path}.${name}`, 'Expected an 8-bit color channel.');
    return parsed;
  };
  return { r: channel('r'), g: channel('g'), b: channel('b'), a: channel('a') };
}

function float32(value: unknown, path: string): Float32Array {
  return validateFloat32(value, path, fail);
}

function uint8(value: unknown, path: string): Uint8Array {
  return validateUint8(value, path, fail);
}

function uint16(value: unknown, path: string): Uint16Array {
  return validateUint16(value, path, fail);
}

function indices(value: unknown, path: string): Uint16Array | Uint32Array {
  return validateIndices(value, path, fail);
}

function finiteArray(value: Float32Array, path: string): void {
  validateFiniteArray(value, path, fail);
}

function parseLimits(value: unknown): RenderLimitsV1 {
  const input = record(value, 'descriptor.limits');
  const names = Object.keys(HARD_RENDER_LIMITS_V1) as (keyof RenderLimitsV1)[];
  const output = {} as Record<keyof RenderLimitsV1, number>;
  for (const name of names) {
    const path = `descriptor.limits.${name}`;
    const parsed = integer(input[name], path, 1);
    if (parsed > HARD_RENDER_LIMITS_V1[name]) {
      fail('limit.exceeds-hard-maximum', path, `Limit exceeds the hard maximum of ${String(HARD_RENDER_LIMITS_V1[name])}.`);
    }
    output[name] = parsed;
  }
  return output;
}

function parseTransactionLimits(value: unknown): RenderTransactionLimitsV1 {
  const input = record(value, 'descriptor.transactionLimits');
  const names = Object.keys(HARD_RENDER_TRANSACTION_LIMITS_V1) as (
    keyof RenderTransactionLimitsV1
  )[];
  const output = {} as Record<keyof RenderTransactionLimitsV1, number>;
  for (const name of names) {
    const path = `descriptor.transactionLimits.${name}`;
    const parsed = integer(input[name], path, 1);
    if (parsed > HARD_RENDER_TRANSACTION_LIMITS_V1[name]) {
      fail(
        'limit.exceeds-hard-maximum',
        path,
        `Limit exceeds the hard maximum of ${String(HARD_RENDER_TRANSACTION_LIMITS_V1[name])}.`,
      );
    }
    output[name] = parsed;
  }
  return output;
}

function parseDescriptor(value: unknown): WorldDescriptorV1 {
  const input = record(value, 'descriptor');
  const coordinates = record(input.coordinates, 'descriptor.coordinates');
  const units = vec3(coordinates.worldUnitsPerVoxel, 'descriptor.coordinates.worldUnitsPerVoxel');
  for (const axis of ['x', 'y', 'z'] as const) {
    if (units[axis] <= 0) fail('number.positive', `descriptor.coordinates.worldUnitsPerVoxel.${axis}`, 'Expected a positive value.');
  }
  const metersPerWorldUnit = finite(coordinates.metersPerWorldUnit, 'descriptor.coordinates.metersPerWorldUnit');
  if (metersPerWorldUnit <= 0) fail('number.positive', 'descriptor.coordinates.metersPerWorldUnit', 'Expected a positive value.');

  const capabilityValues = list(
    input.capabilities,
    'descriptor.capabilities',
    CAPABILITIES.size,
    'limit.capabilities',
    'Capability count exceeds the supported V1 set.',
  );
  const capabilities: RenderCapabilityV1[] = [];
  const seen = new Set<string>();
  capabilityValues.forEach((value, index) => {
    if (typeof value !== 'string' || !CAPABILITIES.has(value as RenderCapabilityV1)) {
      fail('capability.unsupported', `descriptor.capabilities[${String(index)}]`, 'Unsupported render capability.');
    }
    if (seen.has(value)) fail('capability.duplicate', `descriptor.capabilities[${String(index)}]`, 'Duplicate render capability.');
    seen.add(value);
    capabilities.push(value as RenderCapabilityV1);
  });
  const limits = parseLimits(input.limits);

  return {
    schemaVersion: literal(input.schemaVersion, WORLD_SCHEMA_V1, 'descriptor.schemaVersion'),
    worldId: key(input.worldId, 'descriptor.worldId'),
    epoch: key(input.epoch, 'descriptor.epoch'),
    coordinates: {
      handedness: literal(coordinates.handedness, 'right', 'descriptor.coordinates.handedness'),
      upAxis: literal(coordinates.upAxis, '+y', 'descriptor.coordinates.upAxis'),
      forwardAxis: literal(coordinates.forwardAxis, '-z', 'descriptor.coordinates.forwardAxis'),
      chunkRounding: literal(coordinates.chunkRounding, 'floor', 'descriptor.coordinates.chunkRounding'),
      metersPerWorldUnit,
      worldUnitsPerVoxel: units,
    },
    colorEncoding: literal(input.colorEncoding, 'srgb8-straight-alpha', 'descriptor.colorEncoding'),
    capabilities,
    limits,
    ...(input.chunkProfile === undefined
      ? {}
      : { chunkProfile: parseUniformChunkProfileInternal(input.chunkProfile, limits) }),
    ...(input.transactionLimits === undefined
      ? {}
      : { transactionLimits: parseTransactionLimits(input.transactionLimits) }),
  };
}

function identity(input: Record<string, unknown>, path: string): {
  key: string;
  incarnation: number;
  revision: number;
} {
  return {
    key: key(input.key, `${path}.key`),
    incarnation: integer(input.incarnation, `${path}.incarnation`),
    revision: integer(input.revision, `${path}.revision`),
  };
}

function parsePalette(
  input: Record<string, unknown>,
  path: string,
  limits: RenderLimitsV1,
): PaletteResourceV1 {
  const rawEntries = list(
    input.entries,
    `${path}.entries`,
    limits.maxPaletteEntries,
    'limit.palette-entries',
    'Palette entry count exceeds its declared limit.',
  );
  return {
    kind: 'palette',
    ...identity(input, path),
    entries: rawEntries.map((entry, index) => ({ color: color(record(entry, `${path}.entries[${String(index)}]`).color, `${path}.entries[${String(index)}].color`) })),
  };
}

function parseMaterial(input: Record<string, unknown>, path: string): MaterialResourceV1 {
  const shading = input.shading;
  if (shading !== 'unlit' && shading !== 'lambert' && shading !== 'standard') {
    fail('material.shading', `${path}.shading`, 'Unsupported shading model.');
  }
  return {
    kind: 'material',
    ...identity(input, path),
    shading,
    color: color(input.color, `${path}.color`),
    vertexColors: boolean(input.vertexColors, `${path}.vertexColors`),
    transparent: boolean(input.transparent, `${path}.transparent`),
    opacity: unit(input.opacity, `${path}.opacity`),
    doubleSided: boolean(input.doubleSided, `${path}.doubleSided`),
    roughness: unit(input.roughness, `${path}.roughness`),
    metalness: unit(input.metalness, `${path}.metalness`),
  };
}

function parseBounds(value: unknown, path: string): Aabb3V1 {
  const input = record(value, path);
  const bounds = { min: vec3(input.min, `${path}.min`), max: vec3(input.max, `${path}.max`) };
  for (const axis of ['x', 'y', 'z'] as const) {
    if (bounds.min[axis] > bounds.max[axis]) fail('bounds.inverted', `${path}.${axis}`, 'Bounds minimum exceeds maximum.');
  }
  return bounds;
}

function parseGeometry(
  input: Record<string, unknown>,
  path: string,
  limits: RenderLimitsV1,
  budget: SnapshotByteBudgetInternal,
): GeometryResourceV1 {
  const resourceIdentity = identity(input, path);
  const topology = input.topology;
  if (topology !== 'triangles' && topology !== 'lines' && topology !== 'points') {
    fail('geometry.topology', `${path}.topology`, 'Unsupported primitive topology.');
  }
  const rawPositions = float32(input.positions, `${path}.positions`);
  if (rawPositions.length % 3 !== 0) fail('geometry.positions-length', `${path}.positions`, 'Positions must contain xyz triples.');
  const vertexCount = rawPositions.length / 3;
  if (vertexCount > limits.maxGeometryVertices) fail('limit.geometry-vertices', `${path}.positions`, 'Vertex count exceeds its declared limit.');

  const rawNormals = float32(input.normals, `${path}.normals`);
  if (rawNormals.length !== rawPositions.length) fail('geometry.normals-length', `${path}.normals`, 'Normals must match positions.');

  const rawIndices = indices(input.indices, `${path}.indices`);
  if (rawIndices.length > limits.maxGeometryIndices) fail('limit.geometry-indices', `${path}.indices`, 'Index count exceeds its declared limit.');
  const primitiveSize = topology === 'triangles' ? 3 : topology === 'lines' ? 2 : 1;
  if (rawIndices.length % primitiveSize !== 0) fail('geometry.indices-length', `${path}.indices`, 'Index count does not match topology.');

  let rawUvs: Float32Array | undefined;
  if (input.uvs !== undefined) {
    rawUvs = float32(input.uvs, `${path}.uvs`);
    if (rawUvs.length !== vertexCount * 2) fail('geometry.uvs-length', `${path}.uvs`, 'UVs must contain one pair per vertex.');
  }
  let rawColors: Uint8Array | undefined;
  if (input.colors !== undefined) {
    rawColors = uint8(input.colors, `${path}.colors`);
    if (rawColors.length !== vertexCount * 3 && rawColors.length !== vertexCount * 4) {
      fail('geometry.colors-length', `${path}.colors`, 'Colors must contain RGB or RGBA per vertex.');
    }
  }

  const positions = budget.retain(rawPositions, `${path}.positions`);
  const normals = budget.retain(rawNormals, `${path}.normals`);
  const parsedIndices = budget.retain(rawIndices, `${path}.indices`);
  const uvs = rawUvs === undefined ? undefined : budget.retain(rawUvs, `${path}.uvs`);
  const colors = rawColors === undefined
    ? undefined
    : budget.retain(rawColors, `${path}.colors`);
  finiteArray(positions, `${path}.positions`);
  finiteArray(normals, `${path}.normals`);
  if (uvs !== undefined) finiteArray(uvs, `${path}.uvs`);
  parsedIndices.forEach((index, offset) => {
    if (index >= vertexCount) fail('geometry.index-out-of-range', `${path}.indices[${String(offset)}]`, 'Index references a missing vertex.');
  });

  const rawGroups = list(
    input.groups,
    `${path}.groups`,
    MAX_GEOMETRY_GROUPS_PER_RESOURCE_V1,
    'limit.geometry-groups',
    `Geometry group count exceeds the hard maximum of ${String(MAX_GEOMETRY_GROUPS_PER_RESOURCE_V1)}.`,
  );
  let nextGroupStart = 0;
  const groups = rawGroups.map((group, index) => {
    const groupPath = `${path}.groups[${String(index)}]`;
    const raw = record(group, groupPath);
    const start = integer(raw.start, `${groupPath}.start`);
    const count = integer(raw.count, `${groupPath}.count`);
    if (count === 0) {
      fail('geometry.group-empty', `${groupPath}.count`, 'Geometry groups must draw at least one index.');
    }
    if (start % primitiveSize !== 0 || count % primitiveSize !== 0) {
      fail(
        'geometry.group-alignment',
        groupPath,
        'Geometry group boundaries must align with complete primitives.',
      );
    }
    if (start !== nextGroupStart) {
      fail(
        'geometry.group-partition',
        `${groupPath}.start`,
        'Geometry groups must be ordered, non-overlapping, and gap-free.',
      );
    }
    if (start + count > parsedIndices.length) fail('geometry.group-range', groupPath, 'Geometry group exceeds the index range.');
    nextGroupStart = start + count;
    return { start, count, materialKey: key(raw.materialKey, `${groupPath}.materialKey`) };
  });
  if (rawGroups.length > 0 && nextGroupStart !== parsedIndices.length) {
    fail(
      'geometry.group-partition',
      `${path}.groups`,
      'Geometry groups must partition the complete index range exactly once.',
    );
  }

  const bounds = parseBounds(input.bounds, `${path}.bounds`);
  for (let offset = 0; offset < positions.length; offset += 1) {
    const axis = (['x', 'y', 'z'] as const)[offset % 3]!;
    const coordinate = positions[offset]!;
    if (coordinate < bounds.min[axis] || coordinate > bounds.max[axis]) {
      fail(
        'geometry.position-outside-bounds',
        `${path}.positions[${String(offset)}]`,
        'Geometry position lies outside its declared bounds.',
      );
    }
  }

  return {
    kind: 'geometry',
    ...resourceIdentity,
    topology,
    positions,
    normals,
    ...(uvs === undefined ? {} : { uvs }),
    ...(colors === undefined ? {} : { colors }),
    indices: parsedIndices,
    groups,
    bounds,
    pivot: vec3(input.pivot, `${path}.pivot`),
  };
}

function parseResource(
  value: unknown,
  path: string,
  limits: RenderLimitsV1,
  budget: SnapshotByteBudgetInternal,
): RenderResourceV1 {
  const input = record(value, path);
  switch (input.kind) {
    case 'palette': return parsePalette(input, path, limits);
    case 'material': return parseMaterial(input, path);
    case 'geometry': return parseGeometry(input, path, limits, budget);
    default: return fail('resource.kind', `${path}.kind`, 'Unsupported resource kind.');
  }
}

function parseChunk(
  value: unknown,
  path: string,
  limits: RenderLimitsV1,
  budget: SnapshotByteBudgetInternal,
): VoxelChunkV1 {
  const input = record(value, path);
  const chunkIdentity = identity(input, path);
  const size = int3(input.size, `${path}.size`, true);
  const origin = int3(input.origin, `${path}.origin`);
  for (const axis of ['x', 'y', 'z'] as const) {
    const end = origin[axis] + size[axis];
    if (
      !Number.isSafeInteger(end)
      || origin[axis] < -MAX_EXACT_FLOAT32_VOXEL_COORDINATE_V1
      || end > MAX_EXACT_FLOAT32_VOXEL_COORDINATE_V1
    ) {
      fail(
        'chunk.coordinate-range',
        `${path}.origin.${axis}`,
        `Chunk boundaries must stay within the exact Float32 voxel range `
        + `[-${String(MAX_EXACT_FLOAT32_VOXEL_COORDINATE_V1)}, `
        + `${String(MAX_EXACT_FLOAT32_VOXEL_COORDINATE_V1)}].`,
      );
    }
  }
  const volume = size.x * size.y * size.z;
  if (!Number.isSafeInteger(volume) || volume > limits.maxVoxelsPerChunk) {
    fail('limit.chunk-voxels', `${path}.size`, 'Chunk volume exceeds its declared limit.');
  }
  const rawVoxels = uint16(input.voxels, `${path}.voxels`);
  if (rawVoxels.length !== volume) fail('chunk.voxel-count', `${path}.voxels`, 'Voxel data length does not match chunk size.');
  const voxels = budget.retain(rawVoxels, `${path}.voxels`);
  return {
    ...chunkIdentity,
    origin,
    size,
    voxels,
    paletteKey: key(input.paletteKey, `${path}.paletteKey`),
    materialKey: key(input.materialKey, `${path}.materialKey`),
  };
}

function parseBatch(
  value: unknown,
  path: string,
  limits: RenderLimitsV1,
  budget: SnapshotByteBudgetInternal,
): InstanceBatchV1 {
  const input = record(value, path);
  const batchIdentity = identity(input, path);
  const geometryKey = key(input.geometryKey, `${path}.geometryKey`);
  const materialKey = key(input.materialKey, `${path}.materialKey`);
  const rawKeys = list(
    input.instanceKeys,
    `${path}.instanceKeys`,
    limits.maxInstancesPerBatch,
    'limit.batch-instances',
    'Instance count exceeds its declared limit.',
  );
  const instanceKeys = rawKeys.map((value, index) => key(value, `${path}.instanceKeys[${String(index)}]`));
  const seen = new Set<string>();
  instanceKeys.forEach((value, index) => {
    if (seen.has(value)) fail('key.duplicate', `${path}.instanceKeys[${String(index)}]`, 'Duplicate instance key.');
    seen.add(value);
  });
  const rawMatrices = float32(input.matrices, `${path}.matrices`);
  if (rawMatrices.length !== instanceKeys.length * 16) fail('batch.matrix-count', `${path}.matrices`, 'Expected one matrix per instance.');
  let rawColors: Uint8Array | undefined;
  if (input.colors !== undefined) {
    rawColors = uint8(input.colors, `${path}.colors`);
    if (rawColors.length !== instanceKeys.length * 4) fail('batch.color-count', `${path}.colors`, 'Expected one RGBA color per instance.');
  }
  const matrices = budget.retain(rawMatrices, `${path}.matrices`);
  const colors = rawColors === undefined
    ? undefined
    : budget.retain(rawColors, `${path}.colors`);
  finiteArray(matrices, `${path}.matrices`);
  const animation = input.animation === undefined
    ? undefined
    : parseInstanceAnimation(input.animation, `${path}.animation`, instanceKeys.length, budget);
  if (animation !== undefined) {
    if (
      animation.periodsMs.some((period) => period > 0)
      && instanceKeys.length > MAX_INSTANCES_PER_ANIMATED_BATCH_V1
    ) {
      fail(
        'limit.animated-batch-instances',
        `${path}.instanceKeys`,
        `Animated batches may contain at most ${String(MAX_INSTANCES_PER_ANIMATED_BATCH_V1)} instances; shard larger crowds.`,
      );
    }
    validateAnimatedBaseMatrices(matrices, animation, path);
  }
  const presentation = input.presentation === undefined
    ? undefined
    : (() => {
        const policy = record(input.presentation, `${path}.presentation`);
        return {
          castShadow: boolean(policy.castShadow, `${path}.presentation.castShadow`),
          receiveShadow: boolean(policy.receiveShadow, `${path}.presentation.receiveShadow`),
        };
      })();
  return {
    ...batchIdentity,
    geometryKey,
    materialKey,
    instanceKeys,
    matrices,
    ...(colors === undefined ? {} : { colors }),
    ...(animation === undefined ? {} : { animation }),
    ...(presentation === undefined ? {} : { presentation }),
  };
}

const ANIMATED_AFFINE_ZERO_INDICES = [3, 7, 11] as const;
const ANIMATED_AFFINE_LINEAR_INDICES = [0, 1, 2, 4, 5, 6, 8, 9, 10] as const;

function validateAnimatedBaseMatrices(
  matrices: Float32Array,
  animation: InstanceTransformAnimationV1,
  batchPath: string,
): void {
  for (let instanceIndex = 0; instanceIndex < animation.periodsMs.length; instanceIndex += 1) {
    if (animation.periodsMs[instanceIndex] === 0) continue;
    const matrixOffset = instanceIndex * 16;
    for (const elementIndex of ANIMATED_AFFINE_ZERO_INDICES) {
      if (matrices[matrixOffset + elementIndex] !== 0) {
        fail(
          'batch.animation.matrix-affine',
          `${batchPath}.matrices[${String(matrixOffset + elementIndex)}]`,
          'Animated base matrices must be affine transforms.',
        );
      }
    }
    if (matrices[matrixOffset + 15] !== 1) {
      fail(
        'batch.animation.matrix-affine',
        `${batchPath}.matrices[${String(matrixOffset + 15)}]`,
        'Animated base matrices must be affine transforms.',
      );
    }
    for (const elementIndex of ANIMATED_AFFINE_LINEAR_INDICES) {
      if (
        Math.abs(matrices[matrixOffset + elementIndex]!)
        > MAX_INSTANCE_ANIMATION_BASE_LINEAR_COMPONENT_V1
      ) {
        fail(
          'batch.animation.matrix-range',
          `${batchPath}.matrices[${String(matrixOffset + elementIndex)}]`,
          'Animated base matrix exceeds the safe affine multiplication range.',
        );
      }
    }
  }
}

function requireAnimationCount(
  value: Float32Array,
  expected: number,
  code: string,
  path: string,
): void {
  if (value.length !== expected) {
    fail(code, path, `Expected ${String(expected)} animation values.`);
  }
}

function requireAnimationRange(
  values: Float32Array,
  maximumAbsolute: number,
  code: string,
  path: string,
): void {
  for (let index = 0; index < values.length; index += 1) {
    if (Math.abs(values[index]!) > maximumAbsolute) {
      fail(code, `${path}[${String(index)}]`, `Animation value exceeds ${String(maximumAbsolute)}.`);
    }
  }
}

function parseInstanceAnimation(
  value: unknown,
  path: string,
  instanceCount: number,
  budget: SnapshotByteBudgetInternal,
): InstanceTransformAnimationV1 {
  const input = record(value, path);
  const schemaVersion = literal(
    input.schemaVersion,
    INSTANCE_TRANSFORM_ANIMATION_SCHEMA_V1,
    `${path}.schemaVersion`,
  );
  const rawPeriodsMs = float32(input.periodsMs, `${path}.periodsMs`);
  const rawPhasesRadians = float32(input.phasesRadians, `${path}.phasesRadians`);
  const rawTranslationAmplitudes = float32(
    input.translationAmplitudes,
    `${path}.translationAmplitudes`,
  );
  const rawRotationAmplitudesRadians = float32(
    input.rotationAmplitudesRadians,
    `${path}.rotationAmplitudesRadians`,
  );
  const rawScaleAmplitudes = float32(input.scaleAmplitudes, `${path}.scaleAmplitudes`);
  requireAnimationCount(rawPeriodsMs, instanceCount, 'batch.animation.period-count', `${path}.periodsMs`);
  requireAnimationCount(rawPhasesRadians, instanceCount, 'batch.animation.phase-count', `${path}.phasesRadians`);
  requireAnimationCount(
    rawTranslationAmplitudes,
    instanceCount * 3,
    'batch.animation.translation-count',
    `${path}.translationAmplitudes`,
  );
  requireAnimationCount(
    rawRotationAmplitudesRadians,
    instanceCount * 3,
    'batch.animation.rotation-count',
    `${path}.rotationAmplitudesRadians`,
  );
  requireAnimationCount(
    rawScaleAmplitudes,
    instanceCount * 3,
    'batch.animation.scale-count',
    `${path}.scaleAmplitudes`,
  );
  const periodsMs = budget.retain(rawPeriodsMs, `${path}.periodsMs`);
  const phasesRadians = budget.retain(rawPhasesRadians, `${path}.phasesRadians`);
  const translationAmplitudes = budget.retain(
    rawTranslationAmplitudes,
    `${path}.translationAmplitudes`,
  );
  const rotationAmplitudesRadians = budget.retain(
    rawRotationAmplitudesRadians,
    `${path}.rotationAmplitudesRadians`,
  );
  const scaleAmplitudes = budget.retain(rawScaleAmplitudes, `${path}.scaleAmplitudes`);
  for (const [name, array] of Object.entries({
    periodsMs,
    phasesRadians,
    translationAmplitudes,
    rotationAmplitudesRadians,
    scaleAmplitudes,
  })) {
    finiteArray(array, `${path}.${name}`);
  }
  for (let index = 0; index < periodsMs.length; index += 1) {
    const period = periodsMs[index]!;
    if (
      period !== 0
      && (period < MIN_INSTANCE_ANIMATION_PERIOD_MS_V1
        || period > MAX_INSTANCE_ANIMATION_PERIOD_MS_V1)
    ) {
      fail(
        'batch.animation.period-range',
        `${path}.periodsMs[${String(index)}]`,
        `Animation period must be zero or from ${String(MIN_INSTANCE_ANIMATION_PERIOD_MS_V1)} to ${String(MAX_INSTANCE_ANIMATION_PERIOD_MS_V1)} milliseconds.`,
      );
    }
  }
  requireAnimationRange(
    translationAmplitudes,
    MAX_INSTANCE_ANIMATION_TRANSLATION_V1,
    'batch.animation.translation-range',
    `${path}.translationAmplitudes`,
  );
  requireAnimationRange(
    rotationAmplitudesRadians,
    MAX_INSTANCE_ANIMATION_ROTATION_RADIANS_V1,
    'batch.animation.rotation-range',
    `${path}.rotationAmplitudesRadians`,
  );
  requireAnimationRange(
    scaleAmplitudes,
    MAX_INSTANCE_ANIMATION_SCALE_AMPLITUDE_V1,
    'batch.animation.scale-range',
    `${path}.scaleAmplitudes`,
  );
  return {
    schemaVersion,
    periodsMs,
    phasesRadians,
    translationAmplitudes,
    rotationAmplitudesRadians,
    scaleAmplitudes,
  };
}

function assertUniqueKeys(values: readonly { readonly key: string }[], path: string): void {
  const seen = new Set<string>();
  values.forEach((value, index) => {
    if (seen.has(value.key)) fail('key.duplicate', `${path}[${String(index)}].key`, `Duplicate key ${value.key}.`);
    seen.add(value.key);
  });
}

function assertChunksDoNotOverlap(chunks: readonly VoxelChunkV1[]): void {
  const indexed = stableMergeSortInternal(
    chunks.map((chunk, index) => ({ chunk, index })),
    (left, right) => left.chunk.origin.x - right.chunk.origin.x || left.index - right.index,
  );
  let comparisons = 0;
  const maxComparisons = 1_000_000;
  for (let leftIndex = 0; leftIndex < indexed.length; leftIndex += 1) {
    const left = indexed[leftIndex]!;
    const leftMaxX = left.chunk.origin.x + left.chunk.size.x;
    for (let rightIndex = leftIndex + 1; rightIndex < indexed.length; rightIndex += 1) {
      const right = indexed[rightIndex]!;
      if (right.chunk.origin.x >= leftMaxX) break;
      comparisons++;
      if (comparisons > maxComparisons) {
        fail(
          'limit.chunk-overlap-comparisons',
          'chunks',
          'Chunk layout is too complex to validate within the bounded comparison budget.',
        );
      }
      const overlapsY = left.chunk.origin.y < right.chunk.origin.y + right.chunk.size.y
        && right.chunk.origin.y < left.chunk.origin.y + left.chunk.size.y;
      const overlapsZ = left.chunk.origin.z < right.chunk.origin.z + right.chunk.size.z
        && right.chunk.origin.z < left.chunk.origin.z + left.chunk.size.z;
      if (overlapsY && overlapsZ) {
        fail(
          'chunk.overlap',
          `chunks[${String(right.index)}].origin`,
          `Chunk overlaps chunks[${String(left.index)}].`,
        );
      }
    }
  }
}

function assertReferences(snapshot: OwnedRenderSnapshotV1): void {
  const palettes = new Map<string, PaletteResourceV1>();
  const materials = new Set<string>();
  const geometries = new Set<string>();
  snapshot.resources.forEach((resource) => {
    if (resource.kind === 'palette') palettes.set(resource.key, resource);
    if (resource.kind === 'material') materials.add(resource.key);
    if (resource.kind === 'geometry') geometries.add(resource.key);
  });
  snapshot.resources.forEach((resource, resourceIndex) => {
    if (resource.kind !== 'geometry') return;
    resource.groups.forEach((group, groupIndex) => {
      if (!materials.has(group.materialKey)) fail('reference.missing', `resources[${String(resourceIndex)}].groups[${String(groupIndex)}].materialKey`, 'Material resource is missing.');
    });
  });
  snapshot.chunks.forEach((chunk, chunkIndex) => {
    const palette = palettes.get(chunk.paletteKey);
    if (!palette) fail('reference.missing', `chunks[${String(chunkIndex)}].paletteKey`, 'Palette resource is missing.');
    if (!materials.has(chunk.materialKey)) fail('reference.missing', `chunks[${String(chunkIndex)}].materialKey`, 'Material resource is missing.');
    chunk.voxels.forEach((paletteIndex, voxelIndex) => {
      if (paletteIndex >= palette.entries.length) fail('chunk.palette-index-out-of-range', `chunks[${String(chunkIndex)}].voxels[${String(voxelIndex)}]`, 'Voxel references a missing palette entry.');
    });
  });
  snapshot.batches.forEach((batch, batchIndex) => {
    if (!geometries.has(batch.geometryKey)) fail('reference.missing', `batches[${String(batchIndex)}].geometryKey`, 'Geometry resource is missing.');
    if (!materials.has(batch.materialKey)) fail('reference.missing', `batches[${String(batchIndex)}].materialKey`, 'Material resource is missing.');
  });
}

export function parseSnapshot(
  value: unknown,
  copyMetrics?: SnapshotCopyMetricsInternal,
  copyArrays = true,
): OwnedRenderSnapshotV1 {
  const input = record(value, '$');
  const descriptor = parseDescriptor(input.descriptor);
  const budget = new SnapshotByteBudgetInternal(
    descriptor.limits.maxTotalBytes,
    copyMetrics,
    copyArrays,
  );
  const rawResources = list(
    input.resources,
    'resources',
    descriptor.limits.maxResources,
    'limit.resources',
    'Resource count exceeds its declared limit.',
  );
  const resources = rawResources.map((resource, index) => parseResource(resource, `resources[${String(index)}]`, descriptor.limits, budget));
  assertUniqueKeys(resources, 'resources');

  const rawChunks = list(
    input.chunks,
    'chunks',
    descriptor.limits.maxChunks,
    'limit.chunks',
    'Chunk count exceeds its declared limit.',
  );
  const chunks = rawChunks.map((chunk, index) => parseChunk(chunk, `chunks[${String(index)}]`, descriptor.limits, budget));
  assertUniqueKeys(chunks, 'chunks');
  if (descriptor.chunkProfile) assertUniformChunkProfileInternal(chunks, descriptor.chunkProfile);
  assertChunksDoNotOverlap(chunks);

  const rawBatches = list(
    input.batches,
    'batches',
    descriptor.limits.maxBatches,
    'limit.batches',
    'Batch count exceeds its declared limit.',
  );
  const batches = rawBatches.map((batch, index) => parseBatch(batch, `batches[${String(index)}]`, descriptor.limits, budget));
  let activeAnimations = 0;
  batches.forEach((batch, batchIndex) => {
    batch.animation?.periodsMs.forEach((period, instanceIndex) => {
      if (period === 0) return;
      activeAnimations += 1;
      if (activeAnimations > MAX_ACTIVE_INSTANCE_ANIMATIONS_V1) {
        fail(
          'limit.animated-instances',
          `batches[${String(batchIndex)}].animation.periodsMs[${String(instanceIndex)}]`,
          `Active instance animation count exceeds the hard per-frame limit of ${String(MAX_ACTIVE_INSTANCE_ANIMATIONS_V1)}.`,
        );
      }
    });
  });
  assertUniqueKeys(batches, 'batches');

  const snapshot: OwnedRenderSnapshotV1 = {
    schemaVersion: literal(input.schemaVersion, RENDER_SNAPSHOT_SCHEMA_V1, 'schemaVersion'),
    descriptor,
    revision: integer(input.revision, 'revision'),
    resources,
    chunks,
    batches,
  };
  assertReferences(snapshot);
  return snapshot;
}

export function validateAndCopySnapshotV1(value: unknown): SnapshotValidationResultV1 {
  return validateAndCopySnapshotV1WithMetrics(value).result;
}

export type InternalValidationResult<Value> =
  | { readonly ok: true; readonly value: Value }
  | { readonly ok: false; readonly issue: { readonly code: string; readonly path: string; readonly message: string } };

function captureInternalValidation<Value>(parse: () => Value): InternalValidationResult<Value> {
  try {
    return { ok: true, value: parse() };
  } catch (error) {
    if (error instanceof ValidationFailureInternal) {
      return {
        ok: false,
        issue: { code: error.code, path: error.path, message: error.message },
      };
    }
    throw error;
  }
}

/** Package-internal one-copy parser for a delta resource payload. */
export function validateAndCopyRenderResourceV1Internal(
  value: unknown,
  path: string,
  limits: RenderLimitsV1,
  budget: SnapshotByteBudgetInternal,
): InternalValidationResult<RenderResourceV1> {
  return captureInternalValidation(() => parseResource(value, path, limits, budget));
}

/** Package-internal one-copy parser for a delta chunk payload. */
export function validateAndCopyVoxelChunkV1Internal(
  value: unknown,
  path: string,
  limits: RenderLimitsV1,
  budget: SnapshotByteBudgetInternal,
): InternalValidationResult<VoxelChunkV1> {
  return captureInternalValidation(() => parseChunk(value, path, limits, budget));
}

/** Package-internal one-copy parser for a delta batch or patch payload. */
export function validateAndCopyInstanceBatchV1Internal(
  value: unknown,
  path: string,
  limits: RenderLimitsV1,
  budget: SnapshotByteBudgetInternal,
): InternalValidationResult<InstanceBatchV1> {
  return captureInternalValidation(() => parseBatch(value, path, limits, budget));
}

/** Package-internal final-graph validation that never recopies canonical arrays. */
export function validateOwnedSnapshotV1Internal(
  value: unknown,
): SnapshotValidationResultV1 {
  return captureInternalValidation(() => parseSnapshot(value, undefined, false));
}

/** Package-internal ownership telemetry used by the Three ingest regression gate. */
export function validateAndCopySnapshotV1WithMetrics(
  value: unknown,
): SnapshotValidationWithMetricsInternal {
  const metrics: SnapshotCopyMetricsInternal = {
    inputTypedArrayBytes: 0,
    copiedTypedArrayBytes: 0,
    copyOperations: 0,
  };
  try {
    return {
      result: (() => {
        const parsed = parseSnapshot(value, metrics, false);
        // Revalidate the normalized, getter-free graph before copying. A later
        // accessor in the original input may have mutated an earlier borrowed
        // typed lane during the first parse.
        const normalized = parseSnapshot(parsed, undefined, false);
        const owned = copyRenderSnapshotV1(normalized);
        metrics.copiedTypedArrayBytes = renderSnapshotCopyBytes(normalized);
        metrics.copyOperations = renderSnapshotCopyOperations(normalized);
        return { ok: true as const, value: owned };
      })(),
      metrics,
    };
  } catch (error) {
    if (error instanceof ValidationFailureInternal) {
      return {
        result: {
          ok: false,
          issue: { code: error.code, path: error.path, message: error.message },
        },
        metrics,
      };
    }
    throw error;
  }
}
