import { describe, expect, it } from 'vitest';

import {
  OAK_PARAMETERS_V1,
  OAK_SECONDS_PER_HOUR_V1,
} from './oak-parameters.js';
import { stepOakPhysiologyV1 } from './oak-physiology.js';
import {
  createOakSimulationV1,
  oakHostTicksForBiologicalDaysV1,
} from './oak-simulation.js';
import { createInitialOakStateV1 } from './oak-state.js';
import { buildOakTissueVoxelProjectionV1 } from './oak-tissue-union-lattice.js';
import type { OakOrganSnapshotV1 } from './oak-types.js';

function structuralSignature(organs: readonly OakOrganSnapshotV1[]) {
  return organs.map((organ) => ({
    key: organ.key,
    identity: organ.identity,
    kind: organ.kind,
    parentKey: organ.parentKey,
    branchOrder: organ.branchOrder,
    lengthM: organ.lengthM,
    radiusM: organ.radiusM,
    targetLengthM: organ.targetLengthM,
    targetRadiusM: organ.targetRadiusM,
    ...(organ.kind === 'leaf' ? {
      areaM2: organ.areaM2,
      targetAreaM2: organ.targetAreaM2,
    } : {}),
    developmentFraction: organ.developmentFraction,
    developmentPhase: organ.developmentPhase,
    pools: organ.pools,
  }));
}

describe('oak post-primary carbon boundary', () => {
  it('freezes primary structure and names bounded post-primary carbon export', () => {
    const baseline = createOakSimulationV1();
    const noOverflow = createOakSimulationV1({
      ablation: 'no-post-primary-carbon-overflow',
    });
    const day90Ticks = oakHostTicksForBiologicalDaysV1(90);
    baseline.advanceHostTicks(day90Ticks);
    noOverflow.advanceHostTicks(day90Ticks);
    const baseline90 = baseline.snapshot();
    const noOverflow90 = noOverflow.snapshot();
    expect(baseline90.diagnostics.activeGrowthFrontCount).toBeGreaterThan(0);
    expect(baseline90.diagnostics.cumulativePostPrimaryCarbonOverflowKg).toBe(0);
    expect(noOverflow90.diagnostics.cumulativePostPrimaryCarbonOverflowKg).toBe(0);
    expect(structuralSignature(baseline90.organs)).toEqual(structuralSignature(noOverflow90.organs));
    const growthAt90 = baseline90.diagnostics.cumulativeGrowthCarbonKg;
    baseline.advanceHostTicks(oakHostTicksForBiologicalDaysV1(1));
    noOverflow.advanceHostTicks(oakHostTicksForBiologicalDaysV1(1));
    expect(baseline.snapshot().diagnostics.cumulativeGrowthCarbonKg).toBeGreaterThan(growthAt90);

    baseline.advanceHostTicks(oakHostTicksForBiologicalDaysV1(19));
    noOverflow.advanceHostTicks(oakHostTicksForBiologicalDaysV1(19));
    const baseline110 = baseline.snapshot();
    const noOverflow110 = noOverflow.snapshot();
    expect(baseline110.phenology).toBe('leaf-mature');
    expect(baseline110.diagnostics.flushCount).toBe(3);
    expect(baseline110.diagnostics.activeGrowthFrontCount).toBe(0);
    expect(structuralSignature(baseline110.organs)).toEqual(
      structuralSignature(noOverflow110.organs),
    );
    const frozen = structuralSignature(baseline110.organs);
    const frozenGrowthCarbonKg = baseline110.diagnostics.cumulativeGrowthCarbonKg;
    const topology110 = buildOakTissueVoxelProjectionV1(baseline.projection(), false);
    const sourceKeys110 = [...topology110.sourceAssignments.keys()];
    const materialKeys110 = [...topology110.materialCells.keys()];

    baseline.advanceHostTicks(oakHostTicksForBiologicalDaysV1(90));
    noOverflow.advanceHostTicks(oakHostTicksForBiologicalDaysV1(90));
    const baseline200 = baseline.snapshot();
    const noOverflow200 = noOverflow.snapshot();
    expect(baseline200.phenology).toBe('leaf-mature');
    expect(baseline200.diagnostics.activeGrowthFrontCount).toBe(0);
    expect(structuralSignature(baseline200.organs)).toEqual(frozen);
    expect(structuralSignature(noOverflow200.organs)).toEqual(frozen);
    expect(baseline200.diagnostics.cumulativeGrowthCarbonKg).toBe(frozenGrowthCarbonKg);
    expect(noOverflow200.diagnostics.cumulativeGrowthCarbonKg).toBe(frozenGrowthCarbonKg);
    const topology200 = buildOakTissueVoxelProjectionV1(baseline.projection(), false);
    expect([...topology200.sourceAssignments.keys()]).toEqual(sourceKeys110);
    expect([...topology200.materialCells.keys()]).toEqual(materialKeys110);

    const exported = baseline200.diagnostics.cumulativePostPrimaryCarbonOverflowKg;
    expect(exported).toBeGreaterThan(0);
    expect(noOverflow200.diagnostics.cumulativePostPrimaryCarbonOverflowKg).toBe(0);
    expect(baseline200.plantMobilePools.carbonKg)
      .toBeLessThanOrEqual(OAK_PARAMETERS_V1.physiology.postPrimaryMobileCarbonReserveKg
        + Number.EPSILON);
    expect(noOverflow200.plantMobilePools.carbonKg)
      .toBeGreaterThan(OAK_PARAMETERS_V1.physiology.postPrimaryMobileCarbonReserveKg);
    expect(baseline200.diagnostics.cumulativeAssimilationCarbonKg)
      .toBeCloseTo(noOverflow200.diagnostics.cumulativeAssimilationCarbonKg, 14);
    expect(baseline200.diagnostics.cumulativeRespirationCarbonKg)
      .toBeCloseTo(noOverflow200.diagnostics.cumulativeRespirationCarbonKg, 14);
    expect(
      baseline200.ledger.cumulativeSinks.carbonKg
        - noOverflow200.ledger.cumulativeSinks.carbonKg,
    ).toBeCloseTo(exported, 12);
    expect(
      noOverflow200.ledger.currentStorage.carbonKg
        - baseline200.ledger.currentStorage.carbonKg,
    ).toBeCloseTo(exported, 12);
    expect(Math.abs(baseline200.ledger.residual.carbonKg)).toBeLessThan(1e-12);
    expect(Math.abs(noOverflow200.ledger.residual.carbonKg)).toBeLessThan(1e-12);
  }, 120_000);

  it('waits for every funded primary sink and the completion latch', () => {
    const active = createInitialOakStateV1({
      seed: 31,
      timeScale: 1,
      paused: false,
      ablation: 'baseline',
      regime: {},
    }, 1);
    active.elapsedBiologicalSeconds = 12 * OAK_SECONDS_PER_HOUR_V1;
    active.phenology = 'leaf-mature';
    active.mobile = {
      ...active.mobile,
      carbonKg: OAK_PARAMETERS_V1.physiology.postPrimaryMobileCarbonReserveKg + 0.001,
    };
    active.organs[0]!.development!.fraction = 0.5;
    active.organs[0]!.development!.phase = 'cell-expansion';
    stepOakPhysiologyV1(active);
    expect(active.counters.postPrimaryCarbonOverflowKg).toBe(0);
    expect(active.mobile.carbonKg)
      .toBeGreaterThan(OAK_PARAMETERS_V1.physiology.postPrimaryMobileCarbonReserveKg);

    active.organs[0]!.development!.fraction = 1;
    active.organs[0]!.development!.phase = 'mature';
    active.mobile = {
      ...active.mobile,
      carbonKg: OAK_PARAMETERS_V1.physiology.postPrimaryMobileCarbonReserveKg + 0.001,
    };
    stepOakPhysiologyV1(active);
    expect(active.counters.postPrimaryCarbonOverflowKg).toBeGreaterThan(0);
    expect(active.mobile.carbonKg)
      .toBeLessThanOrEqual(OAK_PARAMETERS_V1.physiology.postPrimaryMobileCarbonReserveKg);

    const control = createInitialOakStateV1({
      seed: 31,
      timeScale: 1,
      paused: false,
      ablation: 'no-post-primary-carbon-overflow',
      regime: {},
    }, 1);
    control.elapsedBiologicalSeconds = 12 * OAK_SECONDS_PER_HOUR_V1;
    control.phenology = 'leaf-mature';
    control.mobile = {
      ...control.mobile,
      carbonKg: OAK_PARAMETERS_V1.physiology.postPrimaryMobileCarbonReserveKg + 0.001,
    };
    stepOakPhysiologyV1(control);
    expect(control.counters.postPrimaryCarbonOverflowKg).toBe(0);
    expect(control.mobile.carbonKg)
      .toBeGreaterThan(OAK_PARAMETERS_V1.physiology.postPrimaryMobileCarbonReserveKg);
  });
});
