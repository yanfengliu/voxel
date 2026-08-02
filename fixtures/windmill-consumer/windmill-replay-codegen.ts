import { encodeReplayChannelsV1 } from '../replay-codegen.js';
import {
  WINDMILL_POSE_REPLAY_ID,
  WINDMILL_SCENE_ID,
} from '../../tools/studio/windmill-layout.js';
import {
  synthesizeWindmillProductionTracksV1,
  windmillImpactSecondsV1,
  WINDMILL_PRODUCTION_KINEMATICS_LABEL_V1,
  type WindmillProductionTrackV1,
} from '../../tools/studio/windmill-production-kinematics.js';
import {
  WINDMILL_PRODUCTION_TRACK_IDS_V1,
} from '../../tools/studio/windmill-production-layout.js';
import {
  canonicalWindmillEvidenceJsonV1,
} from './windmill-evidence-hash.js';
import type {
  WindmillCompactRecordedTraceV1,
  WindmillCompactReplayEventV1,
} from './windmill-compact-recorder.js';
import {
  assertWindmillCompactRecordedTraceV1,
} from './windmill-compact-trace-integrity.js';


function eventSource(
  event: WindmillCompactReplayEventV1,
  solverStepSeconds: number,
): Readonly<Record<string, unknown>> {
  return {
    id: event.id,
    timeMs: event.tick * solverStepSeconds * 1_000,
    type: 'contact',
    placementId: event.primaryPlacementId,
    otherPlacementId: event.otherPlacementId,
    point: event.point,
    normal: event.normal,
    normalImpulse: event.normalImpulse,
  };
}

/**
 * Interleaves the four recorded solver tracks with the authored production
 * tracks, frame-major then track-major, recorded tracks first. The recorded
 * channels are copied untouched; the appended tracks are synthesized from
 * the trace's own anvil-impact ticks and never alter the recorded bytes.
 */
function appendProductionChannel(
  recorded: Float32Array,
  production: readonly WindmillProductionTrackV1[],
  channel: 'translations' | 'quaternions'
    | 'linearVelocities' | 'angularVelocities',
  frameCount: number,
  width: number,
): Float32Array {
  const recordedTracks = recorded.length / (frameCount * width);
  if (!Number.isInteger(recordedTracks)) {
    throw new Error(
      `Cannot append windmill production ${channel}: the recorded channel `
      + `holds ${String(recorded.length)} values, which is not a whole `
      + `number of width-${String(width)} tracks over `
      + `${String(frameCount)} frames.`,
    );
  }
  for (const track of production) {
    if (track[channel].length !== frameCount * width) {
      throw new Error(
        `Cannot append windmill production ${channel}: track `
        + `'${track.placementId}' holds ${String(track[channel].length)} `
        + `values, expected ${String(frameCount * width)} `
        + `(${String(frameCount)} frames x ${String(width)}).`,
      );
    }
  }
  const totalTracks = recordedTracks + production.length;
  const combined = new Float32Array(frameCount * totalTracks * width);
  for (let frame = 0; frame < frameCount; frame += 1) {
    combined.set(
      recorded.subarray(
        frame * recordedTracks * width,
        (frame + 1) * recordedTracks * width,
      ),
      frame * totalTracks * width,
    );
    production.forEach((track, index) => {
      combined.set(
        track[channel].subarray(frame * width, (frame + 1) * width),
        (frame * totalTracks + recordedTracks + index) * width,
      );
    });
  }
  return combined;
}

export function windmillReplaySourceV2(
  trace: WindmillCompactRecordedTraceV1,
): string {
  assertWindmillCompactRecordedTraceV1(trace);
  const impactsSeconds = windmillImpactSecondsV1(
    trace.events,
    trace.recordProfile.solverStepSeconds,
  );
  const production = synthesizeWindmillProductionTracksV1(
    impactsSeconds,
    trace.recordProfile.frameCount,
    trace.recordProfile.recordStepSeconds,
  );
  const orderedIds = production.map(({ placementId }) => placementId);
  if (orderedIds.join('|') !== WINDMILL_PRODUCTION_TRACK_IDS_V1.join('|')) {
    throw new Error(
      `Cannot append windmill production tracks: synthesis returned `
      + `[${orderedIds.join(', ')}], expected the declared order `
      + `[${WINDMILL_PRODUCTION_TRACK_IDS_V1.join(', ')}].`,
    );
  }
  const frameCount = trace.recordProfile.frameCount;
  const encoded = {
    playback: 'once' as const,
    sceneId: WINDMILL_SCENE_ID,
    frameCount,
    placementIds: [
      ...trace.placementIds,
      ...WINDMILL_PRODUCTION_TRACK_IDS_V1,
    ],
    provenance: {
      ...trace.provenance,
      inputHash: `sha256:${trace.provenance.inputHash}`,
      finalHash: `sha256:${trace.provenance.finalHash}`,
      capabilityLabels: [
        ...trace.provenance.capabilityLabels,
        WINDMILL_PRODUCTION_KINEMATICS_LABEL_V1,
      ],
    },
    ...encodeReplayChannelsV1({
      translations: appendProductionChannel(
        trace.translations, production, 'translations', frameCount, 3,
      ),
      quaternions: appendProductionChannel(
        trace.rotations, production, 'quaternions', frameCount, 4,
      ),
      linearVelocities: appendProductionChannel(
        trace.linearVelocities, production, 'linearVelocities', frameCount, 3,
      ),
      angularVelocities: appendProductionChannel(
        trace.angularVelocities, production, 'angularVelocities',
        frameCount, 3,
      ),
    }),
    events: trace.events.map((event) =>
      eventSource(event, trace.recordProfile.solverStepSeconds)),
  };
  const presentation = {
    schema: 'fixture.windmill-production-presentation/1',
    label: WINDMILL_PRODUCTION_KINEMATICS_LABEL_V1,
    trackIds: WINDMILL_PRODUCTION_TRACK_IDS_V1,
    // Cycle order, the same authority the synthesis consumed above.
    impactTicks: trace.events
      .filter((event) => event.kind === 'anvil-impact')
      .sort((left, right) => left.cycle - right.cycle)
      .map((event) => event.tick),
    honestyBoundary:
      'The appended wheat and flour tracks are authored presentation '
      + 'kinematics derived from the recorded anvil-impact ticks. They are '
      + 'not solver output, are outside the recorded final hash, and prove '
      + 'nothing about milling, grain, or flour.',
  };
  return [
    '// Generated by fixtures/windmill-consumer/windmill-replay-generation.test.ts.',
    '// The first four pose channels are exact body-origin observations from the selected consumer-physics run.',
    '// Its two-sided relative-velocity pitched-plate rule is a bounded surrogate, not CFD, wake, or turbulence.',
    '// The six appended wheat/flour tracks are authored presentation kinematics keyed to the recorded',
    '// anvil-impact ticks; they are not solver output and claim nothing about milling, grain, or flour.',
    '// Every number here is a 32-bit solver value printed at its shortest exact round trip.',
    '// `no-loss-of-precision` counts digits after the point rather than significant digits, so it',
    '// reads a value like 9.905410766601562 as lossy when parsing it returns the identical float.',
    '/* eslint-disable no-loss-of-precision */',
    "import { decodeInterleavedScenePoseReplayV2 } from './scene-pose-replay-codec.js';",
    '',
    `export const WINDMILL_POSE_REPLAY_ID = ${JSON.stringify(WINDMILL_POSE_REPLAY_ID)};`,
    'export const WINDMILL_COMPACT_REPLAY_SELECTION = '
      + `${canonicalWindmillEvidenceJsonV1(trace.selection)} as const;`,
    'export const WINDMILL_COMPACT_REPLAY_RECORD_PROFILE = '
      + `${canonicalWindmillEvidenceJsonV1(trace.recordProfile)} as const;`,
    'export const WINDMILL_COMPACT_CANDIDATE_RESULT = '
      + `${canonicalWindmillEvidenceJsonV1(trace.evaluation.result)} as const;`,
    'export const WINDMILL_SIMULATION_EVIDENCE = '
      + `${canonicalWindmillEvidenceJsonV1(trace.evaluation.evidence)} as const;`,
    'export const WINDMILL_COMPACT_REPLAY_CONTACTS = '
      + `${canonicalWindmillEvidenceJsonV1(trace.events)} as const;`,
    'export const WINDMILL_PRODUCTION_PRESENTATION = '
      + `${canonicalWindmillEvidenceJsonV1(presentation)} as const;`,
    'export const WINDMILL_POSE_REPLAY = decodeInterleavedScenePoseReplayV2(',
    `${JSON.stringify(encoded)});`,
    '',
  ].join('\n');
}
