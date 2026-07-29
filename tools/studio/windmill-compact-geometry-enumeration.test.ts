import { describe, expect, it } from 'vitest';

import {
  enumerateWindmillCompactGeometryV1,
} from './windmill-compact-geometry-enumeration.js';
import type {
  WindmillCompactAssetV1,
  WindmillCompactBoxV1,
} from './windmill-compact-geometry.js';

function worldBox(
  asset: WindmillCompactAssetV1,
  key: string,
): WindmillCompactBoxV1 {
  const box = asset.boxes.find((entry) => entry.key === key);
  if (box === undefined) throw new Error(`Missing compact box '${key}'.`);
  return {
    ...box,
    at: box.at.map((value, axis) =>
      value + asset.worldOriginVoxels[axis]!) as [number, number, number],
  };
}

function sharedFaceArea(
  first: WindmillCompactBoxV1,
  second: WindmillCompactBoxV1,
): number {
  let area = 0;
  for (let normal = 0; normal < 3; normal += 1) {
    const firstEnd = first.at[normal]! + first.size[normal]!;
    const secondEnd = second.at[normal]! + second.size[normal]!;
    const touches = firstEnd === second.at[normal]
      || secondEnd === first.at[normal];
    if (!touches) continue;
    const tangents = [0, 1, 2].filter((axis) => axis !== normal);
    area = Math.max(area, tangents.reduce((product, axis) =>
      product * Math.max(0, Math.min(
        first.at[axis]! + first.size[axis]!,
        second.at[axis]! + second.size[axis]!,
      ) - Math.max(first.at[axis]!, second.at[axis]!)), 1));
  }
  return area;
}

function occupiedWorldCells(
  asset: WindmillCompactAssetV1,
  boxes: readonly WindmillCompactBoxV1[],
): readonly string[] {
  const cells: string[] = [];
  boxes.forEach((box) => {
    for (let z = box.at[2]; z < box.at[2] + box.size[2]; z += 1) {
      for (let y = box.at[1]; y < box.at[1] + box.size[1]; y += 1) {
        for (let x = box.at[0]; x < box.at[0] + box.size[0]; x += 1) {
          cells.push([
            x + asset.worldOriginVoxels[0],
            y + asset.worldOriginVoxels[1],
            z + asset.worldOriginVoxels[2],
          ].join(','));
        }
      }
    }
  });
  return cells.sort();
}

describe('compact windmill finite geometry enumeration', () => {
  it('records every declared tuple as a candidate or named rejection', () => {
    const enumeration = enumerateWindmillCompactGeometryV1();
    const accepted = enumeration.attempts.filter((attempt) =>
      attempt.outcome === 'candidate');
    const rejected = enumeration.attempts.filter((attempt) =>
      attempt.outcome === 'rejected');
    expect(enumeration.declaredParameterCount).toBe(144);
    expect(enumeration.acceptedCandidateCount).toBe(144);
    expect(enumeration.generationRejectionCount).toBe(0);
    expect(accepted).toHaveLength(144);
    expect(rejected).toHaveLength(0);
    const exactDeclaredKeys: string[] = [];
    for (const rotorRadius of [5, 6]) {
      for (const groundClearance of [1, 2]) {
        for (const sailSpan of [3, 4]) {
          for (const camLength of [2, 3]) {
            for (const camHeight of [1]) {
              for (const armLength of [3, 4, 5]) {
                for (const headHeight of [1, 2, 3]) {
                  for (const initialClearance of [0]) {
                    exactDeclaredKeys.push(
                      `r${String(rotorRadius)}-g${String(groundClearance)}`
                      + `-s${String(sailSpan)}-c${String(camLength)}`
                      + `x${String(camHeight)}-a${String(armLength)}`
                      + `-h${String(headHeight)}`
                      + `-q${String(initialClearance)}`,
                    );
                  }
                }
              }
            }
          }
        }
      }
    }
    expect(enumeration.attempts.map(({ parameterKey }) => parameterKey))
      .toEqual(exactDeclaredKeys.sort());
    expect(rejected).toEqual([]);
  });

  it('is lexically ordered and repeatably binds outcomes to geometry', () => {
    const first = enumerateWindmillCompactGeometryV1();
    const second = enumerateWindmillCompactGeometryV1();
    const keys = first.attempts.map(({ parameterKey }) => parameterKey);
    expect(keys).toEqual([...keys].sort());
    expect(first.enumerationFingerprint)
      .toMatch(/^fnv1a64:[0-9a-f]{16}$/);
    expect(second.enumerationFingerprint)
      .toBe(first.enumerationFingerprint);
  });

  it('derives one localized transmission and impact path for every tuple', () => {
    const accepted = enumerateWindmillCompactGeometryV1().attempts
      .filter((attempt) => attempt.outcome === 'candidate');
    accepted.forEach(({ candidate }) => {
      const { assets, parameters } = candidate;
      const axisY = parameters.rotorRadiusVoxels
        + parameters.groundClearanceVoxels;
      const pivotY = axisY - 3;
      const armLength = parameters.hammerRightArmLengthVoxels;
      const headHeight = parameters.hammerHeadHeightVoxels;
      const headX = 8 + armLength;
      const headBottomY = pivotY - headHeight + 1;
      const camLength = parameters.camRadialLengthVoxels;
      const arm = worldBox(assets.rotor, 'rotor-cam-arm');
      const nose = worldBox(assets.rotor, 'rotor-cam-nose');
      const opposedArm = worldBox(
        assets.rotor,
        'rotor-opposed-cam-arm',
      );
      const opposedNose = worldBox(
        assets.rotor,
        'rotor-opposed-cam-nose',
      );
      const shaft = worldBox(assets.rotor, 'rotor-shaft');
      const shoe = worldBox(assets.hammer, 'hammer-follower-shoe');
      const upper = worldBox(
        assets.hammer,
        'hammer-follower-upper-link',
      );
      const lower = worldBox(
        assets.hammer,
        'hammer-follower-lower-link',
      );
      const pivot = worldBox(assets.hammer, 'hammer-pivot-core');
      const beam = worldBox(assets.hammer, 'hammer-right-beam');
      const toe = worldBox(assets.hammer, 'hammer-impact-toe');
      const cap = worldBox(assets.anvil, 'anvil-impact-cap');
      const headBoxes = assets.hammer.boxes.filter((box) =>
        box.materialProfile === 'hammerHead');
      const expectedHeadCells = Array.from(
        { length: headHeight },
        (_, offset) => `${String(headX)},${String(
          headBottomY + offset,
        )},6`,
      ).sort();

      expect(parameters.camHeightVoxels).toBe(1);
      expect(arm).toMatchObject({
        at: [1, axisY, 6],
        size: [camLength - 1, 1, 1],
        collisionRole: 'inert-solid',
      });
      expect(nose).toMatchObject({
        at: [camLength, axisY, 6],
        size: [1, 1, 1],
        collisionRole: 'cam',
      });
      expect(opposedArm).toMatchObject({
        at: [1 - camLength, axisY, 6],
        size: [camLength - 1, 1, 1],
        collisionRole: 'inert-solid',
      });
      expect(opposedNose).toMatchObject({
        at: [-camLength, axisY, 6],
        size: [1, 1, 1],
        collisionRole: 'cam',
      });
      expect(sharedFaceArea(shaft, arm)).toBe(1);
      expect(sharedFaceArea(arm, nose)).toBe(1);
      expect(sharedFaceArea(opposedArm, shaft)).toBe(1);
      expect(sharedFaceArea(opposedArm, opposedNose)).toBe(1);

      expect(shoe).toMatchObject({
        at: [camLength, pivotY + 1, 6],
        size: [1, 1, 1],
        collisionRole: 'follower',
      });
      expect(upper).toMatchObject({
        at: [camLength + 1, pivotY + 1, 6],
        size: [4 - camLength, 1, 1],
        collisionRole: 'inert-solid',
      });
      expect(lower).toMatchObject({
        at: [4, pivotY, 6],
        size: [3, 1, 1],
        collisionRole: 'inert-solid',
      });
      expect(sharedFaceArea(shoe, upper)).toBe(1);
      expect(sharedFaceArea(upper, lower)).toBe(1);
      expect(sharedFaceArea(lower, pivot)).toBe(1);
      expect(sharedFaceArea(pivot, beam)).toBe(1);
      expect(candidate.requiredInterfaces).toContainEqual({
        fromBoxKey: 'hammer-pivot-core',
        toBoxKey: 'hammer-right-beam',
        minimumFaceAreaVoxels: 1,
      });

      expect(occupiedWorldCells(assets.hammer, headBoxes))
        .toEqual(expectedHeadCells);
      expect(headBoxes.reduce((sum, box) =>
        sum + box.size[0] * box.size[1] * box.size[2], 0))
        .toBe(headHeight);
      expect(headBoxes.every((box) =>
        box.materialProfile === 'hammerHead')).toBe(true);
      expect(toe).toMatchObject({
        at: [headX, headBottomY, 6],
        size: [1, 1, 1],
        collisionRole: 'hammer-head',
      });
      const mass = assets.hammer.boxes.find((box) =>
        box.key === 'hammer-head-mass');
      if (headHeight === 1) {
        expect(mass).toBeUndefined();
        expect(sharedFaceArea(beam, toe)).toBe(1);
      } else {
        expect(worldBox(assets.hammer, 'hammer-head-mass')).toMatchObject({
          at: [headX, headBottomY + 1, 6],
          size: [1, headHeight - 1, 1],
          collisionRole: 'inert-solid',
        });
        expect(sharedFaceArea(toe, worldBox(
          assets.hammer,
          'hammer-head-mass',
        ))).toBe(1);
        expect(sharedFaceArea(beam, worldBox(
          assets.hammer,
          'hammer-head-mass',
        ))).toBe(1);
      }

      expect(cap).toMatchObject({
        at: [headX, headBottomY - 1, 6],
        size: [1, 1, 1],
        collisionRole: 'anvil-face',
      });
      const column = assets.anvil.boxes.find((box) =>
        box.key === 'anvil-column');
      if (headBottomY === 1) {
        expect(column).toBeUndefined();
      } else {
        expect(worldBox(assets.anvil, 'anvil-column')).toMatchObject({
          at: [headX, 0, 6],
          size: [1, headBottomY - 1, 1],
          collisionRole: 'inert-solid',
        });
        expect(sharedFaceArea(
          worldBox(assets.anvil, 'anvil-column'),
          cap,
        )).toBe(1);
      }
      expect(cap.at[0]).toBe(toe.at[0]);
      expect(cap.at[2]).toBe(toe.at[2]);
      expect(cap.at[1] + 1).toBe(toe.at[1]);
      expect(candidate.intentionalContactGroups).toEqual([
        expect.objectContaining({
          key: 'cam-follower',
          firstBoxKeys: [
            'rotor-cam-nose',
            'rotor-opposed-cam-nose',
          ],
          secondBoxKeys: ['hammer-follower-shoe'],
        }),
        expect.objectContaining({
          key: 'head-anvil',
          firstBoxKeys: ['hammer-impact-toe'],
          secondBoxKeys: ['anvil-impact-cap'],
        }),
      ]);

      const toeCornerRadiusX = toe.at[0] - 7.5;
      const toeCornerRadiusY = toe.at[1] - (pivotY + 0.5);
      expect(toeCornerRadiusX).toBe(armLength + 0.5);
      expect(toeCornerRadiusY).toBe(-(headHeight - 0.5));
      for (let degree = 1; degree <= 90; degree += 1) {
        const theta = degree * Math.PI / 180;
        const clearance = (armLength + 0.5) * Math.sin(theta)
          + (headHeight - 0.5) * (1 - Math.cos(theta));
        expect(clearance).toBeGreaterThan(0);
      }
    });
  });
});
