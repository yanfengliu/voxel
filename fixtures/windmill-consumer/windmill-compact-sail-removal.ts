import type {
  PhysicalAssetV1,
  PhysicalColliderV1,
} from '../../tools/studio/physical-asset.js';
import type {
  WindmillCompiledCompactCandidateV1,
} from './windmill-compact-physical-contract.js';
import {
  canonicalWindmillEvidenceJsonV1,
  windmillEvidenceSha256V1,
} from './windmill-evidence-hash.js';
import {
  deepFreezeWindmillEvidenceV1,
} from './windmill-evidence-freeze.js';
import {
  WINDMILL_OPERATIONAL_INPUTS_V1,
} from './windmill-operational-inputs.js';

export interface WindmillCompactSailRemovalEvidenceV1 {
  readonly sailKey: string;
  readonly removedBoxKeys: readonly string[];
  readonly removedOccupiedCells: readonly (readonly [
    number,
    number,
    number,
  ])[];
  readonly removedColliderCount: number;
  readonly removedLoadFrameCount: 1;
  readonly nominalRotorMassKilograms: number;
  readonly ablatedRotorMassKilograms: number;
  readonly ablatedRadialFirstMomentKilogramMeters:
    readonly [number, number, number];
  readonly ablatedAxialWeightedRadialCoupleKilogramMetersSquared:
    readonly [number, number, number];
  readonly effectiveVisibleGeometrySha256: string;
  readonly effectivePhysicalSidecarSha256: string;
  readonly effectiveMaximumVisibleTipRadiusMeters: number;
}

export const WINDMILL_RAPIER_MASS_PARITY_TOLERANCE_V1 = Object.freeze({
  absoluteKilograms: 1e-6,
  relative: 2e-6,
  boundary:
    'exact-TypeScript-sidecar-to-Rapier-float32-derived-mass-representation',
});

export function assertWindmillRapierMassParityV1(
  actualKilograms: number,
  expectedKilograms: number,
  label: string,
): void {
  const tolerance = WINDMILL_RAPIER_MASS_PARITY_TOLERANCE_V1
    .absoluteKilograms
    + WINDMILL_RAPIER_MASS_PARITY_TOLERANCE_V1.relative
      * Math.abs(expectedKilograms);
  if (!Number.isFinite(actualKilograms)
    || !Number.isFinite(expectedKilograms)
    || Math.abs(actualKilograms - expectedKilograms) > tolerance) {
    throw new Error(
      `Cannot verify ${label}: Rapier mass ${String(actualKilograms)} kg `
      + `differs from exact sidecar mass ${String(expectedKilograms)} kg by `
      + `${String(Math.abs(actualKilograms - expectedKilograms))} kg; allowed `
      + `${String(tolerance)} kg at the declared float32 solver boundary.`,
    );
  }
}

interface MassPropertiesV1 {
  readonly mass: number;
  readonly radialFirstMoment: readonly [number, number, number];
  readonly axialWeightedRadialCouple: readonly [number, number, number];
}

function massProperties(
  asset: PhysicalAssetV1,
  shaft: readonly [number, number, number],
  grainMeters: number,
): MassPropertiesV1 {
  let mass = 0;
  const radialFirstMoment = [0, 0, 0];
  const axialWeightedRadialCouple = [0, 0, 0];
  asset.colliders.forEach((collider) => {
    if (collider.shape.kind !== 'box' || collider.density === undefined) {
      throw new Error(
        `Cannot remove compact windmill sail: rotor collider on `
        + `'${asset.recipeId}' is not a finite-density box.`,
      );
    }
    const colliderMass = collider.density
      * collider.shape.halfExtents.reduce(
        (volume, halfExtent) => volume * halfExtent * 2,
        1,
      );
    const offset = collider.pose.position.map((value, axis) =>
      (value - shaft[axis]!) * grainMeters) as [number, number, number];
    const radial = [offset[0], offset[1], 0];
    mass += colliderMass;
    for (let axis = 0; axis < 3; axis += 1) {
      radialFirstMoment[axis] = radialFirstMoment[axis]!
        + colliderMass * radial[axis]!;
      axialWeightedRadialCouple[axis] =
        axialWeightedRadialCouple[axis]!
        +
        colliderMass * radial[axis]! * offset[2];
    }
  });
  return {
    mass,
    radialFirstMoment: radialFirstMoment as [number, number, number],
    axialWeightedRadialCouple:
      axialWeightedRadialCouple as [number, number, number],
  };
}

function remapIndices(
  indices: readonly number[],
  oldToNew: ReadonlyMap<number, number>,
  label: string,
): readonly number[] {
  return Object.freeze(indices.map((index) => {
    const remapped = oldToNew.get(index);
    if (remapped === undefined) {
      throw new Error(
        `Cannot remove compact windmill sail: removed collider index `
        + `${String(index)} is unexpectedly part of '${label}' contact.`,
      );
    }
    return remapped;
  }));
}

export function removeWindmillCompactSailV1(
  compiled: WindmillCompiledCompactCandidateV1,
  sailKey: string,
): {
  readonly compiled: WindmillCompiledCompactCandidateV1;
  readonly evidence: WindmillCompactSailRemovalEvidenceV1;
} {
  const sail = compiled.candidate.sails.find(({ key }) => key === sailKey);
  if (sail === undefined) {
    throw new Error(
      `Cannot remove sail '${sailKey}' from compact windmill `
      + `'${compiled.candidate.parameterKey}'; the named exact sail is absent.`,
    );
  }
  const sparKey = `${sailKey.replace(/-sail$/, '')}-spar`;
  const assemblyBoxes = [
    compiled.candidate.assets.rotor.boxes.find(({ key }) => key === sparKey),
    ...sail.panelBoxKeys.map((key) =>
      compiled.candidate.assets.rotor.boxes.find((box) => box.key === key)),
  ];
  if (assemblyBoxes.some((box) => box === undefined)) {
    throw new Error(
      `Cannot remove compact windmill sail '${sailKey}': exact spar and `
      + 'panel assembly boxes are not all present.',
    );
  }
  const exactAssemblyBoxes = assemblyBoxes as NonNullable<
    typeof assemblyBoxes[number]
  >[];
  const removedBoxKeys = exactAssemblyBoxes.map(({ key }) => key);
  const removedOccupiedCells = exactAssemblyBoxes.flatMap((box) => {
    const cells: [number, number, number][] = [];
    for (let z = box.at[2]; z < box.at[2] + box.size[2]; z += 1) {
      for (let y = box.at[1]; y < box.at[1] + box.size[1]; y += 1) {
        for (let x = box.at[0]; x < box.at[0] + box.size[0]; x += 1) {
          cells.push([x, y, z]);
        }
      }
    }
    return cells;
  });
  const removedCellKeys = new Set(
    removedOccupiedCells.map((cell) => cell.join(',')),
  );
  const removedKeys = new Set(removedBoxKeys);
  const oldIndices = compiled.boxColliderIndices.rotor;
  const removedIndices = new Set([...removedKeys].map((key) => {
    const index = oldIndices[key];
    if (index === undefined) {
      throw new Error(
        `Cannot remove compact windmill sail '${sailKey}': panel box `
        + `'${key}' has no compiled collider.`,
      );
    }
    return index;
  }));
  const oldToNew = new Map<number, number>();
  const colliders: PhysicalColliderV1[] = [];
  compiled.physicalAssets.rotor.colliders.forEach((collider, index) => {
    if (removedIndices.has(index)) return;
    oldToNew.set(index, colliders.length);
    colliders.push(collider);
  });
  const rotorAsset = Object.freeze({
    ...compiled.physicalAssets.rotor,
    recipeId: `${compiled.physicalAssets.rotor.recipeId}:without:${sailKey}`,
    colliders: Object.freeze(colliders),
    ports: Object.freeze(compiled.physicalAssets.rotor.ports.filter(({ key }) =>
      key !== `${sailKey}-load`)),
  });
  const rotorIndices = Object.freeze(Object.fromEntries(
    Object.entries(oldIndices)
      .filter(([key]) => !removedKeys.has(key))
      .map(([key, index]) => [key, oldToNew.get(index)!]),
  ));
  const contactColliderIndices = Object.freeze(
    compiled.contactColliderIndices.map((group) => Object.freeze({
      ...group,
      firstIndices: group.firstAssetKey === 'rotor'
        ? remapIndices(group.firstIndices, oldToNew, group.key)
        : group.firstIndices,
      secondIndices: group.secondAssetKey === 'rotor'
        ? remapIndices(group.secondIndices, oldToNew, group.key)
        : group.secondIndices,
    })),
  );
  const physicalAssets = Object.freeze({
    ...compiled.physicalAssets,
    rotor: rotorAsset,
  });
  const boxColliderIndices = Object.freeze({
    ...compiled.boxColliderIndices,
    rotor: rotorIndices,
  });
  const physicalSidecarSha256 = windmillEvidenceSha256V1([
    canonicalWindmillEvidenceJsonV1({
      physicalAssets,
      boxColliderIndices,
    }),
  ]);
  const effectiveVisibleGeometrySha256 = windmillEvidenceSha256V1([
    canonicalWindmillEvidenceJsonV1({
      baseVisibleGeometrySha256: compiled.visibleGeometrySha256,
      removedSailKey: sailKey,
      removedBoxKeys,
      removedOccupiedCells,
    }),
  ]);
  const solverInputSha256 = windmillEvidenceSha256V1([
    canonicalWindmillEvidenceJsonV1({
      operationalInputs: WINDMILL_OPERATIONAL_INPUTS_V1,
      bodyWorldMeters: compiled.bodyWorldMeters,
      activePorts: compiled.candidate.ports.filter(({ key }) =>
        key !== `${sailKey}-load`),
      contactColliderIndices,
      activePitchedPlateFrames: compiled.pitchedPlateFrames.filter(({ key }) =>
        key !== sailKey),
      removal: {
        effectiveVisibleGeometrySha256,
        physicalSidecarSha256,
      },
    }),
  ]);
  const effectiveCompiled = Object.freeze({
    ...compiled,
    physicalAssets,
    boxColliderIndices,
    contactColliderIndices,
    pitchedPlateFrames: Object.freeze(
      compiled.pitchedPlateFrames.filter(({ key }) => key !== sailKey),
    ),
    worldSailFrames: Object.freeze(
      compiled.worldSailFrames.filter(({ key }) => key !== sailKey),
    ),
    visibleGeometrySha256: effectiveVisibleGeometrySha256,
    physicalSidecarSha256,
    solverInputSha256,
  });
  const shaft = compiled.candidate.ports.find(({ key }) =>
    key === 'rotor-axis')?.positionVoxels;
  if (shaft === undefined) {
    throw new Error(
      'Cannot remove compact windmill sail: rotor-axis port is absent.',
    );
  }
  const nominalMass = massProperties(
    compiled.physicalAssets.rotor,
    shaft,
    compiled.candidate.grainMeters,
  );
  const ablatedMass = massProperties(
    rotorAsset,
    shaft,
    compiled.candidate.grainMeters,
  );
  const evidence = deepFreezeWindmillEvidenceV1({
    sailKey,
    removedBoxKeys: Object.freeze([...removedBoxKeys]),
    removedOccupiedCells: Object.freeze([...removedOccupiedCells]),
    removedColliderCount: removedIndices.size,
    removedLoadFrameCount: 1 as const,
    nominalRotorMassKilograms: nominalMass.mass,
    ablatedRotorMassKilograms: ablatedMass.mass,
    ablatedRadialFirstMomentKilogramMeters:
      ablatedMass.radialFirstMoment,
    ablatedAxialWeightedRadialCoupleKilogramMetersSquared:
      ablatedMass.axialWeightedRadialCouple,
    effectiveVisibleGeometrySha256,
    effectivePhysicalSidecarSha256: physicalSidecarSha256,
    effectiveMaximumVisibleTipRadiusMeters:
      compiled.candidate.assets.rotor.occupiedCells
        .filter((cell) => !removedCellKeys.has(cell.join(',')))
        .reduce((maximum, cell) => {
          let result = maximum;
          [0, 1].forEach((xCorner) => [0, 1].forEach((yCorner) => {
            const x = (
              cell[0] + xCorner
              - compiled.candidate.assets.rotor.bodyOriginVoxels[0]
              - shaft[0]
            ) * compiled.candidate.grainMeters;
            const y = (
              cell[1] + yCorner
              - compiled.candidate.assets.rotor.bodyOriginVoxels[1]
              - shaft[1]
            ) * compiled.candidate.grainMeters;
            result = Math.max(result, Math.hypot(x, y));
          }));
          return result;
        }, 0),
  });
  if (!(evidence.ablatedRotorMassKilograms
      < evidence.nominalRotorMassKilograms)
    || Math.hypot(...evidence.ablatedRadialFirstMomentKilogramMeters)
      <= 1e-9) {
    throw new Error(
      `Cannot remove compact windmill sail '${sailKey}': exact collider mass `
      + 'did not decrease or the remaining rotor stayed radially balanced.',
    );
  }
  return deepFreezeWindmillEvidenceV1({
    compiled: effectiveCompiled,
    evidence,
  });
}
