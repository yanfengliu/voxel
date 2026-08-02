import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { beforeAll, describe, expect, it } from 'vitest';

import {
  sampleValidatedScenePoseReplayV1OrV2,
  scenePoseReplayDurationMsV1OrV2,
} from '../../tools/studio/scene-pose-replay-sampling.js';
import type {
  ScenePoseReplayV1OrV2,
} from '../../tools/studio/scene-pose-replay.js';
import { createStudioParts } from '../../tools/studio/parts.js';
import { buildSceneSnapshot } from '../../tools/studio/scene-build.js';
import {
  assertWindmillCompactSelectionV1,
  createSelectedWindmillCompactCandidateV1,
  WINDMILL_COMPACT_SELECTION_ENUMERATION_FINGERPRINT_V1,
  WINDMILL_COMPACT_SELECTION_MANIFEST_SHA256_V1,
  WINDMILL_COMPACT_SELECTION_SEARCH_EVIDENCE_SHA256_V1,
  WINDMILL_COMPACT_SELECTION_SHA256_V1,
  WINDMILL_COMPACT_SELECTED_PARAMETER_KEY_V1,
  WINDMILL_COMPACT_SELECTED_PROOF_NOMINAL_EVALUATION_SHA256_V1,
  WINDMILL_COMPACT_SELECTED_PROOF_SHA256_V1,
  WINDMILL_COMPACT_SELECTED_SEARCH_EVALUATION_SHA256_V1,
} from '../../tools/studio/windmill-compact-selection.js';
import { createWindmillRecipeBook } from '../../tools/studio/windmill-recipes.js';
import { createWindmillScene } from '../../tools/studio/windmill-scene.js';
import {
  evaluateWindmillCompactCandidateAndRecordV1,
  WINDMILL_COMPACT_RECORD_HERTZ_V1,
  type WindmillCompactRecordedEvaluationV1,
  type WindmillCompactReplaySelectionBindingV1,
} from './windmill-compact-recorder.js';
import { windmillReplaySourceV2 } from './windmill-replay-codegen.js';
import {
  SOLVER_TIMESTEP_SECONDS_V1,
} from '../../tools/studio/solver-rate.js';

const OUTPUT_URL = new URL(
  '../../tools/studio/generated-windmill-replay.ts',
  import.meta.url,
);

const SELECTION_BINDING = Object.freeze({
  schema: 'fixture.windmill-compact-replay-selection-binding/1',
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
} satisfies WindmillCompactReplaySelectionBindingV1);

function nextRepresentableNumberBelow(value: number): number {
  const float = new Float64Array([value]);
  const bits = new BigUint64Array(float.buffer);
  bits[0] = bits[0]! - 1n;
  return float[0]!;
}

describe('selected compact Windmill committed replay', () => {
  let recorded: WindmillCompactRecordedEvaluationV1;
  let generatedSource: string;

  beforeAll(async () => {
    assertWindmillCompactSelectionV1();
    recorded = await evaluateWindmillCompactCandidateAndRecordV1(
      createSelectedWindmillCompactCandidateV1(),
      SELECTION_BINDING,
      `search:full:${WINDMILL_COMPACT_SELECTED_PARAMETER_KEY_V1}`,
    );
    generatedSource = windmillReplaySourceV2(recorded.trace);
  }, 180_000);

  it('is byte-for-byte generated from the selected same-kernel trace', () => {
    if (process.env.UPDATE_WINDMILL_REPLAY === '1') {
      writeFileSync(fileURLToPath(OUTPUT_URL), generatedSource);
    }
    expect(readFileSync(OUTPUT_URL, 'utf8')).toBe(generatedSource);
  });

  it('binds the promoted selection and proof nominal evaluation', () => {
    expect(recorded.trace.selection).toEqual(SELECTION_BINDING);
    expect(recorded.evaluation.result.provenance.combinedEvaluationSha256)
      .toBe(
        WINDMILL_COMPACT_SELECTED_PROOF_NOMINAL_EVALUATION_SHA256_V1,
      );
    expect(recorded.evaluation.evidence.failedGateIds).toEqual([]);
    expect(recorded.trace.inputHash)
      .toBe(recorded.evaluation.result.provenance.effectiveInputSha256);
  });

  it('records four finite body-origin tracks from t=0 through t=12 seconds', () => {
    const { trace } = recorded;
    expect(trace.recordProfile).toMatchObject({
      solverStepSeconds: SOLVER_TIMESTEP_SECONDS_V1,
      recordStepSeconds: 1 / WINDMILL_COMPACT_RECORD_HERTZ_V1,
      solverTicksPerRecordedFrame: Math.round(
        (1 / WINDMILL_COMPACT_RECORD_HERTZ_V1) / SOLVER_TIMESTEP_SECONDS_V1,
      ),
      physicalDurationSeconds: 12,
      frameCount: 721,
    });
    expect(trace.placementIds).toHaveLength(4);
    expect(trace.translations.length).toBe(721 * 4 * 3);
    expect(trace.rotations.length).toBe(721 * 4 * 4);
    expect(trace.linearVelocities.length).toBe(721 * 4 * 3);
    expect(trace.angularVelocities.length).toBe(721 * 4 * 3);
    [
      trace.translations,
      trace.rotations,
      trace.linearVelocities,
      trace.angularVelocities,
    ].forEach((channel) => expect(channel.every(Number.isFinite)).toBe(true));
  });

  it.skipIf(process.env.UPDATE_WINDMILL_REPLAY === '1')(
    'presents every manifold event at its exact solver-tick time',
    async () => {
      const { WINDMILL_POSE_REPLAY } = await import(
        '../../tools/studio/generated-windmill-replay.js'
      );
      const naturalTimes = recorded.trace.events.map((event) =>
        event.tick * recorded.trace.recordProfile.solverStepSeconds * 1_000);
      expect(WINDMILL_POSE_REPLAY.events.map((event) => event.timeMs))
        .toEqual(naturalTimes);
      recorded.trace.events.forEach((_sourceEvent, index) => {
        const event = WINDMILL_POSE_REPLAY.events[index]!;
        const naturalTime = naturalTimes[index]!;
        const atBoundary = sampleValidatedScenePoseReplayV1OrV2(
          WINDMILL_POSE_REPLAY,
          naturalTime,
        );
        const immediatelyBefore = sampleValidatedScenePoseReplayV1OrV2(
          WINDMILL_POSE_REPLAY,
          nextRepresentableNumberBelow(naturalTime),
        );
        expect(atBoundary.eventsThroughTime.at(-1)).toBe(event);
        expect(immediatelyBefore.eventsThroughTime).not.toContain(event);
      });
    },
  );

  it.skipIf(process.env.UPDATE_WINDMILL_REPLAY === '1')(
    'uses V2 once playback and holds the final physical state',
    async () => {
      const { WINDMILL_POSE_REPLAY } = await import(
        '../../tools/studio/generated-windmill-replay.js'
      );
      const replay = WINDMILL_POSE_REPLAY as ScenePoseReplayV1OrV2;
      expect(replay.schemaVersion).toBe('studio.scene-pose-replay/2');
      expect('playback' in replay ? replay.playback : undefined).toBe('once');
      expect(replay.frameCount).toBe(721);
      expect(replay.provenance.fixedTimestepMs).toBe(1000 / 60);
      const atPhysicalEnd = sampleValidatedScenePoseReplayV1OrV2(
        replay,
        12_000,
      );
      expect(atPhysicalEnd.frameA).toBe(720);
      expect(atPhysicalEnd.frameB).toBe(720);
      const durationMs = scenePoseReplayDurationMsV1OrV2(replay);
      expect(durationMs).toBe(
        recorded.trace.recordProfile.presentationDurationMs,
      );
      const terminal = sampleValidatedScenePoseReplayV1OrV2(
        replay,
        durationMs,
      );
      expect(sampleValidatedScenePoseReplayV1OrV2(
        replay,
        durationMs * 3,
      )).toEqual(terminal);
    },
  );

  it.skipIf(process.env.UPDATE_WINDMILL_REPLAY === '1')(
    'starts every track at its authored presented body origin',
    async () => {
      const { WINDMILL_POSE_REPLAY } = await import(
        '../../tools/studio/generated-windmill-replay.js'
      );
      const opening = buildSceneSnapshot(
        createWindmillScene(),
        createWindmillRecipeBook(),
        createStudioParts(),
        { edges: false },
      );
      const authoredTranslations = new Map<string, readonly number[]>();
      opening.batches.forEach((batch) => {
        batch.instanceKeys.forEach((placementId, slot) => {
          const matrixOffset = slot * 16;
          authoredTranslations.set(
            placementId,
            Array.from(
              batch.matrices.subarray(
                matrixOffset + 12,
                matrixOffset + 15,
              ),
            ),
          );
        });
      });
      WINDMILL_POSE_REPLAY.tracks.forEach((track) => {
        expect(
          Array.from(track.translations.subarray(0, 3)),
          track.placementId,
        ).toEqual(authoredTranslations.get(track.placementId));
      });
    },
  );
});
