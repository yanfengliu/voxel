import { describe, expect, it } from 'vitest';

import { timeoutForMeasuredWorkMs } from '../../tests/testing/test-timeout.js';

import type {
  OakOrganSnapshotV1,
  OakRenderProjectionStateV1,
} from './oak-types.js';
import { buildOakContinuousAnalysisSnapshotV1 } from './oak-continuous-render-analysis.js';
import { inspectOakOrganGeometryConflictsV1 } from './oak-organ-conflicts.js';
import {
  createOakSimulationV1,
  oakHostTicksForBiologicalDaysV1,
} from './oak-simulation.js';
import {
  oakAcornGerminationPortsV1,
  oakFiniteWoodAttachmentSectionsV1,
} from './oak-topology.js';

const ROOT_PROJECTION = {
  rootCutaway: { axis: 'x', planeM: 1, keep: 'less-than' },
} as const;

function runProjection(days: number): OakRenderProjectionStateV1 {
  const simulation = createOakSimulationV1();
  simulation.advanceHostTicks(oakHostTicksForBiologicalDaysV1(days));
  return simulation.projection();
}

function reportFor(state: OakRenderProjectionStateV1) {
  const snapshot = buildOakContinuousAnalysisSnapshotV1(state, ROOT_PROJECTION);
  return inspectOakOrganGeometryConflictsV1(state, snapshot);
}

function replaceOrgans(
  state: OakRenderProjectionStateV1,
  replacement: readonly OakOrganSnapshotV1[],
): OakRenderProjectionStateV1 {
  return { ...state, organs: replacement };
}

function transformedPoint(
  matrix: ArrayLike<number>,
  point: Readonly<{ x: number; y: number; z: number }>,
) {
  return {
    x: matrix[0]! * point.x + matrix[4]! * point.y
      + matrix[8]! * point.z + matrix[12]!,
    y: matrix[1]! * point.x + matrix[5]! * point.y
      + matrix[9]! * point.z + matrix[13]!,
    z: matrix[2]! * point.x + matrix[6]! * point.y
      + matrix[10]! * point.z + matrix[14]!,
  };
}

describe('oak organ topology and rendered conflict gate', () => {
  it('uses the declared acorn endpoints as zero-gap shoot and radicle ports', () => {
    const state = runProjection(6);
    const acorn = state.organs.find((organ) => organ.kind === 'acorn')!;
    const stem = state.organs.find((organ) => organ.kind === 'stem')!;
    const root = state.organs.find((organ) => organ.kind === 'coarse-root')!;
    const ports = oakAcornGerminationPortsV1(acorn);
    expect(stem.positionM).toEqual(ports.top);
    expect(root.positionM).toEqual(ports.bottom);

    const oldDefects = replaceOrgans(state, state.organs.filter((organ) =>
      organ.kind === 'acorn' || organ.kind === 'coarse-root' || organ.kind === 'stem')
      .map((organ) => {
      if (organ.key === stem.key) return {
        ...organ,
        positionM: { x: 0, y: 0, z: 0 },
      };
      if (organ.key === root.key) return {
        ...organ,
        positionM: { x: 0, y: -0.018, z: 0 },
      };
        return organ;
      }));
    expect(reportFor(oldDefects).conflicts.filter((conflict) =>
      conflict.kind === 'germination-port-gap-or-overlap')).toHaveLength(2);
  });

  it.each([13, 90, 100])(
    'finds no swept-radius, lamina, petiole, or soil conflict at day %i',
    (days) => {
      const state = runProjection(days);
      const report = reportFor(state);
      const activeCount = state.organs.filter((organ) =>
        organ.stage !== 'abscised' && organ.healthFraction > 0).length;
      expect(report.activeOrganCount).toBe(activeCount);
      expect(report.testedOrganPairs + report.skippedDirectOrganPairs)
        .toBe(activeCount * (activeCount - 1) / 2);
      expect(report.skippedDirectOrganPairs).toBeGreaterThan(0);
      expect(report.conflicts).toEqual([]);
      expect(report.exemptions.some((exemption) =>
        exemption.reason === 'porous-soil-root-co-occupancy')).toBe(true);
      expect(report.exemptions.some((exemption) =>
        exemption.reason === 'germinating-seed-soil-interface')).toBe(true);
    },
  );

  it('keeps the complete authoritative breeze graph conflict-free', () => {
    const simulation = createOakSimulationV1();
    simulation.advanceHostTicks(oakHostTicksForBiologicalDaysV1(90));
    simulation.setPaused(true);
    simulation.applyCommand({ kind: 'set-wind-regime', regime: 'breeze' });
    simulation.advanceHostTicks(15);
    const state = simulation.projection();
    expect(state.wind.speedMPerS).toBeGreaterThan(0);
    expect(reportFor(state).conflicts).toEqual([]);
  });

  it('detects unrelated swept-volume, leaf crossings and under-cleared ports', () => {
    const state = runProjection(13);
    const stem = state.organs.find((organ) => organ.kind === 'stem')!;
    const crossingWood: OakOrganSnapshotV1 = {
      ...stem,
      key: 'organ:900:1',
      identity: { localId: 900, generation: 1 },
      kind: 'branch',
      parentKey: null,
    };
    const withWoodCrossing = replaceOrgans(state, [...state.organs, crossingWood]);
    expect(reportFor(withWoodCrossing).conflicts.some((conflict) =>
      conflict.kind === 'organ-volume-overlap'
      && conflict.organKeys.includes(stem.key)
      && conflict.organKeys.includes(crossingWood.key))).toBe(true);

    const leaf = state.organs.find((organ) => organ.kind === 'leaf')!;
    const crossingLeaf = {
      ...leaf,
      parentKey: null,
      positionM: {
        x: stem.positionM.x + stem.direction.x * stem.lengthM * 0.5,
        y: stem.positionM.y + stem.direction.y * stem.lengthM * 0.5,
        z: stem.positionM.z + stem.direction.z * stem.lengthM * 0.5,
      },
      direction: { x: 1, y: 0, z: 0 },
    } satisfies OakOrganSnapshotV1;
    const withLeafCrossing = replaceOrgans(state, state.organs.map((organ) =>
      organ.key === leaf.key ? crossingLeaf : organ));
    expect(reportFor(withLeafCrossing).conflicts.some((conflict) =>
      conflict.kind === 'leaf-surface-crossing'
      && conflict.organKeys.includes(stem.key)
      && conflict.organKeys.includes(leaf.key))).toBe(true);

    const thresholdState = runProjection(90);
    const axillaryBranch = thresholdState.organs.find((organ) =>
      organ.kind === 'branch')!;
    const subtendingLeaf = thresholdState.organs.find((organ) =>
      organ.kind === 'leaf' && organ.parentKey === axillaryBranch.parentKey)!;
    const sharedParent = thresholdState.organs.find((organ) =>
      organ.key === subtendingLeaf.parentKey)!;
    const parentTip = {
      x: sharedParent.positionM.x
        + sharedParent.direction.x * sharedParent.lengthM,
      y: sharedParent.positionM.y
        + sharedParent.direction.y * sharedParent.lengthM,
      z: sharedParent.positionM.z
        + sharedParent.direction.z * sharedParent.lengthM,
    };
    const attachmentOffset = {
      x: subtendingLeaf.positionM.x - parentTip.x,
      y: subtendingLeaf.positionM.y - parentTip.y,
      z: subtendingLeaf.positionM.z - parentTip.z,
    };
    const axialM = attachmentOffset.x * sharedParent.direction.x
      + attachmentOffset.y * sharedParent.direction.y
      + attachmentOffset.z * sharedParent.direction.z;
    const radial = {
      x: attachmentOffset.x - sharedParent.direction.x * axialM,
      y: attachmentOffset.y - sharedParent.direction.y * axialM,
      z: attachmentOffset.z - sharedParent.direction.z * axialM,
    };
    const radialScale = 0.95;
    const underClearedLeaf = {
      ...subtendingLeaf,
      positionM: {
        x: parentTip.x + sharedParent.direction.x * axialM + radial.x * radialScale,
        y: parentTip.y + sharedParent.direction.y * axialM + radial.y * radialScale,
        z: parentTip.z + sharedParent.direction.z * axialM + radial.z * radialScale,
      },
    } satisfies OakOrganSnapshotV1;
    const underCleared = replaceOrgans(thresholdState, thresholdState.organs.map((organ) =>
      organ.key === subtendingLeaf.key ? underClearedLeaf : organ));
    expect(reportFor(underCleared).conflicts.some((conflict) =>
      conflict.kind === 'parent-surface-penetration'
      && conflict.organKeys.includes(subtendingLeaf.key)
      && conflict.organKeys.includes(sharedParent.key))).toBe(true);

    const continuation = thresholdState.organs.find((organ) =>
      organ.kind === 'stem' && organ.parentKey === sharedParent.key)!;
    const coaxialSibling = replaceOrgans(
      thresholdState,
      thresholdState.organs.map((organ) => organ.key === axillaryBranch.key
        ? { ...organ, direction: continuation.direction }
        : organ),
    );
    expect(reportFor(coaxialSibling).conflicts.some((conflict) =>
      conflict.kind === 'organ-volume-overlap'
      && conflict.organKeys.includes(axillaryBranch.key)
      && conflict.organKeys.includes(continuation.key))).toBe(true);
  }, timeoutForMeasuredWorkMs(28_081));

  it('retains an integrated node-flare peak in the private continuous-geometry oracle', () => {
    const state = runProjection(100);
    const snapshot = buildOakContinuousAnalysisSnapshotV1(state, ROOT_PROJECTION);
    const batch = snapshot.batches.find((candidate) =>
      candidate.key.includes(':node-flared:') && candidate.instanceKeys.length > 0)!;
    const instanceKey = batch.instanceKeys[0]!;
    const slot = batch.instanceKeys.indexOf(instanceKey);
    const matrix = batch.matrices.subarray(slot * 16, slot * 16 + 16);
    const geometry = snapshot.resources.find((candidate) =>
      candidate.kind === 'geometry' && candidate.key === batch.geometryKey)!;
    if (geometry.kind !== 'geometry') throw new Error('Expected node-flared geometry.');
    const ringYs = [...new Set(Array.from(
      { length: geometry.positions.length / 3 },
      (_, index) => geometry.positions[index * 3 + 1]!,
    ))].sort((left, right) => left - right);
    expect(ringYs).toHaveLength(4);
    const ring = (localY: number) => {
      const center = transformedPoint(matrix, { x: 0, y: localY, z: 0 });
      const points = Array.from(
        { length: geometry.positions.length / 3 },
        (_, index) => ({
          x: geometry.positions[index * 3]!,
          y: geometry.positions[index * 3 + 1]!,
          z: geometry.positions[index * 3 + 2]!,
        }),
      ).filter((point) => point.y === localY)
        .map((point) => transformedPoint(matrix, point));
      const radiusM = Math.max(...points.map((point) => Math.hypot(
        point.x - center.x,
        point.y - center.y,
        point.z - center.z,
      )));
      return { center, points, radiusM };
    };
    const proximal = ring(ringYs[0]!);
    const peak = ring(ringYs[2]!);
    const distal = ring(ringYs[3]!);
    const peakFraction = (ringYs[2]! - ringYs[0]!)
      / (ringYs[3]! - ringYs[0]!);
    const endpointInterpolatedRadiusM = proximal.radiusM
      + (distal.radiusM - proximal.radiusM) * peakFraction;
    expect(peak.radiusM).toBeGreaterThan(endpointInterpolatedRadiusM);
    const radialPoint = peak.points.find((point) => Math.abs(
      Math.hypot(
        point.x - peak.center.x,
        point.y - peak.center.y,
        point.z - peak.center.z,
      ) - peak.radiusM,
    ) < 1e-12)!;
    const radial = {
      x: (radialPoint.x - peak.center.x) / peak.radiusM,
      y: (radialPoint.y - peak.center.y) / peak.radiusM,
      z: (radialPoint.z - peak.center.z) / peak.radiusM,
    };
    const intruderRadiusM = 0.00025;
    const separationM = (endpointInterpolatedRadiusM + peak.radiusM) / 2
      + intruderRadiusM;
    const source = state.organs.find((organ) => organ.kind === 'branch')!;
    const parentKey = /^oak:(organ:[0-9]+:[0-9]+):shaft$/u.exec(instanceKey)![1]!;
    const intruder = {
      ...source,
      key: 'organ:900:1',
      identity: { localId: 900, generation: 1 },
      parentKey: null,
      positionM: {
        x: peak.center.x + radial.x * separationM,
        y: peak.center.y + radial.y * separationM,
        z: peak.center.z + radial.z * separationM,
      },
      direction: {
        x: matrix[4]! / Math.hypot(matrix[4]!, matrix[5]!, matrix[6]!),
        y: matrix[5]! / Math.hypot(matrix[4]!, matrix[5]!, matrix[6]!),
        z: matrix[6]! / Math.hypot(matrix[4]!, matrix[5]!, matrix[6]!),
      },
      lengthM: 0.001,
      radiusM: intruderRadiusM,
    } satisfies OakOrganSnapshotV1;
    const report = reportFor(replaceOrgans(state, [...state.organs, intruder]));
    expect(report.conflicts.some((conflict) =>
      conflict.kind === 'organ-volume-overlap'
      && conflict.organKeys.includes(parentKey)
      && conflict.organKeys.includes(intruder.key))).toBe(true);
  });

  it('rejects aboveground geometry below soil while retaining the root exemption', () => {
    const state = runProjection(13);
    const leaf = state.organs.find((organ) => organ.kind === 'leaf')!;
    const buried = replaceOrgans(state, state.organs.map((organ) =>
      organ.key === leaf.key
        ? { ...organ, parentKey: null, positionM: { x: 0, y: -0.05, z: 0 } }
        : organ));
    const report = reportFor(buried);
    expect(report.conflicts.some((conflict) =>
      conflict.kind === 'aboveground-soil-entry'
      && conflict.organKeys.includes(leaf.key))).toBe(true);
    expect(report.exemptions.some((exemption) =>
      exemption.reason === 'porous-soil-root-co-occupancy')).toBe(true);
  });

  it('partitions each exact octagonal terminal section into finite load paths', () => {
    const state = runProjection(100);
    const sections = oakFiniteWoodAttachmentSectionsV1(state.organs);
    expect(sections.length).toBeGreaterThan(3);
    expect(sections.every((section) =>
      Number.isFinite(section.loadPathAreaM2)
      && section.loadPathAreaM2 > 0
      && section.loadPathAreaM2 <= section.childBasalAreaM2)).toBe(true);
    const parents = new Set(sections.map((section) => section.parentKey));
    for (const parentKey of parents) {
      const siblings = sections.filter((section) => section.parentKey === parentKey);
      expect(siblings[0]!.sectorStartFraction).toBe(0);
      expect(siblings.at(-1)!.sectorEndFraction).toBe(1);
      for (let index = 1; index < siblings.length; index += 1) {
        expect(siblings[index]!.sectorStartFraction)
          .toBe(siblings[index - 1]!.sectorEndFraction);
      }
      expect(siblings.reduce((sum, section) =>
        sum + section.loadPathAreaM2, 0))
        .toBeLessThanOrEqual(siblings[0]!.parentTerminalAreaM2 * (1 + 1e-12));
    }
  });
});
