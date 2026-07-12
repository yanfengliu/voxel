import type {
  CoordinateConventionV1,
  InstanceBatchV1,
  RenderLimitsV1,
  RenderResourceV1,
  RenderSnapshotV1,
  Vec3V1,
  VoxelChunkV1,
  WorldDescriptorV1,
} from '../../src/core/index.js';

type Mutable<T> = { -readonly [Key in keyof T]: T[Key] };

type MutableSnapshotFixture = Omit<
  Mutable<RenderSnapshotV1>,
  'descriptor' | 'resources' | 'chunks' | 'batches'
> & {
  descriptor: Omit<Mutable<WorldDescriptorV1>, 'coordinates' | 'limits'> & {
    coordinates: Omit<Mutable<CoordinateConventionV1>, 'worldUnitsPerVoxel'> & {
      worldUnitsPerVoxel: Vec3V1;
    };
    limits: Mutable<RenderLimitsV1>;
  };
  resources: RenderResourceV1[];
  chunks: VoxelChunkV1[];
  batches: (Omit<InstanceBatchV1, 'instanceKeys'> & { instanceKeys: string[] })[];
};

export function validSnapshot(
  revision = 1,
  epoch = 'epoch:one',
): MutableSnapshotFixture {
  return {
    schemaVersion: 'voxel.render-snapshot/1',
    descriptor: {
      schemaVersion: 'voxel.world/1',
      worldId: 'world:test',
      epoch,
      coordinates: {
        handedness: 'right',
        upAxis: '+y',
        forwardAxis: '-z',
        chunkRounding: 'floor',
        metersPerWorldUnit: 1,
        worldUnitsPerVoxel: { x: 1, y: 1, z: 1 },
      },
      colorEncoding: 'srgb8-straight-alpha',
      capabilities: ['voxel-chunks', 'geometry-resources', 'instance-batches'],
      limits: {
        maxResources: 16,
        maxPaletteEntries: 256,
        maxChunks: 16,
        maxBatches: 16,
        maxVoxelsPerChunk: 4_096,
        maxGeometryVertices: 4_096,
        maxGeometryIndices: 12_288,
        maxInstancesPerBatch: 1_024,
        maxTotalBytes: 4_000_000,
      },
    },
    revision,
    resources: [
      {
        kind: 'palette',
        key: 'palette:terrain',
        incarnation: 1,
        revision: 1,
        entries: [
          { color: { r: 0, g: 0, b: 0, a: 0 } },
          { color: { r: 88, g: 127, b: 78, a: 255 } },
        ],
      },
      {
        kind: 'material',
        key: 'material:terrain',
        incarnation: 1,
        revision: 1,
        shading: 'lambert',
        color: { r: 255, g: 255, b: 255, a: 255 },
        vertexColors: true,
        transparent: false,
        opacity: 1,
        doubleSided: false,
        roughness: 1,
        metalness: 0,
      },
      {
        kind: 'geometry',
        key: 'geometry:triangle',
        incarnation: 1,
        revision: 1,
        topology: 'triangles',
        positions: new Float32Array([
          0, 0, 0,
          1, 0, 0,
          0, 1, 0,
        ]),
        normals: new Float32Array([
          0, 0, 1,
          0, 0, 1,
          0, 0, 1,
        ]),
        uvs: new Float32Array([
          0, 0,
          1, 0,
          0, 1,
        ]),
        colors: new Uint8Array([
          255, 255, 255, 255,
          255, 255, 255, 255,
          255, 255, 255, 255,
        ]),
        indices: new Uint32Array([0, 1, 2]),
        groups: [{ start: 0, count: 3, materialKey: 'material:terrain' }],
        bounds: {
          min: { x: 0, y: 0, z: 0 },
          max: { x: 1, y: 1, z: 0 },
        },
        pivot: { x: 0, y: 0, z: 0 },
      },
    ],
    chunks: [
      {
        key: 'chunk:0:0:0',
        incarnation: 1,
        revision: 1,
        origin: { x: 0, y: 0, z: 0 },
        size: { x: 2, y: 1, z: 1 },
        voxels: new Uint16Array([1, 0]),
        paletteKey: 'palette:terrain',
        materialKey: 'material:terrain',
      },
    ],
    batches: [
      {
        key: 'batch:triangle',
        incarnation: 1,
        revision: 1,
        geometryKey: 'geometry:triangle',
        materialKey: 'material:terrain',
        instanceKeys: ['instance:one:0'],
        matrices: new Float32Array([
          1, 0, 0, 0,
          0, 1, 0, 0,
          0, 0, 1, 0,
          2, 0, 3, 1,
        ]),
        colors: new Uint8Array([255, 64, 32, 255]),
      },
    ],
  };
}
