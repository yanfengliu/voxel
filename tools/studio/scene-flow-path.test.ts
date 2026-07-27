import { describe, expect, it } from 'vitest';

import {
  createSceneFlowTrackV1,
  sampleSceneFlowPathV1,
  type SceneFlowPathV1,
} from './scene-flow-path.js';

const SQUARE: SceneFlowPathV1 = {
  closed: true,
  points: [
    [0, 0, 0],
    [10, 0, 0],
    [10, 0, 10],
    [0, 0, 10],
  ],
};

describe('Studio authored flow paths', () => {
  it('samples a polyline by constant arc length and reports matching velocity', () => {
    expect(sampleSceneFlowPathV1(SQUARE, 0.125, 4_000)).toEqual({
      translation: [5, 0, 0],
      linearVelocity: [10, 0, 0],
    });
    expect(sampleSceneFlowPathV1(SQUARE, 0.375, 4_000)).toEqual({
      translation: [10, 0, 5],
      linearVelocity: [0, 0, 10],
    });
    expect(sampleSceneFlowPathV1(SQUARE, 0.25, 4_000)).toEqual({
      translation: [10, 0, 0],
      linearVelocity: [0, 0, 10],
    });
    expect(sampleSceneFlowPathV1(SQUARE, 0.875, 4_000)).toEqual({
      translation: [0, 0, 5],
      linearVelocity: [0, 0, -10],
    });
  });

  it('wraps negative and positive progress to the same deterministic pose', () => {
    expect(sampleSceneFlowPathV1(SQUARE, -0.125, 4_000))
      .toEqual(sampleSceneFlowPathV1(SQUARE, 0.875, 4_000));
    expect(sampleSceneFlowPathV1(SQUARE, 1.375, 4_000))
      .toEqual(sampleSceneFlowPathV1(SQUARE, 0.375, 4_000));
  });

  it('records Float32 replay lanes with an identity orientation at every frame', () => {
    const track = createSceneFlowTrackV1({
      placementId: 'marker',
      path: SQUARE,
      phase: 0.125,
    }, 8, 500);

    expect(track.translations).toHaveLength(24);
    expect(track.linearVelocities).toHaveLength(24);
    expect(track.quaternions).toHaveLength(32);
    expect(track.angularVelocities).toEqual(new Float32Array(24));
    for (let frame = 0; frame < 8; frame += 1) {
      expect(Array.from(track.quaternions.slice(frame * 4, frame * 4 + 4)))
        .toEqual([0, 0, 0, 1]);
    }
  });

  it('can close a reset-mode replay on an endpoint-identical final frame', () => {
    const track = createSceneFlowTrackV1({
      placementId: 'looping-marker',
      path: SQUARE,
      phase: 0.125,
      closeLoopAtFinalFrame: true,
    }, 9, 500);
    expect(Array.from(track.translations.slice(-3)))
      .toEqual(Array.from(track.translations.slice(0, 3)));
    expect(Array.from(track.linearVelocities.slice(-3)))
      .toEqual(Array.from(track.linearVelocities.slice(0, 3)));
  });

  it('rejects ambiguous or non-finite authoring input with actionable diagnostics', () => {
    expect(() => sampleSceneFlowPathV1({ closed: false, points: [[0, 0, 0]] }, 0, 1_000))
      .toThrow('expected at least two points; received 1');
    expect(() => sampleSceneFlowPathV1({
      closed: false,
      points: [[0, 0, 0], [0, 0, 0]],
    }, 0, 1_000)).toThrow('segment 0 has zero length');
    expect(() => createSceneFlowTrackV1({
      placementId: 'marker',
      path: SQUARE,
      phase: 1,
    }, 8, 500)).toThrow('phase must be finite in [0, 1)');
    expect(() => createSceneFlowTrackV1({
      placementId: 'marker',
      path: { closed: false, points: SQUARE.points },
      phase: 0,
      closeLoopAtFinalFrame: true,
    }, 8, 500)).toThrow('path must be closed');
  });
});
