import { describe, expect, it } from 'vitest';

import {
  isOakDimensionedWoodKindV1,
  oakAllometricWoodRadiusMForOrganV1,
  oakWoodMassVolumeDiagnosticV1,
} from './oak-allometry.js';
import {
  createOakSimulationV1,
  oakHostTicksForBiologicalDaysV1,
} from './oak-simulation.js';
import { OAK_PHYSICAL_WOOD_TIP_RADIUS_RATIO_V1 } from './oak-physical-wood.js';

describe('oak dimensioned-wood allometry', () => {
  it('exposes the old undersized branch as a real counter-control', () => {
    const oldAuthoredBranch = {
      kind: 'branch' as const,
      lengthM: 0.045,
      radiusM: 0.0015,
      structuralCarbonKg: 0.00016,
      waterLiters: 0.00025,
    };
    const mismatch = oakWoodMassVolumeDiagnosticV1(oldAuthoredBranch)!;
    expect(mismatch.ownedToGeometryMassRatio).toBeGreaterThan(2.65);
    expect(mismatch.ownedToGeometryMassRatio).toBeLessThan(11.07);
    const corrected = oakWoodMassVolumeDiagnosticV1({
      ...oldAuthoredBranch,
      radiusM: oakAllometricWoodRadiusMForOrganV1(oldAuthoredBranch)!,
    })!;
    expect(corrected.ownedToGeometryMassRatio).toBeCloseTo(1, 14);
  });

  it('matches dimensioned wood across age and seed without ledger drift', () => {
    const scenarios = [
      { day: 13, seed: 0x51a7_0a4b },
      { day: 90, seed: 0x51a7_0a4b },
      { day: 100, seed: 0x51a7_0a4b },
      { day: 250, seed: 0x51a7_0a4b },
      { day: 100, seed: 91 },
    ] as const;
    const snapshots = scenarios.map(({ day, seed }) => {
      const controller = createOakSimulationV1({ seed });
      const snapshot = controller.advanceHostTicks(
        oakHostTicksForBiologicalDaysV1(day),
      );
      expect(snapshot.diagnostics.minimumWoodOwnedToGeometryMassRatio)
        .toBeCloseTo(1, 12);
      expect(snapshot.diagnostics.maximumWoodOwnedToGeometryMassRatio)
        .toBeCloseTo(1, 12);
      for (const [resource, residual] of Object.entries(snapshot.ledger.residual)) {
        expect(Math.abs(residual), `${String(day)}d ${resource}`)
          .toBeLessThan(1e-12);
      }
      return snapshot;
    });
    const snapshot = snapshots[2]!;
    const activeWood = snapshot.organs.filter((organ) =>
      organ.stage !== 'abscised' && isOakDimensionedWoodKindV1(organ.kind));
    expect(new Set(activeWood.map((organ) => organ.kind))).toEqual(new Set([
      'stem',
      'branch',
      'coarse-root',
    ]));
    expect(activeWood.length).toBeGreaterThan(3);
  });

  it('keeps every physical shaft mass-derived and completed shafts at target radius', () => {
    const simulation = createOakSimulationV1();
    const snapshot = simulation.advanceHostTicks(oakHostTicksForBiologicalDaysV1(100));
    const activeWood = snapshot.organs.filter((organ) =>
      organ.stage !== 'abscised' && isOakDimensionedWoodKindV1(organ.kind));
    expect(activeWood.length).toBeGreaterThan(3);
    for (const organ of activeWood) {
      if (organ.developmentFraction === 1) {
        expect(organ.radiusM, organ.key).toBeCloseTo(organ.targetRadiusM, 14);
      }
      expect(oakWoodMassVolumeDiagnosticV1({
        kind: organ.kind,
        lengthM: organ.lengthM,
        radiusM: organ.radiusM,
        structuralCarbonKg: organ.pools.carbonKg,
        waterLiters: organ.pools.waterLiters,
      })!.ownedToGeometryMassRatio, organ.key).toBeCloseTo(1, 12);
    }
  });

  it('keeps every emerged wood child inside its parent terminal section', () => {
    const simulation = createOakSimulationV1();
    let currentDay = 0;
    let oldTaperWouldLeaveAnOutwardStep = false;
    for (const day of [3, 6, 14, 20, 42, 54, 82, 100, 110]) {
      simulation.advanceHostTicks(oakHostTicksForBiologicalDaysV1(day - currentDay));
      currentDay = day;
      const snapshot = simulation.snapshot();
      const byKey = new Map(snapshot.organs.map((organ) => [organ.key, organ]));
      for (const child of snapshot.organs.filter((organ) =>
        organ.stage !== 'abscised' && isOakDimensionedWoodKindV1(organ.kind))) {
        const parent = child.parentKey === null ? undefined : byKey.get(child.parentKey);
        if (parent === undefined || !isOakDimensionedWoodKindV1(parent.kind)) continue;
        const parentTerminalRadiusM = parent.radiusM
          * OAK_PHYSICAL_WOOD_TIP_RADIUS_RATIO_V1;
        expect(child.radiusM, `${String(day)}d ${parent.key} -> ${child.key}`)
          .toBeLessThanOrEqual(parentTerminalRadiusM + Number.EPSILON);
        oldTaperWouldLeaveAnOutwardStep ||= child.radiusM > parent.radiusM * 0.72;
      }
    }
    expect(OAK_PHYSICAL_WOOD_TIP_RADIUS_RATIO_V1).toBe(1);
    expect(oldTaperWouldLeaveAnOutwardStep).toBe(true);
  });

  it('excludes aggregate fine roots and non-wood buds from wood allometry', () => {
    const excluded = ['fine-root-cohort', 'bud'] as const;
    for (const kind of excluded) {
      expect(isOakDimensionedWoodKindV1(kind)).toBe(false);
      expect(oakWoodMassVolumeDiagnosticV1({
        kind,
        lengthM: 0.05,
        radiusM: 0.001,
        structuralCarbonKg: 0.0001,
        waterLiters: 0.0002,
      })).toBeNull();
    }
  });
});
