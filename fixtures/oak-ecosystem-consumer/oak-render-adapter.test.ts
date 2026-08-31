import { describe, expect, it } from 'vitest';

import {
  RenderWorld,
  validateAndCopySnapshotV1,
  type InstanceBatchV1,
  type RenderSnapshotV1,
} from '../../src/core/index.js';
import { buildOakRenderDeltaV1, buildOakRenderFrameV1 } from './oak-render-adapter.js';
import {
  OAK_FALLEN_LITTER_VOXEL_BATCH_KEY_V1,
  OAK_FALLEN_LITTER_VOXEL_MATERIAL_KEY_V1,
} from './oak-fallen-litter-voxel.js';
import { OAK_SOIL_CONTACT_VOXEL_BATCH_KEY_V1 } from './oak-soil-contact-voxels.js';
import { oakLeafColorV1 } from './oak-render-projection.js';
import {
  OAK_SOIL_VOXEL_CHUNK_KEY_V1,
  OAK_SOIL_VOXEL_CHUNK_ORIGIN_V1,
  OAK_SOIL_VOXEL_CHUNK_PROFILE_V1,
  OAK_SOIL_VOXEL_CHUNK_SIZE_V1,
  OAK_SOIL_VOXEL_MATERIAL_KEY_V1,
  OAK_SOIL_VOXEL_PALETTE_KEY_V1,
  OAK_SOIL_VOXEL_WORLD_UNITS_PER_VOXEL_V1,
} from './oak-soil-voxel.js';
import {
  createOakSimulationV1,
  oakHostTicksForBiologicalDaysV1,
} from './oak-simulation.js';
import {
  OAK_LEAF_VOXEL_BATCH_KEY_V1,
  OAK_LEAF_VOXEL_MATERIAL_KEY_V1,
  OAK_ROOT_VOXEL_BATCH_KEY_V1,
  OAK_ROOT_VOXEL_MATERIAL_KEY_V1,
  OAK_SEED_BUD_VOXEL_BATCH_KEY_V1,
  OAK_SEED_BUD_VOXEL_MATERIAL_KEY_V1,
  OAK_TISSUE_VOXEL_GEOMETRY_KEY_V1,
  OAK_TISSUE_VOXEL_PITCH_M_V1,
  OAK_WOOD_VOXEL_BATCH_KEY_V1,
  OAK_WOOD_VOXEL_MATERIAL_KEY_V1,
} from './oak-tissue-voxel-projection.js';
import type {
  OakLeafOrganSnapshotV1,
  OakOrganSnapshotV1,
  OakRenderProjectionStateV1,
  OakSoilCellSnapshotV1,
} from './oak-types.js';

const POOLS = {
  carbonKg: 0.001,
  nitrogenKg: 0.00002,
  phosphorusKg: 0.000002,
  waterLiters: 0.01,
} as const;

function organ(
  input: Partial<OakOrganSnapshotV1> & Pick<OakOrganSnapshotV1, 'key' | 'kind'>,
): OakOrganSnapshotV1 {
  const { key, kind, ...overrides } = input;
  const identityParts = key.split(':');
  const base = {
    key,
    identity: {
      localId: Number(identityParts[1] ?? 1),
      generation: Number(identityParts[2] ?? 1),
    },
    parentKey: null,
    branchOrder: 0,
    ageDays: 120,
    positionM: { x: 0, y: 0, z: 0 },
    direction: { x: 0, y: 1, z: 0 },
    lengthM: 0.012,
    radiusM: 0.0012,
    dryMassKg: 0.0001,
    waterPotentialMpa: -0.4,
    pools: POOLS,
    stage: 'mature' as const,
    healthFraction: 1,
    stressFraction: 0,
    ...overrides,
  };
  if (kind !== 'leaf') return { ...base, kind } as OakOrganSnapshotV1;
  return {
    ...base,
    kind: 'leaf',
    areaM2: 0.00008,
    inclinationRadians: 0.4,
    rollRadians: 0.1,
    chlorophyllFraction: 0.85,
    relativeWaterContentFraction: 0.92,
    ...overrides,
  } as OakLeafOrganSnapshotV1;
}

function soil(
  key: string,
  centerM: Readonly<{ x: number; y: number; z: number }>,
): OakSoilCellSnapshotV1 {
  return {
    key,
    centerM,
    sizeM: { x: 0.5, y: 0.5, z: 0.5 },
    porosityFraction: 0.45,
    rootUptakeWeightFraction: 0.125,
    volumetricWaterFraction: 0.28,
    waterLiters: 35,
    ammoniumKg: 0.00003,
    nitrateKg: 0.00006,
    labilePhosphorusKg: 0.000004,
    sorbedPhosphorusKg: 0.00002,
    litter: { carbonKg: 0.01, nitrogenKg: 0.0004, phosphorusKg: 0.00003 },
    ectomycorrhiza: {
      carbonKg: 0.0002,
      nitrogenKg: 0.00001,
      phosphorusKg: 0.000001,
      colonizedFineRootFraction: 0.35,
    },
  };
}

function sampleOrgans(): readonly OakOrganSnapshotV1[] {
  return [
    organ({ key: 'organ:1:1', kind: 'stem', lengthM: 0.018, radiusM: 0.0018 }),
    organ({
      key: 'organ:2:1',
      kind: 'branch',
      parentKey: 'organ:1:1',
      branchOrder: 1,
      positionM: { x: 0, y: 0.018, z: 0 },
      direction: { x: 0.8, y: 0.6, z: 0 },
      lengthM: 0.009,
      radiusM: 0.0012,
    }),
    organ({
      key: 'organ:3:1',
      kind: 'coarse-root',
      direction: { x: 0, y: -1, z: 0 },
      lengthM: 0.014,
      radiusM: 0.0014,
    }),
    organ({
      key: 'organ:4:1',
      kind: 'leaf',
      parentKey: 'organ:2:1',
      branchOrder: 2,
      positionM: { x: 0.0072, y: 0.0234, z: 0 },
      direction: { x: 0.8, y: 0.2, z: 0.565685424949238 },
    }),
    organ({
      key: 'organ:5:1',
      kind: 'leaf',
      parentKey: 'organ:2:1',
      branchOrder: 2,
      positionM: { x: 0.0072, y: 0.0234, z: 0 },
      direction: { x: -0.5, y: 0.25, z: 0.82915619758885 },
    }),
  ];
}

function projection(
  revision = 1,
  organs: readonly OakOrganSnapshotV1[] = sampleOrgans(),
  soilCells: readonly OakSoilCellSnapshotV1[] = [
    soil('soil:top', { x: 0, y: -0.25, z: 0 }),
    soil('soil:deep', { x: 0, y: -0.75, z: 0 }),
  ],
  epoch = 'oak:test:1',
): OakRenderProjectionStateV1 {
  return {
    schemaVersion: 'oak.render-projection/1',
    epoch,
    revision,
    phenology: 'leaf-mature',
    environmentRegime: { water: 'ambient', nitrogen: 'ambient', phosphorus: 'ambient' },
    wind: { regime: 'still', phaseTick: 0, speedMPerS: 0 },
    organs,
    soil: soilCells,
    diagnostics: {
      heightM: 0.03,
      basalStemDiameterM: 0.0036,
      crownRadiusM: 0.015,
      leafAreaM2: 0.00016,
      meanWaterStressFraction: 0,
      meanNitrogenStressFraction: 0,
      meanPhosphorusStressFraction: 0,
    },
  };
}

function batch(snapshot: RenderSnapshotV1, key: string): InstanceBatchV1 {
  return snapshot.batches.find((candidate) => candidate.key === key)!;
}

function axisLengths(matrix: ArrayLike<number>): readonly number[] {
  return [
    Math.hypot(matrix[0]!, matrix[1]!, matrix[2]!),
    Math.hypot(matrix[4]!, matrix[5]!, matrix[6]!),
    Math.hypot(matrix[8]!, matrix[9]!, matrix[10]!),
  ];
}

function retainedKeyFraction(before: InstanceBatchV1, after: InstanceBatchV1): number {
  const next = new Set(after.instanceKeys);
  return before.instanceKeys.filter((key) => next.has(key)).length / Math.max(1, before.instanceKeys.length);
}

function expectAcceptedDelta(
  before: ReturnType<typeof buildOakRenderFrameV1>,
  after: ReturnType<typeof buildOakRenderFrameV1>,
): void {
  const world = new RenderWorld();
  expect(world.acceptSnapshot(before.snapshot).status).toBe('accepted');
  expect(world.acceptDelta(buildOakRenderDeltaV1(before, after)).status).toBe('accepted');
  expect(world.acceptedSnapshot()).toEqual(after.snapshot);
  world.dispose();
}

describe('oak hybrid voxel render contract', () => {
  it('publishes one worker-profiled soil chunk and six exact-cube scene batches', () => {
    const frame = buildOakRenderFrameV1(projection());
    expect(validateAndCopySnapshotV1(frame.snapshot).ok).toBe(true);
    expect(frame.snapshot.resources).toHaveLength(8);
    expect(frame.snapshot.batches).toHaveLength(6);
    expect(frame.snapshot.chunks).toHaveLength(1);
    expect(new Set(frame.snapshot.resources.map(({ key }) => key))).toEqual(new Set([
      OAK_TISSUE_VOXEL_GEOMETRY_KEY_V1,
      OAK_WOOD_VOXEL_MATERIAL_KEY_V1,
      OAK_ROOT_VOXEL_MATERIAL_KEY_V1,
      OAK_LEAF_VOXEL_MATERIAL_KEY_V1,
      OAK_SEED_BUD_VOXEL_MATERIAL_KEY_V1,
      OAK_FALLEN_LITTER_VOXEL_MATERIAL_KEY_V1,
      OAK_SOIL_VOXEL_PALETTE_KEY_V1,
      OAK_SOIL_VOXEL_MATERIAL_KEY_V1,
    ]));
    expect(new Set(frame.snapshot.batches.map(({ key }) => key))).toEqual(new Set([
      OAK_WOOD_VOXEL_BATCH_KEY_V1,
      OAK_ROOT_VOXEL_BATCH_KEY_V1,
      OAK_LEAF_VOXEL_BATCH_KEY_V1,
      OAK_SEED_BUD_VOXEL_BATCH_KEY_V1,
      OAK_FALLEN_LITTER_VOXEL_BATCH_KEY_V1,
      OAK_SOIL_CONTACT_VOXEL_BATCH_KEY_V1,
    ]));
    expect(frame.snapshot.descriptor.capabilities).toEqual([
      'voxel-chunks',
      'geometry-resources',
      'instance-batches',
    ]);
    expect(frame.snapshot.descriptor.chunkProfile).toEqual(OAK_SOIL_VOXEL_CHUNK_PROFILE_V1);
    expect(frame.snapshot.descriptor.coordinates.worldUnitsPerVoxel)
      .toEqual(OAK_SOIL_VOXEL_WORLD_UNITS_PER_VOXEL_V1);
    const chunk = frame.snapshot.chunks[0]!;
    expect(chunk).toMatchObject({
      key: OAK_SOIL_VOXEL_CHUNK_KEY_V1,
      origin: OAK_SOIL_VOXEL_CHUNK_ORIGIN_V1,
      size: OAK_SOIL_VOXEL_CHUNK_SIZE_V1,
      paletteKey: OAK_SOIL_VOXEL_PALETTE_KEY_V1,
      materialKey: OAK_SOIL_VOXEL_MATERIAL_KEY_V1,
    });
    expect(chunk.voxels.length).toBe(40 ** 3);

    const geometry = frame.snapshot.resources.find(({ key }) =>
      key === OAK_TISSUE_VOXEL_GEOMETRY_KEY_V1)!;
    if (geometry.kind !== 'geometry') throw new Error('Expected tissue cube geometry.');
    expect(geometry.positions).toHaveLength(24 * 3);
    expect(geometry.indices).toHaveLength(12 * 3);
    expect(geometry.bounds).toEqual({
      min: { x: -0.5, y: -0.5, z: -0.5 },
      max: { x: 0.5, y: 0.5, z: 0.5 },
    });
    for (const tissueBatch of frame.snapshot.batches) {
      expect(tissueBatch.geometryKey).toBe(OAK_TISSUE_VOXEL_GEOMETRY_KEY_V1);
      for (let slot = 0; slot < tissueBatch.instanceKeys.length; slot += 1) {
        const matrix = tissueBatch.matrices.subarray(slot * 16, slot * 16 + 16);
        expect(axisLengths(matrix)).toEqual([
          expect.closeTo(OAK_TISSUE_VOXEL_PITCH_M_V1, 8),
          expect.closeTo(OAK_TISSUE_VOXEL_PITCH_M_V1, 8),
          expect.closeTo(OAK_TISSUE_VOXEL_PITCH_M_V1, 8),
        ]);
      }
    }
    expect(batch(frame.snapshot, OAK_ROOT_VOXEL_BATCH_KEY_V1).instanceKeys).toEqual([]);
    expect(frame.metrics).toMatchObject({
      resourceCount: 8,
      batchCount: 6,
      chunkCount: 1,
      rootVoxels: 0,
    });
    expect(frame.metrics.primaryContentPassDrawCalls)
      .toBe(frame.metrics.nonEmptyBatchCount + 1);
    expect(frame.metrics.minimumPrimaryContentPassTriangles).toBeGreaterThan(0);
  });

  it('lets authoritative chlorophyll loss overtake green without faking senescence', () => {
    const healthy = oakLeafColorV1(organ({
      key: 'organ:7:1',
      kind: 'leaf',
      chlorophyllFraction: 0.85,
      relativeWaterContentFraction: 0.95,
      stressFraction: 0,
    }) as OakLeafOrganSnapshotV1);
    const nutrientLimited = oakLeafColorV1(organ({
      key: 'organ:7:1',
      kind: 'leaf',
      chlorophyllFraction: 0.35,
      relativeWaterContentFraction: 0.95,
      stressFraction: 0,
    }) as OakLeafOrganSnapshotV1);
    expect(healthy.g).toBeGreaterThan(healthy.r);
    expect(nutrientLimited.r).toBeGreaterThan(nutrientLimited.g);
    expect(nutrientLimited).not.toEqual(expect.objectContaining({ r: 174, g: 125 }));
  });

  it('projects the authoritative day-100 organ graph as fused voxel tissue and sparsely patches live wind', () => {
    const simulation = createOakSimulationV1();
    simulation.advanceHostTicks(oakHostTicksForBiologicalDaysV1(100));
    const calm = buildOakRenderFrameV1(simulation.projection(), { renderRevision: 20 });
    expect(validateAndCopySnapshotV1(calm.snapshot).ok).toBe(true);
    expect(calm.metrics.leafOrganCount).toBe(10);
    expect(calm.metrics.leafVoxels).toBeGreaterThan(calm.metrics.leafOrganCount);
    const leafBatch = batch(calm.snapshot, OAK_LEAF_VOXEL_BATCH_KEY_V1);
    for (const leaf of simulation.snapshot().organs.filter((candidate) =>
      candidate.kind === 'leaf' && candidate.stage !== 'abscised')) {
      expect(leafBatch.instanceKeys.some((key) => key.startsWith(`oak:${leaf.key}:`))).toBe(true);
    }

    simulation.applyCommand({ kind: 'set-wind-regime', regime: 'breeze' });
    simulation.advanceHostTicks(15);
    const wind = buildOakRenderFrameV1(simulation.projection(), {
      renderRevision: 21,
      previousFrame: calm,
    });
    expect(calm.snapshot.batches.some((beforeBatch) =>
      batch(wind.snapshot, beforeBatch.key).instanceKeys.join('|')
        !== beforeBatch.instanceKeys.join('|'))).toBe(true);
    const calmTissueKeys = calm.snapshot.batches.flatMap(({ instanceKeys }) => instanceKeys);
    const windTissueKeys = new Set(wind.snapshot.batches.flatMap(({ instanceKeys }) => instanceKeys));
    expect(calmTissueKeys.filter((key) => windTissueKeys.has(key)).length / calmTissueKeys.length)
      .toBeGreaterThan(.8);
    const delta = buildOakRenderDeltaV1(calm, wind);
    expect(delta.operations.some((operation) =>
      operation.op === 'patch-batch-instances'
      && operation.upserts.instanceKeys.length > 0)).toBe(true);
    expect(wind.snapshot.batches.every((candidate) => candidate.animation === undefined)).toBe(true);
    expectAcceptedDelta(calm, wind);
  });

  it('rejects invalid or non-advancing presentation revisions', () => {
    const state = projection(4);
    expect(() => buildOakRenderFrameV1(state, { renderRevision: -1 }))
      .toThrow(/nonnegative safe integer/u);
    const before = buildOakRenderFrameV1(state, { renderRevision: 8 });
    expect(() => buildOakRenderFrameV1(state, {
      renderRevision: 8,
      previousFrame: before,
    })).toThrow(/must advance beyond previous frame/u);
  });
});

describe('oak hybrid voxel deltas', () => {
  it('sparsely patches changed lattice membership without replacing the leaf batch', () => {
    const beforeState = projection(4);
    const before = buildOakRenderFrameV1(beforeState, { renderRevision: 8 });
    const changedOrgans = beforeState.organs.map((candidate) => candidate.key === 'organ:4:1'
      ? { ...candidate, direction: { x: 0.72, y: 0.18, z: 0.670522184 }, stressFraction: 0.35 }
      : candidate);
    const after = buildOakRenderFrameV1(projection(5, changedOrgans), {
      renderRevision: 9,
      previousFrame: before,
    });
    const beforeLeaf = batch(before.snapshot, OAK_LEAF_VOXEL_BATCH_KEY_V1);
    const afterLeaf = batch(after.snapshot, OAK_LEAF_VOXEL_BATCH_KEY_V1);
    expect(retainedKeyFraction(beforeLeaf, afterLeaf)).toBeGreaterThan(.5);
    const delta = buildOakRenderDeltaV1(before, after);
    expect(delta.operations).toHaveLength(1);
    const operation = delta.operations[0]!;
    expect(operation.op).toBe('patch-batch-instances');
    if (operation.op === 'patch-batch-instances') {
      expect(operation.key).toBe(OAK_LEAF_VOXEL_BATCH_KEY_V1);
      expect(operation.removeInstanceKeys.length).toBeGreaterThan(0);
      expect(operation.upserts.instanceKeys.length).toBeGreaterThan(0);
      expect(operation.removeInstanceKeys.length + operation.upserts.instanceKeys.length)
        .toBeLessThan(beforeLeaf.instanceKeys.length * 1.5);
    }
    expectAcceptedDelta(before, after);
  });

  it('removes and upserts changed generation membership through the exact sparse patch', () => {
    const beforeState = projection(1);
    const before = buildOakRenderFrameV1(beforeState, { renderRevision: 1 });
    const nextOrgans = beforeState.organs.map((candidate) => candidate.key === 'organ:4:1'
      ? organ({ ...candidate, key: 'organ:4:2', identity: { localId: 4, generation: 2 } })
      : candidate);
    const after = buildOakRenderFrameV1(projection(2, nextOrgans), {
      renderRevision: 2,
      previousFrame: before,
    });
    const delta = buildOakRenderDeltaV1(before, after);
    expect(delta.operations).toHaveLength(1);
    expect(delta.operations[0]?.op).toBe('patch-batch-instances');
    if (delta.operations[0]?.op === 'patch-batch-instances') {
      expect(delta.operations[0].key).toBe(OAK_LEAF_VOXEL_BATCH_KEY_V1);
      expect(delta.operations[0].removeInstanceKeys.some((key) =>
        key.startsWith('oak:organ:4:1:'))).toBe(true);
      expect(delta.operations[0].upserts.instanceKeys.some((key) =>
        key.startsWith('oak:organ:4:2:'))).toBe(true);
    }
    expectAcceptedDelta(before, after);
  });

  it('emits exactly one put-chunk when authoritative soil state changes', () => {
    const beforeState = projection(1);
    const before = buildOakRenderFrameV1(beforeState, { renderRevision: 10 });
    const drySoil = beforeState.soil.map((cell) => ({
      ...cell,
      volumetricWaterFraction: 0.01,
      waterLiters: 1.25,
      ammoniumKg: 0,
      nitrateKg: 0,
      labilePhosphorusKg: 0,
      litter: { carbonKg: 0, nitrogenKg: 0, phosphorusKg: 0 },
    }));
    const after = buildOakRenderFrameV1(projection(2, beforeState.organs, drySoil), {
      renderRevision: 11,
      previousFrame: before,
    });
    const delta = buildOakRenderDeltaV1(before, after);
    expect(delta.operations).toHaveLength(1);
    expect(delta.operations[0]?.op).toBe('put-chunk');
    if (delta.operations[0]?.op === 'put-chunk') {
      expect(delta.operations[0].chunk.key).toBe(OAK_SOIL_VOXEL_CHUNK_KEY_V1);
    }
    expectAcceptedDelta(before, after);
  });

  it('adds voxel roots and exactly one changed soil chunk for a paused cutaway', () => {
    const state = projection(12);
    const surface = buildOakRenderFrameV1(state, { renderRevision: 30 });
    const cutaway = buildOakRenderFrameV1(state, {
      renderRevision: 31,
      previousFrame: surface,
      rootCutaway: { axis: 'z', planeM: 0, keep: 'less-than' },
    });
    expect(surface.metrics.simulationRevision).toBe(cutaway.metrics.simulationRevision);
    expect(batch(surface.snapshot, OAK_ROOT_VOXEL_BATCH_KEY_V1).instanceKeys).toEqual([]);
    expect(batch(cutaway.snapshot, OAK_ROOT_VOXEL_BATCH_KEY_V1).instanceKeys.length)
      .toBeGreaterThan(0);
    const delta = buildOakRenderDeltaV1(surface, cutaway);
    expect(delta.operations.filter((operation) => operation.op === 'put-chunk')).toHaveLength(1);
    expect(delta.operations.some((operation) =>
      operation.op === 'patch-batch-instances'
      && operation.key === OAK_ROOT_VOXEL_BATCH_KEY_V1
      && operation.removeInstanceKeys.length === 0
      && operation.upserts.instanceKeys.length > 0)).toBe(true);
    expectAcceptedDelta(surface, cutaway);
  });

  it('rejects cross-epoch and non-advancing deltas', () => {
    const before = buildOakRenderFrameV1(projection(1), { renderRevision: 4 });
    const otherEpochState = projection(2, sampleOrgans(), projection().soil, 'oak:test:2');
    const otherEpoch = buildOakRenderFrameV1(otherEpochState, { renderRevision: 5 });
    expect(() => buildOakRenderDeltaV1(before, otherEpoch)).toThrow(/cannot cross/u);
    const stale = buildOakRenderFrameV1(projection(2), { renderRevision: 4 });
    expect(() => buildOakRenderDeltaV1(before, stale)).toThrow(/must advance/u);
  });
});
