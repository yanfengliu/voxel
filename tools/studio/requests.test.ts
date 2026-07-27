import { afterEach, describe, expect, it, vi } from 'vitest';

import type { StudioModelV1 } from './model.js';
import type { SceneViewPinV1 } from './scene-annotations.js';
import type { SceneV1 } from './scene.js';
import {
  buildRequest,
  buildSceneRequest,
  normalizeStudioSceneRequestV2,
  sendRequest,
  type StudioRequestV1,
} from './requests.js';

const request = {
  schemaVersion: 'studio.request/1',
  words: 'Make the rim rounder.',
  notes: [],
  model: {},
} as unknown as StudioRequestV1;

const INPUT_HASH = `sha256:${'a'.repeat(64)}`;
const FINAL_HASH = `sha256:${'b'.repeat(64)}`;

const riverScene: SceneV1 = {
  schemaVersion: 'studio.scene/4',
  id: 'studio:scene:river',
  label: 'River',
  placements: [{
    id: 'water',
    model: 'studio:water',
    at: [0, 0, 0],
  }],
  poseReplay: {
    id: 'studio:replay:river',
    durationMs: 6_000,
  },
};

function viewPin(sceneId: string, id: number): SceneViewPinV1 {
  return {
    sceneId,
    id,
    text: `Pin ${String(id)}`,
    createdAt: '2026-07-27T17:00:00.000Z',
    sceneFingerprint: 'fnv1a32:1234abcd:321',
    spot: { u: 0.25, v: 0.75 },
    timeMs: 1_500,
    orbit: { yawDegrees: 45, pitchDegrees: 30, viewHeight: 80 },
    panCenter: [1, 2, 3],
    depth: false,
    lit: true,
    edges: false,
    selectedPlacementId: null,
    viewport: { width: 900, height: 700 },
    replay: {
      id: 'studio:replay:river',
      inputHash: INPUT_HASH,
      finalHash: FINAL_HASH,
    },
  };
}

const capture = {
  timeMs: 1_500,
  orbit: { yawDegrees: 45, pitchDegrees: 30, viewHeight: 80 },
  center: [1, 2, 3] as const,
  depth: false,
  lit: true,
  edges: false,
  selectedPlacementId: null,
  replay: {
    id: 'studio:replay:river',
    inputHash: INPUT_HASH,
    finalHash: FINAL_HASH,
  },
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Studio request builders', () => {
  it('preserves the model request/1 shape and trims its words', () => {
    const model = {} as StudioModelV1;

    expect(buildRequest('  Make the rim rounder.  ', [], model)).toEqual({
      schemaVersion: 'studio.request/1',
      words: 'Make the rim rounder.',
      notes: [],
      model,
    });
  });

  it('captures a scene snapshot, current view, and only that scene pins', () => {
    const ownPin = viewPin(riverScene.id, 7);
    if (ownPin.replay === undefined) {
      throw new Error('The replay-pin fixture must include provenance.');
    }
    const ownPinWithFrames = {
      ...ownPin,
      replay: {
        ...ownPin.replay,
        frames: [{ timeMs: 1_500, poses: [] }],
      },
    };
    const otherPin = viewPin('studio:scene:harbor', 8);
    const sceneWithFrames = {
      ...riverScene,
      replayFrames: [{ timeMs: 1_500, poses: [] }],
    };
    const captureWithFrames = {
      ...capture,
      replay: {
        ...capture.replay,
        frames: [{ timeMs: 1_500, poses: [] }],
      },
    };

    const built = buildSceneRequest(
      '  Make the plunge pool wider.  ',
      [otherPin, ownPinWithFrames],
      sceneWithFrames,
      captureWithFrames,
    );

    expect(built).toEqual({
      schemaVersion: 'studio.request/2',
      words: 'Make the plunge pool wider.',
      pins: [ownPin],
      scene: riverScene,
      capture,
    });
    expect(built.capture.replay).not.toHaveProperty('frames');
    expect(built.pins[0]?.replay).not.toHaveProperty('frames');
    expect(built.scene).not.toHaveProperty('replayFrames');
    expect(built.scene).not.toBe(sceneWithFrames);
    expect(built.pins[0]).not.toBe(ownPinWithFrames);
  });

  it('explains when an empty brief has no pin belonging to the requested scene', () => {
    expect(() => buildSceneRequest(
      '   ',
      [viewPin('studio:scene:harbor', 8)],
      riverScene,
      capture,
    )).toThrow(
      "A scene request for 'studio:scene:river' needs a review brief or at least one view pin "
        + 'belonging to that scene.',
    );
  });

  it('accepts a scene-owned pin without a separate review brief', () => {
    const built = buildSceneRequest(
      '   ',
      [viewPin(riverScene.id, 7)],
      riverScene,
      capture,
    );

    expect(built.words).toBe('');
    expect(built.pins).toHaveLength(1);
  });

  it('rejects replay evidence captured from a different replay', () => {
    expect(() => buildSceneRequest('Fix this.', [], riverScene, {
      ...capture,
      replay: { ...capture.replay, id: 'studio:replay:other' },
    })).toThrow(
      "Scene request capture replay 'studio:replay:other' does not match scene "
        + "'studio:scene:river' replay 'studio:replay:river'. "
        + 'Capture the currently presented replay before sending.',
    );
  });

  it('requires matching replay evidence for V4 captures and pins', () => {
    const { replay: omittedCaptureReplay, ...captureWithoutReplay } = capture;
    const replayPin = viewPin(riverScene.id, 1);
    const { replay: omittedPinReplay, ...pinWithoutReplay } = replayPin;
    expect(omittedCaptureReplay).toBeDefined();
    expect(omittedPinReplay).toBeDefined();
    expect(() => buildSceneRequest('Fix this.', [], riverScene, captureWithoutReplay))
      .toThrow(/capture needs matching replay provenance/u);
    expect(() => buildSceneRequest('Fix this.', [], riverScene, {
      ...capture,
      timeMs: Number.MAX_SAFE_INTEGER + 1,
    })).toThrow(/timeMs.*from 0 through/u);
    expect(() => buildSceneRequest('Fix this.', [
      pinWithoutReplay,
    ], riverScene, capture)).toThrow(/pin 0.*needs replay provenance/u);
    expect(() => buildSceneRequest('Fix this.', [
      {
        ...viewPin(riverScene.id, 1),
        replay: {
          ...viewPin(riverScene.id, 1).replay!,
          id: 'studio:replay:other',
        },
      },
    ], riverScene, capture)).toThrow(/pin 0.*does not match/u);
  });

  it('normalizes and preserves unwrapped replay time after multiple cycles', () => {
    const elapsedTimeMs = riverScene.poseReplay.durationMs * 2 + 375;
    const normalized = normalizeStudioSceneRequestV2({
      schemaVersion: 'studio.request/2',
      words: 'Review the third pass through the waterfall.',
      pins: [{ ...viewPin(riverScene.id, 1), timeMs: elapsedTimeMs }],
      scene: riverScene,
      capture: { ...capture, timeMs: elapsedTimeMs },
    });

    expect(normalized.pins[0]?.timeMs).toBe(elapsedTimeMs);
    expect(normalized.capture.timeMs).toBe(elapsedTimeMs);
  });

  it('canonicalizes capture yaw and rejects camera or center values outside Studio bounds', () => {
    const canonical = buildSceneRequest('Inspect this view.', [], riverScene, {
      ...capture,
      orbit: { ...capture.orbit, yawDegrees: -90 },
    });
    expect(canonical.capture.orbit.yawDegrees).toBe(270);
    expect(() => buildSceneRequest('Fix this.', [], riverScene, {
      ...capture,
      orbit: { ...capture.orbit, yawDegrees: 1_000_001 },
    })).toThrow(/orbit\.yawDegrees.*-1000000 through 1000000/u);
    expect(() => buildSceneRequest('Fix this.', [], riverScene, {
      ...capture,
      orbit: { ...capture.orbit, pitchDegrees: 86 },
    })).toThrow(/orbit\.pitchDegrees.*-85 through 85/u);
    expect(() => buildSceneRequest('Fix this.', [], riverScene, {
      ...capture,
      orbit: { ...capture.orbit, viewHeight: 0.2 },
    })).toThrow(/orbit\.viewHeight.*0\.25 through 256/u);
    expect(() => buildSceneRequest('Fix this.', [], riverScene, {
      ...capture,
      center: [1_000_001, 0, 0],
    })).toThrow(/center\[0\].*-1000000 through 1000000/u);
  });

  it('rejects duplicate retained pin ids in builders and untrusted envelopes', () => {
    const repeated = [viewPin(riverScene.id, 1), viewPin(riverScene.id, 1)];
    expect(() => buildSceneRequest('Fix both.', repeated, riverScene, capture))
      .toThrow(/Pin id 1 appears more than once/u);
    expect(() => normalizeStudioSceneRequestV2({
      schemaVersion: 'studio.request/2',
      words: 'Fix both.',
      pins: repeated,
      scene: riverScene,
      capture,
    })).toThrow(/Pin id 1 appears more than once/u);
  });

  it('rejects replay-bearing pins for static scenes and validates retained pin fields', () => {
    const staticScene: SceneV1 = {
      schemaVersion: 'studio.scene/1',
      id: 'studio:scene:still',
      label: 'Still',
      placements: [],
    };
    const { replay: omittedReplay, ...captureWithoutReplay } = capture;
    expect(omittedReplay).toBeDefined();
    const staticCapture = { ...captureWithoutReplay, timeMs: 0 };
    const replayPin = viewPin(staticScene.id, 1);
    const { replay: omittedPinReplay, ...staticPin } = replayPin;
    expect(omittedPinReplay).toBeDefined();
    expect(() => buildSceneRequest('Fix this.', [
      { ...staticPin, lit: undefined as unknown as boolean },
    ], staticScene, staticCapture)).toThrow(/Pin lit must be true or false/u);
    expect(() => buildSceneRequest('Fix this.', [
      viewPin(staticScene.id, 1),
    ], staticScene, staticCapture)).toThrow(/has no pose-replay reference/u);
  });

  it('round-trips editable selection and rejects unavailable or missing selections', () => {
    const editableScene: SceneV1 = {
      schemaVersion: 'studio.scene/1',
      id: 'studio:scene:editable',
      label: 'Editable',
      placements: [{ id: 'crate', model: 'studio:crate', at: [0, 0, 0] }],
    };
    const { replay: omittedPinReplay, ...pinWithoutReplay } = viewPin(editableScene.id, 1);
    const { replay: omittedCaptureReplay, ...captureWithoutReplay } = capture;
    expect(omittedPinReplay).toBeDefined();
    expect(omittedCaptureReplay).toBeDefined();
    const selectedPin = { ...pinWithoutReplay, selectedPlacementId: 'crate' };
    const selectedCapture = { ...captureWithoutReplay, timeMs: 0, selectedPlacementId: 'crate' };
    const built = buildSceneRequest('Adjust the selected crate.', [selectedPin], editableScene, selectedCapture);
    expect(built.pins[0]?.selectedPlacementId).toBe('crate');
    expect(built.capture.selectedPlacementId).toBe('crate');

    expect(() => buildSceneRequest('Fix this.', [
      { ...selectedPin, selectedPlacementId: 'missing' },
    ], editableScene, selectedCapture)).toThrow(/selects missing placement 'missing'/u);
    expect(() => buildSceneRequest('Fix this.', [selectedPin], editableScene, {
      ...selectedCapture,
      selectedPlacementId: 'missing',
    })).toThrow(/capture selects missing placement 'missing'/u);

    const schemaCompatibleSceneId = ` scene:${'s'.repeat(300)} `;
    const schemaCompatiblePlacementId = ` placement:${'p'.repeat(300)} `;
    const schemaCompatibleScene: SceneV1 = {
      ...editableScene,
      id: schemaCompatibleSceneId,
      placements: [{ ...editableScene.placements[0]!, id: schemaCompatiblePlacementId }],
    };
    const schemaCompatiblePin = {
      ...pinWithoutReplay,
      sceneId: schemaCompatibleSceneId,
      selectedPlacementId: schemaCompatiblePlacementId,
    };
    const schemaCompatibleCapture = {
      ...captureWithoutReplay,
      timeMs: 0,
      selectedPlacementId: schemaCompatiblePlacementId,
    };
    expect(buildSceneRequest(
      'Keep authoritative identifiers exact.',
      [schemaCompatiblePin],
      schemaCompatibleScene,
      schemaCompatibleCapture,
    )).toMatchObject({
      scene: { id: schemaCompatibleSceneId },
      pins: [{ sceneId: schemaCompatibleSceneId, selectedPlacementId: schemaCompatiblePlacementId }],
      capture: { selectedPlacementId: schemaCompatiblePlacementId },
    });
    expect(() => buildSceneRequest('Fix this.', [], riverScene, {
      ...capture,
      selectedPlacementId: 'water',
    })).toThrow(/replay.*selectedPlacementId must be null/u);
    expect(() => buildSceneRequest('Fix this.', [
      { ...viewPin(riverScene.id, 1), selectedPlacementId: 'water' },
    ], riverScene, capture)).toThrow(/cannot select 'water' in a replay scene/u);
  });

  it('normalizes an unknown request/2 envelope and strips unowned extras', () => {
    const normalized = normalizeStudioSceneRequestV2({
      schemaVersion: 'studio.request/2',
      words: '  Widen the pool.  ',
      pins: [{ ...viewPin(riverScene.id, 1), extra: 'drop me' }],
      scene: { ...riverScene, replayFrames: [{ timeMs: 0 }] },
      capture: { ...capture, privateCache: true },
      ignored: 'drop me',
    });

    expect(normalized.words).toBe('Widen the pool.');
    expect(normalized).not.toHaveProperty('ignored');
    expect(normalized.scene).not.toHaveProperty('replayFrames');
    expect(normalized.capture).not.toHaveProperty('privateCache');
    expect(normalized.pins[0]).not.toHaveProperty('extra');
  });

  it('rejects cross-scene pins at the untrusted request/2 boundary', () => {
    expect(() => normalizeStudioSceneRequestV2({
      schemaVersion: 'studio.request/2',
      words: 'Do not mix contexts.',
      pins: [viewPin('studio:scene:other', 4)],
      scene: riverScene,
      capture,
    })).toThrow(/belongs to 'studio:scene:other'.*not request scene/u);
  });
});

describe('Studio request transport diagnostics', () => {
  it('posts a scene request/2 through the same saving endpoint', async () => {
    const sceneRequest = buildSceneRequest(
      'Widen the pool.',
      [viewPin(riverScene.id, 7)],
      riverScene,
      capture,
    );
    const fetchStub = vi.fn(() => Promise.resolve(new Response(
      JSON.stringify({ file: 'tools/studio/requests/scene.json' }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    )));
    vi.stubGlobal('fetch', fetchStub);

    await expect(sendRequest(sceneRequest)).resolves.toEqual({
      ok: true,
      file: 'tools/studio/requests/scene.json',
    });
    expect(fetchStub).toHaveBeenCalledOnce();
    expect(fetchStub).toHaveBeenCalledWith('/studio/requests', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(sceneRequest),
    });
  });

  it('shows the server error that explains which request limit failed', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(
      JSON.stringify({ error: 'Request body exceeds the 1000000-byte limit.' }),
      {
        status: 413,
        statusText: 'Payload Too Large',
        headers: { 'content-type': 'application/json' },
      },
    ))));

    await expect(sendRequest(request)).resolves.toEqual({
      ok: false,
      reason: 'The Studio server rejected the request (413 Payload Too Large): '
        + 'Request body exceeds the 1000000-byte limit.',
    });
  });

  it('explains the required endpoint when a generic dev server rejects the route', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response('<h1>Not found</h1>', {
      status: 404,
      statusText: 'Not Found',
      headers: { 'content-type': 'text/html' },
    }))));

    await expect(sendRequest(request)).resolves.toEqual({
      ok: false,
      reason: 'The Studio server rejected POST /studio/requests (404 Not Found). Serve this page with the '
        + 'Voxel Studio dev server or provide that request-saving endpoint.',
    });
  });

  it('does not claim success when the response omits the saved file path', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response('{}', {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }))));

    await expect(sendRequest(request)).resolves.toEqual({
      ok: false,
      reason: 'The Studio server reported success without naming the saved request file.',
    });
  });
});
