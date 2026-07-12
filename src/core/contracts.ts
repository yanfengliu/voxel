export const WORLD_SCHEMA_V1 = 'voxel.world/1' as const;
export const RENDER_SNAPSHOT_SCHEMA_V1 = 'voxel.render-snapshot/1' as const;

/** Largest integer for which Float32 preserves every adjacent voxel boundary. */
export const MAX_EXACT_FLOAT32_VOXEL_COORDINATE_V1 = 16_777_216;

/** Prevents material-group metadata from becoming its own unbounded workload. */
export const MAX_GEOMETRY_GROUPS_PER_RESOURCE_V1 = 4_096;

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

export interface WorldDescriptorV1 {
  readonly schemaVersion: typeof WORLD_SCHEMA_V1;
  readonly worldId: string;
  readonly epoch: string;
  readonly coordinates: CoordinateConventionV1;
  readonly colorEncoding: 'srgb8-straight-alpha';
  readonly capabilities: readonly RenderCapabilityV1[];
  readonly limits: RenderLimitsV1;
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

export interface InstanceBatchV1 extends ResourceIdentityV1 {
  readonly geometryKey: string;
  readonly materialKey: string;
  /** Opaque, never-reused keys or consumer keys that encode a generation. */
  readonly instanceKeys: readonly string[];
  /** Column-major matrices, sixteen floats per instance. */
  readonly matrices: Float32Array;
  /** Optional straight-alpha sRGB8, four bytes per instance. */
  readonly colors?: Uint8Array;
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
