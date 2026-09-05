import type {
  GeometryResourceV1,
  InstanceBatchV1,
  MaterialResourceV1,
  RenderSnapshotV1,
} from '../../src/core/index.js';
import {
  createOakLeafGeometryV1,
  createOakSoilCubeGeometryV1,
  createOakWoodShaftGeometryV1,
  OAK_LEAF_MATERIAL_KEY_V1,
  OAK_LEAF_VARIANT_DESCRIPTORS_V1,
  OAK_SOIL_MATERIAL_KEY_V1,
  OAK_TAPER_RATIOS_V1,
  OAK_WOOD_MATERIAL_KEY_V1,
} from './oak-render-geometry.js';
import {
  buildOakInstanceRecordsV1,
  type OakRenderInstanceRecordV1,
  type OakRenderProjectionOptionsV1,
} from './oak-render-projection.js';
import { presentOakRootCutawayRecordsV1 } from './oak-root-cutaway-presentation.js';
import type { OakRenderProjectionStateV1 } from './oak-types.js';

const WORLD_ID = 'world:oak-continuous-analysis';
const MAX_INSTANCES_PER_BATCH = 65_536;
const WOOD_GEOMETRY_KEYS = OAK_TAPER_RATIOS_V1.map((_, index) =>
  `geometry:oak:frustum:taper-${String(index)}`);

interface BatchDefinition {
  readonly key: string;
  readonly geometryKey: string;
  readonly materialKey: string;
  readonly castShadow: boolean;
  readonly receiveShadow: boolean;
}

const BATCH_DEFINITIONS: readonly BatchDefinition[] = Object.freeze([
  ...WOOD_GEOMETRY_KEYS.map((geometryKey, index) => ({
    key: `batch:oak:wood:taper-${String(index)}`,
    geometryKey,
    materialKey: OAK_WOOD_MATERIAL_KEY_V1,
    castShadow: true,
    receiveShadow: true,
  })),
  ...WOOD_GEOMETRY_KEYS.map((geometryKey, index) => ({
    key: `batch:oak:root:taper-${String(index)}`,
    geometryKey,
    materialKey: OAK_WOOD_MATERIAL_KEY_V1,
    castShadow: true,
    receiveShadow: true,
  })),
  ...OAK_LEAF_VARIANT_DESCRIPTORS_V1.map((variant) => ({
    key: `batch:oak:leaf:${variant.id}`,
    geometryKey: variant.geometryKey,
    materialKey: OAK_LEAF_MATERIAL_KEY_V1,
    castShadow: true,
    receiveShadow: true,
  })),
  {
    key: 'batch:oak:buds-and-acorns',
    geometryKey: WOOD_GEOMETRY_KEYS[0]!,
    materialKey: OAK_WOOD_MATERIAL_KEY_V1,
    castShadow: true,
    receiveShadow: true,
  },
  {
    key: 'batch:oak:soil',
    geometryKey: 'geometry:oak:soil-cube',
    materialKey: OAK_SOIL_MATERIAL_KEY_V1,
    castShadow: false,
    receiveShadow: true,
  },
]);

function materials(): readonly MaterialResourceV1[] {
  const common = {
    kind: 'material' as const,
    incarnation: 1,
    revision: 1,
    shading: 'standard' as const,
    vertexColors: true,
    transparent: false,
    opacity: 1,
    roughness: 0.96,
    metalness: 0,
  };
  return [
    {
      ...common,
      key: OAK_WOOD_MATERIAL_KEY_V1,
      color: { r: 255, g: 255, b: 255, a: 255 },
      doubleSided: false,
    },
    {
      ...common,
      key: OAK_LEAF_MATERIAL_KEY_V1,
      color: { r: 255, g: 255, b: 255, a: 255 },
      doubleSided: true,
      roughness: 0.9,
    },
    {
      ...common,
      key: OAK_SOIL_MATERIAL_KEY_V1,
      color: { r: 255, g: 255, b: 255, a: 255 },
      doubleSided: false,
    },
  ];
}

function geometries(): readonly GeometryResourceV1[] {
  return [
    ...OAK_TAPER_RATIOS_V1.map((_, index) =>
      createOakWoodShaftGeometryV1(WOOD_GEOMETRY_KEYS[index]!, index, false)),
    ...OAK_LEAF_VARIANT_DESCRIPTORS_V1.map(createOakLeafGeometryV1),
    createOakSoilCubeGeometryV1(),
  ];
}

function batchFromRecords(
  definition: BatchDefinition,
  records: readonly OakRenderInstanceRecordV1[],
  revision: number,
): InstanceBatchV1 {
  const matrices = new Float32Array(records.length * 16);
  const colors = new Uint8Array(records.length * 4);
  records.forEach((record, index) => {
    matrices.set(record.matrix, index * 16);
    colors.set([record.color.r, record.color.g, record.color.b, record.color.a], index * 4);
  });
  return {
    key: definition.key,
    incarnation: 1,
    revision,
    geometryKey: definition.geometryKey,
    materialKey: definition.materialKey,
    instanceKeys: records.map((record) => record.key),
    matrices,
    colors,
    presentation: {
      castShadow: definition.castShadow,
      receiveShadow: definition.receiveShadow,
    },
  };
}

/**
 * Private biological-analysis oracle retaining the former continuous surface.
 * The Studio presentation deliberately does not consume this snapshot: it
 * exists only where allometry and overlap laws need sub-voxel geometry.
 */
export function buildOakContinuousAnalysisSnapshotV1(
  state: OakRenderProjectionStateV1,
  options: OakRenderProjectionOptionsV1 = {},
): RenderSnapshotV1 {
  const projection = buildOakInstanceRecordsV1(
    state,
    BATCH_DEFINITIONS.map((definition) => definition.key),
    options,
  );
  const presentedRecords = options.rootCutaway === undefined
    ? projection.records
    : presentOakRootCutawayRecordsV1(state.organs, projection.records);
  const batches = BATCH_DEFINITIONS.map((definition) => batchFromRecords(
    definition,
    presentedRecords.get(definition.key)!,
    state.revision,
  ));
  if (batches.some((batch) => batch.instanceKeys.length > MAX_INSTANCES_PER_BATCH)) {
    throw new Error('Oak continuous analysis exceeded its fixed per-batch instance budget.');
  }
  return {
    schemaVersion: 'voxel.render-snapshot/1',
    descriptor: {
      schemaVersion: 'voxel.world/1',
      worldId: WORLD_ID,
      epoch: state.epoch,
      coordinates: {
        handedness: 'right',
        upAxis: '+y',
        forwardAxis: '-z',
        chunkRounding: 'floor',
        metersPerWorldUnit: 1,
        worldUnitsPerVoxel: { x: 1, y: 1, z: 1 },
      },
      colorEncoding: 'srgb8-straight-alpha',
      capabilities: ['geometry-resources', 'instance-batches'],
      limits: {
        maxResources: 16,
        maxPaletteEntries: 1,
        maxChunks: 1,
        maxBatches: BATCH_DEFINITIONS.length,
        maxVoxelsPerChunk: 1,
        maxGeometryVertices: 1_024,
        maxGeometryIndices: 4_096,
        maxInstancesPerBatch: MAX_INSTANCES_PER_BATCH,
        maxTotalBytes: 134_217_728,
      },
    },
    revision: state.revision,
    resources: [...materials(), ...geometries()],
    chunks: [],
    batches,
  };
}
