import {
  HARD_RENDER_LIMITS_V1,
  MAX_EXACT_FLOAT32_VOXEL_COORDINATE_V1,
  MAX_GEOMETRY_GROUPS_PER_RESOURCE_V1,
  RENDER_SNAPSHOT_SCHEMA_V1,
  WORLD_SCHEMA_V1,
  type Aabb3V1,
  type GeometryResourceV1,
  type InstanceBatchV1,
  type Int3V1,
  type MaterialResourceV1,
  type OwnedRenderSnapshotV1,
  type PaletteResourceV1,
  type RenderCapabilityV1,
  type RenderLimitsV1,
  type RenderResourceV1,
  type SnapshotValidationResultV1,
  type Srgb8ColorV1,
  type Vec3V1,
  type VoxelChunkV1,
  type WorldDescriptorV1,
} from './contracts.js';

const MAX_KEY_LENGTH = 256;
const CAPABILITIES = new Set<RenderCapabilityV1>([
  'voxel-chunks',
  'geometry-resources',
  'instance-batches',
]);

class ValidationFailure extends Error {
  constructor(
    readonly code: string,
    readonly path: string,
    message: string,
  ) {
    super(message);
  }
}

function fail(code: string, path: string, message: string): never {
  throw new ValidationFailure(code, path, message);
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    fail('type.object', path, 'Expected an object.');
  }
  return value as Record<string, unknown>;
}

function list(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) fail('type.array', path, 'Expected an array.');
  return value;
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

class ByteBudget {
  private used = 0;

  constructor(private readonly maximum: number) {}

  retain<T extends ArrayBufferView & { slice(): T }>(value: T, path: string): T {
    if (
      typeof SharedArrayBuffer !== 'undefined'
      && value.buffer instanceof SharedArrayBuffer
    ) {
      fail('buffer.shared', path, 'SharedArrayBuffer-backed inputs are not accepted.');
    }
    if (this.used + value.byteLength > this.maximum) {
      fail('limit.total-bytes', '$', `Typed-array data exceeds the ${String(this.maximum)}-byte snapshot budget.`);
    }
    let copy: T;
    try {
      copy = value.slice();
    } catch {
      return fail('buffer.detached', path, 'Detached typed-array inputs are not accepted.');
    }
    this.used += value.byteLength;
    return copy;
  }
}

function float32(value: unknown, path: string, budget: ByteBudget): Float32Array {
  if (!(value instanceof Float32Array)) fail('type.float32-array', path, 'Expected Float32Array.');
  return budget.retain(value, path);
}

function uint8(value: unknown, path: string, budget: ByteBudget): Uint8Array {
  if (!(value instanceof Uint8Array)) fail('type.uint8-array', path, 'Expected Uint8Array.');
  return budget.retain(value, path);
}

function uint16(value: unknown, path: string, budget: ByteBudget): Uint16Array {
  if (!(value instanceof Uint16Array)) fail('type.uint16-array', path, 'Expected Uint16Array.');
  return budget.retain(value, path);
}

function indices(
  value: unknown,
  path: string,
  budget: ByteBudget,
): Uint16Array | Uint32Array {
  if (!(value instanceof Uint16Array) && !(value instanceof Uint32Array)) {
    fail('type.index-array', path, 'Expected Uint16Array or Uint32Array.');
  }
  return budget.retain(value, path);
}

function finiteArray(value: Float32Array, path: string): void {
  for (let index = 0; index < value.length; index += 1) {
    if (!Number.isFinite(value[index])) {
      fail('number.non-finite', `${path}[${String(index)}]`, 'Expected a finite number.');
    }
  }
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

function parseDescriptor(value: unknown): WorldDescriptorV1 {
  const input = record(value, 'descriptor');
  const coordinates = record(input.coordinates, 'descriptor.coordinates');
  const units = vec3(coordinates.worldUnitsPerVoxel, 'descriptor.coordinates.worldUnitsPerVoxel');
  for (const axis of ['x', 'y', 'z'] as const) {
    if (units[axis] <= 0) fail('number.positive', `descriptor.coordinates.worldUnitsPerVoxel.${axis}`, 'Expected a positive value.');
  }
  const metersPerWorldUnit = finite(coordinates.metersPerWorldUnit, 'descriptor.coordinates.metersPerWorldUnit');
  if (metersPerWorldUnit <= 0) fail('number.positive', 'descriptor.coordinates.metersPerWorldUnit', 'Expected a positive value.');

  const capabilityValues = list(input.capabilities, 'descriptor.capabilities');
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
    limits: parseLimits(input.limits),
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
  const rawEntries = list(input.entries, `${path}.entries`);
  if (rawEntries.length > limits.maxPaletteEntries) {
    fail('limit.palette-entries', `${path}.entries`, 'Palette entry count exceeds its declared limit.');
  }
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
  budget: ByteBudget,
): GeometryResourceV1 {
  const topology = input.topology;
  if (topology !== 'triangles' && topology !== 'lines' && topology !== 'points') {
    fail('geometry.topology', `${path}.topology`, 'Unsupported primitive topology.');
  }
  const positions = float32(input.positions, `${path}.positions`, budget);
  finiteArray(positions, `${path}.positions`);
  if (positions.length % 3 !== 0) fail('geometry.positions-length', `${path}.positions`, 'Positions must contain xyz triples.');
  const vertexCount = positions.length / 3;
  if (vertexCount > limits.maxGeometryVertices) fail('limit.geometry-vertices', `${path}.positions`, 'Vertex count exceeds its declared limit.');

  const normals = float32(input.normals, `${path}.normals`, budget);
  finiteArray(normals, `${path}.normals`);
  if (normals.length !== positions.length) fail('geometry.normals-length', `${path}.normals`, 'Normals must match positions.');

  const parsedIndices = indices(input.indices, `${path}.indices`, budget);
  if (parsedIndices.length > limits.maxGeometryIndices) fail('limit.geometry-indices', `${path}.indices`, 'Index count exceeds its declared limit.');
  const primitiveSize = topology === 'triangles' ? 3 : topology === 'lines' ? 2 : 1;
  if (parsedIndices.length % primitiveSize !== 0) fail('geometry.indices-length', `${path}.indices`, 'Index count does not match topology.');
  parsedIndices.forEach((index, offset) => {
    if (index >= vertexCount) fail('geometry.index-out-of-range', `${path}.indices[${String(offset)}]`, 'Index references a missing vertex.');
  });

  let uvs: Float32Array | undefined;
  if (input.uvs !== undefined) {
    uvs = float32(input.uvs, `${path}.uvs`, budget);
    finiteArray(uvs, `${path}.uvs`);
    if (uvs.length !== vertexCount * 2) fail('geometry.uvs-length', `${path}.uvs`, 'UVs must contain one pair per vertex.');
  }
  let colors: Uint8Array | undefined;
  if (input.colors !== undefined) {
    colors = uint8(input.colors, `${path}.colors`, budget);
    if (colors.length !== vertexCount * 3 && colors.length !== vertexCount * 4) {
      fail('geometry.colors-length', `${path}.colors`, 'Colors must contain RGB or RGBA per vertex.');
    }
  }

  const rawGroups = list(input.groups, `${path}.groups`);
  if (rawGroups.length > MAX_GEOMETRY_GROUPS_PER_RESOURCE_V1) {
    fail(
      'limit.geometry-groups',
      `${path}.groups`,
      `Geometry group count exceeds the hard maximum of ${String(MAX_GEOMETRY_GROUPS_PER_RESOURCE_V1)}.`,
    );
  }
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
    ...identity(input, path),
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
  budget: ByteBudget,
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
  budget: ByteBudget,
): VoxelChunkV1 {
  const input = record(value, path);
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
  const voxels = uint16(input.voxels, `${path}.voxels`, budget);
  if (voxels.length !== volume) fail('chunk.voxel-count', `${path}.voxels`, 'Voxel data length does not match chunk size.');
  return {
    ...identity(input, path),
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
  budget: ByteBudget,
): InstanceBatchV1 {
  const input = record(value, path);
  const rawKeys = list(input.instanceKeys, `${path}.instanceKeys`);
  if (rawKeys.length > limits.maxInstancesPerBatch) fail('limit.batch-instances', `${path}.instanceKeys`, 'Instance count exceeds its declared limit.');
  const instanceKeys = rawKeys.map((value, index) => key(value, `${path}.instanceKeys[${String(index)}]`));
  const seen = new Set<string>();
  instanceKeys.forEach((value, index) => {
    if (seen.has(value)) fail('key.duplicate', `${path}.instanceKeys[${String(index)}]`, 'Duplicate instance key.');
    seen.add(value);
  });
  const matrices = float32(input.matrices, `${path}.matrices`, budget);
  finiteArray(matrices, `${path}.matrices`);
  if (matrices.length !== instanceKeys.length * 16) fail('batch.matrix-count', `${path}.matrices`, 'Expected one matrix per instance.');
  let colors: Uint8Array | undefined;
  if (input.colors !== undefined) {
    colors = uint8(input.colors, `${path}.colors`, budget);
    if (colors.length !== instanceKeys.length * 4) fail('batch.color-count', `${path}.colors`, 'Expected one RGBA color per instance.');
  }
  return {
    ...identity(input, path),
    geometryKey: key(input.geometryKey, `${path}.geometryKey`),
    materialKey: key(input.materialKey, `${path}.materialKey`),
    instanceKeys,
    matrices,
    ...(colors === undefined ? {} : { colors }),
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
  const indexed = chunks
    .map((chunk, index) => ({ chunk, index }))
    .sort((a, b) => a.chunk.origin.x - b.chunk.origin.x || a.index - b.index);
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

function parseSnapshot(value: unknown): OwnedRenderSnapshotV1 {
  const input = record(value, '$');
  const descriptor = parseDescriptor(input.descriptor);
  const budget = new ByteBudget(descriptor.limits.maxTotalBytes);
  const rawResources = list(input.resources, 'resources');
  if (rawResources.length > descriptor.limits.maxResources) fail('limit.resources', 'resources', 'Resource count exceeds its declared limit.');
  const resources = rawResources.map((resource, index) => parseResource(resource, `resources[${String(index)}]`, descriptor.limits, budget));
  assertUniqueKeys(resources, 'resources');

  const rawChunks = list(input.chunks, 'chunks');
  if (rawChunks.length > descriptor.limits.maxChunks) fail('limit.chunks', 'chunks', 'Chunk count exceeds its declared limit.');
  const chunks = rawChunks.map((chunk, index) => parseChunk(chunk, `chunks[${String(index)}]`, descriptor.limits, budget));
  assertUniqueKeys(chunks, 'chunks');
  assertChunksDoNotOverlap(chunks);

  const rawBatches = list(input.batches, 'batches');
  if (rawBatches.length > descriptor.limits.maxBatches) fail('limit.batches', 'batches', 'Batch count exceeds its declared limit.');
  const batches = rawBatches.map((batch, index) => parseBatch(batch, `batches[${String(index)}]`, descriptor.limits, budget));
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
  try {
    return { ok: true, value: parseSnapshot(value) };
  } catch (error) {
    if (error instanceof ValidationFailure) {
      return { ok: false, issue: { code: error.code, path: error.path, message: error.message } };
    }
    throw error;
  }
}
