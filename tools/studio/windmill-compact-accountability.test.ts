import { describe, expect, it } from 'vitest';

import {
  WINDMILL_COMPACT_MATERIAL_NEEDS_V1,
  WINDMILL_COMPACT_ROLE_COLORS_V1,
  WINDMILL_COMPACT_ROLE_NEEDS_V1,
  windmillCompactBoxRuleV1,
} from './windmill-compact-accountability.js';
import {
  createWindmillCompactCreativeV1,
  type WindmillCompactRecipeBoxInputV1,
} from './windmill-compact-creative.js';
import {
  createWindmillCompactCandidateV1,
  type WindmillCompactAssetV1,
  type WindmillCompactBoxV1,
  type WindmillCompactTripleV1,
  type WindmillCompactCandidateV1,
  type WindmillCompactIntentionalContactGroupV1,
} from './windmill-compact-geometry.js';
import {
  enumerateWindmillCompactGeometryV1,
} from './windmill-compact-geometry-enumeration.js';
import {
  windmillCompactSailFrameV1,
} from './windmill-compact-geometry-evidence.js';

function overlapLength(
  first: WindmillCompactBoxV1,
  second: WindmillCompactBoxV1,
  axis: number,
): number {
  return Math.max(0, Math.min(
    first.at[axis]! + first.size[axis]!,
    second.at[axis]! + second.size[axis]!,
  ) - Math.max(first.at[axis]!, second.at[axis]!));
}

function sharedFaceArea(
  first: WindmillCompactBoxV1,
  second: WindmillCompactBoxV1,
): number {
  let maximum = 0;
  for (let normal = 0; normal < 3; normal += 1) {
    const touches =
      (first.at[normal]! + first.size[normal]!) === second.at[normal]
      || (second.at[normal]! + second.size[normal]!) === first.at[normal];
    if (!touches) continue;
    const tangents = [0, 1, 2].filter((axis) => axis !== normal);
    maximum = Math.max(maximum, tangents.reduce((area, axis) =>
      area * overlapLength(first, second, axis), 1));
  }
  return maximum;
}

function overlapVolume(
  first: WindmillCompactBoxV1,
  second: WindmillCompactBoxV1,
): number {
  return [0, 1, 2].reduce((volume, axis) =>
    volume * overlapLength(first, second, axis), 1);
}

function neighbors(
  asset: WindmillCompactAssetV1,
  target: WindmillCompactBoxV1,
): readonly string[] {
  return asset.boxes.filter((box) =>
    box.key !== target.key && sharedFaceArea(target, box) > 0)
    .map((box) => box.key).sort();
}

const COLOR_GROUP_BY_ROLE = new Map(WINDMILL_COMPACT_ROLE_COLORS_V1
  .map((entry) => [entry.role, entry.colorGroup]));

function appearanceSignature(box: WindmillCompactBoxV1): string {
  return [
    box.role,
    COLOR_GROUP_BY_ROLE.get(box.role),
    box.materialProfile,
  ].join('|');
}

function appearanceComponent(
  asset: WindmillCompactAssetV1,
  target: WindmillCompactBoxV1,
): readonly WindmillCompactBoxV1[] {
  const expected = appearanceSignature(target);
  const visited = new Set([target.key]);
  const pending = [target];
  while (pending.length > 0) {
    const current = pending.pop()!;
    asset.boxes.forEach((candidate) => {
      if (visited.has(candidate.key)
        || appearanceSignature(candidate) !== expected
        || sharedFaceArea(current, candidate) === 0) return;
      visited.add(candidate.key);
      pending.push(candidate);
    });
  }
  return asset.boxes.filter((box) => visited.has(box.key))
    .sort((left, right) => left.key.localeCompare(right.key));
}

function cells(box: WindmillCompactBoxV1): readonly string[] {
  const result: string[] = [];
  for (let z = box.at[2]; z < box.at[2] + box.size[2]; z += 1) {
    for (let y = box.at[1]; y < box.at[1] + box.size[1]; y += 1) {
      for (let x = box.at[0]; x < box.at[0] + box.size[0]; x += 1) {
        result.push(`${String(x)},${String(y)},${String(z)}`);
      }
    }
  }
  return result;
}

function exposedFaces(
  asset: WindmillCompactAssetV1,
  component: readonly WindmillCompactBoxV1[],
): number {
  const occupied = new Set(asset.occupiedCells.map((cell) => cell.join(',')));
  const directions = [[1, 0, 0], [-1, 0, 0], [0, 1, 0],
    [0, -1, 0], [0, 0, 1], [0, 0, -1]] as const;
  return component.flatMap(cells).reduce((count, key) => {
    const at = key.split(',').map(Number);
    return count + directions.filter((delta) => !occupied.has([
      at[0]! + delta[0],
      at[1]! + delta[1],
      at[2]! + delta[2],
    ].join(','))).length;
  }, 0);
}

function moved(
  box: WindmillCompactBoxV1,
  delta: WindmillCompactTripleV1,
): WindmillCompactBoxV1 {
  return {
    ...box,
    at: box.at.map((value, axis) =>
      value + delta[axis]!) as [number, number, number],
  };
}

function worldBox(
  candidate: WindmillCompactCandidateV1,
  boxKey: string,
  replacement?: WindmillCompactBoxV1,
): WindmillCompactBoxV1 {
  for (const asset of Object.values(candidate.assets)) {
    const source = asset.boxes.find((box) => box.key === boxKey);
    if (source !== undefined) {
      const box = replacement?.key === boxKey ? replacement : source;
      return {
        ...box,
        at: box.at.map((value, axis) =>
          value + asset.worldOriginVoxels[axis]!) as [
          number,
          number,
          number,
        ],
      };
    }
  }
  throw new Error(`Missing compact world box '${boxKey}'.`);
}

function alignedAxes(
  candidate: WindmillCompactCandidateV1,
  group: WindmillCompactIntentionalContactGroupV1,
  replacement?: WindmillCompactBoxV1,
): readonly number[] {
  const boxes = [...group.firstBoxKeys, ...group.secondBoxKeys]
    .map((key) => worldBox(candidate, key, replacement));
  const first = boxes[0]!;
  return [0, 1, 2].filter((axis) => boxes.every((box) =>
    box.at[axis] === first.at[axis]
    && box.size[axis] === first.size[axis]));
}

function inputFor(
  creative: ReturnType<typeof createWindmillCompactCreativeV1>,
  assetKey: keyof typeof creative.assets,
  boxKey: string,
): WindmillCompactRecipeBoxInputV1 {
  const input = creative.assets[assetKey].boxes.find((box) =>
    box.boxKey === boxKey);
  if (input === undefined) throw new Error(`Missing creative box '${boxKey}'.`);
  return input;
}

describe('compact windmill exhaustive accountability', () => {
  it('binds every visible box to a job-specific subtraction and relocation witness', () => {
    const accepted = enumerateWindmillCompactGeometryV1().attempts
      .filter((attempt) => attempt.outcome === 'candidate');
    expect(accepted).toHaveLength(144);
    accepted.forEach(({ candidate }) => {
      const creative = createWindmillCompactCreativeV1(candidate);
      Object.entries(candidate.assets).forEach(([assetKey, asset]) => {
        asset.boxes.forEach((box) => {
          const rule = windmillCompactBoxRuleV1(box);
          const input = inputFor(
            creative,
            assetKey as keyof typeof creative.assets,
            box.key,
          );
          const originalNeighbors = neighbors(asset, box);
          const contacts = candidate.intentionalContactGroups.filter((group) =>
            group.firstBoxKeys.includes(box.key)
            || group.secondBoxKeys.includes(box.key));
          expect(originalNeighbors.length + contacts.length, box.key)
            .toBeGreaterThan(0);
          expect(input.purpose.beneficiary, box.key).toBe(rule.beneficiary);
          expect(input.purpose.job, box.key).toBe(rule.job);
          expect(input.purpose.minimumForm, box.key)
            .toContain(rule.minimumForm);
          expect(input.purpose.removalFailure, box.key)
            .toContain(rule.removalConsequence);
          expect(input.purpose.relocationFailure, box.key)
            .toContain(rule.relocationConsequence);
          expect(input.purpose.evidence, box.key).toContain(rule.ruleId);
          originalNeighbors.forEach((neighbor) => {
            expect(input.purpose.removalFailure, box.key).toContain(neighbor);
            expect(input.purpose.relocationFailure, box.key)
              .toContain(neighbor);
          });
          contacts.forEach((group) => {
            expect(alignedAxes(candidate, group).length, box.key)
              .toBeGreaterThan(0);
            expect(input.purpose.removalFailure, box.key).toContain(group.key);
          });

          const relocated = moved(box, rule.relocationDelta);
          const relocatedNeighbors = neighbors(asset, relocated);
          const lost = originalNeighbors.filter((key) =>
            !relocatedNeighbors.includes(key));
          const overlaps = asset.boxes.some((other) =>
            other.key !== box.key && overlapVolume(relocated, other) > 0);
          const leavesGround = box.role === 'foundation'
            && relocated.at[1] !== box.at[1];
          const leavesContactDatum = contacts.some((group) => {
            const before = alignedAxes(candidate, group);
            const after = alignedAxes(candidate, group, relocated);
            return before.some((axis) => !after.includes(axis));
          });
          expect(
            lost.length > 0 || overlaps || leavesGround || leavesContactDatum,
            box.key,
          ).toBe(true);
          expect(input.purpose.relocationFailure, box.key)
            .toContain(`[${rule.relocationDelta.join(',')}]`);

          const removedVolume = box.size.reduce(
            (volume, extent) => volume * extent, 1);
          const retainedVolume = asset.boxes
            .filter((other) => other.key !== box.key)
            .reduce((sum, other) => sum + other.size.reduce(
              (volume, extent) => volume * extent, 1), 0);
          expect(asset.occupiedVoxelCount - retainedVolume, box.key)
            .toBe(removedVolume);
          expect(input.purpose.selectedDynamicProof, box.key).toBeNull();
        });
      });
    });
  });

  it('applies the exact eight-piece bearing-ring rule without assembly slogans', () => {
    const candidate = createWindmillCompactCandidateV1();
    const creative = createWindmillCompactCreativeV1(candidate);
    const suffixes = [
      'left-post',
      'right-post',
      'cap',
      'saddle',
      'lower-left-liner',
      'lower-right-liner',
      'upper-left-liner',
      'upper-right-liner',
    ];
    [
      'rotor-front-bearing',
      'rotor-rear-bearing',
      'hammer-rear-bearing',
    ].forEach((prefix) => {
      const ring = candidate.assets.frame.boxes.filter((box) =>
        box.key.startsWith(`${prefix}-`));
      expect(ring.map((box) => box.key.slice(prefix.length + 1)).sort())
        .toEqual([...suffixes].sort());
      expect(new Set(ring.map((box) =>
        windmillCompactBoxRuleV1(box).ruleId)).size).toBe(8);
      ring.forEach((box) => {
        const input = inputFor(creative, 'frame', box.key);
        const ringNeighbors = neighbors(candidate.assets.frame, box)
          .filter((key) => key.startsWith(`${prefix}-`));
        expect(ringNeighbors.length, box.key).toBeGreaterThanOrEqual(2);
        expect(input.purpose.job, box.key).not.toMatch(
          /carry .* entire|whole bearing|all bearing/i,
        );
        if (box.key.includes('liner')) {
          expect(input.purpose.job, box.key)
            .toMatch(/(upper|lower)-(left|right) corner .*clearance cross/i);
          expect(box.size, box.key).toEqual([1, 1, 1]);
        }
      });
    });
  });

  it('makes each sail slab change the independently recomputed plate frame', () => {
    const candidate = createWindmillCompactCandidateV1();
    const rotorAxis = candidate.ports.find((port) =>
      port.key === 'rotor-axis')?.worldPositionVoxels;
    if (rotorAxis === undefined) throw new Error('Missing rotor-axis port.');
    (['north', 'south'] as const).forEach((side) => {
      const key = `${side}-sail` as const;
      const original = windmillCompactSailFrameV1(
        key,
        candidate.assets.rotor,
        rotorAxis,
      );
      candidate.assets.rotor.boxes
        .filter((box) => box.key.startsWith(`${side}-panel-step-`))
        .forEach((slab) => {
          const without: WindmillCompactAssetV1 = {
            ...candidate.assets.rotor,
            boxes: candidate.assets.rotor.boxes.filter((box) =>
              box.key !== slab.key),
          };
          const relocated: WindmillCompactAssetV1 = {
            ...candidate.assets.rotor,
            boxes: candidate.assets.rotor.boxes.map((box) =>
              box.key === slab.key
                ? moved(box, windmillCompactBoxRuleV1(box).relocationDelta)
                : box),
          };
          expect(
            windmillCompactSailFrameV1(key, without, rotorAxis),
            `${slab.key}:removal`,
          ).not.toEqual(original);
          expect(
            windmillCompactSailFrameV1(key, relocated, rotorAxis),
            `${slab.key}:relocation`,
          ).not.toEqual(original);
        });
    });
  });

  it('accounts for every role, color group, and material boundary at its box datum', () => {
    const candidate = createWindmillCompactCandidateV1();
    const creative = createWindmillCompactCreativeV1(candidate);
    const sourceBoxes = Object.values(candidate.assets)
      .flatMap((asset) => asset.boxes);
    expect(new Set(sourceBoxes.map((box) => box.role)))
      .toEqual(new Set(Object.keys(WINDMILL_COMPACT_ROLE_NEEDS_V1)));
    expect(new Set(sourceBoxes.map((box) => box.materialProfile)))
      .toEqual(new Set(Object.keys(WINDMILL_COMPACT_MATERIAL_NEEDS_V1)));
    creative.roleColors.forEach((boundary) => {
      expect(boundary.beneficiary.length, boundary.role).toBeGreaterThan(0);
      expect(boundary.job.length, boundary.role).toBeGreaterThan(0);
      expect(boundary.minimumForm.length, boundary.role).toBeGreaterThan(0);
      expect(boundary.intendedViewRequirement, boundary.role)
        .toContain('fixed-camera');
      expect(sourceBoxes.some((box) => box.role === boundary.role)).toBe(true);
    });
    Object.entries(creative.assets).forEach(([assetKey, asset]) => {
      asset.boxes.forEach((box) => {
        const appearance = box.appearance;
        const sourceAsset = candidate.assets[
          assetKey as keyof typeof candidate.assets
        ];
        const sourceBox = sourceAsset.boxes.find((entry) =>
          entry.key === box.boxKey)!;
        const component = appearanceComponent(sourceAsset, sourceBox);
        expect(appearance.beneficiary.length, box.boxKey).toBeGreaterThan(0);
        expect(appearance.job, box.boxKey).toContain(`'${box.role}'`);
        expect(appearance.job, box.boxKey)
          .toContain(`'${box.materialProfile}'`);
        expect(appearance.placementDatum, box.boxKey).toContain(box.boxKey);
        expect(appearance.removalFailure, box.boxKey).toContain(box.boxKey);
        expect(appearance.memberBoxKeys, box.boxKey)
          .toEqual(component.map((entry) => entry.key));
        expect(appearance.regionVoxelCount, box.boxKey)
          .toBe(component.flatMap(cells).length);
        expect(appearance.exposedFaceCount, box.boxKey)
          .toBe(exposedFaces(sourceAsset, component));
        expect(appearance.relocationFailure, box.boxKey).toContain(box.boxKey);
        expect(appearance.minimumForm, box.boxKey)
          .toContain('no internal source seam is claimed');
        expect(appearance.representationInvariant, box.boxKey)
          .toContain('exact occupied-voxel role/color/material map');
        expect(appearance.removalFailure, box.boxKey)
          .toContain('exact merge is neutral');
        expect(appearance.removalFailure, box.boxKey)
          .not.toMatch(/merging .* erases|removing or merging/i);
        expect(appearance.intendedViewEvidence, box.boxKey)
          .toMatch(/RGB distance [1-9]\d*(?:\.\d+)?/);
        expect(appearance.intendedViewEvidence, box.boxKey)
          .toContain('fixed-camera visibility remains unbound');
        expect(appearance.intendedViewProof, box.boxKey).toBeNull();
        expect(appearance.placementDatum, assetKey).toContain('world bounds [');
      });
    });
    expect(creative.roleColors).toEqual(
      WINDMILL_COMPACT_ROLE_COLORS_V1.filter((boundary) =>
        sourceBoxes.some((box) => box.role === boundary.role)),
    );
  });

  it('keeps all pre-selection prose static and every dynamic binding null', () => {
    const creative = createWindmillCompactCreativeV1(
      createWindmillCompactCandidateV1(),
    );
    const boxes = Object.values(creative.assets).flatMap((asset) =>
      asset.boxes);
    const prose = boxes.flatMap((box): string[] => [
      box.purposeId,
      box.purpose.beneficiary,
      box.purpose.job,
      box.purpose.removalFailure,
      box.purpose.relocationFailure,
      box.purpose.minimumForm,
      box.purpose.evidence,
      box.purpose.honestyBoundary,
      box.appearance.beneficiary,
      box.appearance.job,
      box.appearance.placementDatum,
      box.appearance.removalFailure,
      box.appearance.relocationFailure,
      box.appearance.minimumForm,
      box.appearance.intendedViewEvidence,
      box.appearance.honestyBoundary,
    ]).join(' ');
    expect(prose).not.toMatch(
      /\b(gravity-return(?:ing)?|pickup|release|proofSha256|validated selected proof)\b/i,
    );
    boxes.forEach((box) =>
      expect(box.purpose.selectedDynamicProof, box.boxKey).toBeNull());
  });
});
