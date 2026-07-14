export const WORLD_SCHEMA_V1 = 'voxel.world/1' as const;
export const RENDER_SNAPSHOT_SCHEMA_V1 = 'voxel.render-snapshot/1' as const;
export const RENDER_DELTA_SCHEMA_V1 = 'voxel.render-delta/1' as const;
export const INSTANCE_TRANSFORM_ANIMATION_SCHEMA_V1 = 'voxel.instance-transform-animation/1' as const;

/** Largest integer for which Float32 preserves every adjacent voxel boundary. */
export const MAX_EXACT_FLOAT32_VOXEL_COORDINATE_V1 = 16_777_216;

/** Prevents material-group metadata from becoming its own unbounded workload. */
export const MAX_GEOMETRY_GROUPS_PER_RESOURCE_V1 = 4_096;

/** Hard safety bounds for procedural rigid-instance animation. */
export const MIN_INSTANCE_ANIMATION_PERIOD_MS_V1 = 16;
export const MAX_INSTANCE_ANIMATION_PERIOD_MS_V1 = 3_600_000;
export const MAX_INSTANCE_ANIMATION_TRANSLATION_V1 = 1_024;
export const MAX_INSTANCE_ANIMATION_ROTATION_RADIANS_V1 = Math.PI * 2;
export const MAX_INSTANCE_ANIMATION_SCALE_AMPLITUDE_V1 = 0.95;
/** Caps deterministic matrix sampling and partial GPU uploads per frame. */
export const MAX_ACTIVE_INSTANCE_ANIMATIONS_V1 = 8_192;
/** Bounds culling and worst-case full-buffer uploads for a dynamic batch. */
export const MAX_INSTANCES_PER_ANIMATED_BATCH_V1 = 16_384;
/** Bounds WebGL bufferSubData command count for sparse animation updates. */
export const MAX_INSTANCE_ANIMATION_UPDATE_RANGES_V1 = 64;
/** Leaves headroom for a three-term affine multiply and the maximum animated scale. */
export const MAX_INSTANCE_ANIMATION_BASE_LINEAR_COMPONENT_V1 = 5e37;

export interface Int3V1 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface Vec3V1 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface Aabb3V1 {
  readonly min: Vec3V1;
  readonly max: Vec3V1;
}

export interface CoordinateConventionV1 {
  readonly handedness: 'right';
  readonly upAxis: '+y';
  readonly forwardAxis: '-z';
  readonly chunkRounding: 'floor';
  readonly metersPerWorldUnit: number;
  readonly worldUnitsPerVoxel: Vec3V1;
}

export interface Srgb8ColorV1 {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly a: number;
}

export type RenderCapabilityV1 =
  | 'voxel-chunks'
  | 'geometry-resources'
  | 'instance-batches';

export interface RenderLimitsV1 {
  readonly maxResources: number;
  readonly maxPaletteEntries: number;
  readonly maxChunks: number;
  readonly maxBatches: number;
  readonly maxVoxelsPerChunk: number;
  readonly maxGeometryVertices: number;
  readonly maxGeometryIndices: number;
  readonly maxInstancesPerBatch: number;
  readonly maxTotalBytes: number;
}

export const HARD_RENDER_LIMITS_V1: Readonly<RenderLimitsV1> = Object.freeze({
  maxResources: 100_000,
  maxPaletteEntries: 65_536,
  maxChunks: 100_000,
  maxBatches: 100_000,
  maxVoxelsPerChunk: 16_777_216,
  maxGeometryVertices: 10_000_000,
  maxGeometryIndices: 30_000_000,
  maxInstancesPerBatch: 1_000_000,
  maxTotalBytes: 1_073_741_824,
});

export interface RenderTransactionLimitsV1 {
  readonly maxOperations: number;
  readonly maxInstanceChanges: number;
  readonly maxInputTypedArrayBytes: number;
  readonly maxValidationElements: number;
  readonly maxTombstones: number;
  readonly maxPresentationWaiters: number;
}

export interface UniformVoxelChunkProfileV1 {
  readonly layout: 'uniform-grid';
  readonly size: Int3V1;
  readonly gridOrigin: Int3V1;
  readonly emptyPaletteIndex: 0;
  readonly surfaceModel: 'opaque';
  readonly missingNeighbor: 'empty' | 'sealed' | 'unavailable';
}

/** Defaults sized from the current AoE and City consumer fixtures. */
export const DEFAULT_RENDER_TRANSACTION_LIMITS_V1: Readonly<RenderTransactionLimitsV1> =
  Object.freeze({
    maxOperations: 8_192,
    maxInstanceChanges: 262_144,
    maxInputTypedArrayBytes: 536_870_912,
    maxValidationElements: 16_777_216,
    maxTombstones: 1_000_000,
    maxPresentationWaiters: 1_024,
  });

/** Hard ceilings that a world descriptor may not raise. */
export const HARD_RENDER_TRANSACTION_LIMITS_V1: Readonly<RenderTransactionLimitsV1> =
  Object.freeze({
    maxOperations: 300_000,
    maxInstanceChanges: 1_000_000,
    maxInputTypedArrayBytes: HARD_RENDER_LIMITS_V1.maxTotalBytes,
    maxValidationElements: 100_000_000,
    maxTombstones: 4_000_000,
    maxPresentationWaiters: 16_384,
  });

export interface WorldDescriptorV1 {
  readonly schemaVersion: typeof WORLD_SCHEMA_V1;
  readonly worldId: string;
  readonly epoch: string;
  readonly coordinates: CoordinateConventionV1;
  readonly colorEncoding: 'srgb8-straight-alpha';
  readonly capabilities: readonly RenderCapabilityV1[];
  readonly limits: RenderLimitsV1;
  /** Explicit opt-in to the indexed production voxel path. */
  readonly chunkProfile?: UniformVoxelChunkProfileV1;
  /** Delta/readiness budgets. Omission uses DEFAULT_RENDER_TRANSACTION_LIMITS_V1. */
  readonly transactionLimits?: RenderTransactionLimitsV1;
}

export interface PaletteEntryV1 {
  readonly color: Srgb8ColorV1;
}

interface ResourceIdentityV1 {
  readonly key: string;
  readonly incarnation: number;
  readonly revision: number;
}

export interface PaletteResourceV1 extends ResourceIdentityV1 {
  readonly kind: 'palette';
  /** Index zero is empty space for voxel chunks. */
  readonly entries: readonly PaletteEntryV1[];
}

export interface MaterialResourceV1 extends ResourceIdentityV1 {
  readonly kind: 'material';
  readonly shading: 'unlit' | 'lambert' | 'standard';
  readonly color: Srgb8ColorV1;
  readonly vertexColors: boolean;
  readonly transparent: boolean;
  readonly opacity: number;
  readonly doubleSided: boolean;
  readonly roughness: number;
  readonly metalness: number;
}

export interface GeometryGroupV1 {
  readonly start: number;
  readonly count: number;
  readonly materialKey: string;
}

export interface GeometryResourceV1 extends ResourceIdentityV1 {
  readonly kind: 'geometry';
  readonly topology: 'triangles' | 'lines' | 'points';
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  readonly uvs?: Float32Array;
  /** Straight-alpha sRGB8, either RGB or RGBA per vertex. */
  readonly colors?: Uint8Array;
  readonly indices: Uint16Array | Uint32Array;
  readonly groups: readonly GeometryGroupV1[];
  readonly bounds: Aabb3V1;
  readonly pivot: Vec3V1;
}

export type RenderResourceV1 =
  | PaletteResourceV1
  | MaterialResourceV1
  | GeometryResourceV1;

export interface VoxelChunkV1 extends ResourceIdentityV1 {
  readonly origin: Int3V1;
  readonly size: Int3V1;
  /** X-major palette indices: x + size.x * (z + size.z * y). */
  readonly voxels: Uint16Array;
  readonly paletteKey: string;
  readonly materialKey: string;
}

export interface InstanceTransformAnimationV1 {
  readonly schemaVersion: typeof INSTANCE_TRANSFORM_ANIMATION_SCHEMA_V1;
  /** Zero disables animation for the corresponding instance. */
  readonly periodsMs: Float32Array;
  readonly phasesRadians: Float32Array;
  /** XYZ world-space translation amplitude, three floats per instance. */
  readonly translationAmplitudes: Float32Array;
  /** XYZ local Euler-angle amplitude in radians, three floats per instance. */
  readonly rotationAmplitudesRadians: Float32Array;
  /** XYZ fractional scale amplitude, three floats per instance. */
  readonly scaleAmplitudes: Float32Array;
}

export interface InstanceBatchPresentationPolicyV1 {
  readonly castShadow: boolean;
  readonly receiveShadow: boolean;
}

export interface InstanceBatchV1 extends ResourceIdentityV1 {
  readonly geometryKey: string;
  readonly materialKey: string;
  /** Opaque, never-reused keys or consumer keys that encode a generation. */
  readonly instanceKeys: readonly string[];
  /** Column-major matrices, sixteen floats per instance. */
  readonly matrices: Float32Array;
  /** Optional straight-alpha sRGB8, four bytes per instance. */
  readonly colors?: Uint8Array;
  /** Optional deterministic rigid motion sampled by the renderer frame clock. */
  readonly animation?: InstanceTransformAnimationV1;
  /** Neutral opt-in to a host's existing shadow system; omission means false/false. */
  readonly presentation?: InstanceBatchPresentationPolicyV1;
}

export interface RenderSnapshotV1 {
  readonly schemaVersion: typeof RENDER_SNAPSHOT_SCHEMA_V1;
  readonly descriptor: WorldDescriptorV1;
  readonly revision: number;
  readonly resources: readonly RenderResourceV1[];
  readonly chunks: readonly VoxelChunkV1[];
  readonly batches: readonly InstanceBatchV1[];
}

/** A validated snapshot whose retained arrays have been copied by core. */
export type OwnedRenderSnapshotV1 = RenderSnapshotV1;

export interface RenderRevisionRefV1 {
  readonly worldId: string;
  readonly epoch: string;
  readonly revision: number;
}

export type PresentationReadinessV1 =
  | {
      readonly status: 'ready';
      readonly target: RenderRevisionRefV1;
      readonly presentedThrough: RenderRevisionRefV1;
    }
  | {
      readonly status: 'not-ready';
      readonly reason: 'not-accepted' | 'pending' | 'context-lost' | 'restoring';
      readonly accepted: RenderRevisionRefV1 | null;
      readonly presentedThrough: RenderRevisionRefV1 | null;
    }
  | {
      readonly status: 'unavailable';
      readonly reason: 'epoch-replaced' | 'disposed' | 'failed';
      readonly target: RenderRevisionRefV1;
    };

/** DOM-free structural subset implemented by native AbortSignal objects. */
export interface PresentationAbortSignalV1 {
  readonly aborted: boolean;
  readonly reason?: unknown;
  addEventListener(
    type: 'abort',
    listener: () => void,
    options?: { readonly once?: boolean },
  ): void;
  removeEventListener(type: 'abort', listener: () => void): void;
}

export interface InstanceBatchPatchPayloadV1 {
  readonly instanceKeys: readonly string[];
  readonly matrices: Float32Array;
  readonly colors?: Uint8Array;
  /** Complete animation tuples corresponding to instanceKeys, not the full batch. */
  readonly animation?: InstanceTransformAnimationV1;
}

export interface PatchBatchInstancesV1 {
  readonly op: 'patch-batch-instances';
  readonly key: string;
  readonly incarnation: number;
  /** Revision of the complete batch after applying this patch. */
  readonly revision: number;
  readonly removeInstanceKeys: readonly string[];
  readonly upserts: InstanceBatchPatchPayloadV1;
}

export type RenderOperationV1 =
  | { readonly op: 'put-resource'; readonly resource: RenderResourceV1 }
  | { readonly op: 'remove-resource'; readonly key: string; readonly incarnation: number }
  | { readonly op: 'put-chunk'; readonly chunk: VoxelChunkV1 }
  | { readonly op: 'remove-chunk'; readonly key: string; readonly incarnation: number }
  | { readonly op: 'put-batch'; readonly batch: InstanceBatchV1 }
  | PatchBatchInstancesV1
  | { readonly op: 'remove-batch'; readonly key: string; readonly incarnation: number };

export interface RenderDeltaV1 extends RenderRevisionRefV1 {
  readonly schemaVersion: typeof RENDER_DELTA_SCHEMA_V1;
  readonly baseRevision: number;
  readonly operations: readonly RenderOperationV1[];
}

/** A validated delta whose retained arrays have been copied by core. */
export type OwnedRenderDeltaV1 = RenderDeltaV1;

export interface ValidationIssueV1 {
  readonly code: string;
  readonly path: string;
  readonly message: string;
}

export type SnapshotValidationResultV1 =
  | { readonly ok: true; readonly value: OwnedRenderSnapshotV1 }
  | { readonly ok: false; readonly issue: ValidationIssueV1 };

export type ApplyResultV1 =
  | {
      readonly status: 'accepted';
      readonly revision: number;
      readonly epoch: string;
    }
  | {
      readonly status: 'rejected';
      readonly code: string;
      readonly path: string;
      readonly message: string;
    };

export type DeltaResyncReasonV1 =
  | 'uninitialized'
  | 'world-mismatch'
  | 'epoch-mismatch'
  | 'base-revision-mismatch';

export type DeltaApplyResultV1 =
  | ApplyResultV1
  | {
      readonly status: 'resync-required';
      readonly reason: DeltaResyncReasonV1;
      readonly expected: RenderRevisionRefV1 | null;
      readonly received: RenderRevisionRefV1 & { readonly baseRevision: number };
    };

export const DELTA_ISSUE_CODES_V1 = Object.freeze({
  REVISION_ORDER: 'delta.revision-order',
  UNKNOWN_OPERATION: 'delta.operation.unknown',
  DUPLICATE_TARGET: 'delta.operation.duplicate-target',
  TARGET_MISSING: 'delta.target.missing',
  INCARNATION_MISMATCH: 'delta.target.incarnation-mismatch',
  INCARNATION_NOT_NEWER: 'delta.target.incarnation-not-newer',
  REVISION_NOT_NEWER: 'delta.target.revision-not-newer',
  RESOURCE_KIND_CHANGE: 'delta.resource.kind-change',
  REFERENCE_IN_USE: 'delta.reference-in-use',
  PATCH_EMPTY: 'batch.patch.empty',
  PATCH_REMOVE_MISSING: 'batch.patch.remove-missing',
  PATCH_KEY_OVERLAP: 'batch.patch.key-overlap',
  PATCH_COLORS_LAYOUT: 'batch.patch.colors-layout',
  PATCH_ANIMATION_LAYOUT: 'batch.patch.animation-layout',
  LIMIT_OPERATIONS: 'limit.delta-operations',
  LIMIT_INSTANCE_CHANGES: 'limit.delta-instance-changes',
  LIMIT_INPUT_BYTES: 'limit.delta-input-bytes',
  LIMIT_VALIDATION_ELEMENTS: 'limit.delta-validation-elements',
  LIMIT_TOMBSTONES: 'limit.delta-tombstones',
  LIMIT_PRESENTATION_BACKLOG: 'limit.presentation-backlog',
} as const);

export type DeltaIssueCodeV1 =
  typeof DELTA_ISSUE_CODES_V1[keyof typeof DELTA_ISSUE_CODES_V1];
