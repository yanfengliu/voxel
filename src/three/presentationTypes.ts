import type { BufferGeometry, Color, Material, Matrix4 } from 'three';
import type {
  DensePaletteChunkReader,
  NeighborSampler,
  ValidatedMesherOutputV1,
} from '../meshing/index.js';
import type { InstanceTransformAnimationV1, Int3V1 } from '../core/index.js';

export interface PresentationBounds {
  readonly min: { readonly x: number; readonly y: number; readonly z: number };
  readonly max: { readonly x: number; readonly y: number; readonly z: number };
}

export interface GeometryPresentation {
  readonly key: string;
  readonly version: string;
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  readonly uvs?: Float32Array;
  readonly colors?: Float32Array | Uint8Array;
  readonly indices: Uint16Array | Uint32Array;
  readonly bounds: PresentationBounds;
  readonly pivot: { readonly x: number; readonly y: number; readonly z: number };
  readonly groups: readonly {
    readonly start: number;
    readonly count: number;
    readonly materialKey: string;
  }[];
}

export interface DenseInstanceBatchPresentation {
  readonly key: string;
  readonly version: string;
  readonly geometryKey: string;
  readonly materialKey: string;
  readonly instanceKeys: readonly string[];
  /** Column-major 4x4 matrices, sixteen floats per instance. */
  readonly matrices: Float32Array;
  /** Straight-alpha sRGB8, four bytes per instance. V1 presentation is opaque. */
  readonly colors?: Uint8Array;
  readonly animation?: InstanceTransformAnimationV1;
  readonly castShadow?: boolean;
  readonly receiveShadow?: boolean;
}

export interface InstanceBatchUpdateRangeInternal {
  readonly start: number;
  readonly count: number;
}

/**
 * Package-internal read-only bridge over canonical copy-on-write pages.
 * It deliberately exposes values and identity comparisons, never page arrays.
 */
export interface PagedInstanceBatchSourceInternal {
  readonly countInternal: number;
  readonly hasColorsInternal: boolean;
  readonly hasAnimationInternal: boolean;
  readonly animationRotationModeInternal: 'swing' | 'turn';
  readonly opacityPageScansInternal: number;
  keyAtInternal(slot: number): string;
  readMatrixAtInternal(slot: number, target: Matrix4): void;
  readColorAtInternal(slot: number, target: Color): void;
  readAnimationAtInternal(slot: number, target: Float32Array): void;
  hasOnlyOpaqueColorsInternal(): boolean;
  updateRangesFromInternal(
    previous: PagedInstanceBatchSourceInternal | undefined,
  ): readonly InstanceBatchUpdateRangeInternal[];
}

export interface PagedInstanceBatchPresentationInternal {
  readonly key: string;
  readonly version: string;
  readonly geometryKey: string;
  readonly materialKey: string;
  /** Empty compatibility lanes for the legacy runtime preflight only. */
  readonly instanceKeys: readonly [];
  readonly matrices: Float32Array;
  readonly colors?: undefined;
  readonly animation?: undefined;
  readonly pagedSourceInternal: PagedInstanceBatchSourceInternal;
  readonly castShadow?: boolean;
  readonly receiveShadow?: boolean;
}

export type InstanceBatchPresentation =
  | DenseInstanceBatchPresentation
  | PagedInstanceBatchPresentationInternal;

export interface InstanceBatchResolvers {
  geometry(key: string): BufferGeometry | undefined;
  material(key: string): Material | undefined;
}

export interface Srgb8Color {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly a: number;
}

export interface ChunkPresentation {
  readonly key: string;
  readonly version: string;
  readonly chunk: DensePaletteChunkReader;
  /** Index zero is empty and may use any color value. */
  readonly palette: readonly Srgb8Color[];
  readonly materialKey: string;
  readonly worldUnitsPerVoxel: {
    readonly x: number;
    readonly y: number;
    readonly z: number;
  };
  readonly sampleNeighbor?: NeighborSampler;
  /** Indexed profiled path: validated source-local geometry from a copied halo. */
  readonly precomputedMesh?: ValidatedMesherOutputV1;
  /** Absolute voxel origin applied as the mesh transform for precomputed output. */
  readonly voxelOrigin?: Int3V1;
}

export interface MaterialPresentation {
  readonly key: string;
  readonly version: string;
  readonly shading: 'unlit' | 'lambert' | 'standard';
  readonly color: Srgb8Color;
  readonly vertexColors: boolean;
  readonly transparent: boolean;
  readonly opacity: number;
  readonly doubleSided: boolean;
  readonly roughness: number;
  readonly metalness: number;
}
