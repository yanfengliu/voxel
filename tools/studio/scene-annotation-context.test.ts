import { describe, expect, it } from 'vitest';

import type { SceneViewPinV1 } from './scene-annotations.js';
import {
  scenePresentationFingerprintV1,
  sceneViewPinMatchesV1,
  sceneViewPinStaleReasonV1,
  type SceneAnnotationViewContextV1,
} from './scene-annotation-context.js';
import type { SceneV1 } from './scene.js';

const scene: SceneV1 = {
  schemaVersion: 'studio.scene/1',
  id: 'falls',
  label: 'Riverfall',
  summary: 'Water crossing a ledge.',
  placements: [{ id: 'ledge', model: 'rock', at: [0, 0, 0] }],
};

function context(): SceneAnnotationViewContextV1 {
  return {
    sceneId: scene.id,
    sceneFingerprint: scenePresentationFingerprintV1(scene),
    timeMs: 250,
    orbit: { yawDegrees: 30, pitchDegrees: 20, viewHeight: 14 },
    panCenter: [1, 0, -2],
    depth: true,
    lit: false,
    edges: true,
    selectedPlacementId: 'ledge',
    viewport: { width: 640, height: 440 },
  };
}

function pin(): SceneViewPinV1 {
  const current = context();
  return {
    ...current,
    id: 1,
    text: 'The lower spray needs more separation.',
    createdAt: '2026-07-27T12:00:00.000Z',
    spot: { u: 0.4, v: 0.6 },
  };
}

describe('scene annotation presentation context', () => {
  it('keeps a fingerprint across prose changes but changes it with presented data', () => {
    expect(scenePresentationFingerprintV1({ ...scene, label: 'Renamed', summary: 'New words' }))
      .toBe(scenePresentationFingerprintV1(scene));
    expect(scenePresentationFingerprintV1({
      ...scene,
      placements: [{ ...scene.placements[0]!, at: [1, 0, 0] }],
    })).not.toBe(scenePresentationFingerprintV1(scene));
    expect(scenePresentationFingerprintV1(scene, ['rock:fnv1a64:aaaaaaaaaaaaaaaa']))
      .not.toBe(scenePresentationFingerprintV1(scene, ['rock:fnv1a64:bbbbbbbbbbbbbbbb']));
  });

  it('shows a marker only at its captured view, phase, depth, and viewport', () => {
    expect(sceneViewPinMatchesV1(pin(), context())).toBe(true);
    expect(sceneViewPinMatchesV1(pin(), { ...context(), timeMs: 251 })).toBe(false);
    expect(sceneViewPinMatchesV1(pin(), {
      ...context(),
      orbit: { ...context().orbit, yawDegrees: 31 },
    })).toBe(false);
    expect(sceneViewPinMatchesV1(pin(), {
      ...context(),
      viewport: { width: 800, height: 440 },
    })).toBe(false);
    expect(sceneViewPinMatchesV1(pin(), { ...context(), depth: false })).toBe(false);
    expect(sceneViewPinMatchesV1(pin(), { ...context(), lit: true })).toBe(false);
    expect(sceneViewPinMatchesV1(pin(), { ...context(), edges: false })).toBe(false);
    expect(sceneViewPinMatchesV1(pin(), { ...context(), selectedPlacementId: null })).toBe(false);
  });

  it('distinguishes stale scene or replay evidence from a restorable view difference', () => {
    expect(sceneViewPinStaleReasonV1(pin(), { ...context(), timeMs: 900 })).toBeNull();
    expect(sceneViewPinStaleReasonV1(pin(), {
      ...context(),
      viewport: { width: 800, height: 440 },
    })).toContain('captured at 640x440');
    expect(sceneViewPinStaleReasonV1(pin(), {
      ...context(),
      sceneFingerprint: 'fnv1a32:00000000:1',
    })).toContain('earlier presentation');

    const replayPin: SceneViewPinV1 = {
      ...pin(),
      replay: {
        id: 'riverfall-trace',
        inputHash: `sha256:${'a'.repeat(64)}`,
        finalHash: `sha256:${'b'.repeat(64)}`,
      },
    };
    expect(sceneViewPinStaleReasonV1(replayPin, context())).toContain('different replay evidence');
  });
});
