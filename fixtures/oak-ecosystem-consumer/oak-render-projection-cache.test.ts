import { isDeepStrictEqual } from 'node:util';
import { describe, expect, it } from 'vitest';

import {
  buildOakRenderFrameV1,
  type OakRenderFrameV1,
} from './oak-render-adapter.js';
import {
  oakArraysEqualForRenderCacheTestV1,
  oakExactProjectionContentEqualForTestV1,
} from './oak-render-projection-cache-test-support.js';
import {
  createOakSimulationV1,
  oakHostTicksForBiologicalDaysV1,
} from './oak-simulation.js';
import { oakSoilSurfaceAtFineCellV1 } from './oak-soil-surface.js';
import {
  oakTissueVoxelBaseColorV1,
  oakTissueVoxelCohortColorV1,
} from './oak-tissue-color.js';
import {
  buildOakTissueVoxelSourceProjectionV1,
  OAK_TISSUE_VOXEL_PITCH_M_V1,
} from './oak-tissue-voxel-projection.js';
import type { OakLeafOrganSnapshotV1, OakRenderProjectionStateV1 } from './oak-types.js';

function sourceUnionInputs(state: OakRenderProjectionStateV1): readonly (readonly unknown[])[] {
  const source = buildOakTissueVoxelSourceProjectionV1(state, false);
  return [...source.records.values()].flatMap((records) => records.map((record) => [
    record.key,
    record.matrix[12], record.matrix[13], record.matrix[14],
  ]));
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
    let state = simulation.projection();
    let cached = buildOakRenderFrameV1(state, { renderRevision: 1_000 });
    let previousSourceUnionInputs = sourceUnionInputs(state);
    let previousSourceKeys = previousSourceUnionInputs.map(([key]) => key);
    let stableSourceKeyTicks = 0;
    let stableSourceInputTicks = 0;
    let topologyHits = 0;
    let completeTissueHits = 0;

    for (let tick = 0; tick < 60; tick += 1) {
      simulation.advanceHostTicks(1);
      state = simulation.projection();
      const renderRevision = 1_001 + tick;
      cached = buildOakRenderFrameV1(state, {
        renderRevision,
        previousFrame: cached,
      });
      const cold = buildOakRenderFrameV1(state, { renderRevision });
      topologyHits += Number(cached.projectionCacheHits.tissueTopology);
      completeTissueHits += Number(cached.projectionCacheHits.tissue);
      const nextSourceUnionInputs = sourceUnionInputs(state);
      const nextSourceKeys = nextSourceUnionInputs.map(([key]) => key);
      stableSourceKeyTicks += Number(isDeepStrictEqual(previousSourceKeys, nextSourceKeys));
      stableSourceInputTicks += Number(isDeepStrictEqual(
        previousSourceUnionInputs,
        nextSourceUnionInputs,
      ));
      previousSourceKeys = nextSourceKeys;
      previousSourceUnionInputs = nextSourceUnionInputs;
      expect(oakExactProjectionContentEqualForTestV1(cached, cold)).toBe(true);
    }

    // Source routing consumes exact world centres. Moving attachments change
    // Those inputs move on active-growth ticks. Stable membership does occur,
    // but exact source centres still prevent an unsound topology reuse.
    expect(stableSourceKeyTicks).toBeGreaterThan(0);
    expect(stableSourceKeyTicks).toBeLessThan(60);
    expect(stableSourceInputTicks).toBe(0);
    expect(topologyHits).toBe(0);
    expect(completeTissueHits).toBe(0);
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
    expect(oakExactProjectionContentEqualForTestV1(recolored, recoloredCold)).toBe(true);

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
    expect(reshaped.projectionCacheHits).toMatchObject({ soil: true, litter: true });
    // Attached leaves are rigid organ-local voxel bodies rather than inputs to
    // the structural allocator. Rolling a leaf must therefore rebuild its
    // presented body while leaving the authoritative wood union unchanged.
    expect(isDeepStrictEqual(
      [...recolored.projectionCache.tissue.materialCells],
      [...reshaped.projectionCache.tissue.materialCells],
    )).toBe(true);
    expect(isDeepStrictEqual(
      recolored.projectionCache.tissue.attachedLeafBodies,
      reshaped.projectionCache.tissue.attachedLeafBodies,
    )).toBe(false);
    expect(oakExactProjectionContentEqualForTestV1(reshaped, reshapedCold)).toBe(true);

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
    expect(hiddenRootChanged.projectionCacheHits.tissueTopology).toBe(true);

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
    expect(oakExactProjectionContentEqualForTestV1(reordered, reorderedCold)).toBe(true);
  }, 120_000);

  it('invalidates a cohort-color input even when the rounded organ base color is unchanged', () => {
    const simulation = createOakSimulationV1();
    simulation.advanceHostTicks(oakHostTicksForBiologicalDaysV1(100));
    const state = simulation.projection();
    const stemIndex = state.organs.findIndex((organ) => organ.kind === 'stem');
    if (stemIndex < 0) throw new Error('Cohort-color cache control requires one stem.');
    const withStress = (stressFraction: number): OakRenderProjectionStateV1 => ({
      ...state,
      revision: state.revision + Math.round(stressFraction * 10_000),
      organs: state.organs.map((organ, index) => index === stemIndex
        ? { ...organ, stressFraction }
        : organ),
    });
    const low = withStress(0.0015);
    const high = withStress(0.002);
    const lowStem = low.organs[stemIndex]!;
    const highStem = high.organs[stemIndex]!;
    expect(oakTissueVoxelBaseColorV1(lowStem)).toEqual(oakTissueVoxelBaseColorV1(highStem));
    expect(oakTissueVoxelCohortColorV1(lowStem, 3, 0, 2))
      .not.toEqual(oakTissueVoxelCohortColorV1(highStem, 3, 0, 2));
    const before = buildOakRenderFrameV1(low, { renderRevision: 2_010 });
    const cached = buildOakRenderFrameV1(high, {
      renderRevision: 2_011,
      previousFrame: before,
    });
    const cold = buildOakRenderFrameV1(high, { renderRevision: 2_011 });
    expect(cached.projectionCacheHits).toMatchObject({
      tissueTopology: true,
      tissue: false,
    });
    expect(oakExactProjectionContentEqualForTestV1(cached, cold)).toBe(true);
  });

  it('invalidates every mature-template and development-front input independently', () => {
    const simulation = createOakSimulationV1();
    simulation.advanceHostTicks(oakHostTicksForBiologicalDaysV1(40));
    const state = simulation.projection();
    const before = buildOakRenderFrameV1(state, { renderRevision: 2_020 });
    const leafIndex = state.organs.findIndex((organ) => organ.kind === 'leaf');
    const structuralIndex = state.organs.findIndex((organ) => organ.kind !== 'leaf');
    expect(leafIndex).toBeGreaterThanOrEqual(0);
    expect(structuralIndex).toBeGreaterThanOrEqual(0);

    const controls: readonly OakRenderProjectionStateV1[] = [
      {
        ...state,
        revision: state.revision + 1,
        organs: state.organs.map((organ, index) => index === leafIndex
          ? { ...organ, targetLengthM: organ.targetLengthM * 1.02 }
          : organ),
      },
      {
        ...state,
        revision: state.revision + 2,
        organs: state.organs.map((organ, index) => index === structuralIndex
          ? { ...organ, targetRadiusM: organ.targetRadiusM * 1.02 }
          : organ),
      },
      {
        ...state,
        revision: state.revision + 3,
        organs: state.organs.map((organ, index) => index === leafIndex
          ? { ...organ, developmentFraction: Math.max(0, organ.developmentFraction - 0.01) }
          : organ),
      },
      replaceLeaf(state, (leaf) => ({
        ...leaf,
        targetAreaM2: leaf.targetAreaM2 * 1.02,
      })),
    ];

    controls.forEach((changed, index) => {
      const renderRevision = 2_021 + index;
      const cached = buildOakRenderFrameV1(changed, {
        renderRevision,
        previousFrame: before,
      });
      const cold = buildOakRenderFrameV1(changed, { renderRevision });
      expect(cached.projectionCacheHits.tissueTopology, String(index)).toBe(false);
      expect(oakExactProjectionContentEqualForTestV1(cached, cold), String(index)).toBe(true);
    });
  }, 120_000);

  it('keeps conservative misses for surface and embedded soil tissue', () => {
    const simulation = createOakSimulationV1();
    simulation.advanceHostTicks(oakHostTicksForBiologicalDaysV1(240));
    const state = simulation.projection();
    const before = buildOakRenderFrameV1(state, { renderRevision: 2_050 });
    const template = state.organs.find((organ) => organ.kind !== 'leaf');
    if (template === undefined) throw new Error('Oak surface-blocker control needs a structural organ.');
    const pitch = OAK_TISSUE_VOXEL_PITCH_M_V1;
    const blockerCell = [60, 60] as const;
    const surface = oakSoilSurfaceAtFineCellV1(...blockerCell);
    if (surface === null) throw new Error('Oak surface-blocker control needs retained terrain.');
    const changed: OakRenderProjectionStateV1 = {
      ...state,
      revision: state.revision + 1,
      organs: [...state.organs, {
        ...template,
        key: 'organ:999:1',
        identity: { localId: 999, generation: 1 },
        kind: 'bud',
        parentKey: null,
        positionM: {
          x: (blockerCell[0] + 0.5) * pitch,
          y: surface.topM + 0.5 * pitch,
          z: (blockerCell[1] + 0.5) * pitch,
        },
        direction: { x: 0, y: 1, z: 0 },
        lengthM: 2 * pitch,
        radiusM: 0.45 * pitch,
        targetLengthM: 2 * pitch,
        targetRadiusM: 0.45 * pitch,
        stage: 'mature',
        developmentPhase: 'mature',
        developmentFraction: 1,
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
      litter: true,
    });
    expect(oakExactProjectionContentEqualForTestV1(cached, cold)).toBe(true);

    const embedded: OakRenderProjectionStateV1 = {
      ...state,
      revision: state.revision + 2,
      organs: [...state.organs, {
        ...template,
        key: 'organ:998:1',
        identity: { localId: 998, generation: 1 },
        kind: 'bud',
        parentKey: null,
        positionM: {
          x: (blockerCell[0] + 0.5) * pitch,
          y: surface.topM - 0.5 * pitch,
          z: (blockerCell[1] + 0.5) * pitch,
        },
        direction: { x: 0, y: -1, z: 0 },
        lengthM: 2 * pitch,
        radiusM: 0.45 * pitch,
        targetLengthM: 2 * pitch,
        targetRadiusM: 0.45 * pitch,
        stage: 'mature',
        developmentPhase: 'mature',
        developmentFraction: 1,
        healthFraction: 1,
        stressFraction: 0,
      }],
    };
    const embeddedCached = buildOakRenderFrameV1(embedded, {
      renderRevision: 2_052,
      previousFrame: before,
    });
    const embeddedCold = buildOakRenderFrameV1(embedded, { renderRevision: 2_052 });
    expect(embeddedCached.projectionCacheHits).toMatchObject({
      tissueTopology: false,
      soil: false,
      litter: true,
    });
    expect(oakArraysEqualForRenderCacheTestV1(
      before.snapshot.chunks[0]!.voxels,
      embeddedCold.snapshot.chunks[0]!.voxels,
    )).toBe(false);
    expect(oakExactProjectionContentEqualForTestV1(embeddedCached, embeddedCold)).toBe(true);
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

  it('rejects caller mutation of cached attached-leaf records before a tissue hit can trust it', () => {
    const simulation = createOakSimulationV1();
    simulation.advanceHostTicks(oakHostTicksForBiologicalDaysV1(100));
    const state = simulation.projection();
    const before = buildOakRenderFrameV1(state, { renderRevision: 2_150 });
    const body = before.projectionCache.tissue.attachedLeafBodies[0]!;
    const matrix = body.records[0]!.matrix as number[];
    expect(() => {
      matrix[12] = matrix[12]! + 0.125;
    }).toThrow(/read only|read-only|frozen/u);
    expect(() => {
      (before.projectionCache.tissue as unknown as { tissueVoxelCount: number })
        .tissueVoxelCount = 0;
    }).toThrow(/read only|read-only|frozen/u);
    expect(() => {
      (before.projectionCache.tissue.materialCells as Map<number, unknown>).clear();
    }).toThrow(/read-only producer artifacts/u);

    const cached = buildOakRenderFrameV1(state, {
      renderRevision: 2_151,
      previousFrame: before,
    });
    const cold = buildOakRenderFrameV1(state, { renderRevision: 2_151 });
    expect(cached.projectionCacheHits.tissue).toBe(true);
    expect(oakExactProjectionContentEqualForTestV1(cached, cold)).toBe(true);
  });

  it('invalidates every abscised-leaf input consumed by rigid litter projection', () => {
    const simulation = createOakSimulationV1();
    simulation.advanceHostTicks(oakHostTicksForBiologicalDaysV1(249));
    const state = simulation.projection();
    const before = buildOakRenderFrameV1(state, { renderRevision: 2_200 });
    const controls = [
      (leaf: OakLeafOrganSnapshotV1) => ({ ...leaf, areaM2: leaf.areaM2 * 0.5 }),
      (leaf: OakLeafOrganSnapshotV1) => ({
        ...leaf, targetLengthM: leaf.targetLengthM * 0.98,
      }),
      (leaf: OakLeafOrganSnapshotV1) => ({
        ...leaf, targetAreaM2: leaf.targetAreaM2 * 0.98,
      }),
      (leaf: OakLeafOrganSnapshotV1) => ({
        ...leaf, developmentFraction: leaf.developmentFraction * 0.98,
      }),
      (leaf: OakLeafOrganSnapshotV1) => ({ ...leaf, healthFraction: 0.5 }),
      (leaf: OakLeafOrganSnapshotV1) => ({ ...leaf, rollRadians: leaf.rollRadians + 0.1 }),
      (leaf: OakLeafOrganSnapshotV1) => ({ ...leaf, chlorophyllFraction: 0.2 }),
      (leaf: OakLeafOrganSnapshotV1) => ({
        ...leaf, litterRecipientSoilCellKey: 'soil:cache-control',
      }),
    ] as const;
    controls.forEach((change, index) => {
      const changed = replaceLeaf(state, change);
      const renderRevision = 2_201 + index;
      const cached = buildOakRenderFrameV1(changed, {
        renderRevision,
        previousFrame: before,
      });
      const cold = buildOakRenderFrameV1(changed, { renderRevision });
      expect(cached.projectionCacheHits.litter, String(index)).toBe(false);
      expect(oakExactProjectionContentEqualForTestV1(cached, cold), String(index)).toBe(true);
    });

    const absentBody = replaceLeaf(state, (leaf) => ({ ...leaf, healthFraction: 0 }));
    const buildCachedAbsentBody = (): OakRenderFrameV1 => buildOakRenderFrameV1(absentBody, {
      renderRevision: 2_250,
      previousFrame: before,
    });
    const buildColdAbsentBody = (): OakRenderFrameV1 => buildOakRenderFrameV1(absentBody, {
      renderRevision: 2_250,
    });
    let cachedError = '';
    let coldError = '';
    try {
      buildCachedAbsentBody();
    } catch (error) {
      cachedError = error instanceof Error ? error.message : String(error);
    }
    try {
      buildColdAbsentBody();
    } catch (error) {
      coldError = error instanceof Error ? error.message : String(error);
    }
    expect(cachedError).toMatch(/no basal petiole source/u);
    expect(cachedError).toBe(coldError);
  }, 120_000);

});
