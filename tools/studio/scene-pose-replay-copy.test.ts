import { describe, expect, it } from 'vitest';

import {
  copyScenePoseReplayV1,
  copyScenePoseReplayV1OrV2,
} from './scene-pose-replay-copy.js';
import {
  STUDIO_SCENE_POSE_REPLAY_SCHEMA_V1,
  STUDIO_SCENE_POSE_REPLAY_SCHEMA_V2,
  type ScenePoseReplayV1,
  type ScenePoseReplayV2,
} from './scene-pose-replay.js';

const HASH = `sha256:${'a'.repeat(64)}`;

function replay(): ScenePoseReplayV1 {
  return {
    schemaVersion: STUDIO_SCENE_POSE_REPLAY_SCHEMA_V1,
    sceneId: 'scene:copy',
    frameCount: 1,
    provenance: {
      solver: { name: 'copy-test', version: '1' },
      fixedTimestepMs: 16,
      gravity: [0, -9.81, 0],
      inputHash: HASH,
      finalHash: HASH,
      lawLabels: ['gravity'],
      capabilityLabels: ['replay'],
    },
    tracks: [{
      placementId: 'part',
      translations: new Float32Array([1, 2, 3]),
      quaternions: new Float32Array([0, 0, 0, 1]),
      linearVelocities: new Float32Array([4, 5, 6]),
      angularVelocities: new Float32Array([7, 8, 9]),
    }],
    events: [{
      id: 'contact',
      type: 'contact',
      timeMs: 0,
      placementId: 'part',
      otherPlacementId: 'bin',
      point: [1, 2, 3],
      normal: [0, 1, 0],
      normalImpulse: 4,
    }],
  };
}

describe('copyScenePoseReplayV1', () => {
  it('detaches every mutable frame, tuple, label, and event array', () => {
    const source = replay();
    const copy = copyScenePoseReplayV1(source);

    source.tracks[0]!.translations[0] = 99;
    source.tracks[0]!.quaternions[3] = 0;
    (source.provenance.gravity as unknown as number[])[1] = 99;
    (source.provenance.lawLabels as string[])[0] = 'changed';
    const event = source.events[0]!;
    if (event.type !== 'contact') throw new Error('Expected contact fixture.');
    (event.point as unknown as number[])[0] = 99;

    expect(Array.from(copy.tracks[0]!.translations)).toEqual([1, 2, 3]);
    expect(Array.from(copy.tracks[0]!.quaternions)).toEqual([0, 0, 0, 1]);
    expect(copy.provenance.gravity).toEqual([0, -9.81, 0]);
    expect(copy.provenance.lawLabels).toEqual(['gravity']);
    expect(copy.events[0]).toMatchObject({ point: [1, 2, 3] });
  });

  it('preserves the finite V2 schema and playback policy while detaching channels', () => {
    const source: ScenePoseReplayV2 = {
      ...replay(),
      schemaVersion: STUDIO_SCENE_POSE_REPLAY_SCHEMA_V2,
      playback: 'once',
    };
    const copy = copyScenePoseReplayV1OrV2(source);
    source.tracks[0]!.translations[0] = 99;

    expect(copy).toMatchObject({
      schemaVersion: STUDIO_SCENE_POSE_REPLAY_SCHEMA_V2,
      playback: 'once',
    });
    expect(Array.from(copy.tracks[0]!.translations)).toEqual([1, 2, 3]);
  });
});
