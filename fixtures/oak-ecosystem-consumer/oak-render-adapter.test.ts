import { describe, expect, it } from 'vitest';

import {
  RenderWorld,
  validateAndCopySnapshotV1,
  type InstanceBatchV1,
  type RenderSnapshotV1,
} from '../../src/core/index.js';
import type {
  OakLeafOrganSnapshotV1,
  OakOrganSnapshotV1,
  OakRenderProjectionStateV1,
  OakSoilCellSnapshotV1,
} from './oak-types.js';
import { buildOakRenderDeltaV1, buildOakRenderFrameV1 } from './oak-render-adapter.js';
import {
  deriveOakLeafLobeCountV1,
  OAK_LEAF_PETIOLE_FRACTION_V1,
  OAK_LEAF_MATERIAL_KEY_V1,
  OAK_LEAF_VARIANT_DESCRIPTORS_V1,
} from './oak-render-geometry.js';
import {
  OAK_LEAF_PETIOLE_NORMALIZED_HALF_THICKNESS_V1,
  OAK_LEAF_PETIOLE_NORMALIZED_HALF_WIDTH_V1,
} from './oak-leaf-shape.js';
import { oakLeafColorV1 } from './oak-render-projection.js';
import {
  createOakSimulationV1,
  oakHostTicksForBiologicalDaysV1,
} from './oak-simulation.js';

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
    lengthM: 0.1,
    radiusM: 0.01,
    dryMassKg: 0.01,
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
    areaM2: 0.004,
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

function projection(
  revision = 1,
  organs: readonly OakOrganSnapshotV1[] = sampleOrgans(),
): OakRenderProjectionStateV1 {
  return {
    schemaVersion: 'oak.render-projection/1',
    epoch: 'oak:test:1',
    revision,
    phenology: 'leaf-mature',
    environmentRegime: { water: 'ambient', nitrogen: 'ambient', phosphorus: 'ambient' },
    wind: { regime: 'still', phaseTick: 0, speedMPerS: 0 },
    organs,
    soil: [
      soil('soil:top', { x: 0, y: -0.25, z: 0 }),
      soil('soil:deep', { x: 0, y: -0.75, z: 0 }),
    ],
    diagnostics: {
      heightM: 1.5,
      basalStemDiameterM: 0.2,
      crownRadiusM: 0.6,
      leafAreaM2: 0.004,
      meanWaterStressFraction: 0,
      meanNitrogenStressFraction: 0,
      meanPhosphorusStressFraction: 0,
    },
  };
}

function sampleOrgans(): readonly OakOrganSnapshotV1[] {
  return [
    organ({
      key: 'organ:1:1',
      kind: 'stem',
      lengthM: 1,
      radiusM: 0.1,
    }),
    organ({
      key: 'organ:2:1',
      kind: 'branch',
      parentKey: 'organ:1:1',
      branchOrder: 1,
      positionM: { x: 0, y: 1, z: 0 },
      direction: { x: 0.8, y: 0.6, z: 0 },
      lengthM: 0.5,
      radiusM: 0.04,
    }),
    organ({
      key: 'organ:3:1',
      kind: 'coarse-root',
      positionM: { x: 0, y: 0, z: 0 },
      direction: { x: 0, y: -1, z: 0 },
      lengthM: 0.4,
      radiusM: 0.05,
    }),
    organ({
      key: 'organ:4:1',
      kind: 'leaf',
      parentKey: 'organ:2:1',
      branchOrder: 2,
      positionM: { x: 0.4, y: 1.3, z: 0 },
      direction: { x: 0.8, y: 0.2, z: 0.565685424949238 },
    }),
  ];
}

function batch(snapshot: RenderSnapshotV1, key: string): InstanceBatchV1 {
  return snapshot.batches.find((candidate) => candidate.key === key)!;
}

function matrixForInstance(snapshot: RenderSnapshotV1, instanceKey: string): Float32Array {
  for (const candidate of snapshot.batches) {
    const slot = candidate.instanceKeys.indexOf(instanceKey);
    if (slot >= 0) return candidate.matrices.slice(slot * 16, slot * 16 + 16);
  }
  throw new Error(`Missing test instance '${instanceKey}'.`);
}

function colorForInstance(snapshot: RenderSnapshotV1, instanceKey: string): readonly number[] {
  for (const candidate of snapshot.batches) {
    const slot = candidate.instanceKeys.indexOf(instanceKey);
    if (slot >= 0) return [...candidate.colors!.subarray(slot * 4, slot * 4 + 4)];
  }
  throw new Error(`Missing test instance '${instanceKey}'.`);
}

describe('oak render geometry', () => {
  it('produces a valid bounded public-contract snapshot with finite geometry', () => {
    const frame = buildOakRenderFrameV1(projection());
    const validation = validateAndCopySnapshotV1(frame.snapshot);
    expect(validation.ok).toBe(true);
    expect(frame.snapshot.chunks).toEqual([]);
    expect(frame.snapshot.descriptor.coordinates.metersPerWorldUnit).toBe(1);
    expect(frame.metrics.batchCount).toBeLessThanOrEqual(frame.snapshot.descriptor.limits.maxBatches);
    expect(frame.metrics.resourceCount).toBeLessThanOrEqual(frame.snapshot.descriptor.limits.maxResources);
    expect(frame.metrics.primaryContentPassDrawCalls).toBe(frame.metrics.nonEmptyBatchCount);
    expect(frame.metrics.primaryContentPassDrawCalls).toBeLessThanOrEqual(frame.metrics.batchCount);
    expect(frame.metrics.primaryContentPassTriangles).toBeGreaterThan(0);

    const materialResources = frame.snapshot.resources.filter((resource) => resource.kind === 'material');
    expect(materialResources.every((resource) =>
      resource.vertexColors
      && resource.color.r === 255
      && resource.color.g === 255
      && resource.color.b === 255)).toBe(true);

    for (const resource of frame.snapshot.resources) {
      if (resource.kind !== 'geometry') continue;
      expect(resource.colors?.length).toBe(resource.positions.length);
      expect(resource.colors?.every((channel) => channel === 255)).toBe(true);
      expect([...resource.positions, ...resource.normals, ...(resource.uvs ?? [])]
        .every(Number.isFinite)).toBe(true);
      expect([...resource.indices].every((index) => index < resource.positions.length / 3)).toBe(true);
      for (let offset = 0; offset < resource.normals.length; offset += 3) {
        const x = resource.normals[offset]!;
        const y = resource.normals[offset + 1]!;
        const z = resource.normals[offset + 2]!;
        expect(Math.sqrt(x * x + y * y + z * z)).toBeCloseTo(1, 5);
      }
      for (let offset = 0; offset < resource.positions.length; offset += 3) {
        expect(resource.positions[offset]).toBeGreaterThanOrEqual(resource.bounds.min.x - 1e-7);
        expect(resource.positions[offset]).toBeLessThanOrEqual(resource.bounds.max.x + 1e-7);
        expect(resource.positions[offset + 1]).toBeGreaterThanOrEqual(resource.bounds.min.y - 1e-7);
        expect(resource.positions[offset + 1]).toBeLessThanOrEqual(resource.bounds.max.y + 1e-7);
        expect(resource.positions[offset + 2]).toBeGreaterThanOrEqual(resource.bounds.min.z - 1e-7);
        expect(resource.positions[offset + 2]).toBeLessThanOrEqual(resource.bounds.max.z + 1e-7);
      }
    }
  });

  it('derives three contrasting lobed, cambered leaves with petiole and midrib relief', () => {
    const signatures = new Set<string>();
    const frame = buildOakRenderFrameV1(projection());
    for (const descriptor of OAK_LEAF_VARIANT_DESCRIPTORS_V1) {
      expect(deriveOakLeafLobeCountV1(descriptor.stationWidths)).toBe(descriptor.lobeCount);
      signatures.add(`${descriptor.lobeCount}/${descriptor.aspectClass}/${String(descriptor.camber)}`);
      const geometry = frame.snapshot.resources.find((resource) =>
        resource.kind === 'geometry' && resource.key === descriptor.geometryKey);
      expect(geometry?.kind).toBe('geometry');
      if (geometry?.kind !== 'geometry') continue;
      expect(geometry.groups.map((group) => group.materialKey))
        .toEqual([OAK_LEAF_MATERIAL_KEY_V1]);
      const vertices = Array.from({ length: geometry.positions.length / 3 }, (_, index) => ({
        x: geometry.positions[index * 3]!,
        y: geometry.positions[index * 3 + 1]!,
        z: geometry.positions[index * 3 + 2]!,
      }));
      const petioleVertices = vertices.slice(0, 8);
      const basalPetiole = petioleVertices.filter((vertex) => vertex.y === 0);
      const distalPetiole = petioleVertices.filter((vertex) =>
        Math.abs(vertex.y - OAK_LEAF_PETIOLE_FRACTION_V1) < 1e-6);
      expect(basalPetiole).toHaveLength(4);
      expect(distalPetiole).toHaveLength(4);
      expect(Math.max(...basalPetiole.map(({ x }) => Math.abs(x))))
        .toBeCloseTo(OAK_LEAF_PETIOLE_NORMALIZED_HALF_WIDTH_V1, 8);
      expect(Math.max(...basalPetiole.map(({ z }) => Math.abs(z))))
        .toBeCloseTo(OAK_LEAF_PETIOLE_NORMALIZED_HALF_THICKNESS_V1, 8);
      expect(Math.max(...distalPetiole.map(({ x }) => Math.abs(x))))
        .toBeLessThan(OAK_LEAF_PETIOLE_NORMALIZED_HALF_WIDTH_V1);
      expect(Math.max(...vertices.map((vertex) => vertex.z))).toBeGreaterThan(descriptor.camber);
    }
    expect(signatures.size).toBe(3);
    const leafTop = frame.snapshot.resources.find((resource) =>
      resource.kind === 'material' && resource.key === OAK_LEAF_MATERIAL_KEY_V1);
    expect(leafTop?.kind === 'material' && leafTop.shading).toBe('standard');
    expect(leafTop?.kind === 'material' && leafTop.doubleSided).toBe(true);
  });

  it('distinguishes living absorptive fine-root tissue from bark and wet soil', () => {
    const fineRoot = organ({
      key: 'organ:5:1',
      kind: 'fine-root-cohort',
      positionM: { x: 0, y: -0.35, z: 0 },
      direction: { x: 0.8, y: -0.6, z: 0 },
      lengthM: 0.2,
      radiusM: 0.004,
    });
    const frame = buildOakRenderFrameV1(projection(1, [...sampleOrgans(), fineRoot]), {
      rootCutaway: { axis: 'x', planeM: 0, keep: 'less-than' },
    });
    const fineRootColor = colorForInstance(frame.snapshot, 'oak:organ:5:1:shaft');
    const coarseRootColor = colorForInstance(frame.snapshot, 'oak:organ:3:1:shaft');
    const wetSoilColor = colorForInstance(frame.snapshot, 'oak-soil:soil:top');
    const luminance = (color: readonly number[]) =>
      color[0]! * 0.2126 + color[1]! * 0.7152 + color[2]! * 0.0722;
    expect(luminance(fineRootColor) - luminance(coarseRootColor)).toBeGreaterThan(50);
    expect(luminance(fineRootColor) - luminance(wetSoilColor)).toBeGreaterThan(35);
  });

  it('lets chlorophyll loss overtake green without faking senescence', () => {
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

  it('replaces an occupied parent terminal surface with one finite node flare', () => {
    const frame = buildOakRenderFrameV1(projection());
    const parent = matrixForInstance(frame.snapshot, 'oak:organ:1:1:shaft');
    const shaft = matrixForInstance(frame.snapshot, 'oak:organ:2:1:shaft');
    const parentTip = [
      Math.fround(parent[12]! + parent[4]!),
      Math.fround(parent[13]! + parent[5]!),
      Math.fround(parent[14]! + parent[6]!),
    ];
    expect([...shaft.subarray(12, 15)]).toEqual(parentTip);
    const parentBatch = frame.snapshot.batches.find((candidate) =>
      candidate.instanceKeys.includes('oak:organ:1:1:shaft'))!;
    expect(parentBatch.key).toContain(':node-flared:');
    const geometry = frame.snapshot.resources.find((resource) =>
      resource.kind === 'geometry' && resource.key === parentBatch.geometryKey)!;
    if (geometry.kind !== 'geometry') throw new Error('Expected node-flared geometry.');
    const ringYs = [...new Set(Array.from(
      { length: geometry.positions.length / 3 },
      (_, index) => geometry.positions[index * 3 + 1]!,
    ))].sort();
    expect(ringYs).toHaveLength(4);
    const radii = ringYs.map((y) => Math.max(...Array.from(
      { length: geometry.positions.length / 3 }, (_, index) => index,
    ).filter((index) => geometry.positions[index * 3 + 1] === y)
      .map((index) => Math.hypot(
        geometry.positions[index * 3]!, geometry.positions[index * 3 + 2]!,
      ))));
    expect(radii[2]).toBeGreaterThan(radii[1]!);
    expect(frame.snapshot.resources.some(({ key }) => key.includes('node-collar'))).toBe(false);
    expect(frame.snapshot.batches.some(({ key }) => key === 'batch:oak:junctions')).toBe(false);
  });

  it('uses one open node-flared parent surface for a multi-child fork', () => {
    const continuation = organ({
      key: 'organ:5:1',
      kind: 'stem',
      parentKey: 'organ:1:1',
      positionM: { x: 0, y: 1, z: 0 },
      direction: { x: 0, y: 1, z: 0 },
      lengthM: 0.5,
      radiusM: 0.045,
    });
    const frame = buildOakRenderFrameV1(projection(1, [...sampleOrgans(), continuation]));
    const parentBatch = frame.snapshot.batches.find((candidate) =>
      candidate.instanceKeys.includes('oak:organ:1:1:shaft'))!;
    expect(parentBatch.key).toContain(':node-flared:');
    const parent = matrixForInstance(frame.snapshot, 'oak:organ:1:1:shaft');
    const parentTip = [
      Math.fround(parent[12]! + parent[4]!),
      Math.fround(parent[13]! + parent[5]!),
      Math.fround(parent[14]! + parent[6]!),
    ];
    for (const key of ['organ:2:1', 'organ:5:1']) {
      const shaft = matrixForInstance(frame.snapshot, `oak:${key}:shaft`);
      expect([...shaft.subarray(12, 15)]).toEqual(parentTip);
    }
    const shaftKeys = frame.snapshot.batches.flatMap(({ instanceKeys }) =>
      instanceKeys.filter((key) => key.endsWith(':shaft')));
    expect(shaftKeys).toHaveLength(new Set(shaftKeys).size);
    const geometry = frame.snapshot.resources.find((resource) =>
      resource.kind === 'geometry' && resource.key === parentBatch.geometryKey)!;
    if (geometry.kind !== 'geometry') throw new Error('Expected node-flared geometry.');
    const distalTriangles = Array.from({ length: geometry.indices.length / 3 }, (_, index) =>
      [...geometry.indices.subarray(index * 3, index * 3 + 3)]).filter((triangle) =>
      triangle.every((vertex) => geometry.positions[vertex * 3 + 1] === 1));
    expect(distalTriangles).toEqual([]);
  });

  it('projects the authoritative connected three-flush organ graph', () => {
    const simulation = createOakSimulationV1();
    simulation.advanceHostTicks(oakHostTicksForBiologicalDaysV1(100));
    const frame = buildOakRenderFrameV1(simulation.projection(), { renderRevision: 20 });
    expect(validateAndCopySnapshotV1(frame.snapshot).ok).toBe(true);
    expect(frame.metrics.leafInstances).toBe(10);
    expect(frame.metrics.woodSegments).toBeGreaterThanOrEqual(4);
    const livingLeafBatches = frame.snapshot.batches.filter((candidate) =>
      candidate.key.startsWith('batch:oak:leaf:'));
    expect(livingLeafBatches.map(({ instanceKeys }) => instanceKeys.length).sort())
      .toEqual([3, 3, 4]);
    expect(livingLeafBatches.every((candidate) => {
      const colors = candidate.colors!;
      for (let offset = 0; offset < colors.length; offset += 4) {
        if (colors[offset + 1]! <= colors[offset]!) return false;
      }
      return true;
    })).toBe(true);

    simulation.applyCommand({ kind: 'set-wind-regime', regime: 'breeze' });
    simulation.advanceHostTicks(15);
    const wind = buildOakRenderFrameV1(simulation.projection(), {
      renderRevision: 21,
      previousFrame: frame,
    });
    const windDelta = buildOakRenderDeltaV1(frame, wind);
    expect(windDelta.operations.some((operation) =>
      operation.op === 'patch-batch-instances' && operation.upserts.instanceKeys.length > 0)).toBe(true);
    expect(wind.snapshot.batches.every((candidate) => candidate.animation === undefined)).toBe(true);
  });
});

describe('oak render deltas', () => {
  it('preserves generation-bearing keys and sparsely patches one wind/stress pose', () => {
    const beforeState = projection(4);
    const before = buildOakRenderFrameV1(beforeState, { renderRevision: 8 });
    const changedOrgans = beforeState.organs.map((candidate) => candidate.kind === 'leaf'
      ? { ...candidate, direction: { x: 0.72, y: 0.18, z: 0.670522184 } , stressFraction: 0.35 }
      : candidate);
    const after = buildOakRenderFrameV1(projection(5, changedOrgans), {
      renderRevision: 9,
      previousFrame: before,
    });
    const delta = buildOakRenderDeltaV1(before, after);
    expect(delta.operations).toHaveLength(1);
    expect(delta.operations[0]?.op).toBe('patch-batch-instances');
    if (delta.operations[0]?.op === 'patch-batch-instances') {
      expect(delta.operations[0].upserts.instanceKeys).toEqual(['oak:organ:4:1']);
      expect(delta.operations[0].removeInstanceKeys).toEqual([]);
    }

    const world = new RenderWorld();
    expect(world.acceptSnapshot(before.snapshot).status).toBe('accepted');
    expect(world.acceptDelta(delta).status).toBe('accepted');
    expect(world.acceptedSnapshot()).toEqual(after.snapshot);
    world.dispose();
  });

  it('replaces changed membership with the exact generation-bearing batch', () => {
    const beforeState = projection(1);
    const before = buildOakRenderFrameV1(beforeState, { renderRevision: 1 });
    const nextOrgans = beforeState.organs.map((candidate) => candidate.kind === 'leaf'
      ? organ({ ...candidate, key: 'organ:4:2', identity: { localId: 4, generation: 2 } })
      : candidate);
    const after = buildOakRenderFrameV1(projection(2, nextOrgans), {
      renderRevision: 2,
      previousFrame: before,
    });
    const delta = buildOakRenderDeltaV1(before, after);
    expect(delta.operations).toHaveLength(1);
    expect(delta.operations[0]?.op).toBe('put-batch');
    if (delta.operations[0]?.op === 'put-batch') {
      expect(delta.operations[0].batch.instanceKeys).toContain('oak:organ:4:2');
      expect(delta.operations[0].batch.instanceKeys).not.toContain('oak:organ:4:1');
    }
    const world = new RenderWorld();
    expect(world.acceptSnapshot(before.snapshot).status).toBe('accepted');
    expect(world.acceptDelta(delta).status).toBe('accepted');
    expect(world.acceptedSnapshot()).toEqual(after.snapshot);
    world.dispose();
  });

  it('advances presentation for a paused-simulation root cutaway', () => {
    const state = projection(12);
    const surface = buildOakRenderFrameV1(state, { renderRevision: 30 });
    const cutaway = buildOakRenderFrameV1(state, {
      renderRevision: 31,
      previousFrame: surface,
      rootCutaway: { axis: 'z', planeM: 0, keep: 'less-than' },
    });
    expect(surface.metrics.simulationRevision).toBe(cutaway.metrics.simulationRevision);
    expect(surface.metrics.soilInstances).toBe(1);
    expect(cutaway.metrics.soilInstances).toBe(2);
    const delta = buildOakRenderDeltaV1(surface, cutaway);
    expect(delta.revision).toBe(31);
    const world = new RenderWorld();
    expect(world.acceptSnapshot(surface.snapshot).status).toBe('accepted');
    expect(world.acceptDelta(delta).status).toBe('accepted');
    expect(world.acceptedSnapshot()).toEqual(cutaway.snapshot);
    world.dispose();
  });

  it('keeps a leaf cohort in at most three instanced draw batches', () => {
    const base = sampleOrgans().filter((candidate) => candidate.kind !== 'leaf');
    const leaves = Array.from({ length: 120 }, (_, index) => organ({
      key: `organ:${String(100 + index)}:1`,
      kind: 'leaf',
      parentKey: 'organ:2:1',
      positionM: { x: 0.4, y: 1.3, z: 0 },
      direction: { x: 0.8, y: 0.2, z: 0.565685424949238 },
    }));
    const frame = buildOakRenderFrameV1(projection(2, [...base, ...leaves]));
    const leafBatches = frame.snapshot.batches.filter((candidate) =>
      candidate.key.startsWith('batch:oak:leaf:') && candidate.instanceKeys.length > 0);
    expect(frame.metrics.leafInstances).toBe(120);
    expect(leafBatches.length).toBeLessThanOrEqual(3);
    expect(leafBatches.every((candidate) => candidate.presentation?.castShadow === true)).toBe(true);
    expect(batch(frame.snapshot, 'batch:oak:soil').presentation?.receiveShadow).toBe(true);
  });
});
