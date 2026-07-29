import type {
  WindmillCompactCandidateV1,
  WindmillCompactParametersV1,
} from '../../tools/studio/windmill-compact-geometry.js';
import {
  windmillCandidateCombinedEvaluationSha256V1,
  type WindmillCompactCandidateResultV1,
} from './windmill-candidate-ranking.js';
import {
  deepFreezeWindmillEvidenceV1,
} from './windmill-evidence-freeze.js';
import {
  WINDMILL_COMPACT_EVALUATOR_DECLARATION_V1,
} from './windmill-compact-evaluator-config.js';
import type {
  WindmillCompactParityEvidenceV1,
  WindmillCompactRunEvidenceV1,
} from './windmill-compact-evaluator-evidence.js';
import type {
  WindmillCompiledCompactCandidateV1,
} from './windmill-compact-physical-contract.js';
import {
  windmillCompactEffectiveInputSha256V1,
  windmillCompactRunEvidenceSha256V1,
} from './windmill-compact-run-input.js';
import type {
  WindmillForbiddenOverlapEvidenceV1,
} from './windmill-forbidden-overlap.js';

export function createWindmillCompactCandidateResultV1(
  candidate: WindmillCompactCandidateV1,
  compiled: WindmillCompiledCompactCandidateV1,
  evidence: WindmillCompactRunEvidenceV1,
  exactParity: WindmillCompactParityEvidenceV1,
  satisfiedInterfaceCount: number,
  overlap: WindmillForbiddenOverlapEvidenceV1,
): WindmillCompactCandidateResultV1<WindmillCompactParametersV1> {
  const effectiveInputSha256 = windmillCompactEffectiveInputSha256V1(
    compiled,
    evidence.effectiveRun,
  );
  const runEvidenceSha256 = windmillCompactRunEvidenceSha256V1(evidence);
  const draft: WindmillCompactCandidateResultV1<
    WindmillCompactParametersV1
  > = {
    parameters: candidate.parameters,
    parameterKey: candidate.parameterKey,
    provenance: {
      schema: 'fixture.windmill-compact-candidate-evaluation/1',
      visibleGeometrySha256: compiled.visibleGeometrySha256,
      physicalSidecarSha256: compiled.physicalSidecarSha256,
      solverInputSha256: compiled.solverInputSha256,
      evaluatorDeclarationSha256:
        compiled.evaluatorDeclarationSha256,
      effectiveInputSha256,
      runEvidenceSha256,
      combinedEvaluationSha256: '',
    },
    diagnostics: {
      geometry: {
        totalOccupiedVoxels: candidate.totalOccupiedVoxels,
        dynamicOccupiedVoxels: candidate.dynamicOccupiedVoxels,
        sceneEnvelopeVoxels: candidate.sceneEnvelopeVoxels,
      },
      structural: {
        requiredInterfaceCount: candidate.requiredInterfaces.length,
        satisfiedInterfaceCount,
        positiveOverlapCellCount: candidate.openingOverlapCellCount,
      },
      clearance: {
        fullSweepSamples: overlap.checks,
        minimumSeparationMeters: overlap.minimumSeparationMeters,
        allowedPenetrationMeters:
          WINDMILL_COMPACT_EVALUATOR_DECLARATION_V1.gates
            .maximumForbiddenPenetrationMeters,
      },
      parity: {
        checks: exactParity.checks,
        mismatchCount: exactParity.mismatchCount,
      },
      output: {
        qualifyingCycles: evidence.completedCausalCycles,
        minimumCycles:
          WINDMILL_COMPACT_EVALUATOR_DECLARATION_V1.gates
            .minimumCausalCycles,
        failedGateIds: evidence.failedGateIds,
      },
    },
  };
  return deepFreezeWindmillEvidenceV1({
    ...draft,
    provenance: {
      ...draft.provenance,
      combinedEvaluationSha256:
        windmillCandidateCombinedEvaluationSha256V1(draft),
    },
  });
}
