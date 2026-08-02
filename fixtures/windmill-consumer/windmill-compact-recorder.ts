import type {
  WindmillCompactCamNoseKeyV1,
  WindmillCompactCandidateV1,
} from '../../tools/studio/windmill-compact-geometry.js';
import {
  WINDMILL_PLACEMENT_IDS_V1,
  type WindmillPlacementIdV1,
} from '../../tools/studio/windmill-layout.js';
import {
  evaluateWindmillCompactCandidateObservedV1,
  type WindmillCompactEvaluationV1,
} from './windmill-compact-evaluator.js';
import type {
  WindmillCompactBodyObservationV1,
  WindmillCompactEvaluationBodiesV1,
} from './windmill-compact-observer.js';
import type {
  WindmillCompactContactSampleV1,
} from './windmill-compact-evaluator-runtime.js';
import type {
  WINDMILL_GRAVITY,
  WINDMILL_SOLVER_VERSION,
} from './windmill-operational-inputs.js';
import {
  assertWindmillCompactReplaySelectionBindingV1,
  createWindmillCompactReplayProvenanceV1,
  windmillCompactRecordedTraceSha256V1,
} from './windmill-compact-trace-integrity.js';

export const WINDMILL_COMPACT_RECORD_HERTZ_V1 = 60;
export const WINDMILL_COMPACT_FULL_DURATION_SECONDS_V1 = 12;

export const WINDMILL_COMPACT_REPLAY_PLACEMENT_IDS_V1 = Object.freeze([
  WINDMILL_PLACEMENT_IDS_V1.frame,
  WINDMILL_PLACEMENT_IDS_V1.rotor,
  WINDMILL_PLACEMENT_IDS_V1.hammer,
  WINDMILL_PLACEMENT_IDS_V1.anvil,
] as const);

export interface WindmillCompactReplaySelectionBindingV1 {
  readonly schema: 'fixture.windmill-compact-replay-selection-binding/1';
  readonly candidateParameterKey: string;
  readonly enumerationFingerprint: string;
  readonly selectionManifestSha256: string;
  readonly searchEvidenceSha256: string;
  readonly selectedSearchEvaluationSha256: string;
  readonly selectedProofNominalEvaluationSha256: string;
  readonly selectedProofSha256: string;
  readonly selectionSha256: string;
}

export interface WindmillCompactRecordProfileV1 {
  readonly schema: 'fixture.windmill-compact-record-profile/1';
  readonly solverStepSeconds: number;
  readonly recordStepSeconds: number;
  readonly solverTicksPerRecordedFrame: number;
  readonly physicalDurationSeconds: number;
  readonly frameCount: number;
  readonly presentationDurationMs: number;
}

export interface WindmillCompactReplayEventV1 {
  readonly id: string;
  readonly kind: 'cam-contact' | 'anvil-impact';
  readonly cycle: number;
  readonly camNoseKey: WindmillCompactCamNoseKeyV1;
  readonly tick: number;
  readonly primaryPlacementId: WindmillPlacementIdV1;
  readonly otherPlacementId: WindmillPlacementIdV1;
  readonly point: readonly [number, number, number];
  /** Unit normal from the other placement toward the primary placement. */
  readonly normal: readonly [number, number, number];
  readonly normalImpulse: number;
  readonly penetration: number;
}

export interface WindmillCompactReplayProvenanceV1 {
  readonly solver: {
    readonly name: '@dimforge/rapier3d-compat';
    readonly version: typeof WINDMILL_SOLVER_VERSION;
  };
  readonly fixedTimestepMs: number;
  readonly gravity: typeof WINDMILL_GRAVITY;
  readonly inputHash: string;
  readonly finalHash: string;
  readonly lawLabels: readonly string[];
  readonly capabilityLabels: readonly string[];
}

export interface WindmillCompactRecordedTraceV1 {
  readonly schema: 'fixture.windmill-compact-recorded-trace/1';
  readonly recordProfile: WindmillCompactRecordProfileV1;
  readonly placementIds:
    typeof WINDMILL_COMPACT_REPLAY_PLACEMENT_IDS_V1;
  /** Frame-major, then placement-major body-origin XYZ. */
  readonly translations: Float32Array;
  /** Frame-major, then placement-major body XYZW rotation. */
  readonly rotations: Float32Array;
  /** Frame-major, then placement-major body-origin linear velocity. */
  readonly linearVelocities: Float32Array;
  /** Frame-major, then placement-major world-axis angular velocity. */
  readonly angularVelocities: Float32Array;
  readonly events: readonly WindmillCompactReplayEventV1[];
  readonly evaluation: WindmillCompactEvaluationV1;
  readonly selection: WindmillCompactReplaySelectionBindingV1;
  readonly inputHash: string;
  readonly finalHash: string;
  readonly provenance: WindmillCompactReplayProvenanceV1;
}

export interface WindmillCompactRecordedEvaluationV1 {
  readonly evaluation: WindmillCompactEvaluationV1;
  readonly trace: WindmillCompactRecordedTraceV1;
}

interface MutableChannelsV1 {
  readonly translations: Float32Array;
  readonly rotations: Float32Array;
  readonly linearVelocities: Float32Array;
  readonly angularVelocities: Float32Array;
}

function createRecordProfile(
  solverStepSeconds: number,
  physicalDurationSeconds: number,
): WindmillCompactRecordProfileV1 {
  const recordStepSeconds = 1 / WINDMILL_COMPACT_RECORD_HERTZ_V1;
  const exactTicksPerFrame = recordStepSeconds / solverStepSeconds;
  const solverTicksPerRecordedFrame = Math.round(exactTicksPerFrame);
  const exactSolverTicks = physicalDurationSeconds / solverStepSeconds;
  const solverTicks = Math.round(exactSolverTicks);
  if (!Number.isSafeInteger(solverTicksPerRecordedFrame)
    || solverTicksPerRecordedFrame <= 0
    || Math.abs(
      exactTicksPerFrame - solverTicksPerRecordedFrame,
    ) > 1e-12) {
    throw new Error(
      `Cannot record compact windmill at `
      + `${String(WINDMILL_COMPACT_RECORD_HERTZ_V1)} Hz from solver step `
      + `${String(solverStepSeconds)} seconds; expected an exact positive `
      + 'integer number of solver ticks per recorded frame.',
    );
  }
  if (!Number.isSafeInteger(solverTicks)
    || Math.abs(exactSolverTicks - solverTicks) > 1e-9
    || solverTicks % solverTicksPerRecordedFrame !== 0) {
    throw new Error(
      `Cannot record compact windmill duration `
      + `${String(physicalDurationSeconds)} seconds: expected an exact `
      + `${String(solverTicksPerRecordedFrame)}-solver-tick frame boundary.`,
    );
  }
  const frameCount = solverTicks / solverTicksPerRecordedFrame + 1;
  return Object.freeze({
    schema: 'fixture.windmill-compact-record-profile/1',
    solverStepSeconds,
    recordStepSeconds,
    solverTicksPerRecordedFrame,
    physicalDurationSeconds,
    frameCount,
    presentationDurationMs: frameCount * (recordStepSeconds * 1_000),
  });
}

function recordBody(
  channels: MutableChannelsV1,
  frame: number,
  slot: number,
  body: WindmillCompactBodyObservationV1,
): void {
  const trackCount = WINDMILL_COMPACT_REPLAY_PLACEMENT_IDS_V1.length;
  const vectorOffset = (frame * trackCount + slot) * 3;
  const quaternionOffset = (frame * trackCount + slot) * 4;
  channels.translations.set(body.bodyOriginTranslation, vectorOffset);
  channels.rotations.set(body.bodyRotation, quaternionOffset);
  channels.linearVelocities.set(
    body.bodyOriginLinearVelocity,
    vectorOffset,
  );
  channels.angularVelocities.set(body.angularVelocity, vectorOffset);
}

function recordFrame(
  channels: MutableChannelsV1,
  frame: number,
  bodies: WindmillCompactEvaluationBodiesV1,
): void {
  recordBody(channels, frame, 0, bodies.frame);
  recordBody(channels, frame, 1, bodies.rotor);
  recordBody(channels, frame, 2, bodies.hammer);
  recordBody(channels, frame, 3, bodies.anvil);
}

function reversedNormal(
  sample: WindmillCompactContactSampleV1,
): readonly [number, number, number] {
  return [-sample.normal[0], -sample.normal[1], -sample.normal[2]];
}

function eventFromSample(
  kind: WindmillCompactReplayEventV1['kind'],
  cycle: number,
  camNoseKey: WindmillCompactCamNoseKeyV1,
  tick: number,
  sample: WindmillCompactContactSampleV1,
): WindmillCompactReplayEventV1 {
  const cam = kind === 'cam-contact';
  return Object.freeze({
    id: `windmill-cycle-${String(cycle)}-${camNoseKey}-${kind}`,
    kind,
    cycle,
    camNoseKey,
    tick,
    primaryPlacementId: WINDMILL_PLACEMENT_IDS_V1.hammer,
    otherPlacementId: cam
      ? WINDMILL_PLACEMENT_IDS_V1.rotor
      : WINDMILL_PLACEMENT_IDS_V1.anvil,
    point: Object.freeze([...sample.point] as [number, number, number]),
    normal: Object.freeze(
      cam ? [...sample.normal] as [number, number, number]
        : [...reversedNormal(sample)] as [number, number, number],
    ),
    normalImpulse: sample.normalImpulse,
    penetration: sample.penetration,
  });
}

function requireContactSample(
  samples: ReadonlyMap<string, WindmillCompactContactSampleV1>,
  key: string,
  candidateParameterKey: string,
  cycle: number,
  kind: WindmillCompactReplayEventV1['kind'],
): WindmillCompactContactSampleV1 {
  const sample = samples.get(key);
  if (sample === undefined) {
    throw new Error(
      `Cannot record compact windmill '${candidateParameterKey}' cycle `
      + `${String(cycle)} ${kind}: qualified evidence tick '${key}' has no `
      + 'solver-manifold point, oriented normal, impulse, and penetration '
      + 'witness. Replay contact claims must come from the evaluator kernel.',
    );
  }
  return sample;
}

/**
 * Records the selected candidate from the same evaluator loop that produces
 * pass/fail evidence. Recording is observation-only and therefore cannot
 * change the candidate's effective input or evaluation hash.
 */
export async function evaluateWindmillCompactCandidateAndRecordV1(
  candidate: WindmillCompactCandidateV1,
  selection: WindmillCompactReplaySelectionBindingV1,
  name = 'proof:nominal',
): Promise<WindmillCompactRecordedEvaluationV1> {
  assertWindmillCompactReplaySelectionBindingV1(candidate, selection);
  // A holder rather than two `let`s. The observer's callbacks are the only
  // writers, and TypeScript does not reset a captured `let`'s narrowing for
  // assignments made inside a nested function — so the guard after the run
  // narrowed both to `never` and every read of them was an error. Reading
  // the fields off an object, and destructuring them after the guard,
  // narrows the way it reads. This file is only type-checked now that a
  // browser proof imports it: `fixtures/windmill-consumer` is outside the
  // tsconfig include list.
  const recording: {
    profile?: WindmillCompactRecordProfileV1;
    channels?: MutableChannelsV1;
  } = {};
  let recordedFrames = 0;
  const camSamples = new Map<string, WindmillCompactContactSampleV1>();
  const impactSamples = new Map<string, WindmillCompactContactSampleV1>();
  const evaluation = await evaluateWindmillCompactCandidateObservedV1(
    candidate,
    {
      name,
      durationSeconds: WINDMILL_COMPACT_FULL_DURATION_SECONDS_V1,
    },
    {
      start(effectiveRun, bodies): void {
        if (recording.profile !== undefined
          || recording.channels !== undefined) {
          throw new Error(
            `Cannot record compact windmill '${candidate.parameterKey}': `
            + 'evaluator observer started more than once.',
          );
        }
        const startedProfile = createRecordProfile(
          effectiveRun.numericalProfile.fixedStepSeconds,
          effectiveRun.durationSeconds,
        );
        const trackCount =
          WINDMILL_COMPACT_REPLAY_PLACEMENT_IDS_V1.length;
        const startedChannels: MutableChannelsV1 = {
          translations: new Float32Array(
            startedProfile.frameCount * trackCount * 3,
          ),
          rotations: new Float32Array(
            startedProfile.frameCount * trackCount * 4,
          ),
          linearVelocities: new Float32Array(
            startedProfile.frameCount * trackCount * 3,
          ),
          angularVelocities: new Float32Array(
            startedProfile.frameCount * trackCount * 3,
          ),
        };
        recording.profile = startedProfile;
        recording.channels = startedChannels;
        recordFrame(startedChannels, recordedFrames, bodies);
        recordedFrames += 1;
      },
      step({ tick, bodies, activeCamNoseKey, cam, impact }): void {
        const { profile, channels } = recording;
        if (profile === undefined || channels === undefined) {
          throw new Error(
            `Cannot record compact windmill '${candidate.parameterKey}' at `
            + `tick ${String(tick)}: evaluator observer has not started.`,
          );
        }
        if (activeCamNoseKey !== null && cam.strongestSample !== null) {
          camSamples.set(
            `${activeCamNoseKey}:${String(tick)}`,
            cam.strongestSample,
          );
        }
        if (impact.strongestSample !== null) {
          impactSamples.set(String(tick), impact.strongestSample);
        }
        if (tick % profile.solverTicksPerRecordedFrame === 0) {
          recordFrame(channels, recordedFrames, bodies);
          recordedFrames += 1;
        }
      },
    },
  );
  const {
    profile: recordedProfile,
    channels: recordedChannels,
  } = recording;
  if (recordedProfile === undefined || recordedChannels === undefined) {
    throw new Error(
      `Cannot record compact windmill '${candidate.parameterKey}': evaluator `
      + 'completed without starting the recording observer.',
    );
  }
  if (recordedFrames !== recordedProfile.frameCount) {
    throw new Error(
      `Cannot record compact windmill '${candidate.parameterKey}': captured `
      + `${String(recordedFrames)} frames, expected `
      + `${String(recordedProfile.frameCount)} from the exact solver/record `
      + 'cadence.',
    );
  }
  const nominalEvaluationSha256 =
    evaluation.result.provenance.combinedEvaluationSha256;
  if (nominalEvaluationSha256
      !== selection.selectedProofNominalEvaluationSha256) {
    throw new Error(
      `Cannot record compact windmill '${candidate.parameterKey}': same-kernel `
      + `evaluation hash '${nominalEvaluationSha256}' does not match promoted `
      + `proof nominal '${selection
        .selectedProofNominalEvaluationSha256}'.`,
    );
  }
  const events = Object.freeze(evaluation.evidence.cycleRecords.flatMap(
    (cycle) => {
      const camSample = requireContactSample(
        camSamples,
        `${cycle.camNoseKey}:${String(cycle.camContactTick)}`,
        candidate.parameterKey,
        cycle.cycle,
        'cam-contact',
      );
      const impactSample = requireContactSample(
        impactSamples,
        String(cycle.impactTick),
        candidate.parameterKey,
        cycle.cycle,
        'anvil-impact',
      );
      return [
        eventFromSample(
          'cam-contact',
          cycle.cycle,
          cycle.camNoseKey,
          cycle.camContactTick,
          camSample,
        ),
        eventFromSample(
          'anvil-impact',
          cycle.cycle,
          cycle.camNoseKey,
          cycle.impactTick,
          impactSample,
        ),
      ];
    },
  ).sort((left, right) =>
    left.tick - right.tick || left.id.localeCompare(right.id)));
  const inputHash = evaluation.result.provenance.effectiveInputSha256;
  const traceWithoutFinal = {
    schema: 'fixture.windmill-compact-recorded-trace/1' as const,
    recordProfile: recordedProfile,
    placementIds: WINDMILL_COMPACT_REPLAY_PLACEMENT_IDS_V1,
    translations: recordedChannels.translations,
    rotations: recordedChannels.rotations,
    linearVelocities: recordedChannels.linearVelocities,
    angularVelocities: recordedChannels.angularVelocities,
    events,
    evaluation,
    selection,
    inputHash,
  };
  const provenanceWithoutFinal =
    createWindmillCompactReplayProvenanceV1(recordedProfile, inputHash);
  const finalHash = windmillCompactRecordedTraceSha256V1({
    ...traceWithoutFinal,
    provenance: provenanceWithoutFinal,
  });
  const trace: WindmillCompactRecordedTraceV1 = Object.freeze({
    ...traceWithoutFinal,
    finalHash,
    provenance: Object.freeze({
      ...provenanceWithoutFinal,
      finalHash,
    }),
  });
  return Object.freeze({ evaluation, trace });
}
