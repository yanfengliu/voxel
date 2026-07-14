import {
  HARD_RENDER_LIMITS_V1,
  type Int3V1,
} from '../core/contracts.js';
import type { DensePaletteChunkReader } from './dense-palette-chunk.js';
import {
  MAX_MESHER_SAMPLE_VOXELS_V1,
  MESHER_DESCRIPTOR_SCHEMA_V1,
  MESHER_OUTPUT_SCHEMA_V1,
  type MesherOutputBudgetV1,
  type MesherOutputV1,
  type PureMesherDescriptorV1,
  type PureMesherInputV1,
  type PureVoxelMesherV1,
} from './mesher-contract.js';
import {
  validatePureMesherDescriptorV1,
  validatePureMesherInputV1,
} from './mesher-contract-validation.js';
import { meshVisibleFaces } from './visible-face-mesher.js';

export const VISIBLE_FACE_ORACLE_ID_V1 = 'voxel.visible-face-oracle' as const;
export const VISIBLE_FACE_ORACLE_VERSION_V1 = '1' as const;

export const INDEXED_VISIBLE_FACE_ORACLE_DEFAULT_OUTPUT_BUDGET_V1:
Readonly<MesherOutputBudgetV1> = Object.freeze({
  maxExposedUnitFaces: 262_144,
  maxVertices: 1_048_576,
  maxIndices: 1_572_864,
  maxPositionBytes: 12_582_912,
  maxNormalBytes: 12_582_912,
  maxPaletteIndexBytes: 2_097_152,
  maxMaterialIndexBytes: 1,
  maxTotalBytes: 33_554_432,
  maxMeshingWorkElements: 300_000_000,
  maxResultValidationElements: 30_000_000,
});

const rawDescriptor: PureMesherDescriptorV1 = {
  schemaVersion: MESHER_DESCRIPTOR_SCHEMA_V1,
  id: VISIBLE_FACE_ORACLE_ID_V1,
  version: VISIBLE_FACE_ORACLE_VERSION_V1,
  halo: {
    negative: { x: 1, y: 1, z: 1 },
    positive: { x: 1, y: 1, z: 1 },
  },
  dependencyOffsets: [
    { x: -1, y: 0, z: 0 },
    { x: 1, y: 0, z: 0 },
    { x: 0, y: -1, z: 0 },
    { x: 0, y: 1, z: 0 },
    { x: 0, y: 0, z: -1 },
    { x: 0, y: 0, z: 1 },
  ],
  attributes: {
    normals: 'flat-axis-aligned-f32x3',
    paletteIndices: 'per-vertex-u16',
    materialIndices: 'none',
    maxPaletteEntries: 65_536,
    maxMaterialEntries: 0,
  },
  limits: {
    maxSampleVoxels: MAX_MESHER_SAMPLE_VOXELS_V1,
    maxSampleBytes: MAX_MESHER_SAMPLE_VOXELS_V1 * Uint16Array.BYTES_PER_ELEMENT,
    maxDependencyOffsets: 6,
    output: INDEXED_VISIBLE_FACE_ORACLE_DEFAULT_OUTPUT_BUDGET_V1,
  },
};

const descriptorResult = validatePureMesherDescriptorV1(rawDescriptor);
if (!descriptorResult.ok) {
  throw new Error(`Invalid visible-face oracle descriptor: ${descriptorResult.issue.message}`);
}

/** Frozen contract shared by the synchronous oracle and later worker candidates. */
export const VISIBLE_FACE_ORACLE_DESCRIPTOR_V1 = descriptorResult.value;

function checkedMultiply(left: number, right: number, name: string): number {
  const value = left * right;
  if (!Number.isSafeInteger(value)) throw new RangeError(`${name} exceeds safe-integer range.`);
  return value;
}

function checkedAdd(left: number, right: number, name: string): number {
  const value = left + right;
  if (!Number.isSafeInteger(value)) throw new RangeError(`${name} exceeds safe-integer range.`);
  return value;
}

function dimensions(input: PureMesherInputV1): Int3V1 {
  const halo = VISIBLE_FACE_ORACLE_DESCRIPTOR_V1.halo;
  return {
    x: input.source.size.x + halo.negative.x + halo.positive.x,
    y: input.source.size.y + halo.negative.y + halo.positive.y,
    z: input.source.size.z + halo.negative.z + halo.positive.z,
  };
}

function sampleIndex(x: number, y: number, z: number, size: Int3V1): number {
  return x + size.x * (z + size.z * y);
}

class HaloChunkReader implements DensePaletteChunkReader {
  readonly origin = Object.freeze({ x: 0, y: 0, z: 0 });
  readonly size: Int3V1;
  readonly volume: number;
  readonly #sampleSize: Int3V1;

  constructor(private readonly input: PureMesherInputV1) {
    this.size = input.source.size;
    this.volume = this.size.x * this.size.y * this.size.z;
    this.#sampleSize = dimensions(input);
  }

  containsLocal(x: number, y: number, z: number): boolean {
    return Number.isInteger(x) && Number.isInteger(y) && Number.isInteger(z)
      && x >= 0 && y >= 0 && z >= 0
      && x < this.size.x && y < this.size.y && z < this.size.z;
  }

  getLocal(x: number, y: number, z: number): number {
    if (!this.containsLocal(x, y, z)) {
      throw new RangeError('Visible-face oracle local sample is outside its source chunk.');
    }
    return this.sample(x, y, z);
  }

  sample(x: number, y: number, z: number): number {
    const halo = VISIBLE_FACE_ORACLE_DESCRIPTOR_V1.halo.negative;
    return this.input.sampleVolume[sampleIndex(
      x + halo.x,
      y + halo.y,
      z + halo.z,
      this.#sampleSize,
    )]!;
  }
}

export interface IndexedVisibleFaceOraclePreflightInternal {
  readonly input: PureMesherInputV1;
  readonly sourceVoxelCount: number;
  readonly exposedUnitFaceCount: number;
  readonly vertexCount: number;
  readonly indexCount: number;
  readonly triangleCount: number;
  readonly outputBytes: number;
  readonly workElements: number;
  readonly resultValidationWorkElements: number;
}

function assertWithin(value: number, limit: number, field: keyof MesherOutputBudgetV1): void {
  if (value > limit) {
    throw new RangeError(`Visible-face oracle output exceeds outputBudget.${field}.`);
  }
}

function preflight(
  reader: HaloChunkReader,
  input: PureMesherInputV1,
): IndexedVisibleFaceOraclePreflightInternal {
  let sourceVoxelCount = 0;
  let exposedUnitFaceCount = 0;
  let scanWork = 0;
  const maxScanWork = Math.floor(input.outputBudget.maxMeshingWorkElements / 2);
  const chargeScan = (): void => {
    scanWork += 1;
    if (scanWork > maxScanWork) {
      throw new RangeError(
        'Visible-face oracle output exceeds outputBudget.maxMeshingWorkElements.',
      );
    }
  };
  const offsets = VISIBLE_FACE_ORACLE_DESCRIPTOR_V1.dependencyOffsets;
  for (let y = 0; y < reader.size.y; y += 1) {
    for (let z = 0; z < reader.size.z; z += 1) {
      for (let x = 0; x < reader.size.x; x += 1) {
        const paletteIndex = reader.sample(x, y, z);
        chargeScan();
        if (paletteIndex === 0) continue;
        if (paletteIndex >= input.paletteEntryCount) {
          throw new RangeError(
            `Source palette index ${String(paletteIndex)} exceeds paletteEntryCount.`,
          );
        }
        sourceVoxelCount += 1;
        for (const offset of offsets) {
          chargeScan();
          if (reader.sample(x + offset.x, y + offset.y, z + offset.z) === 0) {
            exposedUnitFaceCount += 1;
          }
        }
      }
    }
  }

  const vertexCount = checkedMultiply(exposedUnitFaceCount, 4, 'vertexCount');
  const indexCount = checkedMultiply(exposedUnitFaceCount, 6, 'indexCount');
  const triangleCount = checkedMultiply(exposedUnitFaceCount, 2, 'triangleCount');
  const positionBytes = checkedMultiply(vertexCount, 12, 'positionBytes');
  const normalBytes = checkedMultiply(vertexCount, 12, 'normalBytes');
  const paletteIndexBytes = checkedMultiply(vertexCount, 2, 'paletteIndexBytes');
  const indexBytes = checkedMultiply(indexCount, 4, 'indexBytes');
  const outputBytes = checkedAdd(
    checkedAdd(positionBytes, normalBytes, 'outputBytes'),
    checkedAdd(paletteIndexBytes, indexBytes, 'outputBytes'),
    'outputBytes',
  );
  const workElements = checkedMultiply(scanWork, 2, 'workElements');
  const positionValidationWork = checkedMultiply(
    vertexCount,
    3,
    'result validation work',
  );
  const normalValidationWork = checkedMultiply(
    vertexCount,
    3,
    'result validation work',
  );
  const indexValidationWork = checkedMultiply(
    indexCount,
    12,
    'result validation work',
  );
  const resultValidationWorkElements = checkedAdd(
    checkedAdd(
      checkedAdd(64, positionValidationWork, 'result validation work'),
      normalValidationWork,
      'result validation work',
    ),
    checkedAdd(vertexCount, indexValidationWork, 'result validation work'),
    'result validation work',
  );
  const budget = input.outputBudget;
  assertWithin(exposedUnitFaceCount, budget.maxExposedUnitFaces, 'maxExposedUnitFaces');
  assertWithin(vertexCount, budget.maxVertices, 'maxVertices');
  assertWithin(indexCount, budget.maxIndices, 'maxIndices');
  assertWithin(positionBytes, budget.maxPositionBytes, 'maxPositionBytes');
  assertWithin(normalBytes, budget.maxNormalBytes, 'maxNormalBytes');
  assertWithin(paletteIndexBytes, budget.maxPaletteIndexBytes, 'maxPaletteIndexBytes');
  assertWithin(outputBytes, budget.maxTotalBytes, 'maxTotalBytes');
  assertWithin(workElements, budget.maxMeshingWorkElements, 'maxMeshingWorkElements');
  assertWithin(
    resultValidationWorkElements,
    budget.maxResultValidationElements,
    'maxResultValidationElements',
  );
  return {
    input,
    sourceVoxelCount,
    exposedUnitFaceCount,
    vertexCount,
    indexCount,
    triangleCount,
    outputBytes,
    workElements,
    resultValidationWorkElements,
  };
}

/** Package-internal exact preflight used by the synchronous world ledger. */
export function preflightIndexedVisibleFaceOracleV1Internal(
  inputValue: PureMesherInputV1,
): IndexedVisibleFaceOraclePreflightInternal {
  const inputResult = validatePureMesherInputV1(
    inputValue,
    VISIBLE_FACE_ORACLE_DESCRIPTOR_V1,
  );
  if (!inputResult.ok) {
    throw new RangeError(`${inputResult.issue.code} at ${inputResult.issue.path}: ${inputResult.issue.message}`);
  }
  return preflightPreparedIndexedVisibleFaceOracleV1Internal(inputResult.value);
}

/** Package-internal fast path for an input already validated by the preparer. */
export function preflightPreparedIndexedVisibleFaceOracleV1Internal(
  input: PureMesherInputV1,
): IndexedVisibleFaceOraclePreflightInternal {
  const reader = new HaloChunkReader(input);
  if (reader.volume > HARD_RENDER_LIMITS_V1.maxVoxelsPerChunk) {
    throw new RangeError('Visible-face oracle source exceeds maxVoxelsPerChunk.');
  }
  return preflight(reader, input);
}

/** Package-internal emission after exact work and bytes have been reserved. */
export function emitIndexedVisibleFaceOracleV1Internal(
  expected: IndexedVisibleFaceOraclePreflightInternal,
): MesherOutputV1 {
  const input = expected.input;
  const reader = new HaloChunkReader(input);
  const mesh = meshVisibleFaces(reader, {
    positionSpace: 'source-local',
    maxFaces: input.outputBudget.maxExposedUnitFaces,
    sampleNeighbor: (x, y, z) => reader.sample(x, y, z),
  });
  if (mesh.faceCount !== expected.exposedUnitFaceCount
    || mesh.voxelCount !== expected.sourceVoxelCount) {
    throw new Error('Visible-face oracle preflight and emission counts diverged.');
  }
  return {
    schemaVersion: MESHER_OUTPUT_SCHEMA_V1,
    mesherId: input.mesherId,
    mesherVersion: input.mesherVersion,
    dependencySignature: input.dependencySignature,
    source: input.source,
    positions: mesh.positions,
    normals: mesh.normals,
    paletteIndices: mesh.paletteIndices,
    indices: mesh.indices,
    bounds: mesh.bounds,
    counts: {
      sourceVoxelCount: expected.sourceVoxelCount,
      exposedUnitFaceCount: expected.exposedUnitFaceCount,
      vertexCount: expected.vertexCount,
      indexCount: expected.indexCount,
      triangleCount: expected.triangleCount,
    },
    metrics: {
      workElements: expected.workElements,
      outputBytes: expected.outputBytes,
    },
  };
}

/** Runs the deterministic correctness oracle against one validated copied halo. */
export function meshIndexedVisibleFaceOracleV1(inputValue: PureMesherInputV1): MesherOutputV1 {
  return emitIndexedVisibleFaceOracleV1Internal(
    preflightIndexedVisibleFaceOracleV1Internal(inputValue),
  );
}

export const VISIBLE_FACE_ORACLE_MESHER_V1: PureVoxelMesherV1 = Object.freeze({
  descriptor: VISIBLE_FACE_ORACLE_DESCRIPTOR_V1,
  mesh: meshIndexedVisibleFaceOracleV1,
});
