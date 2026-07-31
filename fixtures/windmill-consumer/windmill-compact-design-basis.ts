import {
  createWindmillCompactCandidateV1,
  WINDMILL_COMPACT_PARAMETER_RANGES_V1,
  type WindmillCompactCandidateV1,
  type WindmillCompactMaterialProfileV1,
} from '../../tools/studio/windmill-compact-geometry.js';
import {
  windmillPitchedPlateLoadV1,
} from '../../tools/studio/pitched-plate-wind.js';

export const WINDMILL_COMPACT_MAXIMUM_ROTOR_ANGULAR_SPEED_RADIANS_PER_SECOND_V1 =
  24 as const;

interface WindmillCompactDensityProfileV1 {
  readonly densityKilogramsPerVoxelCube: number | null;
}

export interface WindmillCompactDesignBasisInputsV1 {
  readonly airDensityKilogramsPerCubicMeter: number;
  readonly dragCoefficient: number;
  readonly gravityMetersPerSecondSquared: number;
  readonly materialProfiles: Readonly<Record<
    WindmillCompactMaterialProfileV1,
    WindmillCompactDensityProfileV1
  >>;
}

type Triple = readonly [number, number, number];

function dot(left: Triple, right: Triple): number {
  return left.reduce((sum, value, axis) =>
    sum + value * right[axis]!, 0);
}

function subtract(left: Triple, right: Triple): Triple {
  return [
    left[0] - right[0],
    left[1] - right[1],
    left[2] - right[2],
  ];
}

function scale(vector: Triple, scalar: number): Triple {
  return [
    vector[0] * scalar,
    vector[1] * scalar,
    vector[2] * scalar,
  ];
}

function port(
  candidate: WindmillCompactCandidateV1,
  key: string,
): WindmillCompactCandidateV1['ports'][number] {
  const result = candidate.ports.find((entry) => entry.key === key);
  if (result === undefined) {
    throw new Error(
      `Cannot derive compact windmill design basis: exact port '${key}' is absent.`,
    );
  }
  return result;
}

function box(
  candidate: WindmillCompactCandidateV1,
  assetKey: 'rotor' | 'hammer',
  key: string,
): WindmillCompactCandidateV1['assets']['rotor']['boxes'][number] {
  const result = candidate.assets[assetKey].boxes.find((entry) =>
    entry.key === key);
  if (result === undefined) {
    throw new Error(
      `Cannot derive compact windmill design basis: exact ${assetKey} box `
      + `'${key}' is absent.`,
    );
  }
  return result;
}

function worldCenter(
  candidate: WindmillCompactCandidateV1,
  assetKey: 'rotor' | 'hammer',
  boxValue: ReturnType<typeof box>,
): Triple {
  const origin = candidate.assets[assetKey].worldOriginVoxels;
  return [
    origin[0] + boxValue.at[0] + boxValue.size[0] / 2,
    origin[1] + boxValue.at[1] + boxValue.size[1] / 2,
    origin[2] + boxValue.at[2] + boxValue.size[2] / 2,
  ];
}

function windTorqueMagnitude(
  candidate: WindmillCompactCandidateV1,
  inputs: Pick<
    WindmillCompactDesignBasisInputsV1,
    'airDensityKilogramsPerCubicMeter' | 'dragCoefficient'
  >,
  speedMetersPerSecond: number,
): number {
  const windRule = {
    airDensityKilogramsPerCubicMeter:
      inputs.airDensityKilogramsPerCubicMeter,
    dragCoefficient: inputs.dragCoefficient,
    windVelocityWorldMetersPerSecond:
      [0, 0, speedMetersPerSecond] as const,
  };
  const torque = candidate.sails.reduce((sum, sail) => {
    const leverMeters = scale(
      subtract(sail.localCentroidVoxels, sail.localShaftPointVoxels),
      candidate.grainMeters,
    );
    const load = windmillPitchedPlateLoadV1(
      windRule,
      sail.equivalentPlateAreaSquareMeters,
      sail.localNormalUnit,
      [0, 0, 0],
    );
    return sum + leverMeters[0] * load.forceWorldNewtons[1]
      - leverMeters[1] * load.forceWorldNewtons[0];
  }, 0);
  return Math.abs(torque);
}

function noLoadAngularSpeedPerWindSpeed(
  candidate: WindmillCompactCandidateV1,
): number {
  const coefficients = candidate.sails.map((sail) => {
    const leverMeters = scale(
      subtract(sail.localCentroidVoxels, sail.localShaftPointVoxels),
      candidate.grainMeters,
    );
    const tangentialVelocityPerRadianPerSecond: Triple = [
      -leverMeters[1],
      leverMeters[0],
      0,
    ];
    const tangentialNormalCoupling = dot(
      tangentialVelocityPerRadianPerSecond,
      sail.localNormalUnit,
    );
    if (Math.abs(tangentialNormalCoupling) <= Number.EPSILON) {
      throw new Error(
        `Cannot derive compact windmill design basis for '${candidate.parameterKey}': `
        + `sail '${sail.key}' has zero tangential-normal coupling.`,
      );
    }
    return Math.abs(
      sail.localNormalUnit[2] / tangentialNormalCoupling,
    );
  });
  if (Math.abs(coefficients[0]! - coefficients[1]!) > 1e-12) {
    throw new Error(
      `Cannot derive compact windmill design basis for '${candidate.parameterKey}': `
      + 'the opposed sails do not share one no-load angular-speed coefficient.',
    );
  }
  return coefficients[0]!;
}

function compactCandidateFamily(): readonly WindmillCompactCandidateV1[] {
  const candidates: WindmillCompactCandidateV1[] = [];
  for (const rotorRadiusVoxels of
    WINDMILL_COMPACT_PARAMETER_RANGES_V1.rotorRadiusVoxels) {
    for (const groundClearanceVoxels of
      WINDMILL_COMPACT_PARAMETER_RANGES_V1.groundClearanceVoxels) {
      for (const sailRadialSpanVoxels of
        WINDMILL_COMPACT_PARAMETER_RANGES_V1.sailRadialSpanVoxels) {
        for (const camRadialLengthVoxels of
          WINDMILL_COMPACT_PARAMETER_RANGES_V1.camRadialLengthVoxels) {
          for (const camHeightVoxels of
            WINDMILL_COMPACT_PARAMETER_RANGES_V1.camHeightVoxels) {
            for (const hammerRightArmLengthVoxels of
              WINDMILL_COMPACT_PARAMETER_RANGES_V1
                .hammerRightArmLengthVoxels) {
              for (const hammerHeadHeightVoxels of
                WINDMILL_COMPACT_PARAMETER_RANGES_V1
                  .hammerHeadHeightVoxels) {
                for (const initialHeadAnvilClearanceVoxels of
                  WINDMILL_COMPACT_PARAMETER_RANGES_V1
                    .initialHeadAnvilClearanceVoxels) {
                  candidates.push(createWindmillCompactCandidateV1({
                    rotorRadiusVoxels,
                    groundClearanceVoxels,
                    sailRadialSpanVoxels,
                    camRadialLengthVoxels,
                    camHeightVoxels,
                    hammerRightArmLengthVoxels,
                    hammerHeadHeightVoxels,
                    initialHeadAnvilClearanceVoxels,
                  }));
                }
              }
            }
          }
        }
      }
    }
  }
  return candidates;
}

function hammerGravityTorqueMagnitude(
  candidate: WindmillCompactCandidateV1,
  inputs: WindmillCompactDesignBasisInputsV1,
): number {
  const axis = port(candidate, 'hammer-axis').worldPositionVoxels;
  const torque = candidate.assets.hammer.boxes.reduce((sum, boxValue) => {
    const density = inputs.materialProfiles[boxValue.materialProfile]
      .densityKilogramsPerVoxelCube;
    if (density === null) {
      throw new Error(
        `Cannot derive compact windmill design basis: dynamic hammer box `
        + `'${boxValue.key}' has no declared mass.`,
      );
    }
    const volumeVoxels = boxValue.size.reduce(
      (product, size) => product * size,
      1,
    );
    const leverXMeters =
      (worldCenter(candidate, 'hammer', boxValue)[0] - axis[0])
      * candidate.grainMeters;
    const downwardForceNewtons = -density * volumeVoxels
      * inputs.gravityMetersPerSecondSquared;
    return sum + leverXMeters * downwardForceNewtons;
  }, 0);
  if (torque >= 0) {
    throw new Error(
      'Cannot derive compact windmill design basis: the exact hammer mass '
      + `distribution has ${String(torque)} N*m gravity torque, so it does `
      + 'not oppose the declared lifting direction.',
    );
  }
  return -torque;
}

export function deriveWindmillCompactDesignBasisV1(
  inputs: WindmillCompactDesignBasisInputsV1,
) {
  const reference = createWindmillCompactCandidateV1();
  const family = compactCandidateFamily();
  const maximumNoLoadAngularSpeedPerWindSpeed =
    Math.max(...family.map(noLoadAngularSpeedPerWindSpeed));
  const maximumWindFromNoLoadSpeedGate =
    WINDMILL_COMPACT_MAXIMUM_ROTOR_ANGULAR_SPEED_RADIANS_PER_SECOND_V1
    / maximumNoLoadAngularSpeedPerWindSpeed;
  const selectedWindSpeedMetersPerSecond =
    Math.floor(maximumWindFromNoLoadSpeedGate);
  const rotorAxis = port(reference, 'rotor-axis').worldPositionVoxels;
  const hammerAxis = port(reference, 'hammer-axis').worldPositionVoxels;
  const primaryNoseLeverMeters = Math.abs(
    worldCenter(
      reference,
      'rotor',
      box(reference, 'rotor', 'rotor-cam-nose'),
    )[0] - rotorAxis[0],
  ) * reference.grainMeters;
  const followerLeverMeters = Math.abs(
    worldCenter(
      reference,
      'hammer',
      box(reference, 'hammer', 'hammer-follower-shoe'),
    )[0]
      - hammerAxis[0],
  ) * reference.grainMeters;
  const centerlineMechanicalAdvantage =
    followerLeverMeters / primaryNoseLeverMeters;
  const gravityTorque = hammerGravityTorqueMagnitude(reference, inputs);
  const priorWindSpeedMetersPerSecond = 18;
  const priorShaftTorque = windTorqueMagnitude(
    reference,
    inputs,
    priorWindSpeedMetersPerSecond,
  );
  const priorMappedLiftTorque =
    priorShaftTorque * centerlineMechanicalAdvantage;
  const breakawayWindSpeedMetersPerSecond =
    priorWindSpeedMetersPerSecond
    * Math.sqrt(gravityTorque / priorMappedLiftTorque);
  const selectedShaftTorque = windTorqueMagnitude(
    reference,
    inputs,
    selectedWindSpeedMetersPerSecond,
  );
  const selectedMappedLiftTorque =
    selectedShaftTorque * centerlineMechanicalAdvantage;
  if (selectedWindSpeedMetersPerSecond <= breakawayWindSpeedMetersPerSecond
    || selectedWindSpeedMetersPerSecond
      > maximumWindFromNoLoadSpeedGate) {
    throw new Error(
      'Cannot derive compact windmill design basis: greatest whole-number '
      + `bounded wind ${String(selectedWindSpeedMetersPerSecond)} m/s must be `
      + `above breakaway ${String(breakawayWindSpeedMetersPerSecond)} m/s `
      + `and at most ${String(maximumWindFromNoLoadSpeedGate)} m/s; `
      + `the exact prior shaft/mapped torques were ${String(priorShaftTorque)} `
      + `and ${String(priorMappedLiftTorque)} N*m.`,
    );
  }
  return Object.freeze({
    schema: 'fixture.windmill-compact-design-basis/1' as const,
    referenceCandidateParameterKey: reference.parameterKey,
    candidateFamilyCount: family.length,
    noLoadSpeedBound: Object.freeze({
      derivation:
        'geometry-derived normal-flow zero on every exact sail in the finite candidate family',
      maximumAngularSpeedRadiansPerSecond:
        WINDMILL_COMPACT_MAXIMUM_ROTOR_ANGULAR_SPEED_RADIANS_PER_SECOND_V1,
      maximumNoLoadAngularSpeedPerWindSpeed,
      maximumWindSpeedMetersPerSecond: maximumWindFromNoLoadSpeedGate,
    }),
    quasiStaticCenterlineLoadPath: Object.freeze({
      primaryCamNoseLeverMeters: primaryNoseLeverMeters,
      followerLeverMeters,
      mechanicalAdvantage: centerlineMechanicalAdvantage,
      hammerGravityTorqueNewtonMeters: gravityTorque,
      breakawayWindSpeedMetersPerSecond,
    }),
    selectedWind: Object.freeze({
      selectionRule:
        'greatest whole-number m/s not exceeding the family-wide no-load speed bound',
      speedMetersPerSecond: selectedWindSpeedMetersPerSecond,
      shaftTorqueAtRestNewtonMeters: selectedShaftTorque,
      mappedHammerLiftTorqueAtRestNewtonMeters: selectedMappedLiftTorque,
      liftTorqueToGravityTorqueRatio:
        selectedMappedLiftTorque / gravityTorque,
      noLoadAngularSpeedRadiansPerSecond:
        selectedWindSpeedMetersPerSecond
        * maximumNoLoadAngularSpeedPerWindSpeed,
    }),
    rejectedPriorWind: Object.freeze({
      speedMetersPerSecond: priorWindSpeedMetersPerSecond,
      shaftTorqueAtRestNewtonMeters: priorShaftTorque,
      mappedHammerLiftTorqueAtRestNewtonMeters: priorMappedLiftTorque,
      reason:
        'its family-wide no-load angular speed exceeds the frozen safety gate',
    }),
    assumptions: Object.freeze([
      'zero rotor and follower speed for the breakaway torque witness',
      'centerline vertical contact force at the exact primary nose and follower centers',
      'fixed prescribed world flow with the same fixture pitched-plate law used by the operational run',
      'no friction, impact loss, wake, deformation, or dynamic-cycle prediction in this static witness',
    ]),
  });
}
