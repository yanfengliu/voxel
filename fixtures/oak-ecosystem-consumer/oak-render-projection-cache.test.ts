import { performance } from 'node:perf_hooks';
import { isDeepStrictEqual } from 'node:util';
import { describe, expect, it } from 'vitest';

import {
  buildOakRenderFrameV1,
  type OakRenderFrameV1,
} from './oak-render-adapter.js';
import {
  createOakSimulationV1,
  oakHostTicksForBiologicalDaysV1,
} from './oak-simulation.js';
import { OAK_TISSUE_VOXEL_PITCH_M_V1 } from './oak-tissue-voxel-projection.js';
import type { OakLeafOrganSnapshotV1, OakRenderProjectionStateV1 } from './oak-types.js';

function arrayEqual(left: ArrayLike<number>, right: ArrayLike<number>): boolean {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (!Object.is(left[index], right[index])) return false;
  }
  return true;
}

function recordMapsEqual(
  left: OakRenderFrameV1['projectionCache']['tissue']['records'],
  right: OakRenderFrameV1['projectionCache']['tissue']['records'],
): boolean {
  if (left.size !== right.size) return false;
  for (const [batchKey, leftRecords] of left) {
    const rightRecords = right.get(batchKey);
    if (rightRecords === undefined || leftRecords.length !== rightRecords.length) return false;
    for (let index = 0; index < leftRecords.length; index += 1) {
      const before = leftRecords[index]!;
      const after = rightRecords[index]!;
      if (before.key !== after.key || !arrayEqual(before.matrix, after.matrix)
        || before.color.r !== after.color.r || before.color.g !== after.color.g
        || before.color.b !== after.color.b || before.color.a !== after.color.a) return false;
    }
  }
  return true;
}

function batchesEqualByInstanceKey(left: OakRenderFrameV1, right: OakRenderFrameV1): boolean {
  if (left.snapshot.batches.length !== right.snapshot.batches.length) return false;
  for (const leftBatch of left.snapshot.batches) {
    const rightBatch = right.snapshot.batches.find(({ key }) => key === leftBatch.key);
    if (rightBatch === undefined || leftBatch.instanceKeys.length !== rightBatch.instanceKeys.length
      || leftBatch.geometryKey !== rightBatch.geometryKey
      || leftBatch.materialKey !== rightBatch.materialKey) return false;
    const rightSlots = new Map(rightBatch.instanceKeys.map((key, index) => [key, index]));
    for (let leftIndex = 0; leftIndex < leftBatch.instanceKeys.length; leftIndex += 1) {
      const rightIndex = rightSlots.get(leftBatch.instanceKeys[leftIndex]!);
      if (rightIndex === undefined) return false;
      if (!arrayEqual(
        leftBatch.matrices.subarray(leftIndex * 16, leftIndex * 16 + 16),
        rightBatch.matrices.subarray(rightIndex * 16, rightIndex * 16 + 16),
      )) return false;
      if (leftBatch.colors !== undefined && rightBatch.colors !== undefined && !arrayEqual(
        leftBatch.colors.subarray(leftIndex * 4, leftIndex * 4 + 4),
        rightBatch.colors.subarray(rightIndex * 4, rightIndex * 4 + 4),
      )) return false;
    }
  }
  return true;
}

function exactProjectionContentEqual(left: OakRenderFrameV1, right: OakRenderFrameV1): boolean {
  const leftTissue = left.projectionCache.tissue;
  const rightTissue = right.projectionCache.tissue;
  return recordMapsEqual(leftTissue.records, rightTissue.records)
    && isDeepStrictEqual(leftTissue.organMetrics, rightTissue.organMetrics)
    && isDeepStrictEqual([...leftTissue.materialCells], [...rightTissue.materialCells])
    && isDeepStrictEqual([...leftTissue.sourceAssignments], [...rightTissue.sourceAssignments])
    && isDeepStrictEqual(leftTissue.ports, rightTissue.ports)
    && isDeepStrictEqual(
      { ...leftTissue, records: null, materialCells: null, sourceAssignments: null, ports: null },
      { ...rightTissue, records: null, materialCells: null, sourceAssignments: null, ports: null },
    )
    && isDeepStrictEqual(left.projectionCache.soil.contactVoxels,
      right.projectionCache.soil.contactVoxels)
    && isDeepStrictEqual(left.projectionCache.soil.metrics, right.projectionCache.soil.metrics)
    && isDeepStrictEqual(left.projectionCache.litter, right.projectionCache.litter)
    && isDeepStrictEqual(left.snapshot.resources, right.snapshot.resources)
    && isDeepStrictEqual(left.metrics, right.metrics)
    && arrayEqual(left.snapshot.chunks[0]!.voxels, right.snapshot.chunks[0]!.voxels)
    && batchesEqualByInstanceKey(left, right);
}

function replaceLeaf(
  state: OakRenderProjectionStateV1,
  change: (leaf: OakLeafOrganSnapshotV1) => OakLeafOrganSnapshotV1,
): OakRenderProjectionStateV1 {
  let changed = false;
  return {
    ...state,
    revision: state.revision + 1,
    organs: state.organs.map((organ) => {
      if (changed || organ.kind !== 'leaf') return organ;
      changed = true;
      return change(organ);
    }),
  };
}

describe('oak render projection cache', () => {
  it('is bit-exact with a cold rebuild across 60 consecutive live day-100 ticks', () => {
    const simulation = createOakSimulationV1();
    simulation.advanceHostTicks(oakHostTicksForBiologicalDaysV1(100));
    let cached = buildOakRenderFrameV1(simulation.projection(), { renderRevision: 1_000 });
    let topologyHits = 0;
    let completeTissueHits = 0;

    for (let tick = 0; tick < 60; tick += 1) {
      simulation.advanceHostTicks(1);
      const state = simulation.projection();
      const renderRevision = 1_001 + tick;
      cached = buildOakRenderFrameV1(state, {
        renderRevision,
        previousFrame: cached,
      });
      const cold = buildOakRenderFrameV1(state, { renderRevision });
      topologyHits += Number(cached.projectionCacheHits.tissueTopology);
      completeTissueHits += Number(cached.projectionCacheHits.tissue);
      expect(exactProjectionContentEqual(cached, cold)).toBe(true);
    }

    expect(topologyHits).toBe(60);
    expect(completeTissueHits).toBeGreaterThanOrEqual(45);
  }, 120_000);

  it('refreshes appearance on stable topology and rebuilds after a topology mutation', () => {
    const simulation = createOakSimulationV1();
    simulation.advanceHostTicks(oakHostTicksForBiologicalDaysV1(100));
    const state = simulation.projection();
    const before = buildOakRenderFrameV1(state, { renderRevision: 2_000 });
    const recoloredState = replaceLeaf(state, (leaf) => ({
      ...leaf,
      stage: 'senescing',
      chlorophyllFraction: 0.2,
      relativeWaterContentFraction: 0.55,
      stressFraction: 0.65,
    }));
    const recolored = buildOakRenderFrameV1(recoloredState, {
      renderRevision: 2_001,
      previousFrame: before,
    });
    const recoloredCold = buildOakRenderFrameV1(recoloredState, { renderRevision: 2_001 });
    expect(recolored.projectionCacheHits).toMatchObject({
      tissue: false,
      tissueTopology: true,
    });
    expect(exactProjectionContentEqual(recolored, recoloredCold)).toBe(true);

    const reshapedState = replaceLeaf(recoloredState, (leaf) => ({
      ...leaf,
      rollRadians: leaf.rollRadians + 0.125,
    }));
    const reshaped = buildOakRenderFrameV1(reshapedState, {
      renderRevision: 2_002,
      previousFrame: recolored,
    });
    const reshapedCold = buildOakRenderFrameV1(reshapedState, { renderRevision: 2_002 });
    expect(reshaped.projectionCacheHits.tissueTopology).toBe(false);
    expect(exactProjectionContentEqual(reshaped, reshapedCold)).toBe(true);

    const hiddenRootState: OakRenderProjectionStateV1 = {
      ...recoloredState,
      revision: recoloredState.revision + 1,
      organs: recoloredState.organs.map((organ) =>
        organ.kind === 'coarse-root' || organ.kind === 'fine-root-cohort'
          ? { ...organ, radiusM: organ.radiusM * 1.01 }
          : organ),
    };
    const hiddenRootChanged = buildOakRenderFrameV1(hiddenRootState, {
      renderRevision: 2_003,
      previousFrame: recolored,
    });
    expect(hiddenRootChanged.metrics.rootVoxels).toBe(0);
    expect(hiddenRootChanged.projectionCacheHits.tissueTopology).toBe(false);

    const reorderedState: OakRenderProjectionStateV1 = {
      ...state,
      revision: state.revision + 1,
      organs: [...state.organs].reverse(),
    };
    const reordered = buildOakRenderFrameV1(reorderedState, {
      renderRevision: 2_004,
      previousFrame: before,
    });
    const reorderedCold = buildOakRenderFrameV1(reorderedState, { renderRevision: 2_004 });
    expect(reordered.projectionCacheHits.tissueTopology).toBe(false);
    expect(exactProjectionContentEqual(reordered, reorderedCold)).toBe(true);
  }, 120_000);

  it('invalidates soil and litter for a new living blocker on the soil surface', () => {
    const simulation = createOakSimulationV1();
    simulation.advanceHostTicks(oakHostTicksForBiologicalDaysV1(240));
    const state = simulation.projection();
    const before = buildOakRenderFrameV1(state, { renderRevision: 2_050 });
    const template = state.organs.find((organ) => organ.kind !== 'leaf');
    if (template === undefined) throw new Error('Oak surface-blocker control needs a structural organ.');
    const pitch = OAK_TISSUE_VOXEL_PITCH_M_V1;
    const changed: OakRenderProjectionStateV1 = {
      ...state,
      revision: state.revision + 1,
      organs: [...state.organs, {
        ...template,
        key: 'organ:999:1',
        identity: { localId: 999, generation: 1 },
        kind: 'bud',
        parentKey: null,
        positionM: { x: 60.5 * pitch, y: 0.5 * pitch, z: 60.5 * pitch },
        direction: { x: 0, y: 1, z: 0 },
        lengthM: 2 * pitch,
        radiusM: 0.45 * pitch,
        stage: 'mature',
        healthFraction: 1,
        stressFraction: 0,
      }],
    };
    const cached = buildOakRenderFrameV1(changed, {
      renderRevision: 2_051,
      previousFrame: before,
    });
    const cold = buildOakRenderFrameV1(changed, { renderRevision: 2_051 });
    expect(cached.projectionCacheHits).toMatchObject({
      tissueTopology: false,
      soil: false,
      litter: false,
    });
    expect(exactProjectionContentEqual(cached, cold)).toBe(true);
  }, 120_000);

  it('does not collapse signed zero in a topology cache key', () => {
    const simulation = createOakSimulationV1();
    const state = simulation.projection();
    const before = buildOakRenderFrameV1(state, { renderRevision: 2_100 });
    const changed: OakRenderProjectionStateV1 = {
      ...state,
      revision: state.revision + 1,
      organs: state.organs.map((organ, index) => index === 0
        ? { ...organ, positionM: { ...organ.positionM, x: -0 } }
        : organ),
    };
    expect(Object.is(state.organs[0]!.positionM.x, 0)).toBe(true);
    expect(Object.is(changed.organs[0]!.positionM.x, -0)).toBe(true);
    const after = buildOakRenderFrameV1(changed, {
      renderRevision: 2_101,
      previousFrame: before,
    });
    expect(after.projectionCacheHits.tissueTopology).toBe(false);
  });

  it('reports live frame construction while deterministic cache-work gates carry the verdict', () => {
    const simulation = createOakSimulationV1();
    simulation.advanceHostTicks(oakHostTicksForBiologicalDaysV1(100));
    let previous = buildOakRenderFrameV1(simulation.projection(), { renderRevision: 3_000 });
    for (let warmup = 0; warmup < 12; warmup += 1) {
      simulation.advanceHostTicks(1);
      previous = buildOakRenderFrameV1(simulation.projection(), {
        renderRevision: 3_001 + warmup,
        previousFrame: previous,
      });
    }

    const samples: number[] = [];
    let topologyHits = 0;
    for (let tick = 0; tick < 60; tick += 1) {
      const started = performance.now();
      simulation.advanceHostTicks(1);
      previous = buildOakRenderFrameV1(simulation.projection(), {
        renderRevision: 3_013 + tick,
        previousFrame: previous,
      });
      samples.push(performance.now() - started);
      topologyHits += Number(previous.projectionCacheHits.tissueTopology);
    }
    samples.sort((left, right) => left - right);
    const p50 = samples[29]!;
    const p95 = samples[56]!;
    const p99 = samples[59]!;
    console.log(
      `oak day-100 live host tick + voxel frame: p50 ${p50.toFixed(2)} ms, `
      + `p95 ${p95.toFixed(2)} ms, p99 ${p99.toFixed(2)} ms `
      + '(observational only; 100 ms pathology ceiling, rendering excluded)',
    );

    expect(topologyHits).toBe(60);
    expect(p50).toBeLessThan(100);
    expect(p95).toBeLessThan(100);
  }, 120_000);
});
