import { describe, expect, it } from 'vitest';

import {
  createWindmillCompactCandidateV1,
} from '../../tools/studio/windmill-compact-geometry.js';
import {
  WINDMILL_COMPACT_PHYSICAL_DECLARATION_SCHEMA_V1,
  createWindmillCompactPhysicalAssetsV1,
} from '../../tools/studio/windmill-compact-physical-assets.js';
import {
  WINDMILL_RECIPE_IDS_V1,
} from '../../tools/studio/windmill-layout.js';
import {
  validatePhysicalAssetV1,
} from '../../tools/studio/physical-asset.js';
import {
  WINDMILL_BODY_DYNAMICS_V1,
  WINDMILL_COMPACT_PHYSICAL_DECLARATION_V1,
  WINDMILL_MATERIAL_PROFILES_V1,
} from './windmill-operational-inputs.js';
import {
  assertWindmillCompactRotorBalanceV1,
  compileWindmillCompactCandidateV1,
  deriveWindmillCompactPanelBasisV1,
  windmillCompactSolverInputSha256V1,
} from './windmill-compact-physical.js';
import {
  WINDMILL_OPERATIONAL_INPUTS_V1,
} from './windmill-operational-inputs.js';

const ASSET_KEYS = ['frame', 'rotor', 'hammer', 'anvil'] as const;

function rotatedPositiveZ(
  rotation: readonly [number, number, number, number],
): readonly [number, number, number] {
  const [x, y, z, w] = rotation;
  return [
    2 * (x * z + w * y),
    2 * (y * z - w * x),
    1 - 2 * (x * x + y * y),
  ];
}

describe('compact windmill physical compiler', () => {
  it('adapts frozen operational constants without adding runtime policy', () => {
    expect(WINDMILL_COMPACT_PHYSICAL_DECLARATION_V1.schema).toBe(
      WINDMILL_COMPACT_PHYSICAL_DECLARATION_SCHEMA_V1,
    );
    expect(WINDMILL_COMPACT_PHYSICAL_DECLARATION_V1.materialProfiles)
      .toBe(WINDMILL_MATERIAL_PROFILES_V1);
    expect(Object.isFrozen(WINDMILL_COMPACT_PHYSICAL_DECLARATION_V1))
      .toBe(true);
    expect(Object.isFrozen(
      WINDMILL_COMPACT_PHYSICAL_DECLARATION_V1.dynamics,
    )).toBe(true);
    for (const key of ['rotor', 'hammer'] as const) {
      const source = WINDMILL_BODY_DYNAMICS_V1[key];
      const adapted = WINDMILL_COMPACT_PHYSICAL_DECLARATION_V1.dynamics[key];
      expect(Object.isFrozen(adapted)).toBe(true);
      expect(adapted).toEqual({
        linearDamping: source.linearDamping,
        angularDamping: source.angularDamping,
        gravityScale: source.gravityScale,
        continuous: source.continuousCollisionDetection,
      });
      expect(adapted).not.toHaveProperty('canSleep');
    }
  });

  it('consumes the exact shared sidecars, stable ids, and axis frames', () => {
    const candidate = createWindmillCompactCandidateV1();
    const shared = createWindmillCompactPhysicalAssetsV1(
      candidate,
      WINDMILL_COMPACT_PHYSICAL_DECLARATION_V1,
    );
    const compiled = compileWindmillCompactCandidateV1(candidate);
    const expectedAssets = Object.fromEntries(ASSET_KEYS.map((key) => [
      key,
      shared.physicalAssetBook[WINDMILL_RECIPE_IDS_V1[key]],
    ]));
    const expectedIndices = Object.fromEntries(ASSET_KEYS.map((key) => [
      key,
      shared.colliderIndexByBoxKey[WINDMILL_RECIPE_IDS_V1[key]],
    ]));
    expect(compiled.physicalAssets).toEqual(expectedAssets);
    expect(compiled.boxColliderIndices).toEqual(expectedIndices);
    for (const key of ASSET_KEYS) {
      const physical = compiled.physicalAssets[key];
      expect(physical.recipeId).toBe(WINDMILL_RECIPE_IDS_V1[key]);
      expect(physical).toEqual(
        shared.physicalAssetBook[WINDMILL_RECIPE_IDS_V1[key]],
      );
      expect(compiled.boxColliderIndices[key]).toEqual(
        shared.colliderIndexByBoxKey[WINDMILL_RECIPE_IDS_V1[key]],
      );
    }
    for (const sourcePort of candidate.ports) {
      const port = compiled.physicalAssets[sourcePort.assetKey].ports.find(
        ({ key }) => key === sourcePort.key,
      );
      expect(port, sourcePort.key).toBeDefined();
      if (sourcePort.axisUnit === undefined) {
        expect(port?.frame.rotation, sourcePort.key).toBeUndefined();
        continue;
      }
      const rotation = port?.frame.rotation;
      if (rotation === undefined) {
        throw new Error(
          `Shared sidecar port '${sourcePort.key}' lost its axis rotation.`,
        );
      }
      rotatedPositiveZ(rotation).forEach((value, axis) => {
        expect(value, `${sourcePort.key}:axis-${String(axis)}`)
          .toBeCloseTo(sourcePort.axisUnit![axis]!, 12);
      });
    }
  });

  it('compiles every exact visible box to one exact valid collider', () => {
    const compiled = compileWindmillCompactCandidateV1();
    Object.entries(compiled.candidate.assets).forEach(([key, geometry]) => {
      const physical = compiled.physicalAssets[
        key as keyof typeof compiled.physicalAssets
      ];
      expect(validatePhysicalAssetV1(physical)).toEqual([]);
      expect(physical.colliders).toHaveLength(geometry.boxes.length);
      geometry.boxes.forEach((box, index) => {
        const collider = physical.colliders[index]!;
        expect(compiled.boxColliderIndices[
          key as keyof typeof compiled.boxColliderIndices
        ][box.key]).toBe(index);
        expect(collider.shape).toEqual({
          kind: 'box',
          halfExtents: box.size.map((value) => value / 2),
        });
        expect(collider.pose.position).toEqual(box.at.map((value, axis) =>
          value + box.size[axis]! / 2
          - geometry.bodyOriginVoxels[axis]!));
      });
    });
  });

  it('preserves exact authored world centers through normalized body poses', () => {
    const compiled = compileWindmillCompactCandidateV1();
    const worldCenterVoxels = (
      assetKey: 'hammer' | 'anvil',
      boxKey: string,
    ) => {
      const collider = compiled.physicalAssets[assetKey].colliders[
        compiled.boxColliderIndices[assetKey][boxKey]!
      ]!;
      return collider.pose.position.map((value, axis) =>
        value + compiled.bodyWorldMeters[assetKey][axis]!
        / compiled.candidate.grainMeters);
    };
    expect(worldCenterVoxels('hammer', 'hammer-impact-toe'))
      .toEqual([13.5, 3.5, 6.5]);
    expect(worldCenterVoxels('hammer', 'hammer-head-mass'))
      .toEqual([13.5, 4.5, 6.5]);
    expect(worldCenterVoxels('anvil', 'anvil-impact-cap'))
      .toEqual([13.5, 2.5, 6.5]);
  });

  it('rederives the fitted plates and exposes distinct local/world frames', () => {
    const compiled = compileWindmillCompactCandidateV1();
    compiled.pitchedPlateFrames.forEach((frame, index) => {
      const declared = compiled.candidate.sails[index]!;
      expect(frame.localCentroidMeters).toEqual(
        declared.localCentroidVoxels.map((value) =>
          value * compiled.candidate.grainMeters),
      );
      expect(frame.equivalentPlateAreaSquareMeters).toBeCloseTo(
        declared.equivalentPlateAreaSquareMeters,
        12,
      );
      expect(compiled.worldSailFrames[index]!.centroidWorldMeters)
        .not.toEqual(frame.localCentroidMeters);
      expect(compiled.worldSailFrames[index]!.normalUnitWorld)
        .toEqual(frame.localNormalUnit);
    });
  });

  it('keeps aerodynamic load frames invariant to panel box seams', () => {
    const candidate = createWindmillCompactCandidateV1();
    const rotor = candidate.assets.rotor;
    const slabs = rotor.boxes.filter(({ key }) =>
      key.startsWith('north-panel-'));
    const strips = slabs.flatMap((box) => [
      {
        ...box,
        key: `${box.key}-x0`,
        size: [1, box.size[1], box.size[2]] as const,
      },
      {
        ...box,
        key: `${box.key}-x1`,
        at: [box.at[0] + 1, box.at[1], box.at[2]] as const,
        size: [1, box.size[1], box.size[2]] as const,
      },
    ]);
    const shaft = candidate.ports.find(({ key }) =>
      key === 'rotor-axis')!.positionVoxels;
    const slabBasis = deriveWindmillCompactPanelBasisV1(
      slabs,
      rotor.bodyOriginVoxels,
      shaft,
    );
    const stripBasis = deriveWindmillCompactPanelBasisV1(
      strips,
      rotor.bodyOriginVoxels,
      shaft,
    );
    expect(stripBasis).toEqual(slabBasis);
    const loadFrame = (basis: typeof slabBasis) => ({
      localCentroidMeters: basis.centroid.map((value) =>
        value * candidate.grainMeters),
      localRadialUnit: basis.radial,
      localChordUnit: basis.chord,
      localNormalUnit: basis.normal,
      radialSpanMeters: basis.radialSpan * candidate.grainMeters,
      chordSpanMeters: basis.chordSpan * candidate.grainMeters,
      equivalentPlateAreaSquareMeters:
        basis.equivalentAreaVoxels * candidate.grainMeters ** 2,
      massKilograms: basis.panelCells.length
        * WINDMILL_MATERIAL_PROFILES_V1.sail
          .densityKilogramsPerVoxelCube!,
    });
    expect(loadFrame(stripBasis)).toEqual(loadFrame(slabBasis));
  });

  it('rejects an aerodynamic datum detached from the exact step union', () => {
    const candidate = createWindmillCompactCandidateV1();
    const detached = {
      ...candidate,
      sails: [
        {
          ...candidate.sails[0],
          chordSpanVoxels: candidate.sails[0].chordSpanVoxels + 1,
        },
        candidate.sails[1],
      ],
    } as typeof candidate;
    expect(() => compileWindmillCompactCandidateV1(detached))
      .toThrow(/not the exact canonical generator result/i);
  });

  it('uses one density for both exact opposed cam lobes', () => {
    const compiled = compileWindmillCompactCandidateV1();
    const arm = compiled.physicalAssets.rotor.colliders[
      compiled.boxColliderIndices.rotor['rotor-cam-arm']!
    ]!;
    const nose = compiled.physicalAssets.rotor.colliders[
      compiled.boxColliderIndices.rotor['rotor-cam-nose']!
    ]!;
    const opposedArm = compiled.physicalAssets.rotor.colliders[
      compiled.boxColliderIndices.rotor['rotor-opposed-cam-arm']!
    ]!;
    const opposedNose = compiled.physicalAssets.rotor.colliders[
      compiled.boxColliderIndices.rotor['rotor-opposed-cam-nose']!
    ]!;
    expect(arm.density).toBe(
      WINDMILL_MATERIAL_PROFILES_V1.cam.densityKilogramsPerVoxelCube,
    );
    expect([nose.density, opposedArm.density, opposedNose.density])
      .toEqual([arm.density, arm.density, arm.density]);
    const rotorGeometry = compiled.candidate.assets.rotor;
    const shaft = compiled.candidate.ports.find(({ key }) =>
      key === 'rotor-axis')!.positionVoxels;
    const balanceBoxes = rotorGeometry.boxes;
    const moments = balanceBoxes.reduce((sum, box) => {
      const density = WINDMILL_MATERIAL_PROFILES_V1[
        box.materialProfile
      ].densityKilogramsPerVoxelCube!;
      const mass = box.size.reduce((product, size) => product * size, density);
      const center = box.at.map((value, axis) =>
        value + box.size[axis]! / 2
        - rotorGeometry.bodyOriginVoxels[axis]!);
      const radialX = center[0]! - shaft[0];
      const radialY = center[1]! - shaft[1];
      const axialZ = center[2]! - shaft[2];
      return {
        radial: [
          sum.radial[0] + mass * radialX,
          sum.radial[1] + mass * radialY,
        ],
        axialCouple: [
          sum.axialCouple[0] + mass * axialZ * radialX,
          sum.axialCouple[1] + mass * axialZ * radialY,
        ],
      };
    }, { radial: [0, 0], axialCouple: [0, 0] });
    expect(moments.radial[0]).toBeCloseTo(0, 12);
    expect(moments.radial[1]).toBeCloseTo(0, 12);
    expect(moments.axialCouple[0]).toBeCloseTo(0, 12);
    expect(moments.axialCouple[1]).toBeCloseTo(0, 12);
  });

  it('fails opposed-lobe removal and axial relocation balance witnesses', () => {
    const candidate = createWindmillCompactCandidateV1();
    const removed = {
      ...candidate,
      assets: {
        ...candidate.assets,
        rotor: {
          ...candidate.assets.rotor,
          boxes: candidate.assets.rotor.boxes.filter(({ key }) =>
            key !== 'rotor-opposed-cam-nose'),
        },
      },
    } as typeof candidate;
    expect(() => assertWindmillCompactRotorBalanceV1(removed))
      .toThrow(/dual-lobe cam volume .* must be equal/i);
    const relocated = {
      ...candidate,
      assets: {
        ...candidate.assets,
        rotor: {
          ...candidate.assets.rotor,
          boxes: candidate.assets.rotor.boxes.map((box) =>
            box.key === 'rotor-opposed-cam-nose'
              ? {
                  ...box,
                  at: [box.at[0], box.at[1], box.at[2] + 1] as const,
                }
              : box),
        },
      },
    } as typeof candidate;
    expect(() => assertWindmillCompactRotorBalanceV1(relocated))
      .toThrow(/axial-weighted radial couple/i);
  });

  it('binds exact geometry, sidecars, solver inputs, and evaluator', () => {
    const first = compileWindmillCompactCandidateV1();
    const second = compileWindmillCompactCandidateV1();
    [
      first.visibleGeometrySha256,
      first.physicalSidecarSha256,
      first.solverInputSha256,
      first.evaluatorDeclarationSha256,
    ].forEach((hash) => expect(hash).toMatch(/^[0-9a-f]{64}$/));
    expect(second.visibleGeometrySha256).toBe(first.visibleGeometrySha256);
    expect(second.physicalSidecarSha256).toBe(first.physicalSidecarSha256);
    expect(second.solverInputSha256).toBe(first.solverInputSha256);
    expect(second.evaluatorDeclarationSha256)
      .toBe(first.evaluatorDeclarationSha256);
    const changedPhysicalSidecarSha256 =
      first.physicalSidecarSha256[0] === '0'
        ? `1${first.physicalSidecarSha256.slice(1)}`
        : `0${first.physicalSidecarSha256.slice(1)}`;
    expect(windmillCompactSolverInputSha256V1({
      physicalSidecarSha256: first.physicalSidecarSha256,
      operationalInputs: WINDMILL_OPERATIONAL_INPUTS_V1,
      bodyWorldMeters: first.bodyWorldMeters,
      ports: first.candidate.ports,
      contactColliderIndices: first.contactColliderIndices,
      pitchedPlateFrames: first.pitchedPlateFrames,
    })).toBe(first.solverInputSha256);
    expect(windmillCompactSolverInputSha256V1({
      physicalSidecarSha256: changedPhysicalSidecarSha256,
      operationalInputs: WINDMILL_OPERATIONAL_INPUTS_V1,
      bodyWorldMeters: first.bodyWorldMeters,
      ports: first.candidate.ports,
      contactColliderIndices: first.contactColliderIndices,
      pitchedPlateFrames: first.pitchedPlateFrames,
    })).not.toBe(first.solverInputSha256);
  });
});
