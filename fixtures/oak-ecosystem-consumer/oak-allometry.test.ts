import { describe, expect, it } from 'vitest';

import {
  isOakDimensionedWoodKindV1,
  oakAllometricWoodRadiusMForOrganV1,
  oakWoodMassVolumeDiagnosticV1,
} from './oak-allometry.js';
import { buildOakContinuousAnalysisSnapshotV1 } from './oak-continuous-render-analysis.js';
import {
  createOakSimulationV1,
  oakHostTicksForBiologicalDaysV1,
} from './oak-simulation.js';
import { OAK_PARAMETERS_V1 } from './oak-parameters.js';
import { oakWoodUnitCrossSectionAreaM2V1 } from './oak-wood-shape.js';

interface Point3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

function transformPoint(matrix: ArrayLike<number>, point: Point3): Point3 {
  return {
    x: matrix[0]! * point.x + matrix[4]! * point.y
      + matrix[8]! * point.z + matrix[12]!,
    y: matrix[1]! * point.x + matrix[5]! * point.y
      + matrix[9]! * point.z + matrix[13]!,
    z: matrix[2]! * point.x + matrix[6]! * point.y
      + matrix[10]! * point.z + matrix[14]!,
  };
}

function polygonArea(vertices: readonly Point3[]): number {
  let x = 0;
  let y = 0;
  let z = 0;
  vertices.forEach((point, index) => {
    const next = vertices[(index + 1) % vertices.length]!;
    x += point.y * next.z - point.z * next.y;
    y += point.z * next.x - point.x * next.z;
    z += point.x * next.y - point.y * next.x;
  });
  return Math.sqrt(x * x + y * y + z * z) / 2;
}

function projectedShaftVolumeM3(
  snapshot: ReturnType<typeof buildOakContinuousAnalysisSnapshotV1>,
  organKey: string,
): number {
  const instanceKey = `oak:${organKey}:shaft`;
  const batch = snapshot.batches.find((candidate) =>
    candidate.instanceKeys.includes(instanceKey));
  if (!batch) throw new Error(`Missing projected shaft '${instanceKey}'.`);
  const geometry = snapshot.resources.find((candidate) =>
    candidate.kind === 'geometry' && candidate.key === batch.geometryKey);
  if (!geometry || geometry.kind !== 'geometry') {
    throw new Error(`Missing projected shaft geometry '${batch.geometryKey}'.`);
  }
  const slot = batch.instanceKeys.indexOf(instanceKey);
  const matrix = batch.matrices.subarray(slot * 16, slot * 16 + 16);
  const ringYs = [...new Set(Array.from(
    { length: geometry.positions.length / 3 },
    (_, index) => geometry.positions[index * 3 + 1]!,
  ))].sort((left, right) => left - right);
  const rings = ringYs.map((ringY) => {
    const localVertices = new Map<string, Point3>();
    for (let offset = 0; offset < geometry.positions.length; offset += 3) {
      const local = {
        x: geometry.positions[offset]!,
        y: geometry.positions[offset + 1]!,
        z: geometry.positions[offset + 2]!,
      };
      if (Math.abs(local.y - ringY) > 1e-6
        || local.x * local.x + local.z * local.z < 1e-12) continue;
      localVertices.set(`${String(local.x)}/${String(local.z)}`, local);
    }
    const vertices = [...localVertices.values()].map((point) =>
      transformPoint(matrix, point));
    const center = {
      x: vertices.reduce((sum, point) => sum + point.x, 0) / vertices.length,
      y: vertices.reduce((sum, point) => sum + point.y, 0) / vertices.length,
      z: vertices.reduce((sum, point) => sum + point.z, 0) / vertices.length,
    };
    return { center, areaM2: polygonArea(vertices) };
  });
  let volumeM3 = 0;
  for (let index = 0; index < rings.length - 1; index += 1) {
    const start = rings[index]!;
    const end = rings[index + 1]!;
    const lengthM = Math.hypot(
      end.center.x - start.center.x,
      end.center.y - start.center.y,
      end.center.z - start.center.z,
    );
    volumeM3 += lengthM * (
      start.areaM2 + Math.sqrt(start.areaM2 * end.areaM2) + end.areaM2
    ) / 3;
  }
  return volumeM3;
}

describe('oak dimensioned-wood allometry', () => {
  it('exposes the old undersized branch as a real counter-control', () => {
    expect(oakWoodUnitCrossSectionAreaM2V1()).toBeCloseTo(2 * Math.sqrt(2), 14);
    expect(oakWoodUnitCrossSectionAreaM2V1()).not.toBeCloseTo(Math.PI, 2);
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

  it('matches owned fresh mass to every actual projected day-100 shaft', () => {
    const simulation = createOakSimulationV1();
    const snapshot = simulation.advanceHostTicks(oakHostTicksForBiologicalDaysV1(100));
    const analysisSnapshot = buildOakContinuousAnalysisSnapshotV1(simulation.projection());
    const activeWood = snapshot.organs.filter((organ) =>
      organ.stage !== 'abscised' && isOakDimensionedWoodKindV1(organ.kind));
    expect(activeWood.length).toBeGreaterThan(3);
    for (const organ of activeWood) {
      const freshMassKg = organ.pools.carbonKg
          / OAK_PARAMETERS_V1.growth.structuralCarbonFractionOfDryMass
        + organ.pools.waterLiters * OAK_PARAMETERS_V1.mechanics.waterDensityKgPerLiter;
      const projectedMassKg = projectedShaftVolumeM3(analysisSnapshot, organ.key)
        * OAK_PARAMETERS_V1.mechanics.greenWoodDensityKgPerM3;
      const ratio = freshMassKg / projectedMassKg;
      expect(ratio, organ.key).toBeCloseTo(1, 5);
    }
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
