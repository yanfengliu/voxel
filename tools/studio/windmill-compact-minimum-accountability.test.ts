import { describe, expect, it } from 'vitest';

import { createWindmillCompactCreativeV1 } from './windmill-compact-creative.js';
import {
  type WindmillCompactAssetV1,
  type WindmillCompactBoxV1,
  type WindmillCompactCandidateV1,
} from './windmill-compact-geometry.js';
import {
  enumerateWindmillCompactGeometryV1,
} from './windmill-compact-geometry-enumeration.js';
import {
  windmillCompactSailFrameV1,
} from './windmill-compact-geometry-evidence.js';

interface LocatedBox {
  readonly asset: WindmillCompactAssetV1;
  readonly box: WindmillCompactBoxV1;
  readonly world: WindmillCompactBoxV1;
}

function locatedBox(
  candidate: WindmillCompactCandidateV1,
  key: string,
): LocatedBox {
  for (const asset of Object.values(candidate.assets)) {
    const box = asset.boxes.find((entry) => entry.key === key);
    if (box !== undefined) {
      return {
        asset,
        box,
        world: {
          ...box,
          at: box.at.map((value, axis) =>
            value + asset.worldOriginVoxels[axis]!) as [number, number, number],
        },
      };
    }
  }
  throw new Error(`Missing compact minimum-form box '${key}'.`);
}

function occupiedCellKeys(
  boxes: readonly WindmillCompactBoxV1[],
): readonly string[] {
  const keys: string[] = [];
  boxes.forEach((box) => {
    for (let z = box.at[2]; z < box.at[2] + box.size[2]; z += 1) {
      for (let y = box.at[1]; y < box.at[1] + box.size[1]; y += 1) {
        for (let x = box.at[0]; x < box.at[0] + box.size[0]; x += 1) {
          keys.push(`${String(x)},${String(y)},${String(z)}`);
        }
      }
    }
  });
  return keys.sort();
}

function adjacentJournalZCells(
  candidate: WindmillCompactCandidateV1,
  journalKey: string,
): readonly number[] {
  const journal = locatedBox(candidate, journalKey).world;
  const cells = new Set<number>();
  candidate.requiredInterfaces.forEach((edge) => {
    const neighborKey = edge.fromBoxKey === journalKey
      ? edge.toBoxKey
      : edge.toBoxKey === journalKey ? edge.fromBoxKey : undefined;
    if (neighborKey === undefined) return;
    const neighbor = locatedBox(candidate, neighborKey).world;
    const start = Math.max(journal.at[2], neighbor.at[2]);
    const end = Math.min(
      journal.at[2] + journal.size[2],
      neighbor.at[2] + neighbor.size[2],
    );
    for (let z = start; z < end; z += 1) cells.add(z);
  });
  return [...cells];
}

describe('compact windmill irreducible cuboid cover', () => {
  it('ends each one-course journal at its outermost named interface datum', () => {
    const accepted = enumerateWindmillCompactGeometryV1().attempts
      .filter((attempt) => attempt.outcome === 'candidate');
    expect(accepted).toHaveLength(144);
    accepted.forEach(({ candidate }) => {
      [
        {
          key: 'rotor-shaft',
          portKeys: ['rotor-front-bearing', 'rotor-rear-bearing'],
        },
        {
          key: 'hammer-pivot-core',
          portKeys: ['frame-hammer-axis'],
        },
      ].forEach(({ key, portKeys }) => {
        const journal = locatedBox(candidate, key).world;
        const required = [...adjacentJournalZCells(candidate, key)];
        portKeys.forEach((portKey) => {
          const port = candidate.ports.find((entry) => entry.key === portKey);
          if (port === undefined) {
            throw new Error(`Missing compact minimum-form port '${portKey}'.`);
          }
          required.push(Math.floor(port.worldPositionVoxels[2]));
        });
        const first = Math.min(...required);
        const last = Math.max(...required);
        expect(journal.size.slice(0, 2), key).toEqual([1, 1]);
        expect(journal.at[2], `${key}:front terminal`).toBe(first);
        expect(
          journal.at[2] + journal.size[2] - 1,
          `${key}:rear terminal`,
        ).toBe(last);
        expect(required, `${key}:front requirement`).toContain(first);
        expect(required, `${key}:rear requirement`).toContain(last);
      });
    });
  });

  it('uses two slabs per sail with decomposition-invariant union, mass, and load frame', () => {
    const accepted = enumerateWindmillCompactGeometryV1().attempts
      .filter((attempt) => attempt.outcome === 'candidate');
    accepted.forEach(({ candidate }) => {
      const rotorAxis = candidate.ports.find((port) =>
        port.key === 'rotor-axis')?.worldPositionVoxels;
      if (rotorAxis === undefined) throw new Error('Missing rotor-axis port.');
      const creative = createWindmillCompactCreativeV1(candidate);
      (['north', 'south'] as const).forEach((side) => {
        const slabs = candidate.assets.rotor.boxes.filter((box) =>
          box.key.startsWith(`${side}-panel-step-`));
        expect(slabs, side).toHaveLength(2);
        slabs.forEach((slab) => {
          expect(slab.size[0], slab.key).toBe(2);
          expect(slab.size[2], slab.key).toBe(1);
        });
        const splitSlabs = slabs.flatMap((slab) => [0, 1].map((offset) => ({
          ...slab,
          key: `${slab.key}-split-${String(offset)}`,
          at: [slab.at[0] + offset, slab.at[1], slab.at[2]] as const,
          size: [1, slab.size[1], 1] as const,
        })));
        const splitAsset: WindmillCompactAssetV1 = {
          ...candidate.assets.rotor,
          boxes: candidate.assets.rotor.boxes
            .filter((box) => !slabs.includes(box))
            .concat(splitSlabs),
        };
        expect(occupiedCellKeys(splitSlabs), `${side}:union`)
          .toEqual(occupiedCellKeys(slabs));
        expect(splitSlabs.every((box) =>
          box.materialProfile === slabs[0]!.materialProfile)).toBe(true);
        expect(occupiedCellKeys(splitSlabs).length, `${side}:mass`)
          .toBe(occupiedCellKeys(slabs).length);
        const splitFrame = windmillCompactSailFrameV1(
          `${side}-sail`,
          splitAsset,
          rotorAxis,
        );
        const originalFrame = windmillCompactSailFrameV1(
          `${side}-sail`,
          candidate.assets.rotor,
          rotorAxis,
        );
        expect({
          ...splitFrame,
          panelBoxKeys: originalFrame.panelBoxKeys,
        }, `${side}:load-frame`).toEqual(originalFrame);

        const min = [0, 1, 2].map((axis) =>
          Math.min(...slabs.map((box) => box.at[axis]!)));
        const max = [0, 1, 2].map((axis) => Math.max(...slabs.map((box) =>
          box.at[axis]! + box.size[axis]!)));
        const oneCuboid: WindmillCompactBoxV1 = {
          ...slabs[0]!,
          key: `${side}-invalid-single-cuboid`,
          at: min as [number, number, number],
          size: max.map((value, axis) =>
            value - min[axis]!) as [number, number, number],
        };
        const union = occupiedCellKeys(slabs);
        const cuboid = occupiedCellKeys([oneCuboid]);
        expect(cuboid.length - union.length, `${side}:invented corners`)
          .toBe(2 * slabs[0]!.size[1]);
        expect(cuboid, `${side}:single cuboid changes occupancy`)
          .not.toEqual(union);
        const appearance = slabs.map((slab) =>
          creative.assets.rotor.boxes.find((box) =>
            box.boxKey === slab.key)!.appearance);
        expect(appearance[0]!.regionKey).toBe(appearance[1]!.regionKey);
        expect(appearance[0]!.memberBoxKeys)
          .toEqual(slabs.map((box) => box.key).sort());
      });
    });
  });
});
