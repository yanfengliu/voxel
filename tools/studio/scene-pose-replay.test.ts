import { describe, expect, it } from 'vitest';

import {
  MAX_POSE_REPLAY_EVENT_MEMBERS,
  sampleScenePoseReplayV1,
  sampleValidatedScenePoseReplayV1,
  scenePoseReplayDurationMsV1,
  STUDIO_SCENE_POSE_REPLAY_SCHEMA_V1,
  validateScenePoseReplayV1,
  type ScenePoseReplayV1,
} from './scene-pose-replay.js';

const HASH_A = `sha256:${'a'.repeat(64)}`;
const HASH_B = `sha256:${'b'.repeat(64)}`;

function track(
  placementId: string,
  translations = new Float32Array([0, 0, 0, 10, 20, 30]),
  quaternions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1]),
) {
  return {
    placementId,
    translations,
    quaternions,
    linearVelocities: new Float32Array([1, 2, 3, 3, 4, 5]),
    angularVelocities: new Float32Array([0, 1, 0, 0, 3, 0]),
  };
}

function replay(): ScenePoseReplayV1 {
  return {
    schemaVersion: STUDIO_SCENE_POSE_REPLAY_SCHEMA_V1,
    sceneId: 'studio:assembly-evidence',
    frameCount: 2,
    provenance: {
      solver: { name: 'test-recorder', version: '1.2.3' },
      fixedTimestepMs: 100,
      gravity: [0, -9.81, 0],
      inputHash: HASH_A,
      finalHash: HASH_B,
      lawLabels: ['gravity', 'rigid-body/contact'],
      capabilityLabels: ['assembly', 'collection'],
    },
    tracks: [
      track('arm'),
      track('block'),
      track('bin'),
    ],
    events: [
      {
        id: 'join',
        type: 'assembled',
        timeMs: 0,
        placementId: 'arm',
        assemblyId: 'grip-1',
        memberPlacementIds: ['arm', 'block'],
      },
      {
        id: 'drop',
        type: 'released',
        timeMs: 40,
        placementId: 'block',
        assemblyId: 'grip-1',
        remainingMemberPlacementIds: ['arm'],
      },
      {
        id: 'impact',
        type: 'contact',
        timeMs: 100,
        placementId: 'block',
        otherPlacementId: 'bin',
        point: [4, 2, 1],
        normal: [0, 1, 0],
        normalImpulse: 2.5,
      },
      {
        id: 'caught',
        type: 'collected',
        timeMs: 120,
        placementId: 'block',
        collectorPlacementId: 'bin',
      },
    ],
  };
}

describe('Studio scene pose replay validation', () => {
  it('accepts bounded pose, velocity, assembly, contact, and collection evidence', () => {
    const value = replay();
    expect(validateScenePoseReplayV1(value)).toEqual([]);
    expect(scenePoseReplayDurationMsV1(value)).toBe(200);
  });

  it('defines 1080 fixed frames at 60 Hz as an 18-second wrapping duration', () => {
    const value = replay();
    const sixtyHz = {
      ...value,
      frameCount: 1_080,
      provenance: { ...value.provenance, fixedTimestepMs: 1_000 / 60 },
    };
    expect(scenePoseReplayDurationMsV1(sixtyHz)).toBe(18_000);
  });

  it('reports strict provenance and track errors at their exact paths', () => {
    const value = replay() as unknown as Record<string, unknown>;
    const provenance = value.provenance as Record<string, unknown>;
    const tracks = value.tracks as Record<string, unknown>[];
    value.extra = true;
    provenance.inputHash = 'not-a-hash';
    provenance.lawLabels = ['gravity', 'gravity'];
    tracks[0]!.translations = [0, 0, 0];
    tracks[0]!.quaternions = new Float32Array([0, 0, 0, 2, 0, 0, 0, 1]);
    tracks[0]!.linearVelocities = new Float32Array([0, 0, 0]);
    tracks[1]!.placementId = 'arm';

    const issues = validateScenePoseReplayV1(value);
    expect(issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: '$.extra' }),
      expect.objectContaining({ path: '$.provenance.inputHash' }),
      expect.objectContaining({ path: '$.provenance.lawLabels[1]' }),
      expect.objectContaining({ path: '$.tracks[0].translations' }),
      expect.objectContaining({ path: '$.tracks[0].quaternions[frame 0]' }),
      expect.objectContaining({ path: '$.tracks[0].linearVelocities' }),
      expect.objectContaining({ path: '$.tracks[1].placementId' }),
    ]));
    expect(issues.find((issue) => issue.path === '$.tracks[0].translations')?.message)
      .toContain('Float32Array');
  });

  it('rejects a replay that cannot move or observe any placement', () => {
    const value = { ...replay(), tracks: [], events: [] };
    expect(validateScenePoseReplayV1(value)).toContainEqual({
      path: '$.tracks',
      message: 'Expected an array containing 1 through 4096 pose tracks.',
    });
  });

  it('rejects ambiguous attachment and contact evidence', () => {
    const value = replay() as unknown as Record<string, unknown>;
    const events = value.events as Record<string, unknown>[];
    events[0]!.memberPlacementIds = ['arm'];
    events[1]!.remainingMemberPlacementIds = ['block', 'missing'];
    events[2]!.otherPlacementId = 'block';
    events[2]!.normal = [0, 2, 0];
    events[2]!.normalImpulse = -1;
    events[3]!.collectorPlacementId = 'block';

    const issues = validateScenePoseReplayV1(value);
    expect(issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: '$.events[0].memberPlacementIds' }),
      expect.objectContaining({ path: '$.events[1].remainingMemberPlacementIds' }),
      expect.objectContaining({ path: '$.events[1].remainingMemberPlacementIds[1]' }),
      expect.objectContaining({ path: '$.events[2].otherPlacementId' }),
      expect.objectContaining({ path: '$.events[2].normal' }),
      expect.objectContaining({ path: '$.events[2].normalImpulse' }),
      expect.objectContaining({ path: '$.events[3].collectorPlacementId' }),
    ]));
  });

  it('bounds membership, event time, ordering, references, and event kinds', () => {
    const value = replay() as unknown as Record<string, unknown>;
    const events = value.events as Record<string, unknown>[];
    events[0]!.memberPlacementIds = Array.from(
      { length: MAX_POSE_REPLAY_EVENT_MEMBERS + 1 },
      (_, index) => `member-${String(index)}`,
    );
    events[1]!.timeMs = 150;
    events[2]!.timeMs = 100;
    events[3] = {
      id: 'mystery',
      type: 'teleported',
      timeMs: 200,
      placementId: 'missing',
    };

    const issues = validateScenePoseReplayV1(value);
    expect(issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: '$.events[0].memberPlacementIds' }),
      expect.objectContaining({ path: '$.events[2].timeMs' }),
      expect.objectContaining({ path: '$.events[3].timeMs' }),
      expect.objectContaining({ path: '$.events[3].placementId' }),
      expect.objectContaining({ path: '$.events[3].type' }),
    ]));
  });

  it('rejects holes in tuples, labels, tracks, and events', () => {
    const value = replay() as unknown as Record<string, unknown>;
    const provenance = value.provenance as Record<string, unknown>;
    provenance.gravity = new Array(3);
    provenance.lawLabels = new Array(1);
    value.tracks = new Array(1);
    value.events = new Array(1);
    const paths = validateScenePoseReplayV1(value).map((issue) => issue.path);
    expect(paths).toEqual(expect.arrayContaining([
      '$.provenance.gravity[0]',
      '$.provenance.lawLabels[0]',
      '$.tracks[0]',
      '$.events[0]',
    ]));
  });
});

describe('Studio scene pose replay sampling', () => {
  it('linearly samples pose and velocities and wraps exact, late, and negative times', () => {
    const value = replay();
    const halfway = sampleScenePoseReplayV1(value, 50);
    expect(halfway).toMatchObject({
      wrappedTimeMs: 50,
      frameA: 0,
      frameB: 1,
      alpha: 0.5,
    });
    expect(halfway.placements[0]).toMatchObject({
      translation: [5, 10, 15],
      linearVelocity: [2, 3, 4],
      angularVelocity: [0, 2, 0],
    });
    expect(halfway.eventsThroughTime.map((event) => event.id)).toEqual(['join', 'drop']);

    expect(sampleScenePoseReplayV1(value, 150).placements[0]?.translation).toEqual([10, 20, 30]);
    expect(sampleScenePoseReplayV1(value, 200).placements[0]?.translation).toEqual([0, 0, 0]);
    expect(sampleScenePoseReplayV1(value, -50).placements[0]?.translation).toEqual([10, 20, 30]);
    expect(sampleScenePoseReplayV1(value, 450).placements[0]?.translation).toEqual([5, 10, 15]);
  });

  it('normalizes shortest-path quaternion interpolation across the sign boundary', () => {
    const radians = (degrees: number) => degrees * Math.PI / 180;
    const positive = radians(170) / 2;
    const negative = radians(-170) / 2;
    const value = replay();
    value.tracks[0]!.quaternions.set([
      0, Math.sin(positive), 0, Math.cos(positive),
      0, Math.sin(negative), 0, Math.cos(negative),
    ]);

    const quaternion = sampleScenePoseReplayV1(value, 50).placements[0]!.quaternion;
    expect(Math.hypot(...quaternion)).toBeCloseTo(1, 7);
    expect(Math.abs(quaternion[1])).toBeCloseTo(1, 5);
    expect(Math.abs(quaternion[3])).toBeCloseTo(0, 5);
  });

  it('keeps a negative epsilon inside the final interval despite division rounding', () => {
    const base = replay();
    const value: ScenePoseReplayV1 = {
      ...base,
      frameCount: 6,
      provenance: { ...base.provenance, fixedTimestepMs: 1 / 3 },
      tracks: base.tracks.map((item) => ({
        ...item,
        translations: new Float32Array(18),
        quaternions: new Float32Array(Array.from({ length: 24 }, (_, index) => index % 4 === 3 ? 1 : 0)),
        linearVelocities: new Float32Array(18),
        angularVelocities: new Float32Array(18),
      })),
    };
    const sample = sampleValidatedScenePoseReplayV1(value, -Number.EPSILON);
    expect(sample.frameA).toBe(5);
    expect(sample.frameB).toBe(5);
    expect(sample.alpha).toBe(0);
    expect(sample.placements[0]?.translation.every(Number.isFinite)).toBe(true);
  });

  it('includes an event when sampling its exact floating-point boundary', () => {
    const base = replay();
    const eventTimeMs = 810 * (1_000 / 60);
    const value: ScenePoseReplayV1 = {
      ...base,
      events: [{
        id: 'floating-boundary',
        type: 'collected',
        timeMs: eventTimeMs,
        placementId: 'block',
        collectorPlacementId: 'bin',
      }],
      provenance: { ...base.provenance, fixedTimestepMs: 1_000 / 60 },
      frameCount: 1_080,
      tracks: base.tracks.map((item) => ({
        ...item,
        translations: new Float32Array(3_240),
        quaternions: new Float32Array(Array.from(
          { length: 4_320 },
          (_, index) => index % 4 === 3 ? 1 : 0,
        )),
        linearVelocities: new Float32Array(3_240),
        angularVelocities: new Float32Array(3_240),
      })),
    };

    expect(sampleScenePoseReplayV1(value, eventTimeMs).eventsThroughTime)
      .toContainEqual(expect.objectContaining({ id: 'floating-boundary' }));
  });

  it('holds the final physical frame and resets only at the explicit loop boundary', () => {
    const value = replay();
    const beforeReset = sampleScenePoseReplayV1(value, 199.999);
    expect(beforeReset.frameA).toBe(1);
    expect(beforeReset.frameB).toBe(1);
    expect(beforeReset.alpha).toBe(0);
    expect(beforeReset.placements[0]?.translation).toEqual([10, 20, 30]);
    const reset = sampleScenePoseReplayV1(value, 200);
    expect(reset.frameA).toBe(0);
    expect(reset.placements[0]?.translation).toEqual([0, 0, 0]);
  });

  it('is deterministic without mutating recorded arrays', () => {
    const value = replay();
    const before = Array.from(value.tracks[0]!.quaternions);
    expect(validateScenePoseReplayV1(value)).toEqual([]);
    expect(sampleValidatedScenePoseReplayV1(value, 75))
      .toEqual(sampleValidatedScenePoseReplayV1(value, 75));
    expect(Array.from(value.tracks[0]!.quaternions)).toEqual(before);
  });

  it('throws actionable errors for invalid replay data and nonfinite time', () => {
    const invalid = replay() as unknown as Record<string, unknown>;
    invalid.frameCount = 0;
    expect(() => sampleScenePoseReplayV1(invalid as unknown as ScenePoseReplayV1, 0))
      .toThrow('$.frameCount');
    expect(() => sampleScenePoseReplayV1(replay(), Number.NaN))
      .toThrow('expected a finite time');
  });
});
