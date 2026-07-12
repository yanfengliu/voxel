import type { BufferGeometry, Material } from 'three';
import type {
  DensePaletteChunk,
  NeighborSampler,
} from '../meshing/index.js';

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

export interface InstanceBatchPresentation {
  readonly key: string;
  readonly version: string;
  readonly geometryKey: string;
  readonly materialKey: string;
  readonly instanceKeys: readonly string[];
  /** Column-major 4x4 matrices, sixteen floats per instance. */
  readonly matrices: Float32Array;
  /** Straight-alpha sRGB8, four bytes per instance. V1 presentation is opaque. */
  readonly colors?: Uint8Array;
}

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
  readonly chunk: DensePaletteChunk;
  /** Index zero is empty and may use any color value. */
  readonly palette: readonly Srgb8Color[];
  readonly materialKey: string;
  readonly worldUnitsPerVoxel: {
    readonly x: number;
    readonly y: number;
    readonly z: number;
  };
  readonly sampleNeighbor?: NeighborSampler;
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
