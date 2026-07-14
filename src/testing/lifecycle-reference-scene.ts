import {
  RENDER_SNAPSHOT_SCHEMA_V1,
  WORLD_SCHEMA_V1,
  type RenderSnapshotV1,
} from '../core/index.js';

const MAX_REFERENCE_EPOCH_LENGTH = 256;

export interface RendererLifecycleReferenceOptions {
  readonly revision: number;
  readonly epoch?: string;
  /** Increment this value to force GPU resource replacement without changing identity. */
  readonly resourceRevision?: number;
}

function requireNonNegativeSafeInteger(name: string, value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative safe integer.`);
  }
}

/**
 * Small deterministic scene that exercises every V1 presentation lane.
 *
 * It is intentionally game-neutral and allocation-fresh so lifecycle tests can
 * mutate, rebuild, or transfer one returned snapshot without affecting another.
 */
export function createRendererLifecycleReferenceSnapshot(
  options: RendererLifecycleReferenceOptions,
): RenderSnapshotV1 {
  requireNonNegativeSafeInteger('revision', options.revision);
  const resourceRevision = options.resourceRevision ?? options.revision;
  requireNonNegativeSafeInteger('resourceRevision', resourceRevision);
  const epoch = options.epoch ?? 'epoch:renderer-lifecycle';
  if (epoch.length === 0 || epoch.length > MAX_REFERENCE_EPOCH_LENGTH) {
    throw new RangeError(
      `epoch must contain between 1 and ${String(MAX_REFERENCE_EPOCH_LENGTH)} characters.`,
    );
  }

  return {
    schemaVersion: RENDER_SNAPSHOT_SCHEMA_V1,
    descriptor: {
      schemaVersion: WORLD_SCHEMA_V1,
      worldId: 'world:renderer-lifecycle',
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
        maxResources: 8,
        maxPaletteEntries: 8,
        maxChunks: 4,
        maxBatches: 4,
        maxVoxelsPerChunk: 64,
        maxGeometryVertices: 64,
        maxGeometryIndices: 192,
        maxInstancesPerBatch: 16,
        maxTotalBytes: 64_000,
      },
    },
    revision: options.revision,
    resources: [
      {
        kind: 'palette',
        key: 'palette:renderer-lifecycle',
        incarnation: 1,
        revision: resourceRevision,
        entries: [
          { color: { r: 0, g: 0, b: 0, a: 0 } },
          { color: { r: 92, g: 156, b: 92, a: 255 } },
        ],
      },
      {
        kind: 'material',
        key: 'material:renderer-lifecycle',
        incarnation: 1,
        revision: resourceRevision,
        shading: 'unlit',
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
        key: 'geometry:renderer-lifecycle',
        incarnation: 1,
        revision: resourceRevision,
        topology: 'triangles',
        positions: new Float32Array([
          -0.5, 0, 0,
          0.5, 0, 0,
          0, 1, 0,
        ]),
        normals: new Float32Array([
          0, 0, 1,
          0, 0, 1,
          0, 0, 1,
        ]),
        colors: new Uint8Array([
          232, 105, 76, 255,
          232, 105, 76, 255,
          232, 105, 76, 255,
        ]),
        indices: new Uint16Array([0, 1, 2]),
        groups: [{
          start: 0,
          count: 3,
          materialKey: 'material:renderer-lifecycle',
        }],
        bounds: {
          min: { x: -0.5, y: 0, z: 0 },
          max: { x: 0.5, y: 1, z: 0 },
        },
        pivot: { x: 0, y: 0, z: 0 },
      },
    ],
    chunks: [{
      key: 'chunk:renderer-lifecycle',
      incarnation: 1,
      revision: resourceRevision,
      origin: { x: 0, y: 0, z: 0 },
      size: { x: 2, y: 1, z: 2 },
      voxels: new Uint16Array([1, 1, 1, 0]),
      paletteKey: 'palette:renderer-lifecycle',
      materialKey: 'material:renderer-lifecycle',
    }],
    batches: [{
      key: 'batch:renderer-lifecycle',
      incarnation: 1,
      revision: resourceRevision,
      geometryKey: 'geometry:renderer-lifecycle',
      materialKey: 'material:renderer-lifecycle',
      instanceKeys: ['instance:renderer-lifecycle:0'],
      matrices: new Float32Array([
        1, 0, 0, 0,
        0, 1, 0, 0,
        0, 0, 1, 0,
        2.25, 0.1, 0.75, 1,
      ]),
      colors: new Uint8Array([255, 255, 255, 255]),
    }],
  };
}
