import { describe, expect, it } from 'vitest';

import {
  createWindmillCompactCandidateV1,
  windmillDefaultCompactParametersV1,
  type WindmillCompactAssetV1,
  type WindmillCompactBoxV1,
  type WindmillCompactTripleV1,
} from './windmill-compact-geometry.js';
import {
  assertNoWindmillOpeningVoxelOverlapV1,
  windmillCompactRequiredInterfacesV1,
} from './windmill-compact-geometry-evidence.js';

function worldBox(
  asset: WindmillCompactAssetV1,
  key: string,
): WindmillCompactBoxV1 {
  const box = asset.boxes.find((candidate) => candidate.key === key);
  if (box === undefined) throw new Error(`Missing compact box '${key}'.`);
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
      product * Math.max(
        0,
        Math.min(
          first.at[axis]! + first.size[axis]!,
          second.at[axis]! + second.size[axis]!,
        ) - Math.max(first.at[axis]!, second.at[axis]!),
      ), 1));
  }
  return area;
}

function cross(
  left: WindmillCompactTripleV1,
  right: WindmillCompactTripleV1,
): WindmillCompactTripleV1 {
  return [
    left[1] * right[2] - left[2] * right[1],
    left[2] * right[0] - left[0] * right[2],
    left[0] * right[1] - left[1] * right[0],
  ];
}

describe('compact windmill geometry source', () => {
  it('normalizes every exact disjoint occupied union to all six grid faces', () => {
    const candidate = createWindmillCompactCandidateV1();
    Object.values(candidate.assets).forEach((asset) => {
      expect(asset.occupiedVoxelCount).toBe(asset.occupiedCells.length);
      expect(new Set(asset.occupiedCells.map((cell) => cell.join(','))).size)
        .toBe(asset.occupiedCells.length);
      [0, 1, 2].forEach((axis) => {
        expect(Math.min(...asset.occupiedCells.map((cell) => cell[axis]!)))
          .toBe(0);
        expect(Math.max(...asset.occupiedCells.map((cell) => cell[axis]!)))
          .toBe(asset.sizeVoxels[axis]! - 1);
      });
    });
    expect(candidate.totalOccupiedVoxels).toBe(
      Object.values(candidate.assets).reduce(
        (sum, asset) => sum + asset.occupiedVoxelCount,
        0,
      ),
    );
    expect(candidate.dynamicOccupiedVoxels).toBe(
      candidate.assets.rotor.occupiedVoxelCount
      + candidate.assets.hammer.occupiedVoxelCount,
    );
  });

  it('derives two diametric fitted plate frames from visible stepped unions', () => {
    const candidate = createWindmillCompactCandidateV1();
    const [north, south] = candidate.sails;
    expect(north.panelOccupiedCells).toHaveLength(
      candidate.parameters.sailRadialSpanVoxels * 4,
    );
    expect(south.panelOccupiedCells).toHaveLength(
      north.panelOccupiedCells.length,
    );
    expect(north.localRadialUnit).toEqual([0, 1, 0]);
    expect(south.localRadialUnit).toEqual([0, -1, 0]);
    expect(north.localChordUnit[0]).toBeCloseTo(
      -south.localChordUnit[0],
      12,
    );
    expect(north.localChordUnit[2]).toBeCloseTo(
      south.localChordUnit[2],
      12,
    );
    const northCross = cross(
      north.localRadialUnit,
      north.localChordUnit,
    );
    const southCross = cross(
      south.localRadialUnit,
      south.localChordUnit,
    );
    north.localNormalUnit.forEach((component, axis) =>
      expect(component).toBeCloseTo(northCross[axis]!, 12));
    south.localNormalUnit.forEach((component, axis) =>
      expect(component).toBeCloseTo(southCross[axis]!, 12));
    for (const sail of candidate.sails) {
      expect(sail.chordSpanVoxels).toBeCloseTo(8 / Math.sqrt(5), 12);
      expect(sail.equivalentPlateAreaSquareVoxels).toBeCloseTo(
        sail.radialSpanVoxels * sail.chordSpanVoxels,
        12,
      );
      expect(sail.worldShaftPointVoxels.map((value, axis) =>
        value - candidate.assets.rotor.bodyWorldVoxels[axis]!))
        .toEqual(sail.localShaftPointVoxels);
      expect(sail.worldCentroidVoxels.map((value, axis) =>
        value - candidate.assets.rotor.bodyWorldVoxels[axis]!))
        .toEqual(sail.localCentroidVoxels);
      expect(sail.worldStepEndpointsVoxels.map((endpoint) =>
        endpoint.map((value, axis) =>
          value - candidate.assets.rotor.bodyWorldVoxels[axis]!)))
        .toEqual(sail.localStepEndpointsVoxels);
      expect(sail.honestyBoundary).toContain('equivalent-flat-plate');
    }
    const initialTorqueZ = candidate.sails.map((sail) => {
      const normalWind = sail.localNormalUnit[2];
      const forceScale = normalWind * Math.abs(normalWind);
      const forceX = sail.localNormalUnit[0] * forceScale;
      const forceY = sail.localNormalUnit[1] * forceScale;
      const leverX = sail.worldCentroidVoxels[0]
        - sail.worldShaftPointVoxels[0];
      const leverY = sail.worldCentroidVoxels[1]
        - sail.worldShaftPointVoxels[1];
      return leverX * forceY - leverY * forceX;
    });
    expect(initialTorqueZ.every((torque) => torque < 0)).toBe(true);
    expect(initialTorqueZ[0]).toBeCloseTo(initialTorqueZ[1]!, 12);
  });

  it('keeps the minimum mechanical chain face-connected at declared interfaces', () => {
    const candidate = createWindmillCompactCandidateV1();
    candidate.requiredInterfaces.forEach((required) => {
      const asset = Object.values(candidate.assets).find((candidateAsset) =>
        candidateAsset.boxes.some((box) =>
          box.key === required.fromBoxKey));
      if (!asset?.boxes.some((box) => box.key === required.toBoxKey)) {
        throw new Error(
          `Interface '${required.fromBoxKey}' -> '${required.toBoxKey}' `
          + 'does not stay inside one rigid asset.',
        );
      }
      expect(sharedFaceArea(
        worldBox(asset, required.fromBoxKey),
        worldBox(asset, required.toBoxKey),
      )).toBeGreaterThanOrEqual(required.minimumFaceAreaVoxels);
    });
    Object.values(candidate.assets).forEach((asset) => {
      if (asset.boxes.length > 1) {
        asset.boxes.forEach((box) => expect(
          candidate.requiredInterfaces.some((connection) =>
            connection.fromBoxKey === box.key
            || connection.toBoxKey === box.key),
        ).toBe(true));
      }
      if (!asset.dynamic) {
        expect(Math.min(...asset.occupiedCells.map((cell) =>
          cell[1] + asset.worldOriginVoxels[1]))).toBe(0);
      }
    });
    expect(candidate.openingOverlapCellCount).toBe(0);
    expect(worldBox(candidate.assets.rotor, 'rotor-shaft').size.slice(0, 2))
      .toEqual([1, 1]);
    expect(worldBox(candidate.assets.hammer, 'hammer-pivot-core').size.slice(0, 2))
      .toEqual([1, 1]);
    const pivot = worldBox(candidate.assets.hammer, 'hammer-pivot-core');
    const rightBeam = worldBox(candidate.assets.hammer, 'hammer-right-beam');
    expect(sharedFaceArea(pivot, rightBeam)).toBe(1);
    expect(candidate.requiredInterfaces).toContainEqual(
      expect.objectContaining({
        fromBoxKey: 'hammer-pivot-core',
        toBoxKey: 'hammer-right-beam',
        minimumFaceAreaVoxels: 1,
      }),
    );
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
  });

  it('rests the head on the anvil and routes the base through fixed posts', () => {
    const { assets, parameters } = createWindmillCompactCandidateV1();
    const head = worldBox(assets.hammer, 'hammer-impact-toe');
    const face = worldBox(assets.anvil, 'anvil-impact-cap');
    const rotorPost = worldBox(
      assets.frame,
      'rotor-rear-bearing-left-post',
    );
    const xRail = worldBox(assets.frame, 'rotor-to-hammer-ground-x');
    const zRail = worldBox(assets.frame, 'rotor-to-hammer-ground-z');
    const hammerPost = worldBox(
      assets.frame,
      'hammer-rear-bearing-left-post',
    );
    expect(parameters.initialHeadAnvilClearanceVoxels).toBe(0);
    expect(face.at[1] + face.size[1]).toBe(head.at[1]);
    expect(sharedFaceArea(rotorPost, zRail)).toBe(1);
    expect(sharedFaceArea(zRail, xRail)).toBe(1);
    expect(sharedFaceArea(xRail, hammerPost)).toBe(1);
    expect(xRail.size).toEqual([7, 1, 1]);
    expect(xRail.at).toEqual([-2, 0, 9]);
    expect(zRail.at).toEqual([-2, 0, 4]);
  });

  it('mirrors the same-density arm and nose exactly in their own plane', () => {
    const { assets, parameters } = createWindmillCompactCandidateV1();
    const { rotor } = assets;
    const arm = worldBox(rotor, 'rotor-cam-arm');
    const nose = worldBox(rotor, 'rotor-cam-nose');
    const opposedArm = worldBox(rotor, 'rotor-opposed-cam-arm');
    const opposedNose = worldBox(rotor, 'rotor-opposed-cam-nose');
    const volume = (box: WindmillCompactBoxV1) =>
      box.size.reduce((product, size) => product * size, 1);
    const cells = (box: WindmillCompactBoxV1) => {
      const result: string[] = [];
      for (let z = box.at[2]; z < box.at[2] + box.size[2]; z += 1) {
        for (let y = box.at[1]; y < box.at[1] + box.size[1]; y += 1) {
          for (let x = box.at[0]; x < box.at[0] + box.size[0]; x += 1) {
            result.push(`${String(x)},${String(y)},${String(z)}`);
          }
        }
      }
      return result;
    };
    expect(arm.materialProfile).toBe('cam');
    expect(arm.collisionRole).toBe('inert-solid');
    expect(nose.materialProfile).toBe('cam');
    expect(nose.collisionRole).toBe('cam');
    expect(opposedArm.materialProfile).toBe('cam');
    expect(opposedArm.collisionRole).toBe('inert-solid');
    expect(opposedNose.materialProfile).toBe('cam');
    expect(opposedNose.collisionRole).toBe('cam');
    expect(volume(opposedArm) + volume(opposedNose))
      .toBe(volume(arm) + volume(nose));
    const mirroredCamCells = [...cells(arm), ...cells(nose)]
      .map((cell) => {
        const [x, y, z] = cell.split(',').map(Number);
        return `${String(-x!)},${String(y!)},${String(z!)}`;
      }).sort();
    expect([...cells(opposedArm), ...cells(opposedNose)].sort())
      .toEqual(mirroredCamCells);
    expect(opposedArm.size).toEqual([
      parameters.camRadialLengthVoxels - 1,
      1,
      1,
    ]);
    expect(opposedNose.size).toEqual([1, 1, 1]);
  });

  it('captures each journal with four sweep-clear corner liners', () => {
    const { assets } = createWindmillCompactCandidateV1();
    const journalAtBearing = [
      ['rotor-front-bearing', assets.rotor, 'rotor-shaft'],
      ['rotor-rear-bearing', assets.rotor, 'rotor-shaft'],
      ['hammer-rear-bearing', assets.hammer, 'hammer-pivot-core'],
    ] as const;
    journalAtBearing.forEach(([prefix, asset, journalKey]) => {
      const journal = worldBox(asset, journalKey);
      const journalCenter = [
        journal.at[0] + journal.size[0] / 2,
        journal.at[1] + journal.size[1] / 2,
      ] as const;
      const journalSweptRadius = Math.SQRT1_2;
      ['lower-left', 'lower-right', 'upper-left', 'upper-right']
        .forEach((side) => {
          const liner = worldBox(assets.frame, `${prefix}-${side}-liner`);
          expect(liner.role).toBe('bearing-liner');
          expect(sharedFaceArea(liner, journal)).toBe(0);
          const closestX = Math.max(
            liner.at[0],
            Math.min(journalCenter[0], liner.at[0] + liner.size[0]),
          );
          const closestY = Math.max(
            liner.at[1],
            Math.min(journalCenter[1], liner.at[1] + liner.size[1]),
          );
          expect(Math.hypot(
            closestX - journalCenter[0],
            closestY - journalCenter[1],
          )).toBeCloseTo(journalSweptRadius, 12);
        });
    });
  });

  it('supports the one-cell terminal head and changes its bound fingerprint', () => {
    const baseline = createWindmillCompactCandidateV1();
    const compactHead = createWindmillCompactCandidateV1({
      ...windmillDefaultCompactParametersV1(),
      hammerHeadHeightVoxels: 1,
      hammerRightArmLengthVoxels: 3,
    });
    expect(worldBox(compactHead.assets.hammer, 'hammer-impact-toe').size)
      .toEqual([1, 1, 1]);
    expect(compactHead.assets.hammer.boxes.some((box) =>
      box.key === 'hammer-head-mass')).toBe(false);
    expect(worldBox(compactHead.assets.anvil, 'anvil-impact-cap').at[0])
      .toBe(worldBox(
        compactHead.assets.hammer,
        'hammer-impact-toe',
      ).at[0]);
    expect(compactHead.geometryFingerprint)
      .not.toBe(baseline.geometryFingerprint);
    expect(createWindmillCompactCandidateV1().geometryFingerprint)
      .toBe(baseline.geometryFingerprint);
  });

  it('rejects parameters outside the declared finite design space', () => {
    expect(() => createWindmillCompactCandidateV1({
      ...windmillDefaultCompactParametersV1(),
      rotorRadiusVoxels: 7,
    } as unknown as ReturnType<typeof windmillDefaultCompactParametersV1>))
      .toThrow(
        /parameter 'rotorRadiusVoxels' as 7; expected one of \[5, 6\]/i,
      );
  });

  it('rejects a disconnected rigid component and opening-pose overlap', () => {
    const candidate = createWindmillCompactCandidateV1();
    const rotor = candidate.assets.rotor;
    const disconnectedRotor = {
      ...rotor,
      boxes: rotor.boxes.map((box) => box.key === 'north-panel-step-z0'
        ? {
          ...box,
          at: [
            box.at[0] + 100,
            box.at[1],
            box.at[2],
          ] as const,
        }
        : box),
    };
    expect(() => windmillCompactRequiredInterfacesV1(
      candidate.parameters,
      { rotor: disconnectedRotor },
    )).toThrow(/interface need/i);

    const rotorWorldCell = rotor.occupiedCells[0]!.map((value, axis) =>
      value + rotor.worldOriginVoxels[axis]!) as [
      number,
      number,
      number,
    ];
    const anvil = candidate.assets.anvil;
    const anvilFirstCell = anvil.occupiedCells[0]!;
    const overlappingAnvil = {
      ...anvil,
      worldOriginVoxels: rotorWorldCell.map((value, axis) =>
        value - anvilFirstCell[axis]!) as [
        number,
        number,
        number,
      ],
    };
    expect(() => assertNoWindmillOpeningVoxelOverlapV1({
      rotor,
      anvil: overlappingAnvil,
    })).toThrow(/occupy world voxel/i);
  });
});
