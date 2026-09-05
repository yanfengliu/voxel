import { describe, expect, it } from 'vitest';

import { timeoutForMeasuredWorkMs } from '../../tests/testing/test-timeout.js';

import type {
  OakOrganSnapshotV1,
  OakRenderProjectionStateV1,
} from './oak-types.js';
import { buildOakContinuousAnalysisSnapshotV1 } from './oak-continuous-render-analysis.js';
import { inspectOakOrganGeometryConflictsV1 } from './oak-organ-conflicts.js';
import { isOakPlacedOrganV1 } from './oak-organ-lifecycle.js';
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
      const activeCount = state.organs.filter(isOakPlacedOrganV1).length;
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
    const state = runProjection(20);
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
      stage: 'expanding',
      developmentPhase: 'cell-expansion',
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
      organ.kind === 'branch' && isOakPlacedOrganV1(organ))!;
    const subtendingLeaf = thresholdState.organs.find((organ) =>
      organ.kind === 'leaf' && organ.parentKey === axillaryBranch.parentKey
      && isOakPlacedOrganV1(organ))!;
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
    // Remove the entire tangential radial port offset. A fractional scale is
    // coupled to the current leaf-section width and clearance parameter and
    // can remain outside the parent after either grows; the zero-offset
    // mutant always puts the petiole base inside the woody node envelope.
    const radialScale = 0;
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
      organ.kind === 'stem' && organ.parentKey === sharedParent.key
      && isOakPlacedOrganV1(organ))!;
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

  it('rejects aboveground geometry below soil while retaining the root exemption', () => {
    const state = runProjection(20);
    const leaf = state.organs.find((organ) => organ.kind === 'leaf')!;
    const buried = replaceOrgans(state, state.organs.map((organ) =>
      organ.key === leaf.key
        ? {
          ...organ,
          stage: 'expanding',
          developmentPhase: 'cell-expansion',
          parentKey: null,
          positionM: { x: 0, y: -0.05, z: 0 },
        }
        : organ));
    const report = reportFor(buried);
    expect(report.conflicts.some((conflict) =>
      conflict.kind === 'aboveground-soil-entry'
      && conflict.organKeys.includes(leaf.key))).toBe(true);
    expect(report.exemptions.some((exemption) =>
      exemption.reason === 'porous-soil-root-co-occupancy')).toBe(true);
  });

  it('partitions each exact circular terminal section into finite load paths', () => {
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
