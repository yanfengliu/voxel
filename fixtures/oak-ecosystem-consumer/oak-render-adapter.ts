import type { RenderSnapshotV1 } from '../../src/core/index.js';
import type { OakRenderProjectionStateV1 } from './oak-types.js';
import {
  type OakRenderInstanceRecordV1,
  type OakRenderProjectionOptionsV1,
  type OakRootCutawayV1,
} from './oak-render-projection.js';
import {
  buildOakSoilVoxelResourcesV1,
  OAK_SOIL_VOXEL_CHUNK_PROFILE_V1,
  OAK_SOIL_VOXEL_WORLD_UNITS_PER_VOXEL_V1,
} from './oak-soil-voxel.js';
import {
  oakSoilContactInstanceRecordsV1,
  OAK_SOIL_CONTACT_VOXEL_BATCH_KEY_V1,
} from './oak-soil-contact-voxels.js';
import {
  createOakFallenLitterVoxelMaterialV1,
  OAK_FALLEN_LITTER_VOXEL_BATCH_KEY_V1,
} from './oak-fallen-litter-voxel.js';
import { OAK_RENDER_BATCH_DEFINITIONS_V1 } from './oak-render-batch-definitions.js';
import {
  createOakTissueVoxelGeometryV1,
  createOakTissueVoxelMaterialsV1,
  OAK_MAX_TISSUE_VOXELS_PER_BATCH_V1,
} from './oak-tissue-voxel-projection.js';
import {
  buildOakCachedRenderProjectionsV1,
  type OakRenderProjectionCacheHitsV1,
  type OakRenderProjectionCacheV1,
} from './oak-render-projection-cache.js';
import {
  oakPresentedLeafVoxelCountV1,
  oakPresentedTissueRecordsV1,
  oakPresentedTissueVoxelCountV1,
  oakPresentedWoodVoxelCountV1,
} from './oak-tissue-union-lattice.js';
import {
  buildOakWeatherVoxelPresentationV1,
  createOakWeatherVoxelMaterialV1,
  oakWeatherNeedsOccupancyV1,
  type OakWeatherPresentationEvidenceV1,
  type OakWeatherPresentationInputV1,
  OAK_WEATHER_VOXEL_BATCH_KEY_V1,
} from './oak-weather-voxel-presentation.js';
import { oakVoxelRecordAabbV1 } from './oak-voxel-aabb.js';
import {
  batchCanReuseRecords,
  batchFromRecords,
  chunkContentEqual,
  recordsInPatchOrder,
  typedArrayBytes,
  visibleVoxelFaceCount,
} from './oak-render-snapshot-operations.js';
import {
  assertOakRenderFrameIntegrityV1,
  registerOakRenderFrameIntegrityV1,
} from './oak-render-frame-integrity.js';
import {
  oakTrustedProjectionCacheV1,
  protectOakRenderProjectionCacheV1,
  registerOakTrustedProjectionCacheV1,
} from './oak-render-projection-cache-integrity.js';

export type { OakRootCutawayV1 } from './oak-render-projection.js';
export { buildOakRenderDeltaV1 } from './oak-render-snapshot-operations.js';

const WORLD_ID = 'world:oak-ecosystem-case-study';
const MAX_INSTANCES_PER_BATCH = OAK_MAX_TISSUE_VOXELS_PER_BATCH_V1;

export interface OakRenderOptionsV1 extends OakRenderProjectionOptionsV1 {
  /** Presentation revision independent of a possibly paused biological revision. */
  readonly renderRevision?: number;
  /**
   * Previously accepted frame in the same epoch. Unchanged batches retain
   * their own content revision while the world presentation revision advances.
   */
  readonly previousFrame?: OakRenderFrameV1;
  readonly rootCutaway?: OakRootCutawayV1;
  /** Fixture-owned weather cue state; numerical environment state remains in `state`. */
  readonly weatherPresentation?: Omit<
    OakWeatherPresentationInputV1,
    'rootCutaway' | 'occupiedCubeBoundsM'
  >;
}

export interface OakRenderMetricsV1 {
  readonly simulationRevision: number;
  readonly renderRevision: number;
  readonly resourceCount: number;
  readonly batchCount: number;
  readonly nonEmptyBatchCount: number;
  /** Geometry-group submissions in one primary colour pass; excludes shadows. */
  readonly primaryContentPassDrawCalls: number;
  readonly leafOrganCount: number;
  readonly woodOrganCount: number;
  readonly rootOrganCount: number;
  readonly chunkCount: number;
  readonly occupiedSoilVoxels: number;
  readonly carvedSoilVoxelsForTissue: number;
  readonly soilContactVoxels: number;
  readonly soilVisibleFaces: number;
  readonly tissueVoxelInstances: number;
  readonly leafVoxels: number;
  readonly woodVoxels: number;
  readonly rootVoxels: number;
  readonly seedBudVoxels: number;
  readonly fallenLitterLeafCount: number;
  readonly fallenLitterVoxels: number;
  readonly weather: OakWeatherPresentationEvidenceV1;
  /** Instanced-cube triangle floor; the worker-meshed chunk adds triangles after acceptance. */
  readonly minimumPrimaryContentPassTriangles: number;
  readonly retainedTypedArrayBytes: number;
  readonly skippedTooShortOrNonpositiveRadiusSegments: number;
  readonly skippedJunctionConsumedSegments: number;
}

export interface OakRenderFrameV1 {
  readonly snapshot: RenderSnapshotV1;
  readonly metrics: OakRenderMetricsV1;
  readonly projectionCache: OakRenderProjectionCacheV1;
  readonly projectionCacheHits: OakRenderProjectionCacheHitsV1;
}

/** Project validated consumer-owned biology into public Voxel contracts. */
export function buildOakRenderFrameV1(
  state: OakRenderProjectionStateV1,
  options: OakRenderOptionsV1 = {},
): OakRenderFrameV1 {
  const renderRevision = options.renderRevision ?? state.revision;
  if (!Number.isSafeInteger(renderRevision) || renderRevision < 0) {
    throw new Error(`Oak render revision must be a nonnegative safe integer; received ${String(renderRevision)}.`);
  }
  const previousFrame = options.previousFrame;
  if (previousFrame !== undefined) {
    assertOakRenderFrameIntegrityV1(previousFrame, 'previousFrame');
  }
  const reusesPreviousEpoch = previousFrame?.snapshot.descriptor.epoch === state.epoch;
  if (reusesPreviousEpoch && previousFrame && renderRevision <= previousFrame.snapshot.revision) {
    throw new Error(
      `Oak render revision ${String(renderRevision)} must advance beyond previous frame `
      + `${String(previousFrame.snapshot.revision)}.`,
    );
  }
  const projections = buildOakCachedRenderProjectionsV1(
    state,
    renderRevision,
    options.rootCutaway,
    reusesPreviousEpoch && previousFrame
      ? oakTrustedProjectionCacheV1(previousFrame)
      : undefined,
  );
  const { tissue, soil: soilCandidate, litter } = projections.cache;
  const presentedTissueRecords = oakPresentedTissueRecordsV1(tissue);
  const presentedTissueVoxelCount = oakPresentedTissueVoxelCountV1(tissue);
  const presentedLeafVoxelCount = oakPresentedLeafVoxelCountV1(tissue);
  const soilContactRecords = oakSoilContactInstanceRecordsV1(soilCandidate.contactVoxels);
  const weatherInput = {
    ...(options.weatherPresentation ?? {
      hostTick: state.wind.phaseTick,
      wind: state.wind,
      windTravelM: 0,
    }),
    ...(options.rootCutaway ? { rootCutaway: options.rootCutaway } : {}),
  };
  const occupiedCubeBoundsM = oakWeatherNeedsOccupancyV1(weatherInput)
    ? [
      ...[...presentedTissueRecords.values()].flat(),
      ...litter.records,
      ...soilContactRecords,
    ].map(oakVoxelRecordAabbV1)
    : [];
  const weather = buildOakWeatherVoxelPresentationV1({
    ...weatherInput,
    occupiedCubeBoundsM,
  });
  const geometry = createOakTissueVoxelGeometryV1();
  const resources = [
    ...createOakTissueVoxelMaterialsV1(),
    createOakFallenLitterVoxelMaterialV1(),
    ...buildOakSoilVoxelResourcesV1(),
    createOakWeatherVoxelMaterialV1(),
    geometry,
  ];
  const recordsByBatch = new Map(presentedTissueRecords);
  recordsByBatch.set(OAK_FALLEN_LITTER_VOXEL_BATCH_KEY_V1, litter.records);
  recordsByBatch.set(
    OAK_SOIL_CONTACT_VOXEL_BATCH_KEY_V1,
    soilContactRecords,
  );
  recordsByBatch.set(OAK_WEATHER_VOXEL_BATCH_KEY_V1, weather.records);
  const previousBatches = new Map(
    reusesPreviousEpoch && previousFrame
      ? previousFrame.snapshot.batches.map((batch) => [batch.key, batch] as const)
      : [],
  );
  const canonicalRecordsByBatch = new Map<string, readonly OakRenderInstanceRecordV1[]>();
  const batches = OAK_RENDER_BATCH_DEFINITIONS_V1.map((definition) => {
    const previous = previousBatches.get(definition.key);
    const records = recordsInPatchOrder(recordsByBatch.get(definition.key)!, previous);
    canonicalRecordsByBatch.set(definition.key, records);
    return previous && batchCanReuseRecords(definition, records, previous)
      ? previous
      : batchFromRecords(definition, records, renderRevision);
  });
  if (batches.some((batch) => batch.instanceKeys.length > MAX_INSTANCES_PER_BATCH)) {
    throw new Error('Oak render projection exceeded its fixed per-batch instance budget.');
  }
  const previousChunk = reusesPreviousEpoch ? previousFrame?.snapshot.chunks[0] : undefined;
  const soilChunk = previousChunk && chunkContentEqual(previousChunk, soilCandidate.chunk)
    ? { ...soilCandidate.chunk, revision: previousChunk.revision }
    : soilCandidate.chunk;
  const snapshot: RenderSnapshotV1 = {
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
        worldUnitsPerVoxel: OAK_SOIL_VOXEL_WORLD_UNITS_PER_VOXEL_V1,
      },
      colorEncoding: 'srgb8-straight-alpha',
      capabilities: ['voxel-chunks', 'geometry-resources', 'instance-batches'],
      chunkProfile: OAK_SOIL_VOXEL_CHUNK_PROFILE_V1,
      limits: {
        maxResources: resources.length,
        maxPaletteEntries: 6,
        maxChunks: 1,
        maxBatches: OAK_RENDER_BATCH_DEFINITIONS_V1.length,
        maxVoxelsPerChunk: soilChunk.voxels.length,
        maxGeometryVertices: geometry.positions.length / 3,
        maxGeometryIndices: geometry.indices.length,
        maxInstancesPerBatch: MAX_INSTANCES_PER_BATCH,
        maxTotalBytes: 134_217_728,
      },
    },
    revision: renderRevision,
    resources,
    chunks: [soilChunk],
    batches,
  };
  const nonEmptyBatches = batches.filter((batch) => batch.instanceKeys.length > 0);
  const soilVisibleFaces = projections.hits.soil && previousFrame !== undefined
    ? previousFrame.metrics.soilVisibleFaces
    : visibleVoxelFaceCount(soilChunk);
  const presentedOrganMetrics = [
    ...tissue.organMetrics,
    ...tissue.detachedLeafBodies.flatMap((body) => body.organMetrics),
  ];
  const organCount = (...kinds: readonly string[]): number => presentedOrganMetrics
    .filter((metric) => kinds.includes(metric.kind)).length;
  let protectedProjectionCache: OakRenderProjectionCacheV1 | undefined;
  const frame: OakRenderFrameV1 = {
    snapshot,
    get projectionCache() {
      protectedProjectionCache ??= protectOakRenderProjectionCacheV1(projections.cache);
      return protectedProjectionCache;
    },
    projectionCacheHits: projections.hits,
    metrics: {
      simulationRevision: state.revision,
      renderRevision,
      resourceCount: snapshot.resources.length,
      batchCount: batches.length,
      nonEmptyBatchCount: nonEmptyBatches.length,
      primaryContentPassDrawCalls: nonEmptyBatches.length + 1,
      leafOrganCount: organCount('leaf'),
      woodOrganCount: organCount('stem', 'branch'),
      rootOrganCount: organCount('coarse-root', 'fine-root-cohort'),
      chunkCount: 1,
      occupiedSoilVoxels: soilCandidate.metrics.occupiedVoxelCount,
      carvedSoilVoxelsForTissue: soilCandidate.metrics.carvedTissueVoxelCount,
      soilContactVoxels: soilCandidate.metrics.contactVoxelCount,
      soilVisibleFaces,
      tissueVoxelInstances: presentedTissueVoxelCount,
      leafVoxels: presentedLeafVoxelCount,
      woodVoxels: oakPresentedWoodVoxelCountV1(tissue),
      rootVoxels: tissue.rootVoxelCount,
      seedBudVoxels: tissue.seedBudVoxelCount,
      fallenLitterLeafCount: litter.leafMetrics.length,
      fallenLitterVoxels: litter.voxelCount,
      weather: weather.evidence,
      minimumPrimaryContentPassTriangles:
        (presentedTissueVoxelCount + litter.voxelCount + soilCandidate.metrics.contactVoxelCount
          + weather.evidence.totalVoxelCount)
        * geometry.indices.length / 3,
      retainedTypedArrayBytes: typedArrayBytes(snapshot),
      skippedTooShortOrNonpositiveRadiusSegments:
        tissue.skippedTooShortOrNonpositiveRadiusSegments,
      skippedJunctionConsumedSegments: tissue.skippedJunctionConsumedSegments,
    },
  };
  registerOakRenderFrameIntegrityV1(
    frame,
    canonicalRecordsByBatch,
    reusesPreviousEpoch ? previousFrame : undefined,
  );
  registerOakTrustedProjectionCacheV1(frame, projections.cache);
  return frame;
}
