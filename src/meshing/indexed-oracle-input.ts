import type {
  Int3V1,
  UniformVoxelChunkProfileV1,
  Vec3V1,
} from '../core/contracts.js';
import {
  MESHER_INPUT_SCHEMA_V1,
  type MesherDependencyTokenV1,
  type MesherOutputBudgetV1,
  type PureMesherDescriptorV1,
  type PureMesherInputV1,
} from './mesher-contract.js';
import {
  validatePureMesherDescriptorV1,
  validatePureMesherInputV1,
} from './mesher-contract-validation.js';
import type { ChunkIndexEntryV1, ChunkIndexV1 } from './chunk-index.js';
import {
  INDEXED_VISIBLE_FACE_ORACLE_DEFAULT_OUTPUT_BUDGET_V1,
  VISIBLE_FACE_ORACLE_DESCRIPTOR_V1,
} from './visible-face-oracle.js';

export interface IndexedMesherPreparationLimitsV1 {
  /** Maximum scheduled chunks in the indexed world. */
  readonly maxChunks: number;
  /** Aggregate copied source-plus-halo bytes for that complete world. */
  readonly maxCopiedSampleBytes: number;
  /** Aggregate deterministic sampling and dependency-query work. */
  readonly maxPreparationWorkElements: number;
}

/** Compatibility name retained for the visible-face oracle wrapper. */
export type IndexedVisibleFaceOraclePreparationLimitsV1 =
  IndexedMesherPreparationLimitsV1;

export interface PrepareIndexedMesherInputOptionsV1 {
  readonly descriptor: PureMesherDescriptorV1;
  readonly index: ChunkIndexV1;
  readonly sourceCoordinate: Int3V1;
  readonly worldId: string;
  readonly epoch: string;
  readonly materialPolicyVersion: string;
  readonly worldUnitsPerVoxel: Vec3V1;
  readonly paletteEntryCount: number;
  readonly materialEntryCount?: number;
  readonly outputBudget?: MesherOutputBudgetV1;
  /** Exact transaction/group population used for aggregate copy/work preflight. */
  readonly scheduledChunkCount?: number;
  readonly preparationLimits: IndexedMesherPreparationLimitsV1;
}

export interface PrepareIndexedVisibleFaceOracleInputOptionsV1 {
  readonly index: ChunkIndexV1;
  readonly sourceCoordinate: Int3V1;
  readonly worldId: string;
  readonly epoch: string;
  readonly materialPolicyVersion: string;
  readonly worldUnitsPerVoxel: Vec3V1;
  readonly paletteEntryCount: number;
  readonly outputBudget?: MesherOutputBudgetV1;
  readonly preparationLimits: IndexedVisibleFaceOraclePreparationLimitsV1;
}

export interface IndexedMesherPreparationMetricsV1 {
  readonly indexedChunkCount: number;
  readonly copiedSampleBytes: number;
  readonly preparationWorkElements: number;
  readonly projectedWorldCopiedSampleBytes: number;
  readonly projectedWorldPreparationWorkElements: number;
}

/** Compatibility name retained for the visible-face oracle wrapper. */
export type IndexedVisibleFaceOraclePreparationMetricsV1 =
  IndexedMesherPreparationMetricsV1;

export interface PreparedIndexedMesherInputV1 {
  readonly input: PureMesherInputV1;
  readonly metrics: IndexedMesherPreparationMetricsV1;
}

export interface PreparedIndexedVisibleFaceOracleInputV1 {
  readonly input: PureMesherInputV1;
  readonly metrics: IndexedVisibleFaceOraclePreparationMetricsV1;
}

function positiveSafeInteger(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive safe integer.`);
  }
  return value;
}

function checkedAdd(left: number, right: number, name: string): number {
  const value = left + right;
  if (!Number.isSafeInteger(value)) throw new RangeError(`${name} exceeds safe-integer range.`);
  return value;
}

function checkedMultiply(left: number, right: number, name: string): number {
  const value = left * right;
  if (!Number.isSafeInteger(value)) throw new RangeError(`${name} exceeds safe-integer range.`);
  return value;
}

function sampleDimensions(
  profile: UniformVoxelChunkProfileV1,
  descriptor: PureMesherDescriptorV1,
): Int3V1 {
  const size = profile.size;
  const halo = descriptor.halo;
  return Object.freeze({
    x: checkedAdd(checkedAdd(size.x, halo.negative.x, 'sample size.x'), halo.positive.x, 'sample size.x'),
    y: checkedAdd(checkedAdd(size.y, halo.negative.y, 'sample size.y'), halo.positive.y, 'sample size.y'),
    z: checkedAdd(checkedAdd(size.z, halo.negative.z, 'sample size.z'), halo.positive.z, 'sample size.z'),
  });
}

function sampleVolume(size: Int3V1): number {
  return checkedMultiply(
    checkedMultiply(size.x, size.y, 'sample volume'),
    size.z,
    'sample volume',
  );
}

function sampleOffset(x: number, y: number, z: number, size: Int3V1): number {
  return x + size.x * (z + size.z * y);
}

function voxelOffset(x: number, y: number, z: number, size: Int3V1): number {
  return x + size.x * (z + size.z * y);
}

function offsetKey(offset: Int3V1): string {
  return `${String(offset.x)},${String(offset.y)},${String(offset.z)}`;
}

interface IndexedDependency {
  readonly offset: Int3V1;
  readonly entry: ChunkIndexEntryV1 | undefined;
  readonly token: MesherDependencyTokenV1;
}

function dependencies(
  index: ChunkIndexV1,
  source: ChunkIndexEntryV1,
  descriptor: PureMesherDescriptorV1,
): readonly IndexedDependency[] {
  const result: IndexedDependency[] = [];
  for (const offset of descriptor.dependencyOffsets) {
    const entry = index.neighbor(source.coordinate, offset);
    if (entry) {
      result.push(Object.freeze({
        offset,
        entry,
        token: Object.freeze({
          state: 'present',
          offset,
          slotGeneration: entry.slotGeneration,
          key: entry.key,
          incarnation: entry.incarnation,
          sourceRevision: entry.sourceRevision,
        }),
      }));
      continue;
    }
    if (index.profile.missingNeighbor === 'unavailable') {
      throw new RangeError(
        `Mesher dependency ${offsetKey(offset)} is unavailable.`,
      );
    }
    result.push(Object.freeze({
      offset,
      entry: undefined,
      token: Object.freeze({
        state: 'missing',
        offset,
        slotGeneration: index.slotGenerationAt({
          x: source.coordinate.x + offset.x,
          y: source.coordinate.y + offset.y,
          z: source.coordinate.z + offset.z,
        }),
        missingNeighbor: index.profile.missingNeighbor,
      }),
    }));
  }
  return Object.freeze(result);
}

export function preflightIndexedMesherWorldV1(
  profile: UniformVoxelChunkProfileV1,
  indexedChunkCount: number,
  descriptorValue: PureMesherDescriptorV1,
  limits: IndexedMesherPreparationLimitsV1,
): IndexedMesherPreparationMetricsV1 {
  const descriptorResult = validatePureMesherDescriptorV1(descriptorValue);
  if (!descriptorResult.ok) {
    throw new RangeError(
      `${descriptorResult.issue.code} at ${descriptorResult.issue.path}: ${descriptorResult.issue.message}`,
    );
  }
  const descriptor = descriptorResult.value;
  const maxChunks = positiveSafeInteger(limits.maxChunks, 'preparationLimits.maxChunks');
  const maxCopiedSampleBytes = positiveSafeInteger(
    limits.maxCopiedSampleBytes,
    'preparationLimits.maxCopiedSampleBytes',
  );
  const maxPreparationWorkElements = positiveSafeInteger(
    limits.maxPreparationWorkElements,
    'preparationLimits.maxPreparationWorkElements',
  );
  if (!Number.isSafeInteger(indexedChunkCount) || indexedChunkCount < 0) {
    throw new RangeError('indexedChunkCount must be a nonnegative safe integer.');
  }
  if (indexedChunkCount > maxChunks) {
    throw new RangeError('Indexed mesher exceeds preparationLimits.maxChunks.');
  }
  const dimensions = sampleDimensions(profile, descriptor);
  const samples = sampleVolume(dimensions);
  if (samples > descriptor.limits.maxSampleVoxels) {
    throw new RangeError('Indexed mesher sample exceeds descriptor maxSampleVoxels.');
  }
  const copiedSampleBytes = checkedMultiply(
    samples,
    Uint16Array.BYTES_PER_ELEMENT,
    'copied sample bytes',
  );
  if (copiedSampleBytes > descriptor.limits.maxSampleBytes) {
    throw new RangeError('Indexed mesher sample exceeds descriptor maxSampleBytes.');
  }
  const preparationWorkElements = checkedAdd(
    samples,
    descriptor.dependencyOffsets.length,
    'preparation work',
  );
  const projectedWorldCopiedSampleBytes = checkedMultiply(
    copiedSampleBytes,
    indexedChunkCount,
    'projected world copied sample bytes',
  );
  const projectedWorldPreparationWorkElements = checkedMultiply(
    preparationWorkElements,
    indexedChunkCount,
    'projected world preparation work',
  );
  if (projectedWorldCopiedSampleBytes > maxCopiedSampleBytes) {
    throw new RangeError(
      'Indexed mesher exceeds preparationLimits.maxCopiedSampleBytes.',
    );
  }
  if (projectedWorldPreparationWorkElements > maxPreparationWorkElements) {
    throw new RangeError(
      'Indexed mesher exceeds preparationLimits.maxPreparationWorkElements.',
    );
  }
  return Object.freeze({
    indexedChunkCount,
    copiedSampleBytes,
    preparationWorkElements,
    projectedWorldCopiedSampleBytes,
    projectedWorldPreparationWorkElements,
  });
}

export function preflightIndexedVisibleFaceOracleWorldV1(
  profile: UniformVoxelChunkProfileV1,
  indexedChunkCount: number,
  limits: IndexedVisibleFaceOraclePreparationLimitsV1,
): IndexedVisibleFaceOraclePreparationMetricsV1 {
  return preflightIndexedMesherWorldV1(
    profile,
    indexedChunkCount,
    VISIBLE_FACE_ORACLE_DESCRIPTOR_V1,
    limits,
  );
}

function sampleDependency(
  dependency: IndexedDependency,
  sourceLocal: Int3V1,
  size: Int3V1,
  missingNeighbor: 'empty' | 'sealed',
): number {
  if (!dependency.entry) return missingNeighbor === 'sealed' ? 1 : 0;
  const wrap = (value: number, modulus: number): number => (
    ((value % modulus) + modulus) % modulus
  );
  const neighborLocal = {
    x: wrap(sourceLocal.x, size.x),
    y: wrap(sourceLocal.y, size.y),
    z: wrap(sourceLocal.z, size.z),
  };
  return dependency.entry.chunk.voxels[voxelOffset(
    neighborLocal.x,
    neighborLocal.y,
    neighborLocal.z,
    size,
  )]!;
}

function copySampleVolume(
  index: ChunkIndexV1,
  source: ChunkIndexEntryV1,
  indexedDependencies: readonly IndexedDependency[],
  descriptor: PureMesherDescriptorV1,
): Uint16Array {
  const dimensions = sampleDimensions(index.profile, descriptor);
  const result = new Uint16Array(sampleVolume(dimensions));
  const halo = descriptor.halo.negative;
  const size = index.profile.size;
  const dependencyByOffset = new Map(
    indexedDependencies.map((dependency) => [offsetKey(dependency.offset), dependency] as const),
  );
  const missingNeighbor = index.profile.missingNeighbor === 'sealed' ? 'sealed' : 'empty';
  for (let sampleY = 0; sampleY < dimensions.y; sampleY += 1) {
    for (let sampleZ = 0; sampleZ < dimensions.z; sampleZ += 1) {
      for (let sampleX = 0; sampleX < dimensions.x; sampleX += 1) {
        const local = {
          x: sampleX - halo.x,
          y: sampleY - halo.y,
          z: sampleZ - halo.z,
        };
        const outsideX = local.x < 0 || local.x >= size.x
          ? Math.floor(local.x / size.x)
          : 0;
        const outsideY = local.y < 0 || local.y >= size.y
          ? Math.floor(local.y / size.y)
          : 0;
        const outsideZ = local.z < 0 || local.z >= size.z
          ? Math.floor(local.z / size.z)
          : 0;
        let value = 0;
        if (outsideX === 0 && outsideY === 0 && outsideZ === 0) {
          value = source.chunk.voxels[voxelOffset(local.x, local.y, local.z, size)]!;
        } else {
          const dependency = dependencyByOffset.get(offsetKey({
            x: outsideX,
            y: outsideY,
            z: outsideZ,
          }));
          // Rectangular halo cells that the descriptor does not declare as a
          // dependency are deterministic zero padding and must not query world state.
          if (dependency) value = sampleDependency(dependency, local, size, missingNeighbor);
        }
        result[sampleOffset(sampleX, sampleY, sampleZ, dimensions)] = value;
      }
    }
  }
  return result;
}

/** Copies one canonical source plus the selected descriptor's declared halo. */
export function prepareIndexedMesherInputV1(
  options: PrepareIndexedMesherInputOptionsV1,
): PreparedIndexedMesherInputV1 {
  const descriptorResult = validatePureMesherDescriptorV1(options.descriptor);
  if (!descriptorResult.ok) {
    throw new RangeError(
      `${descriptorResult.issue.code} at ${descriptorResult.issue.path}: ${descriptorResult.issue.message}`,
    );
  }
  const descriptor = descriptorResult.value;
  const scheduledChunkCount = options.scheduledChunkCount ?? options.index.entries.length;
  if (
    !Number.isSafeInteger(scheduledChunkCount)
    || scheduledChunkCount <= 0
    || scheduledChunkCount > options.index.entries.length
  ) {
    throw new RangeError(
      'scheduledChunkCount must be a positive safe integer no greater than the indexed chunk count.',
    );
  }
  const metrics = preflightIndexedMesherWorldV1(
    options.index.profile,
    scheduledChunkCount,
    descriptor,
    options.preparationLimits,
  );
  const source = options.index.at(options.sourceCoordinate);
  if (!source) throw new RangeError('Indexed mesher source is not present.');
  const indexedDependencies = dependencies(options.index, source, descriptor);
  const missingNeighbor = options.index.profile.missingNeighbor === 'sealed' ? 'sealed' : 'empty';
  const input: PureMesherInputV1 = {
    schemaVersion: MESHER_INPUT_SCHEMA_V1,
    mesherId: descriptor.id,
    mesherVersion: descriptor.version,
    dependencySignature: options.index.dependencySignature({
      worldId: options.worldId,
      epoch: options.epoch,
      mesherId: descriptor.id,
      mesherVersion: descriptor.version,
      materialPolicyVersion: options.materialPolicyVersion,
      worldUnitsPerVoxel: options.worldUnitsPerVoxel,
      sourceCoordinate: source.coordinate,
      dependencyOffsets: descriptor.dependencyOffsets,
    }),
    source: Object.freeze({
      coordinate: source.coordinate,
      slotGeneration: source.slotGeneration,
      key: source.key,
      incarnation: source.incarnation,
      sourceRevision: source.sourceRevision,
      size: source.chunk.size,
    }),
    dependencies: Object.freeze(indexedDependencies.map((dependency) => dependency.token)),
    missingNeighbor,
    paletteEntryCount: options.paletteEntryCount,
    materialEntryCount: options.materialEntryCount ?? 0,
    sampleVolume: copySampleVolume(options.index, source, indexedDependencies, descriptor),
    outputBudget: options.outputBudget ?? descriptor.limits.output,
  };
  const validated = validatePureMesherInputV1(input, descriptor);
  if (!validated.ok) {
    throw new RangeError(`${validated.issue.code} at ${validated.issue.path}: ${validated.issue.message}`);
  }
  return Object.freeze({ input: validated.value, metrics });
}

/** Compatibility wrapper for the synchronous correctness oracle. */
export function prepareIndexedVisibleFaceOracleInputV1(
  options: PrepareIndexedVisibleFaceOracleInputOptionsV1,
): PreparedIndexedVisibleFaceOracleInputV1 {
  return prepareIndexedMesherInputV1({
    ...options,
    descriptor: VISIBLE_FACE_ORACLE_DESCRIPTOR_V1,
    outputBudget: options.outputBudget
      ?? INDEXED_VISIBLE_FACE_ORACLE_DEFAULT_OUTPUT_BUDGET_V1,
  });
}
