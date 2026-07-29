export interface WindmillCompactCandidateProvenanceV1 {
  readonly schema: 'fixture.windmill-compact-candidate-evaluation/1';
  readonly visibleGeometrySha256: string;
  readonly physicalSidecarSha256: string;
  readonly solverInputSha256: string;
  readonly evaluatorDeclarationSha256: string;
  readonly effectiveInputSha256: string;
  readonly runEvidenceSha256: string;
  readonly combinedEvaluationSha256: string;
}

export interface WindmillCompactCandidateDiagnosticsV1 {
  readonly geometry: {
    readonly totalOccupiedVoxels: number;
    readonly dynamicOccupiedVoxels: number;
    readonly sceneEnvelopeVoxels: readonly [number, number, number];
  };
  readonly structural: {
    readonly requiredInterfaceCount: number;
    readonly satisfiedInterfaceCount: number;
    readonly positiveOverlapCellCount: number;
  };
  readonly clearance: {
    readonly fullSweepSamples: number;
    readonly minimumSeparationMeters: number;
    readonly allowedPenetrationMeters: number;
  };
  readonly parity: {
    readonly checks: number;
    readonly mismatchCount: number;
  };
  readonly output: {
    readonly qualifyingCycles: number;
    readonly minimumCycles: number;
    readonly failedGateIds: readonly string[];
  };
}

export interface WindmillCompactCandidateResultV1<Parameters> {
  readonly parameters: Parameters;
  readonly parameterKey: string;
  readonly provenance: WindmillCompactCandidateProvenanceV1;
  readonly diagnostics: WindmillCompactCandidateDiagnosticsV1;
}

const SHA256 = /^[0-9a-f]{64}$/;

export function windmillCandidateCombinedEvaluationSha256V1(
  candidate: WindmillCompactCandidateResultV1<unknown>,
): string {
  return sha256V1([canonicalJsonV1({
    schema: candidate.provenance.schema,
    parameters: candidate.parameters,
    parameterKey: candidate.parameterKey,
    visibleGeometrySha256: candidate.provenance.visibleGeometrySha256,
    physicalSidecarSha256: candidate.provenance.physicalSidecarSha256,
    solverInputSha256: candidate.provenance.solverInputSha256,
    evaluatorDeclarationSha256:
      candidate.provenance.evaluatorDeclarationSha256,
    effectiveInputSha256: candidate.provenance.effectiveInputSha256,
    runEvidenceSha256: candidate.provenance.runEvidenceSha256,
    diagnostics: candidate.diagnostics,
  })]);
}

function requireCount(value: number, label: string, key: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(
      `Cannot rank windmill compact candidate '${key}': ${label} is `
      + `${String(value)}; expected a non-negative safe integer derived from `
      + 'the exact visible candidate occupied-cell union.',
    );
  }
}

function validateProvenance(
  candidate: WindmillCompactCandidateResultV1<unknown>,
): void {
  const { provenance, parameterKey } = candidate;
  if (provenance.schema !== 'fixture.windmill-compact-candidate-evaluation/1') {
    throw new Error(
      `Cannot rank windmill compact candidate '${parameterKey}': provenance `
      + `schema '${String(provenance.schema)}' is not the supported evaluation schema.`,
    );
  }
  Object.entries(provenance).forEach(([name, value]) => {
    if (name !== 'schema' && (typeof value !== 'string' || !SHA256.test(value))) {
      throw new Error(
        `Cannot rank windmill compact candidate '${parameterKey}': provenance `
        + `'${name}' is not a lowercase SHA-256 binding.`,
      );
    }
  });
  const expectedCombined = windmillCandidateCombinedEvaluationSha256V1(
    candidate,
  );
  if (provenance.combinedEvaluationSha256 !== expectedCombined) {
    throw new Error(
      `Cannot rank windmill compact candidate '${parameterKey}': combined `
      + `evaluation hash '${provenance.combinedEvaluationSha256}' does not bind `
      + `its parameter tuple, exact geometry, sidecar, solver input, evaluator `
      + `declaration, effective run inputs, full run evidence, and diagnostics; `
      + `expected '${expectedCombined}'.`,
    );
  }
}

function geometry(
  candidate: WindmillCompactCandidateResultV1<unknown>,
): WindmillCompactCandidateDiagnosticsV1['geometry'] {
  return candidate.diagnostics.geometry;
}

function envelopeVolume(
  candidate: WindmillCompactCandidateResultV1<unknown>,
): number {
  const extents = geometry(candidate).sceneEnvelopeVoxels;
  extents.forEach((value, axis) => {
    requireCount(value, `scene envelope axis ${String(axis)}`, candidate.parameterKey);
    if (value === 0) {
      throw new Error(
        `Cannot rank windmill compact candidate '${candidate.parameterKey}': `
        + `scene envelope axis ${String(axis)} is zero for a nonempty mechanism.`,
      );
    }
  });
  const volume = extents.reduce((product, extent) => product * extent, 1);
  if (!Number.isSafeInteger(volume)) {
    throw new Error(
      `Cannot rank windmill compact candidate '${candidate.parameterKey}': `
      + `scene envelope volume ${String(volume)} is not a safe integer.`,
    );
  }
  return volume;
}

function validateCandidate(
  candidate: WindmillCompactCandidateResultV1<unknown>,
): void {
  validateProvenance(candidate);
  const diagnostic = candidate.diagnostics;
  requireCount(
    diagnostic.geometry.totalOccupiedVoxels,
    'total occupied voxels',
    candidate.parameterKey,
  );
  requireCount(
    diagnostic.geometry.dynamicOccupiedVoxels,
    'dynamic occupied voxels',
    candidate.parameterKey,
  );
  if (diagnostic.geometry.totalOccupiedVoxels === 0
    || diagnostic.geometry.dynamicOccupiedVoxels
      > diagnostic.geometry.totalOccupiedVoxels) {
    throw new Error(
      `Cannot rank windmill compact candidate '${candidate.parameterKey}': `
      + 'occupied totals must describe a nonempty mechanism with dynamic '
      + 'voxels no greater than total voxels.',
    );
  }
  const countFields = [
    ['required structural interfaces', diagnostic.structural.requiredInterfaceCount],
    ['satisfied structural interfaces', diagnostic.structural.satisfiedInterfaceCount],
    ['positive-overlap cells', diagnostic.structural.positiveOverlapCellCount],
    ['full-sweep clearance samples', diagnostic.clearance.fullSweepSamples],
    ['parity checks', diagnostic.parity.checks],
    ['parity mismatches', diagnostic.parity.mismatchCount],
    ['qualifying cycles', diagnostic.output.qualifyingCycles],
    ['minimum cycles', diagnostic.output.minimumCycles],
  ] as const;
  countFields.forEach(([label, value]) =>
    requireCount(value, label, candidate.parameterKey));
  if (diagnostic.structural.satisfiedInterfaceCount
      > diagnostic.structural.requiredInterfaceCount
    || diagnostic.parity.mismatchCount > diagnostic.parity.checks
    || diagnostic.output.minimumCycles === 0) {
    throw new Error(
      `Cannot rank windmill compact candidate '${candidate.parameterKey}': `
      + 'structured gate counts are internally inconsistent.',
    );
  }
  if (!Number.isFinite(diagnostic.clearance.minimumSeparationMeters)
    || !Number.isFinite(diagnostic.clearance.allowedPenetrationMeters)
    || diagnostic.clearance.allowedPenetrationMeters < 0) {
    throw new Error(
      `Cannot rank windmill compact candidate '${candidate.parameterKey}': `
      + 'clearance distances must be finite and allowed penetration non-negative.',
    );
  }
  const failedGateIds = new Set(diagnostic.output.failedGateIds);
  if (failedGateIds.size !== diagnostic.output.failedGateIds.length
    || [...failedGateIds].some((id) => id.length === 0)) {
    throw new Error(
      `Cannot rank windmill compact candidate '${candidate.parameterKey}': `
      + 'failed output gate ids must be nonempty and unique.',
    );
  }
  envelopeVolume(candidate);
}

export function assertWindmillCompactCandidateResultV1(
  candidate: WindmillCompactCandidateResultV1<unknown>,
): void {
  validateCandidate(candidate);
}

export function windmillCandidatePassesV1(
  candidate: WindmillCompactCandidateResultV1<unknown>,
): boolean {
  validateCandidate(candidate);
  const { structural, clearance, parity, output } = candidate.diagnostics;
  return structural.requiredInterfaceCount > 0
    && structural.satisfiedInterfaceCount === structural.requiredInterfaceCount
    && structural.positiveOverlapCellCount === 0
    && clearance.fullSweepSamples > 0
    && clearance.minimumSeparationMeters >= -clearance.allowedPenetrationMeters
    && parity.checks > 0
    && parity.mismatchCount === 0
    && output.qualifyingCycles >= output.minimumCycles
    && output.failedGateIds.length === 0;
}

export function compareWindmillCompactCandidatesV1(
  left: WindmillCompactCandidateResultV1<unknown>,
  right: WindmillCompactCandidateResultV1<unknown>,
): number {
  validateCandidate(left);
  validateCandidate(right);
  const leftGeometry = geometry(left);
  const rightGeometry = geometry(right);
  const leftPasses = windmillCandidatePassesV1(left);
  const rightPasses = windmillCandidatePassesV1(right);
  if (leftPasses !== rightPasses) return leftPasses ? -1 : 1;
  return leftGeometry.totalOccupiedVoxels - rightGeometry.totalOccupiedVoxels
    || leftGeometry.dynamicOccupiedVoxels - rightGeometry.dynamicOccupiedVoxels
    || envelopeVolume(left) - envelopeVolume(right)
    || leftGeometry.sceneEnvelopeVoxels[0] - rightGeometry.sceneEnvelopeVoxels[0]
    || leftGeometry.sceneEnvelopeVoxels[1] - rightGeometry.sceneEnvelopeVoxels[1]
    || leftGeometry.sceneEnvelopeVoxels[2] - rightGeometry.sceneEnvelopeVoxels[2]
    || (left.parameterKey < right.parameterKey
      ? -1
      : left.parameterKey > right.parameterKey ? 1 : 0);
}

function dominates(
  left: WindmillCompactCandidateResultV1<unknown>,
  right: WindmillCompactCandidateResultV1<unknown>,
): boolean {
  const leftGeometry = geometry(left);
  const rightGeometry = geometry(right);
  const leftMetrics = [
    leftGeometry.totalOccupiedVoxels,
    leftGeometry.dynamicOccupiedVoxels,
    envelopeVolume(left),
  ];
  const rightMetrics = [
    rightGeometry.totalOccupiedVoxels,
    rightGeometry.dynamicOccupiedVoxels,
    envelopeVolume(right),
  ];
  return leftMetrics.every((value, index) => value <= rightMetrics[index]!)
    && leftMetrics.some((value, index) => value < rightMetrics[index]!);
}

export function selectWindmillVisualReviewSetV1<Parameters>(
  candidates: readonly WindmillCompactCandidateResultV1<Parameters>[],
  maximumCandidates = 5,
): readonly WindmillCompactCandidateResultV1<Parameters>[] {
  if (!Number.isSafeInteger(maximumCandidates) || maximumCandidates <= 0) {
    throw new Error(
      `Cannot select windmill visual-review candidates with limit `
      + `${String(maximumCandidates)}; expected a positive safe integer.`,
    );
  }
  const keys = new Set<string>();
  candidates.forEach((candidate) => {
    validateCandidate(candidate);
    if (candidate.parameterKey.length === 0 || keys.has(candidate.parameterKey)) {
      throw new Error(
        `Cannot rank windmill compact candidates: parameter key `
        + `'${candidate.parameterKey}' is empty or duplicated. Give every finite `
        + 'parameter tuple one stable unique key.',
      );
    }
    keys.add(candidate.parameterKey);
  });
  const passing = candidates
    .filter(windmillCandidatePassesV1)
    .sort(compareWindmillCompactCandidatesV1);
  if (passing.length === 0) {
    throw new Error(
      'Cannot choose a compact windmill: no candidate passed structural, '
      + 'full-sweep clearance, exact visible/sidecar parity, and working-output gates.',
    );
  }
  const pareto = passing.filter((candidate) =>
    !passing.some((other) => other !== candidate && dominates(other, candidate)));
  const chosen: WindmillCompactCandidateResultV1<Parameters>[] = [];
  [...pareto.sort(compareWindmillCompactCandidatesV1), ...passing].forEach(
    (candidate) => {
      if (chosen.length < maximumCandidates && !chosen.includes(candidate)) {
        chosen.push(candidate);
      }
    },
  );
  return Object.freeze(chosen);
}
import {
  canonicalWindmillEvidenceJsonV1 as canonicalJsonV1,
  windmillEvidenceSha256V1 as sha256V1,
} from './windmill-evidence-hash.js';
