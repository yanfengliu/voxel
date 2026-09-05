import { describe, expect, it } from 'vitest';

import { OAK_PARAMETERS_V1, OAK_SECONDS_PER_DAY_V1 } from './oak-parameters.js';
import { stepOakAllocationV1, stepOakPhenologyV1 } from './oak-growth.js';
import {
  createOakSimulationV1,
  oakHostTicksForBiologicalDaysV1,
} from './oak-simulation.js';
import { createInitialOakStateV1 } from './oak-state.js';
import type { OakLeafOrganSnapshotV1 } from './oak-types.js';

const options = {
  seed: 7,
  timeScale: OAK_SECONDS_PER_DAY_V1,
  paused: false,
  ablation: 'baseline' as const,
  regime: { water: 'ambient' as const, nitrogen: 'ambient' as const,
    phosphorus: 'ambient' as const },
};

describe('oak organ-scale primary development', () => {
  it('advances the same stable leaf front on consecutive default-speed frames', () => {
    expect(OAK_PARAMETERS_V1.growth.development.flushLeafMaturationDays
      + OAK_PARAMETERS_V1.growth.development.budSwellingDurationDays).toBe(28);
    const simulation = createOakSimulationV1();
    simulation.advanceHostTicks(oakHostTicksForBiologicalDaysV1(16));
    let leaf: ReturnType<typeof simulation.snapshot>['organs'][number] | undefined;
    for (let frame = 0; frame < oakHostTicksForBiologicalDaysV1(12); frame += 1) {
      leaf = simulation.advanceHostTicks(1).organs.find((organ) =>
        organ.kind === 'leaf' && organ.developmentPhase !== 'preformed');
      if (leaf) break;
    }
    expect(leaf).toBeDefined();
    const activeLeaf = leaf!;
    expect(activeLeaf.developmentFraction).toBeGreaterThan(0);
    expect(activeLeaf.developmentFraction).toBeLessThan(1);
    const fractions = [activeLeaf.developmentFraction];
    for (let frame = 0; frame < 12; frame += 1) {
      const next = simulation.advanceHostTicks(1).organs.find((organ) =>
        organ.key === activeLeaf.key)!;
      fractions.push(next.developmentFraction);
    }
    const increments = fractions.slice(1).map((fraction, index) =>
      fraction - fractions[index]!);
    expect(increments.every((increment) => increment > 0)).toBe(true);
    expect(Math.max(...increments)).toBeLessThan(0.01);
    expect(simulation.snapshot().diagnostics.activeGrowthFrontCount).toBeGreaterThan(0);
  });

  it('preserves integrated paid growth when accelerated playback crosses more steps', () => {
    const ordinary = createOakSimulationV1({ seed: 41 });
    const fastScale = OAK_SECONDS_PER_DAY_V1 * 10;
    const accelerated = createOakSimulationV1({ seed: 41, timeScale: fastScale });
    const ordinaryState = ordinary.advanceHostTicks(
      oakHostTicksForBiologicalDaysV1(25),
    );
    const acceleratedState = accelerated.advanceHostTicks(
      oakHostTicksForBiologicalDaysV1(25, fastScale),
    );
    expect(acceleratedState.elapsedBiologicalSeconds)
      .toBe(ordinaryState.elapsedBiologicalSeconds);
    expect(acceleratedState.diagnostics.cumulativeGrowthCarbonKg)
      .toBeCloseTo(ordinaryState.diagnostics.cumulativeGrowthCarbonKg, 14);
    expect(acceleratedState.organs.map((organ) => ({
      key: organ.key,
      developmentFraction: organ.developmentFraction,
      pools: organ.pools,
    }))).toEqual(ordinaryState.organs.map((organ) => ({
      key: organ.key,
      developmentFraction: organ.developmentFraction,
      pools: organ.pools,
    })));
  });

  it('keeps every current cohort bounded by paid organ carbon', () => {
    const state = createInitialOakStateV1(options, 1);
    state.elapsedBiologicalSeconds = 3 * OAK_SECONDS_PER_DAY_V1;
    stepOakPhenologyV1(state);
    for (let step = 1; step <= 6 * 96; step += 1) {
      state.elapsedBiologicalSeconds = 3 * OAK_SECONDS_PER_DAY_V1 + step * 900;
      stepOakAllocationV1(state);
    }
    const developing = state.organs.filter((organ) =>
      organ.development?.role !== 'seed' && organ.stage !== 'abscised');
    expect(developing.length).toBeGreaterThan(0);
    for (const organ of developing) {
      const cohorts = Object.values(organ.development!.cohorts);
      expect(cohorts.every((carbonKg) => carbonKg >= 0)).toBe(true);
      expect(cohorts.reduce((sum, carbonKg) => sum + carbonKg, 0))
        .toBeCloseTo(organ.structuralCarbonKg, 14);
      expect(organ.development!.fraction).toBeGreaterThanOrEqual(0);
      expect(organ.development!.fraction).toBeLessThanOrEqual(1);
    }
  });

  it('authors only a funded primordium at flush birth', () => {
    const simulation = createOakSimulationV1();
    simulation.advanceHostTicks(oakHostTicksForBiologicalDaysV1(12));
    let flushBirth: ReturnType<typeof simulation.snapshot> | undefined;
    let flushBirthDay = 0;
    for (let frame = 0; frame < oakHostTicksForBiologicalDaysV1(8); frame += 1) {
      const snapshot = simulation.advanceHostTicks(1);
      if (snapshot.organs.some((organ) => organ.kind === 'leaf')) {
        flushBirth = snapshot;
        flushBirthDay = snapshot.elapsedBiologicalSeconds / OAK_SECONDS_PER_DAY_V1;
        break;
      }
    }
    expect(flushBirth).toBeDefined();
    const leaves = flushBirth!.organs.filter((organ) => organ.kind === 'leaf');
    expect(flushBirthDay).toBe(14);
    expect(leaves).toHaveLength(3);
    expect(leaves.every((leaf) => leaf.developmentPhase === 'preformed')).toBe(true);
    expect(leaves.every((leaf) => leaf.developmentFraction
      === OAK_PARAMETERS_V1.growth.development.primordiumFraction)).toBe(true);
    expect(leaves.every((leaf) => leaf.areaM2 < leaf.targetAreaM2)).toBe(true);
    expect(leaves.every((leaf) => leaf.pools.carbonKg
      < OAK_PARAMETERS_V1.growth.leafCarbonKg)).toBe(true);
    expect(flushBirth!.diagnostics.leafCount).toBe(0);
    expect(flushBirth!.diagnostics.leafAreaM2).toBe(0);
  });

  it('exposes dependent emergence organs only after physical distal clearance', () => {
    for (const emergence of [
      { day: 3, kind: 'fine-root-cohort' as const, parentKind: 'coarse-root' as const },
      { day: 6, kind: 'bud' as const, parentKind: 'stem' as const },
    ]) {
      const simulation = createOakSimulationV1();
      const birth = simulation.advanceHostTicks(oakHostTicksForBiologicalDaysV1(emergence.day));
      const primordium = birth.organs.find((organ) => organ.kind === emergence.kind)!;
      expect(primordium.developmentPhase).toBe('preformed');
      const authority = {
        key: primordium.key,
        targetLengthM: primordium.targetLengthM,
        targetRadiusM: primordium.targetRadiusM,
        pools: primordium.pools,
      };
      let priorParentLengthM = 0;
      let exposed: ReturnType<typeof simulation.snapshot> | undefined;
      for (let frame = 0; frame < oakHostTicksForBiologicalDaysV1(6); frame += 1) {
        const snapshot = simulation.advanceHostTicks(1);
        const current = snapshot.organs.find((organ) => organ.key === authority.key)!;
        const parent = snapshot.organs.find((organ) => organ.key === current.parentKey)!;
        if (current.developmentPhase !== 'preformed') {
          exposed = snapshot;
          break;
        }
        expect({
          key: current.key,
          targetLengthM: current.targetLengthM,
          targetRadiusM: current.targetRadiusM,
          pools: current.pools,
        }).toEqual(authority);
        priorParentLengthM = parent.lengthM;
      }
      expect(exposed).toBeDefined();
      const current = exposed!.organs.find((organ) => organ.key === authority.key)!;
      const parent = exposed!.organs.find((organ) => organ.key === current.parentKey)!;
      expect(parent.kind).toBe(emergence.parentKind);
      const development = OAK_PARAMETERS_V1.growth.development;
      const clearanceM = Math.max(
        development.distalNodeExposureLengthM,
        parent.radiusM * development.distalNodeClearanceRadiusMultiple,
      );
      expect(priorParentLengthM).toBeLessThan(clearanceM);
      expect(parent.lengthM).toBeGreaterThanOrEqual(clearanceM);
      expect(current.developmentPhase).toBe('cell-division');
      expect(current.developmentFraction)
        .toBe(OAK_PARAMETERS_V1.growth.development.primordiumFraction);
      expect(current.positionM.x).toBeCloseTo(
        parent.positionM.x + parent.direction.x * parent.lengthM,
        14,
      );
      expect(current.positionM.y).toBeCloseTo(
        parent.positionM.y + parent.direction.y * parent.lengthM,
        14,
      );
      expect(current.positionM.z).toBeCloseTo(
        parent.positionM.z + parent.direction.z * parent.lengthM,
        14,
      );
      const next = simulation.advanceHostTicks(1).organs.find((organ) =>
        organ.key === authority.key)!;
      expect(next.developmentFraction - current.developmentFraction).toBeGreaterThan(0);
      expect(next.developmentFraction - current.developmentFraction).toBeLessThanOrEqual(
        OAK_PARAMETERS_V1.growth.development.maximumDevelopmentFractionPerAllocation * 2,
      );
    }
  });

  it('exposes a lateral leaf before its downstream axis clears the same node', () => {
    const simulation = createOakSimulationV1();
    simulation.advanceHostTicks(oakHostTicksForBiologicalDaysV1(16));
    let exposed: ReturnType<typeof simulation.snapshot> | undefined;
    for (let frame = 0; frame < oakHostTicksForBiologicalDaysV1(12); frame += 1) {
      const snapshot = simulation.advanceHostTicks(1);
      if (snapshot.organs.some((organ) => organ.kind === 'leaf'
        && organ.developmentPhase !== 'preformed')) {
        exposed = snapshot;
        break;
      }
    }
    expect(exposed).toBeDefined();
    const leaf = exposed!.organs.find((organ) => organ.kind === 'leaf'
      && organ.developmentPhase !== 'preformed')!;
    const parent = exposed!.organs.find((organ) => organ.key === leaf.parentKey)!;
    const downstream = exposed!.organs.find((organ) => organ.parentKey === parent.key
      && organ.kind === 'stem');
    const development = OAK_PARAMETERS_V1.growth.development;
    const lateralClearanceM = Math.max(
      development.lateralNodeExposureLengthM,
      parent.radiusM * development.lateralNodeClearanceRadiusMultiple,
    );
    const distalClearanceM = Math.max(
      development.distalNodeExposureLengthM,
      parent.radiusM * development.distalNodeClearanceRadiusMultiple,
    );
    expect(parent.lengthM).toBeGreaterThanOrEqual(lateralClearanceM);
    expect(parent.lengthM).toBeLessThan(distalClearanceM);
    expect(downstream?.developmentPhase).toBe('preformed');
    expect(exposed!.diagnostics.leafCount).toBeGreaterThan(0);
    const firstSegmentTargetCarbonKg = OAK_PARAMETERS_V1.growth.segmentCarbonKg
      * OAK_PARAMETERS_V1.growth.flushArchitecture.segmentCarbonFractions[0]!;
    expect(parent.pools.carbonKg / firstSegmentTargetCarbonKg)
      .toBeCloseTo(parent.developmentFraction ** 3, 14);
    expect(leaf.pools.carbonKg / OAK_PARAMETERS_V1.growth.leafCarbonKg)
      .toBeCloseTo(leaf.developmentFraction, 14);
  });

  it('retains falling leaf identity and pools until authoritative soil contact', () => {
    const simulation = createOakSimulationV1();
    const beforeDetachment = simulation.advanceHostTicks(
      oakHostTicksForBiologicalDaysV1(239.8),
    );
    const beforeLeaf = beforeDetachment.organs
      .filter((organ): organ is OakLeafOrganSnapshotV1 => organ.kind === 'leaf')
      .sort((left, right) => left.key.localeCompare(right.key))[0]!;
    const beforeParent = beforeDetachment.organs.find((organ) =>
      organ.key === beforeLeaf.parentKey)!;
    const detached = simulation.advanceHostTicks(oakHostTicksForBiologicalDaysV1(0.3));
    expect(detached.organs.filter((organ) => organ.kind === 'leaf')
      .map((organ) => organ.stage)).toContain('detached');
    expect(detached.diagnostics.leafCount).toBe(9);
    expect(detached.diagnostics.leafAreaM2).toBeGreaterThan(0);
    const leaf = detached.organs.find((organ): organ is OakLeafOrganSnapshotV1 =>
      organ.kind === 'leaf' && organ.key === beforeLeaf.key)!;
    const parent = detached.organs.find((organ) => organ.key === beforeParent.key)!;
    expect(leaf.developmentPhase).toBe('falling');
    expect(leaf.pools.carbonKg).toBeGreaterThan(0);
    const scar = leaf.abscissionScar;
    expect(scar).toBeDefined();
    expect(detached.organs.some((organ) => organ.key === scar!.parentKey)).toBe(true);
    expect(scar).not.toHaveProperty('pools');
    expect(leaf.pools.carbonKg).toBe(beforeLeaf.pools.carbonKg);
    expect(parent.pools).toEqual(beforeParent.pools);
    expect(beforeLeaf.pools.nitrogenKg - leaf.pools.nitrogenKg).toBeGreaterThan(0);
    expect(beforeLeaf.pools.phosphorusKg - leaf.pools.phosphorusKg).toBeGreaterThan(0);
    const middle = simulation.advanceHostTicks(oakHostTicksForBiologicalDaysV1(0.3))
      .organs.find((organ): organ is OakLeafOrganSnapshotV1 =>
        organ.kind === 'leaf' && organ.key === leaf.key)!;
    expect(middle.stage).toBe('detached');
    const centroidY = (organ: typeof leaf) =>
      organ.positionM.y + organ.direction.y * organ.lengthM * 0.5;
    expect(centroidY(middle)).toBeLessThan(centroidY(leaf));
    expect(middle.pools).toEqual(leaf.pools);
    const landed = simulation.advanceHostTicks(oakHostTicksForBiologicalDaysV1(
      OAK_PARAMETERS_V1.growth.development.leafFallDurationDays,
    ))
      .organs.find((organ): organ is OakLeafOrganSnapshotV1 =>
        organ.kind === 'leaf' && organ.key === leaf.key)!;
    expect(landed.stage).toBe('abscised');
    expect(Object.values(landed.pools).every((value) => value === 0)).toBe(true);
    expect(landed.abscissionScar).toEqual(scar);
    expect(Math.abs(simulation.snapshot().ledger.residual.carbonKg)).toBeLessThan(1e-12);
  });
});
