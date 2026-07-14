import type { Int3V1 } from '../core/contracts.js';

export const MESHER_DESCRIPTOR_SCHEMA_V1 = 'voxel.mesher-descriptor/1' as const;
export const MESHER_INPUT_SCHEMA_V1 = 'voxel.mesher-input/1' as const;
export const MESHER_OUTPUT_SCHEMA_V1 = 'voxel.mesher-output/1' as const;

export const MAX_MESHER_DEPENDENCY_OFFSETS_V1 = 4_096;
export const MAX_MESHER_HALO_VOXELS_PER_AXIS_V1 = 64;
export const MAX_MESHER_ID_LENGTH_V1 = 256;
export const MAX_MESHER_DEPENDENCY_SIGNATURE_LENGTH_V1 = 65_536;
export const MAX_MESHER_SAMPLE_VOXELS_V1 = 100_000_000;
export const MAX_MESHER_WORK_ELEMENTS_V1 = 1_000_000_000;

export interface MesherHaloV1 {
  /** Copied voxel layers before source-local zero on each axis. */
  readonly negative: Int3V1;
  /** Copied voxel layers after the source extent on each axis. */
  readonly positive: Int3V1;
}

export interface MesherAttributePolicyV1 {
  readonly normals: 'flat-axis-aligned-f32x3';
  readonly paletteIndices: 'per-vertex-u16';
  readonly materialIndices: 'none' | 'per-triangle-u16';
  readonly maxPaletteEntries: number;
  readonly maxMaterialEntries: number;
}

/** A per-job ceiling. Candidates must stop before exceeding any member. */
export interface MesherOutputBudgetV1 {
  readonly maxExposedUnitFaces: number;
  readonly maxVertices: number;
  readonly maxIndices: number;
  readonly maxPositionBytes: number;
  readonly maxNormalBytes: number;
  readonly maxPaletteIndexBytes: number;
  readonly maxMaterialIndexBytes: number;
  readonly maxTotalBytes: number;
  readonly maxMeshingWorkElements: number;
  /** Bounds the engine's scalar/index scan before any GPU allocation. */
  readonly maxResultValidationElements: number;
}

export interface MesherDescriptorLimitsV1 {
  readonly maxSampleVoxels: number;
  readonly maxSampleBytes: number;
  readonly maxDependencyOffsets: number;
  readonly output: MesherOutputBudgetV1;
}

/**
 * Immutable identity and capability declaration for a DOM/Three-free mesher.
 * Dependency offsets are source-to-dependency chunk-coordinate offsets.
 */
export interface PureMesherDescriptorV1 {
  readonly schemaVersion: typeof MESHER_DESCRIPTOR_SCHEMA_V1;
  readonly id: string;
  readonly version: string;
  readonly halo: MesherHaloV1;
  readonly dependencyOffsets: readonly Int3V1[];
  readonly attributes: MesherAttributePolicyV1;
  readonly limits: MesherDescriptorLimitsV1;
}

export interface MesherSourceTokenV1 {
  readonly coordinate: Int3V1;
  readonly slotGeneration: number;
  readonly key: string;
  readonly incarnation: number;
  readonly sourceRevision: number;
  readonly size: Int3V1;
}

export type MesherDependencyTokenV1 =
  | {
      readonly state: 'present';
      readonly offset: Int3V1;
      readonly slotGeneration: number;
      readonly key: string;
      readonly incarnation: number;
      readonly sourceRevision: number;
    }
  | {
      readonly state: 'missing';
      readonly offset: Int3V1;
      readonly slotGeneration: number;
      readonly missingNeighbor: 'empty' | 'sealed';
    };

export interface PureMesherInputV1 {
  readonly schemaVersion: typeof MESHER_INPUT_SCHEMA_V1;
  readonly mesherId: string;
  readonly mesherVersion: string;
  readonly dependencySignature: string;
  readonly source: MesherSourceTokenV1;
  /** One token for every descriptor offset, in descriptor canonical order. */
  readonly dependencies: readonly MesherDependencyTokenV1[];
  readonly missingNeighbor: 'empty' | 'sealed';
  readonly paletteEntryCount: number;
  readonly materialEntryCount: number;
  /**
   * Caller-owned, mesher-borrowed x-major volume. The mesher must not mutate or
   * retain it. Its size is source.size + negative halo + positive halo;
   * source-local zero starts at descriptor.halo.negative.
   */
  readonly sampleVolume: Uint16Array;
  readonly outputBudget: MesherOutputBudgetV1;
}

export interface MesherOutputCountsV1 {
  readonly sourceVoxelCount: number;
  /** Surface area measured in oriented unit voxel faces. */
  readonly exposedUnitFaceCount: number;
  readonly vertexCount: number;
  readonly indexCount: number;
  readonly triangleCount: number;
}

export interface MesherOutputMetricsV1 {
  /** Candidate-reported deterministic work; wall-clock time is measured outside. */
  readonly workElements: number;
  /** Exact sum of returned typed-array byte lengths. */
  readonly outputBytes: number;
}

export interface MesherLocalBoundsV1 {
  readonly min: readonly [number, number, number];
  readonly max: readonly [number, number, number];
}

/**
 * Untrusted candidate or worker output. Every typed array is result-owned and
 * ownership transfers to the caller on return; the producer must not retain a
 * mutable alias or mutate a returned buffer afterward.
 */
export interface MesherOutputV1 {
  readonly schemaVersion: typeof MESHER_OUTPUT_SCHEMA_V1;
  readonly mesherId: string;
  readonly mesherVersion: string;
  readonly dependencySignature: string;
  readonly source: MesherSourceTokenV1;
  /** Source-local voxel coordinates, never world-space coordinates. */
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  readonly paletteIndices: Uint16Array;
  readonly materialIndices?: Uint16Array;
  readonly indices: Uint32Array;
  readonly bounds: MesherLocalBoundsV1 | null;
  readonly counts: MesherOutputCountsV1;
  readonly metrics: MesherOutputMetricsV1;
}

declare const VALIDATED_MESHER_OUTPUT_V1: unique symbol;

/**
 * Opaque proof that identity, budgets, topology, attributes, and bounds passed
 * the hard result gate. Returned typed arrays are the original result arrays;
 * validation does not allocate replacement geometry.
 */
export type ValidatedMesherOutputV1 = MesherOutputV1 & {
  readonly [VALIDATED_MESHER_OUTPUT_V1]: true;
};

export interface MesherValidationIssueV1 {
  readonly code:
    | 'mesher.schema'
    | 'mesher.type'
    | 'mesher.value'
    | 'mesher.identity'
    | 'mesher.limit'
    | 'mesher.attribute'
    | 'mesher.index'
    | 'mesher.topology'
    | 'mesher.bounds';
  readonly path: string;
  readonly message: string;
}

export type MesherValidationResultV1<Value> =
  | { readonly ok: true; readonly value: Value }
  | { readonly ok: false; readonly issue: MesherValidationIssueV1 };

/** Candidate implementations are synchronous and side-effect-free. */
export interface PureVoxelMesherV1 {
  readonly descriptor: PureMesherDescriptorV1;
  mesh(input: PureMesherInputV1): MesherOutputV1;
}
