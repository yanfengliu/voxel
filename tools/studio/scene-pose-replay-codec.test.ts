import { describe, expect, it } from 'vitest';

import {
  MACHINE_WORKS_POSE_REPLAY,
  MACHINE_WORKS_POSE_REPLAY_ID,
} from './generated-machine-works-replay.js';
import {
  MACHINE_WORKS_CONVEYOR_DRUM_IDS,
  MACHINE_WORKS_CONVEYOR_SLAT_IDS,
  MACHINE_WORKS_EXPOSED_COGS_V1,
} from './machine-works-conveyor.js';
import { decodeInterleavedScenePoseReplayV1 } from './scene-pose-replay-codec.js';
import {
  scenePoseReplayDurationMsV1,
  validateScenePoseReplayV1,
} from './scene-pose-replay.js';

describe('encoded scene pose replay', () => {
  it('decodes the generated Machine Works trace with bounded causal evidence', () => {
    expect(MACHINE_WORKS_POSE_REPLAY_ID).toBe('studio:pose-replay:machine-works');
    expect(validateScenePoseReplayV1(MACHINE_WORKS_POSE_REPLAY)).toEqual([]);
    expect(scenePoseReplayDurationMsV1(MACHINE_WORKS_POSE_REPLAY)).toBe(30_000);
    expect(MACHINE_WORKS_POSE_REPLAY.tracks.map(({ placementId }) => placementId)).toEqual([
      'assembly-carriage',
      'core-head',
      'cap-head',
      'product-base',
      'product-core',
      'product-cap',
      'collection-bucket',
      ...MACHINE_WORKS_CONVEYOR_SLAT_IDS,
      ...MACHINE_WORKS_CONVEYOR_DRUM_IDS,
      ...MACHINE_WORKS_EXPOSED_COGS_V1.map(({ id }) => id),
    ]);
    expect(MACHINE_WORKS_POSE_REPLAY.events.map(({ type }) => type)).toEqual([
      'assembled',
      'released',
      'contact',
      'collected',
    ]);
    expect(MACHINE_WORKS_POSE_REPLAY.provenance).toMatchObject({
      solver: {
        name: '@dimforge/rapier3d-compat',
        version: '0.19.3',
      },
      gravity: [0, -9.81, 0],
    });
  });

  it('rejects missing, malformed, or wrong-sized binary observations explicitly', () => {
    const base = {
      sceneId: 'scene:test',
      frameCount: 1,
      placementIds: ['placement:test'],
      provenance: {
        solver: { name: 'solver', version: '1' },
        fixedTimestepMs: 16,
        gravity: [0, -9.81, 0] as const,
        inputHash: `sha256:${'a'.repeat(64)}`,
        finalHash: `sha256:${'b'.repeat(64)}`,
        lawLabels: ['rigid-body.gravity'],
        capabilityLabels: ['pose-output'],
      },
      translationsBase64: '',
      quaternionsBase64: '',
      linearVelocitiesBase64: '',
      angularVelocitiesBase64: '',
      events: [],
    };
    expect(() => decodeInterleavedScenePoseReplayV1({
      ...base,
      placementIds: [],
    })).toThrow('placementIds must contain at least one track');
    expect(() => decodeInterleavedScenePoseReplayV1(base)).toThrow(
      'translationsBase64: expected 12 bytes',
    );
    expect(() => decodeInterleavedScenePoseReplayV1({
      ...base,
      translationsBase64: '***',
    })).toThrow('expected canonical base64');
  });
});
