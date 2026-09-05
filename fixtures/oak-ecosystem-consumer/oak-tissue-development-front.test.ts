import { describe, expect, it } from 'vitest';

import {
  oakTissueBoundedRatioV1,
  oakTissueCommittedPrefixV1,
  oakTissueConnectedAdditionsV1,
  oakTissueOrderedRadialSectionV1,
  oakTissueSegmentCandidatesV1,
  oakTissueStructuralVolumeFractionV1,
  oakTissueVisibleStructuralCandidatesV1,
  oakTissueVisibleLeafCandidatesV1,
  type OakTissueFrontCandidateV1,
} from './oak-tissue-development-front.js';
import type { OakStructuralOrganSnapshotV1 } from './oak-types.js';

const COLOR = { r: 80, g: 120, b: 70, a: 255 } as const;

function structural(
  developmentFraction: number,
  lengthFraction: number,
  radiusFraction: number,
): OakStructuralOrganSnapshotV1 {
  return {
    key: 'organ:990:1',
    identity: { localId: 990, generation: 1 },
    kind: 'branch',
    parentKey: null,
    branchOrder: 1,
    ageDays: 0,
    positionM: { x: 0, y: 0, z: 0 },
    direction: { x: 0, y: 1, z: 0 },
    lengthM: lengthFraction,
    radiusM: radiusFraction,
    targetLengthM: 1,
    targetRadiusM: 1,
    dryMassKg: 0,
    waterPotentialMpa: -0.3,
    pools: { carbonKg: 0, nitrogenKg: 0, phosphorusKg: 0, waterLiters: 0 },
    stage: 'expanding',
    developmentPhase: 'cell-expansion',
    developmentFraction,
    healthFraction: 1,
    stressFraction: 0,
  };
}

function keys(candidates: readonly OakTissueFrontCandidateV1[]): Set<string> {
  return new Set(candidates.map(({ role, local }) =>
    `${role}/${String(local.x)}/${String(local.y)}/${String(local.z)}`));
}

describe('oak tissue development front', () => {
  it('bounds structural commitment by paid cells and current geometry', () => {
    expect(oakTissueBoundedRatioV1(-1, 2)).toBe(0);
    expect(oakTissueBoundedRatioV1(3, 2)).toBe(1);
    expect(oakTissueStructuralVolumeFractionV1(structural(0.9, 0.5, 0.5)))
      .toBeCloseTo(0.5 ** 3, 12);
    expect(oakTissueStructuralVolumeFractionV1(structural(0.1, 0.8, 0.8)))
      .toBeCloseTo(0.1 ** 3, 12);
  });

  it('changes monotonically inside the current structural envelope', () => {
    const profile = [
      { axialFraction: 0, radiusRatio: 1 },
      { axialFraction: 1, radiusRatio: 0.72 },
    ] as const;
    const candidates = oakTissueSegmentCandidatesV1({
      layers: 12,
      radiusM: 1,
      pitchM: 0.2,
      profile,
      color: COLOR,
    });
    const early = oakTissueVisibleStructuralCandidatesV1({
      organ: structural(0.6, 0.45, 0.55),
      candidates,
      layers: 12,
      pitchM: 0.2,
      profile,
    });
    const later = oakTissueVisibleStructuralCandidatesV1({
      organ: structural(0.8, 0.75, 0.8),
      candidates,
      layers: 12,
      pitchM: 0.2,
      profile,
    });
    expect(early.every(({ local }) => local.y < Math.ceil(12 * 0.45))).toBe(true);
    expect([...keys(early)].every((key) => keys(later).has(key))).toBe(true);
    expect(later.length).toBeGreaterThan(early.length);

    let prior = new Set<string>();
    for (let step = 1; step <= 20; step += 1) {
      const fraction = step / 20;
      const visible = oakTissueVisibleStructuralCandidatesV1({
        organ: structural(fraction, fraction, fraction),
        candidates,
        layers: 12,
        pitchM: 0.2,
        profile,
      });
      const next = keys(visible);
      expect([...prior].every((key) => next.has(key)), String(fraction)).toBe(true);
      prior = next;
    }
  });

  it('orders every radial section center-out so any prefix remains connected', () => {
    const section = oakTissueOrderedRadialSectionV1(3, 3, () => true);
    expect(section[0]).toEqual({ x: 0, y: 3, z: 0 });
    const distances = section.map(({ x, z }) => Math.abs(x) + Math.abs(z));
    expect(distances).toEqual([...distances].sort((left, right) => left - right));

    const candidates = oakTissueSegmentCandidatesV1({
      layers: 6,
      radiusM: 2,
      pitchM: 1,
      profile: [{ axialFraction: 0, radiusRatio: 1 }, { axialFraction: 1, radiusRatio: 0.8 }],
      color: COLOR,
    });
    const prefixes = [0, 0.03, 0.2, 0.6, 1]
      .map((fraction) => oakTissueCommittedPrefixV1(candidates, fraction));
    for (let index = 1; index < prefixes.length; index += 1) {
      const before = keys(prefixes[index - 1]!);
      const after = keys(prefixes[index]!);
      expect([...before].every((key) => after.has(key))).toBe(true);
    }

    const connected = oakTissueConnectedAdditionsV1(
      [candidates[0]!],
      [
        { role: 'wood-voxel', local: { x: 1, y: 0, z: 0 }, color: COLOR },
        { role: 'wood-voxel', local: { x: 2, y: 0, z: 0 }, color: COLOR },
        { role: 'wood-voxel', local: { x: 0, y: 5, z: 0 }, color: COLOR },
      ],
      1,
    );
    expect(connected.map(({ local }) => local.x)).toEqual([1, 2]);
  });

  it('combines a monotone area prefix with an independent paid axial limit', () => {
    const candidates = Array.from({ length: 20 }, (_, index): OakTissueFrontCandidateV1 => ({
      role: index < 10 ? 'midrib-voxel' : 'lamina-voxel',
      local: { x: index < 10 ? 0 : 1, y: index % 10, z: 0 },
      color: COLOR,
    }));
    const visibleAt = (fraction: number) => oakTissueVisibleLeafCandidatesV1({
      candidates,
      layers: 10,
      developmentFraction: fraction,
      currentAreaM2: fraction,
      targetAreaM2: 1,
      currentLengthM: fraction,
      targetLengthM: 1,
    });
    const birth = visibleAt(0);
    const early = visibleAt(0.2);
    const later = visibleAt(0.6);
    expect(birth).toHaveLength(1);
    expect(early.every(({ local }) => local.y < 2)).toBe(true);
    expect([...keys(birth)].every((key) => keys(early).has(key))).toBe(true);
    expect([...keys(early)].every((key) => keys(later).has(key))).toBe(true);
  });
});
