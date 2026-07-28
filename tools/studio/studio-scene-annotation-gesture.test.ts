import { describe, expect, it, vi } from 'vitest';

import {
  createStudioSceneAnnotationGestureV1,
  type SceneAnnotationGestureIntentV1,
  type StudioSceneAnnotationGestureDepsV1,
} from './studio-scene-annotation-gesture.js';

const intent: SceneAnnotationGestureIntentV1 = {
  previous: {
    timeMs: 400,
    enabled: true,
    playing: true,
    annotationMode: true,
  },
  hasMotion: true,
  capture: {
    sceneFingerprint: 'fnv1a32:12345678:1',
    spot: { u: 0.25, v: 0.75 },
    timeMs: 425,
    orbit: { yawDegrees: 30, pitchDegrees: 25, viewHeight: 20 },
    panCenter: [0, 0, 0],
    depth: true,
    lit: false,
    edges: true,
    selectedPlacementId: null,
    viewport: { width: 640, height: 480 },
  },
};

function setup(
  overrides: Partial<StudioSceneAnnotationGestureDepsV1> = {},
): {
  readonly gesture: ReturnType<typeof createStudioSceneAnnotationGestureV1>;
  readonly deps: StudioSceneAnnotationGestureDepsV1;
} {
  const deps: StudioSceneAnnotationGestureDepsV1 = {
    readIntent: vi.fn(() => intent),
    freezeAt: vi.fn(),
    beginCapture: vi.fn(() => true),
    restorePlayback: vi.fn(),
    restoreAnnotationMode: vi.fn(),
    reportFailure: vi.fn(),
    ...overrides,
  };
  return { gesture: createStudioSceneAnnotationGestureV1(deps), deps };
}

describe('scene annotation gesture', () => {
  it('freezes at press time and submits that capture only on a clean finish', () => {
    const { gesture, deps } = setup();
    expect(gesture.prepare({} as PointerEvent)).toBe(true);
    expect(deps.freezeAt).toHaveBeenCalledWith(intent.capture.timeMs);
    expect(deps.beginCapture).not.toHaveBeenCalled();
    gesture.finish();
    expect(deps.beginCapture).toHaveBeenCalledWith(intent.capture);
    expect(deps.restorePlayback).not.toHaveBeenCalled();
  });

  it('restores playback and annotation mode when the gesture becomes a drag', () => {
    const { gesture, deps } = setup();
    expect(gesture.prepare({} as PointerEvent)).toBe(true);
    gesture.cancel();
    expect(deps.beginCapture).not.toHaveBeenCalled();
    expect(deps.restorePlayback).toHaveBeenCalledWith(intent.previous, true);
    expect(deps.restoreAnnotationMode).toHaveBeenCalledWith(true);
    expect(deps.reportFailure).not.toHaveBeenCalled();
  });

  it('reports a rejected finish only after restoring both owners', () => {
    const order: string[] = [];
    const { gesture, deps } = setup({
      beginCapture: () => {
        order.push('capture');
        return false;
      },
      restorePlayback: () => { order.push('playback'); },
      restoreAnnotationMode: () => { order.push('mode'); },
      reportFailure: (error, summary) => {
        order.push('report');
        expect(error.message).toContain('prior playback and annotation mode were restored');
        expect(summary).toContain('scene and prior notes remain unchanged');
      },
    });
    expect(gesture.prepare({} as PointerEvent)).toBe(true);
    gesture.finish();
    expect(order).toEqual(['capture', 'playback', 'mode', 'report']);
    expect(deps.freezeAt).toHaveBeenCalledWith(intent.capture.timeMs);
  });
});
