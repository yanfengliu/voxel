import {
  WINDMILL_COMPACT_REPLAY_SELECTION,
  WINDMILL_POSE_REPLAY,
  WINDMILL_POSE_REPLAY_ID as GENERATED_WINDMILL_POSE_REPLAY_ID,
} from './generated-windmill-replay.js';
import {
  WINDMILL_POSE_REPLAY_ID,
  WINDMILL_SCENE_ID,
} from './windmill-layout.js';
import {
  WINDMILL_SYSTEM_DYNAMIC_PROOF_BINDING_V1,
} from './windmill-system-purpose.js';

export interface WindmillReplayTraceBindingV1 {
  readonly schema: 'studio.windmill-replay-trace-binding/1';
  readonly replayId: string;
  readonly sceneId: string;
  readonly candidateParameterKey: string;
  readonly selectionSha256: string;
  readonly inputHash: string;
  readonly finalHash: string;
  readonly honestyBoundary: string;
}

function differs(left: string, right: string): boolean {
  return left !== right;
}

function createReplayTraceBindingV1(): WindmillReplayTraceBindingV1 {
  const proof = WINDMILL_SYSTEM_DYNAMIC_PROOF_BINDING_V1;
  const generated = WINDMILL_COMPACT_REPLAY_SELECTION;
  const mismatch =
    differs(GENERATED_WINDMILL_POSE_REPLAY_ID, WINDMILL_POSE_REPLAY_ID)
    || generated.candidateParameterKey !== proof.candidateParameterKey
    || generated.selectedProofNominalEvaluationSha256
      !== proof.nominalEvaluationSha256
    || generated.selectedProofSha256 !== proof.proofSha256
    || generated.selectionSha256 !== proof.selectionSha256
    || WINDMILL_POSE_REPLAY.sceneId !== WINDMILL_SCENE_ID;
  if (mismatch) {
    throw new Error(
      `Cannot bind selected windmill replay '${GENERATED_WINDMILL_POSE_REPLAY_ID}': generated selection '${generated.candidateParameterKey}' / nominal '${generated.selectedProofNominalEvaluationSha256}' / proof '${generated.selectedProofSha256}' / selection '${generated.selectionSha256}' / scene '${WINDMILL_POSE_REPLAY.sceneId}' does not match system proof '${proof.candidateParameterKey}' / nominal '${proof.nominalEvaluationSha256}' / proof '${proof.proofSha256}' / selection '${proof.selectionSha256}' / scene '${WINDMILL_SCENE_ID}'. Regenerate the replay from the promoted selected proof.`,
    );
  }
  const { inputHash, finalHash } = WINDMILL_POSE_REPLAY.provenance;
  if (!/^sha256:[0-9a-f]{64}$/.test(inputHash)
    || !/^sha256:[0-9a-f]{64}$/.test(finalHash)) {
    throw new Error(
      `Cannot bind selected windmill replay '${GENERATED_WINDMILL_POSE_REPLAY_ID}': provenance input '${inputHash}' and final '${finalHash}' must be lowercase SHA-256 identifiers with the 'sha256:' prefix.`,
    );
  }
  return Object.freeze({
    schema: 'studio.windmill-replay-trace-binding/1',
    replayId: GENERATED_WINDMILL_POSE_REPLAY_ID,
    sceneId: WINDMILL_POSE_REPLAY.sceneId,
    candidateParameterKey: generated.candidateParameterKey,
    selectionSha256: generated.selectionSha256,
    inputHash,
    finalHash,
    honestyBoundary:
      'The input hash binds the consumer run input and the final hash binds the finite recorded observation and provenance of the four solver tracks. The six appended wheat/flour tracks are authored presentation kinematics keyed to the recorded impact ticks, outside that hash and outside the solver. Playback is evidence from that run, not a Studio solver, a fresh simulation, simulated milling, or proof of any individual box purpose.',
  });
}

/**
 * Catalog-facing trace provenance. It is intentionally separate from the
 * scene module so the replay generator can import the scene while repairing a
 * stale generated artifact; ordinary catalog loading still fails closed.
 */
export const WINDMILL_REPLAY_TRACE_BINDING_V1 =
  createReplayTraceBindingV1();
