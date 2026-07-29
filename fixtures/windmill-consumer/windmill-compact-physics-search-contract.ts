import type {
  WindmillCompactCamNoseKeyV1,
  WindmillCompactParametersV1,
} from '../../tools/studio/windmill-compact-geometry.js';

export interface WindmillCompactPhysicsSearchProgressV1 {
  readonly stage: 'analytic' | 'short' | 'full';
  readonly completed: number;
  readonly total: number;
  readonly parameterKey?: string;
  readonly passingFullCount?: number;
  readonly firstPassingParameters?: WindmillCompactParametersV1;
}

export interface WindmillCompactPhysicsRunRecordV1 {
  readonly parameterKey: string;
  readonly parameters: WindmillCompactParametersV1;
  readonly combinedEvaluationSha256: string;
  readonly runEvidenceSha256: string;
  readonly evaluationFailedGateIds: readonly string[];
  readonly completedCausalCycles: number;
  readonly qualifiedCausalCyclesByNose: Readonly<Record<
    WindmillCompactCamNoseKeyV1,
    number
  >>;
  readonly maximumHeadLiftMeters: number;
  readonly maximumRotorAngularSpeedRadiansPerSecond: number;
  readonly maximumRotorAxisDirectionRateRadiansPerSecond: number;
  readonly maximumHammerAxisDirectionRateRadiansPerSecond: number;
  readonly minimumForbiddenSeparationMeters: number;
  readonly closestForbiddenPair: string;
  readonly maximumCamFollowerPenetrationMeters: number;
  readonly maximumHeadAnvilPenetrationMeters: number;
  readonly passesEvaluation: boolean;
}

export interface WindmillCompactPhysicsSearchEvidenceV1 {
  readonly schema: 'fixture.windmill-compact-physics-search/1';
  readonly enumerationFingerprint: string;
  readonly declaredAttemptCount: number;
  readonly generationRejectedCount: number;
  readonly analyticAcceptedCount: number;
  readonly manifestSha256: string;
  readonly shortRangeStart: number;
  readonly shortRangeEndExclusive: number;
  readonly rangeParameterKeys: readonly string[];
  readonly shortEvaluatedCount: number;
  readonly shortRejectedCount: number;
  readonly fullEvaluatedCount: number;
  readonly fullPassingCount: number;
  readonly generationRejections: readonly {
    readonly parameterKey: string;
    readonly parameters: WindmillCompactParametersV1;
    readonly gateId: string;
    readonly message: string;
  }[];
  readonly analyticRecords: readonly {
    readonly parameterKey: string;
    readonly visibleGeometrySha256: string;
    readonly physicalSidecarSha256: string;
    readonly solverInputSha256: string;
    readonly evaluatorDeclarationSha256: string;
    readonly exactParityChecks: number;
  }[];
  readonly shortRecords: readonly (
    WindmillCompactPhysicsRunRecordV1 & {
      readonly shortMonotoneFailedGateIds: readonly string[];
    }
  )[];
  readonly fullRecords: readonly WindmillCompactPhysicsRunRecordV1[];
  readonly passingParameters: readonly WindmillCompactParametersV1[];
  readonly firstPassingParameterKey: string | null;
  readonly firstPassingCombinedEvaluationSha256: string | null;
  readonly defaultFullRecord: WindmillCompactPhysicsRunRecordV1 | null;
  readonly defaultWasSeparateAudit: boolean;
  readonly searchEvidenceSha256: string;
}

export interface WindmillCompactPhysicsSearchManifestV1 {
  readonly schema: 'fixture.windmill-compact-physics-search-manifest/1';
  readonly enumerationFingerprint: string;
  readonly declaredAttemptCount: number;
  readonly generationRejectedCount: number;
  readonly analyticAcceptedCount: number;
  readonly generationRejections:
    WindmillCompactPhysicsSearchEvidenceV1['generationRejections'];
  readonly analyticRecords:
    WindmillCompactPhysicsSearchEvidenceV1['analyticRecords'];
  readonly orderedCandidateKeys: readonly string[];
  readonly defaultParameterKey: string;
  readonly manifestSha256: string;
}

export interface WindmillCompactPhysicsSearchOptionsV1 {
  readonly rangeStart?: number;
  readonly rangeEndExclusive?: number;
  readonly expectedManifestSha256?: string;
  readonly expectedRangeParameterKeys?: readonly string[];
}
