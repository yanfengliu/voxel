import {
  createWindmillCompactCandidateV1,
} from './windmill-compact-geometry.js';
import {
  WINDMILL_COMPACT_PARAMETER_RANGES_V1,
  windmillCompactParameterKeyV1,
  type WindmillCompactCandidateV1,
  type WindmillCompactParametersV1,
} from './windmill-compact-geometry-contract.js';
import {
  windmillCompactFnv1a64V1,
} from './windmill-compact-geometry-math.js';

export const WINDMILL_COMPACT_ENUMERATION_SCHEMA_V1 =
  'studio.windmill-compact-enumeration/1' as const;

export interface WindmillCompactGenerationRejectionV1 {
  readonly gateId: 'anvil-ground-path-missing';
  readonly message: string;
}

export type WindmillCompactGenerationAttemptV1 =
  | {
    readonly outcome: 'candidate';
    readonly parameterKey: string;
    readonly parameters: WindmillCompactParametersV1;
    readonly candidate: WindmillCompactCandidateV1;
  }
  | {
    readonly outcome: 'rejected';
    readonly parameterKey: string;
    readonly parameters: WindmillCompactParametersV1;
    readonly rejection: WindmillCompactGenerationRejectionV1;
  };

export interface WindmillCompactEnumerationV1 {
  readonly schema: typeof WINDMILL_COMPACT_ENUMERATION_SCHEMA_V1;
  readonly declaredParameterCount: number;
  readonly acceptedCandidateCount: number;
  readonly generationRejectionCount: number;
  readonly attempts: readonly WindmillCompactGenerationAttemptV1[];
  readonly enumerationFingerprint: `fnv1a64:${string}`;
}

function parameterSpaceV1(): readonly WindmillCompactParametersV1[] {
  const parameters: WindmillCompactParametersV1[] = [];
  const ranges = WINDMILL_COMPACT_PARAMETER_RANGES_V1;
  for (const rotorRadiusVoxels of ranges.rotorRadiusVoxels) {
    for (const groundClearanceVoxels of ranges.groundClearanceVoxels) {
      for (const sailRadialSpanVoxels of ranges.sailRadialSpanVoxels) {
        for (const camRadialLengthVoxels of ranges.camRadialLengthVoxels) {
          for (const camHeightVoxels of ranges.camHeightVoxels) {
            for (const hammerRightArmLengthVoxels
              of ranges.hammerRightArmLengthVoxels) {
              for (const hammerHeadHeightVoxels
                of ranges.hammerHeadHeightVoxels) {
                for (const initialHeadAnvilClearanceVoxels
                  of ranges.initialHeadAnvilClearanceVoxels) {
                  parameters.push(Object.freeze({
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
  return Object.freeze(parameters);
}

function attemptCandidateV1(
  parameters: WindmillCompactParametersV1,
): WindmillCompactGenerationAttemptV1 {
  try {
    const candidate = createWindmillCompactCandidateV1(parameters);
    return Object.freeze({
      outcome: 'candidate',
      parameterKey: candidate.parameterKey,
      parameters,
      candidate,
    });
  } catch (error) {
    if (!(error instanceof Error)
      || !error.message.includes('direct-ground anvil face below y=0')) {
      throw error;
    }
    return Object.freeze({
      outcome: 'rejected',
      parameterKey: windmillCompactParameterKeyV1(parameters),
      parameters,
      rejection: Object.freeze({
        gateId: 'anvil-ground-path-missing',
        message: error.message,
      }),
    });
  }
}

export function enumerateWindmillCompactGeometryV1():
WindmillCompactEnumerationV1 {
  const attempts = Object.freeze(parameterSpaceV1().map(attemptCandidateV1));
  const evidence = Object.freeze({
    ranges: WINDMILL_COMPACT_PARAMETER_RANGES_V1,
    attempts: attempts.map((attempt) => Object.freeze({
      outcome: attempt.outcome,
      parameterKey: attempt.parameterKey,
      parameters: attempt.parameters,
      result: attempt.outcome === 'candidate'
        ? attempt.candidate.geometryFingerprint
        : attempt.rejection,
    })),
  });
  const acceptedCandidateCount = attempts.filter((attempt) =>
    attempt.outcome === 'candidate').length;
  return Object.freeze({
    schema: WINDMILL_COMPACT_ENUMERATION_SCHEMA_V1,
    declaredParameterCount: attempts.length,
    acceptedCandidateCount,
    generationRejectionCount: attempts.length - acceptedCandidateCount,
    attempts,
    enumerationFingerprint:
      windmillCompactFnv1a64V1(JSON.stringify(evidence)),
  });
}
