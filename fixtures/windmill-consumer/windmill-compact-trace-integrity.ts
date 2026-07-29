import {
  assertWindmillCompactSelectionV1,
  WINDMILL_COMPACT_SELECTION_ENUMERATION_FINGERPRINT_V1,
  WINDMILL_COMPACT_SELECTION_MANIFEST_SHA256_V1,
  WINDMILL_COMPACT_SELECTION_SEARCH_EVIDENCE_SHA256_V1,
  WINDMILL_COMPACT_SELECTION_SHA256_V1,
  WINDMILL_COMPACT_SELECTED_PARAMETER_KEY_V1,
  WINDMILL_COMPACT_SELECTED_PROOF_NOMINAL_EVALUATION_SHA256_V1,
  WINDMILL_COMPACT_SELECTED_PROOF_SHA256_V1,
  WINDMILL_COMPACT_SELECTED_SEARCH_EVALUATION_SHA256_V1,
} from '../../tools/studio/windmill-compact-selection.js';
import {
  canonicalWindmillEvidenceJsonV1,
  windmillEvidenceSha256V1,
} from './windmill-evidence-hash.js';
import {
  WINDMILL_GRAVITY,
  WINDMILL_SOLVER_VERSION,
} from './windmill-operational-inputs.js';
import type {
  WindmillCompactRecordProfileV1,
  WindmillCompactRecordedTraceV1,
  WindmillCompactReplayProvenanceV1,
  WindmillCompactReplaySelectionBindingV1,
} from './windmill-compact-recorder.js';

const NONZERO_SHA256 = /^(?!0{64}$)[0-9a-f]{64}$/;
const LAW_LABELS = Object.freeze([
  'gravity:uniform-newtonian',
  'wind:two-sided-relative-velocity-flat-plate-drag',
  'joint:passive-revolute-constraint',
  'contact:rapier-impulse-manifold',
]);
const CAPABILITY_LABELS = Object.freeze([
  'two-sail-pitched-wind-rotor',
  'dual-cam-trip-hammer',
  'finite-deterministic-observation',
]);

type ProvenanceWithoutFinalV1 = Omit<
  WindmillCompactReplayProvenanceV1,
  'finalHash'
>;
type TraceHashInputV1 = Omit<
  WindmillCompactRecordedTraceV1,
  'finalHash' | 'provenance'
> & {
  readonly provenance: ProvenanceWithoutFinalV1;
};

export function createWindmillCompactReplayProvenanceV1(
  profile: WindmillCompactRecordProfileV1,
  inputHash: string,
): ProvenanceWithoutFinalV1 {
  return Object.freeze({
    solver: Object.freeze({
      name: '@dimforge/rapier3d-compat' as const,
      version: WINDMILL_SOLVER_VERSION,
    }),
    fixedTimestepMs: profile.recordStepSeconds * 1_000,
    gravity: WINDMILL_GRAVITY,
    inputHash,
    lawLabels: LAW_LABELS,
    capabilityLabels: CAPABILITY_LABELS,
  });
}

function provenanceWithoutFinal(
  provenance: WindmillCompactReplayProvenanceV1
    | ProvenanceWithoutFinalV1,
): ProvenanceWithoutFinalV1 {
  return {
    solver: provenance.solver,
    fixedTimestepMs: provenance.fixedTimestepMs,
    gravity: provenance.gravity,
    inputHash: provenance.inputHash,
    lawLabels: provenance.lawLabels,
    capabilityLabels: provenance.capabilityLabels,
  };
}

export function assertWindmillCompactReplaySelectionBindingV1(
  candidate: { readonly parameterKey: string },
  binding: WindmillCompactReplaySelectionBindingV1,
): void {
  if (!Object.isFrozen(binding)) {
    throw new Error(
      `Cannot record compact windmill '${candidate.parameterKey}': selection `
      + 'binding is mutable. Freeze the exact promoted search/proof record '
      + 'before the evaluator starts.',
    );
  }
  if (binding.schema
    !== 'fixture.windmill-compact-replay-selection-binding/1') {
    throw new Error(
      `Cannot record compact windmill '${candidate.parameterKey}': selection `
      + `binding schema '${String(binding.schema)}' is unsupported.`,
    );
  }
  if (binding.candidateParameterKey !== candidate.parameterKey) {
    throw new Error(
      `Cannot record compact windmill '${candidate.parameterKey}': selection `
      + `binding names '${binding.candidateParameterKey}'. Record the exact `
      + 'candidate selected by the exhaustive search and proof.',
    );
  }
  const hashes = [
    ['selectionManifestSha256', binding.selectionManifestSha256],
    ['searchEvidenceSha256', binding.searchEvidenceSha256],
    ['selectedSearchEvaluationSha256',
      binding.selectedSearchEvaluationSha256],
    ['selectedProofNominalEvaluationSha256',
      binding.selectedProofNominalEvaluationSha256],
    ['selectedProofSha256', binding.selectedProofSha256],
    ['selectionSha256', binding.selectionSha256],
  ] as const;
  const invalid = hashes.find(([, value]) => !NONZERO_SHA256.test(value));
  if (invalid !== undefined) {
    throw new Error(
      `Cannot record compact windmill '${candidate.parameterKey}': selection `
      + `binding ${invalid[0]} '${invalid[1]}' is not a nonzero lowercase `
      + 'SHA-256.',
    );
  }
  if (binding.enumerationFingerprint.trim().length === 0) {
    throw new Error(
      `Cannot record compact windmill '${candidate.parameterKey}': selection `
      + 'binding has no exhaustive enumeration fingerprint.',
    );
  }
  assertWindmillCompactSelectionV1();
  const expected = {
    candidateParameterKey: WINDMILL_COMPACT_SELECTED_PARAMETER_KEY_V1,
    enumerationFingerprint:
      WINDMILL_COMPACT_SELECTION_ENUMERATION_FINGERPRINT_V1,
    selectionManifestSha256:
      WINDMILL_COMPACT_SELECTION_MANIFEST_SHA256_V1,
    searchEvidenceSha256:
      WINDMILL_COMPACT_SELECTION_SEARCH_EVIDENCE_SHA256_V1,
    selectedSearchEvaluationSha256:
      WINDMILL_COMPACT_SELECTED_SEARCH_EVALUATION_SHA256_V1,
    selectedProofNominalEvaluationSha256:
      WINDMILL_COMPACT_SELECTED_PROOF_NOMINAL_EVALUATION_SHA256_V1,
    selectedProofSha256: WINDMILL_COMPACT_SELECTED_PROOF_SHA256_V1,
    selectionSha256: WINDMILL_COMPACT_SELECTION_SHA256_V1,
  } as const;
  const mismatch = Object.entries(expected).find(([key, value]) =>
    binding[key as keyof typeof binding] !== value);
  if (mismatch !== undefined) {
    throw new Error(
      `Cannot record compact windmill '${candidate.parameterKey}': selection `
      + `binding ${mismatch[0]} is '${String(
        binding[mismatch[0] as keyof typeof binding],
      )}', expected exact promoted value '${mismatch[1]}'.`,
    );
  }
}

function float32LittleEndianBytes(values: Float32Array): Uint8Array {
  const bytes = new Uint8Array(
    values.length * Float32Array.BYTES_PER_ELEMENT,
  );
  const view = new DataView(bytes.buffer);
  values.forEach((value, index) => {
    view.setFloat32(index * Float32Array.BYTES_PER_ELEMENT, value, true);
  });
  return bytes;
}

export function windmillCompactRecordedTraceSha256V1(
  trace: TraceHashInputV1 | WindmillCompactRecordedTraceV1,
): string {
  return windmillEvidenceSha256V1([
    canonicalWindmillEvidenceJsonV1({
      schema: trace.schema,
      recordProfile: trace.recordProfile,
      placementIds: trace.placementIds,
      events: trace.events,
      evaluation: trace.evaluation,
      selection: trace.selection,
      inputHash: trace.inputHash,
      provenance: provenanceWithoutFinal(trace.provenance),
    }),
    float32LittleEndianBytes(trace.translations),
    float32LittleEndianBytes(trace.rotations),
    float32LittleEndianBytes(trace.linearVelocities),
    float32LittleEndianBytes(trace.angularVelocities),
  ]);
}

export function assertWindmillCompactRecordedTraceV1(
  trace: WindmillCompactRecordedTraceV1,
): void {
  assertWindmillCompactReplaySelectionBindingV1(
    trace.evaluation.result,
    trace.selection,
  );
  if (trace.schema !== 'fixture.windmill-compact-recorded-trace/1') {
    throw new Error(
      `Cannot encode compact windmill trace: schema `
      + `'${String(trace.schema)}' is unsupported.`,
    );
  }
  if (trace.evaluation.result.parameterKey
      !== trace.selection.candidateParameterKey) {
    throw new Error(
      `Cannot encode compact windmill trace: evaluation candidate `
      + `'${trace.evaluation.result.parameterKey}' does not match promoted `
      + `selection '${trace.selection.candidateParameterKey}'.`,
    );
  }
  if (trace.inputHash
      !== trace.evaluation.result.provenance.effectiveInputSha256) {
    throw new Error(
      `Cannot encode compact windmill trace '${trace.selection
        .candidateParameterKey}': input hash '${trace.inputHash}' does not `
      + 'match the same-kernel evaluation effective input.',
    );
  }
  const actualProvenance = provenanceWithoutFinal(trace.provenance);
  const expectedProvenance = createWindmillCompactReplayProvenanceV1(
    trace.recordProfile,
    trace.inputHash,
  );
  if (canonicalWindmillEvidenceJsonV1(actualProvenance)
      !== canonicalWindmillEvidenceJsonV1(expectedProvenance)) {
    throw new Error(
      `Cannot encode compact windmill trace '${trace.selection
        .candidateParameterKey}': emitted solver, timestep, gravity, input, `
      + 'law, or capability provenance differs from the exact recorder '
      + 'declaration bound by this trace.',
    );
  }
  const expectedFinalHash = windmillCompactRecordedTraceSha256V1(trace);
  if (trace.finalHash !== expectedFinalHash
    || trace.provenance.finalHash !== expectedFinalHash) {
    throw new Error(
      `Cannot encode compact windmill trace '${trace.selection
        .candidateParameterKey}': final hash '${trace.finalHash}' or `
      + `provenance hash '${trace.provenance.finalHash}' does not bind the `
      + `current channels, events, evidence, profile, and selection; expected `
      + `'${expectedFinalHash}'.`,
    );
  }
}
