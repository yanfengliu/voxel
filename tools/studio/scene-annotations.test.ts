import { describe, expect, it, vi } from 'vitest';

import {
  SCENE_ANNOTATION_MAX_BRIEF_LENGTH,
  SCENE_ANNOTATION_MAX_PINS,
  SCENE_ANNOTATION_MAX_PIN_TEXT_LENGTH,
  SCENE_ANNOTATION_MAX_SCENES,
  SCENE_ANNOTATIONS_KEY,
  SCENE_ANNOTATIONS_QUARANTINE_KEY,
  SCENE_ANNOTATIONS_SCHEMA_V1,
  SceneAnnotationStore,
  validateSceneViewPinV1,
  type SceneAnnotationStorageV1,
  type SceneViewPinDraftV1,
  type SceneViewPinV1,
} from './scene-annotations.js';
import { MAX_SCENE_POSE_REPLAY_ID_LENGTH } from './scene.js';

function mapStorage(seed: Record<string, string> = {}): SceneAnnotationStorageV1 & {
  readonly data: Map<string, string>;
} {
  const data = new Map(Object.entries(seed));
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => { data.set(key, value); },
    removeItem: (key) => { data.delete(key); },
  };
}

const CREATED_AT = '2026-07-27T12:34:56.000Z';
const HASH_A = `sha256:${'a'.repeat(64)}`;
const HASH_B = `sha256:${'b'.repeat(64)}`;

function draft(overrides: Partial<SceneViewPinDraftV1> = {}): SceneViewPinDraftV1 {
  return {
    text: 'Inspect the waterfall lip.',
    sceneFingerprint: 'fnv1a32:1234abcd:2048',
    spot: { u: 0.25, v: 0.75 },
    timeMs: 1_250,
    orbit: { yawDegrees: 405, pitchDegrees: 30, viewHeight: 18 },
    panCenter: [1, 2, 3],
    depth: true,
    lit: true,
    edges: false,
    selectedPlacementId: 'waterfall-lip',
    viewport: { width: 1_280, height: 720 },
    replay: { id: 'studio:riverfall:fluid-v1', inputHash: HASH_A, finalHash: HASH_B },
    ...overrides,
  };
}

function pin(overrides: Partial<SceneViewPinV1> = {}): SceneViewPinV1 {
  return {
    ...draft(),
    sceneId: 'studio:scene:riverfall-canyon',
    id: 1,
    createdAt: CREATED_AT,
    ...overrides,
  };
}

function storeAtFixedTime(storage: SceneAnnotationStorageV1): SceneAnnotationStore {
  return new SceneAnnotationStore({ storage, now: () => new Date(CREATED_AT) });
}

describe('scene annotation persistence', () => {
  it('round-trips a brief and a complete view/phase pin through the versioned document', () => {
    const storage = mapStorage();
    const first = storeAtFixedTime(storage);
    expect(first.setBrief('studio:scene:riverfall-canyon', 'Check the water sheet.').persisted).toBe(true);
    const added = first.addPin('studio:scene:riverfall-canyon', draft());
    expect(added.persistence.persisted).toBe(true);
    expect(added.pin).toEqual({
      ...pin(),
      orbit: { yawDegrees: 45, pitchDegrees: 30, viewHeight: 18 },
    });

    const reopened = new SceneAnnotationStore({ storage });
    expect(reopened.loadWarnings).toEqual([]);
    expect(reopened.readScene('studio:scene:riverfall-canyon')).toEqual({
      sceneId: 'studio:scene:riverfall-canyon',
      brief: 'Check the water sheet.',
      pins: [added.pin],
    });
    expect(JSON.parse(storage.data.get(SCENE_ANNOTATIONS_KEY) ?? '{}')).toMatchObject({
      schemaVersion: SCENE_ANNOTATIONS_SCHEMA_V1,
    });
  });

  it('isolates each scene brief and pin queue', () => {
    const annotations = storeAtFixedTime(mapStorage());
    annotations.setBrief('scene:a', 'Alpha');
    annotations.setBrief('scene:b', 'Beta');
    annotations.addPin('scene:a', draft({ text: 'Only A' }));

    expect(annotations.readScene('scene:a')).toMatchObject({ brief: 'Alpha', pins: [{ text: 'Only A' }] });
    expect(annotations.readScene('scene:b')).toEqual({ sceneId: 'scene:b', brief: 'Beta', pins: [] });
    expect(annotations.readScene('scene:c')).toEqual({ sceneId: 'scene:c', brief: '', pins: [] });
  });

  it('never reuses a numeric id after deletion or clearing', () => {
    const annotations = storeAtFixedTime(mapStorage());
    expect(annotations.addPin('scene:a', draft()).pin.id).toBe(1);
    expect(annotations.addPin('scene:a', draft()).pin.id).toBe(2);
    expect(annotations.removePin('scene:a', 1).removed).toBe(true);
    expect(annotations.addPin('scene:a', draft()).pin.id).toBe(3);
    expect(annotations.clearScene('scene:a').persisted).toBe(true);
    expect(annotations.readScene('scene:a').pins).toEqual([]);
    expect(annotations.addPin('scene:a', draft()).pin.id).toBe(4);
    expect(annotations.clearScene('missing').message).toContain('nothing was changed');
  });

  it('autosaves each brief edit, including an empty brief', () => {
    const storage = mapStorage();
    const annotations = storeAtFixedTime(storage);
    annotations.setBrief('scene:a', 'First draft');
    expect(new SceneAnnotationStore({ storage }).readScene('scene:a').brief).toBe('First draft');
    annotations.setBrief('scene:a', '');
    expect(new SceneAnnotationStore({ storage }).readScene('scene:a').brief).toBe('');
  });

  it('rejects invalid scene, brief, pin, camera, phase, and replay inputs actionably', () => {
    const annotations = storeAtFixedTime(mapStorage());
    expect(() => annotations.setBrief('', 'brief')).toThrow(/Scene id.*non-empty/u);
    expect(() => annotations.setBrief('scene:a', 'x'.repeat(SCENE_ANNOTATION_MAX_BRIEF_LENGTH + 1)))
      .toThrow(/Scene brief.*at most/u);
    expect(() => annotations.addPin('scene:a', draft({ text: ' ' }))).toThrow(/Pin text.*non-whitespace/u);
    expect(() => annotations.addPin(
      'scene:a',
      draft({ text: 'x'.repeat(SCENE_ANNOTATION_MAX_PIN_TEXT_LENGTH + 1) }),
    )).toThrow(/Pin text.*at most/u);
    expect(() => annotations.addPin('scene:a', draft({ sceneFingerprint: '' })))
      .toThrow(/sceneFingerprint.*non-whitespace/u);
    expect(() => annotations.addPin('scene:a', draft({ spot: { u: 1.01, v: 0 } })))
      .toThrow(/spot\.u.*from 0 through 1/u);
    expect(() => annotations.addPin('scene:a', draft({ timeMs: Number.POSITIVE_INFINITY })))
      .toThrow(/timeMs.*finite/u);
    expect(() => annotations.addPin(
      'scene:a',
      draft({ orbit: { yawDegrees: 0, pitchDegrees: 86, viewHeight: 1 } }),
    )).toThrow(/pitchDegrees/u);
    expect(() => annotations.addPin('scene:a', draft({ panCenter: [0, Number.NaN, 0] })))
      .toThrow(/panCenter\[1\].*finite/u);
    expect(() => annotations.addPin('scene:a', draft({ lit: undefined as unknown as boolean })))
      .toThrow(/Pin lit must be true or false/u);
    expect(() => annotations.addPin('scene:a', draft({ edges: 1 as unknown as boolean })))
      .toThrow(/Pin edges must be true or false/u);
    expect(() => annotations.addPin('scene:a', draft({
      selectedPlacementId: undefined as unknown as string,
    }))).toThrow(/selectedPlacementId must be non-empty text/u);
    expect(() => annotations.addPin('scene:a', draft({ viewport: { width: 0, height: 100 } })))
      .toThrow(/viewport\.width/u);
    expect(() => annotations.addPin('scene:a', draft({
      replay: { id: 'replay', inputHash: 'abc', finalHash: HASH_B },
    }))).toThrow(/inputHash.*canonical/u);
  });

  it('enforces the per-scene pin-count bound without consuming another id', () => {
    const annotations = storeAtFixedTime(mapStorage());
    for (let index = 0; index < SCENE_ANNOTATION_MAX_PINS; index += 1) {
      annotations.addPin('scene:a', draft({ text: `Pin ${String(index)}` }));
    }
    expect(() => annotations.addPin('scene:a', draft())).toThrow(/maximum 64 pins/u);
    expect(annotations.readScene('scene:a').pins).toHaveLength(SCENE_ANNOTATION_MAX_PINS);
  });

  it('owns input and output copies so callers cannot rewrite persisted evidence', () => {
    const storage = mapStorage();
    const annotations = storeAtFixedTime(storage);
    const input = draft();
    const added = annotations.addPin('scene:a', input);
    (input.spot as { u: number }).u = 0.99;
    (input.panCenter as unknown as number[])[0] = 99;
    (input.replay as { inputHash: string }).inputHash = HASH_B;
    (added.pin.spot as { u: number }).u = 0.88;
    (added.pin.panCenter as unknown as number[])[1] = 88;

    const firstRead = annotations.readScene('scene:a');
    (firstRead.pins[0]?.orbit as { yawDegrees: number }).yawDegrees = 180;
    expect(annotations.readScene('scene:a').pins[0]).toMatchObject({
      spot: { u: 0.25 },
      panCenter: [1, 2, 3],
      orbit: { yawDegrees: 45 },
      replay: { inputHash: HASH_A },
    });
    expect(new SceneAnnotationStore({ storage }).readScene('scene:a').pins[0]?.spot.u).toBe(0.25);
  });

  it('keeps valid records from a mixed document, quarantines the raw text, and saves the repair', () => {
    const raw = JSON.stringify({
      schemaVersion: SCENE_ANNOTATIONS_SCHEMA_V1,
      scenes: [{
        sceneId: 'scene:a',
        brief: 'Keep this',
        nextPinId: 1,
        pins: [
          pin({ sceneId: 'scene:a', id: 3 }),
          pin({ sceneId: 'scene:a', id: 4, text: ' ' }),
          pin({ sceneId: 'wrong-scene', id: 5 }),
        ],
      }, { sceneId: '', brief: 'bad', nextPinId: 1, pins: [] }],
    });
    const storage = mapStorage({ [SCENE_ANNOTATIONS_KEY]: raw });
    const annotations = new SceneAnnotationStore({ storage });

    expect(annotations.readScene('scene:a')).toMatchObject({ brief: 'Keep this', pins: [{ id: 3 }] });
    expect(annotations.loadWarnings.join(' ')).toMatch(/dropped.*repaired.*preserved/u);
    expect(storage.data.get(SCENE_ANNOTATIONS_QUARANTINE_KEY)).toBe(raw);
    expect(JSON.parse(storage.data.get(SCENE_ANNOTATIONS_KEY) ?? '{}')).toMatchObject({
      scenes: [{ sceneId: 'scene:a', nextPinId: 4, pins: [{ id: 3 }] }],
    });
  });

  it('quarantines malformed JSON and unknown schemas before writing an empty known document', () => {
    for (const raw of [
      '{ definitely not JSON',
      JSON.stringify({ schemaVersion: 'studio.scene-annotations/99', scenes: [] }),
    ]) {
      const storage = mapStorage({ [SCENE_ANNOTATIONS_KEY]: raw });
      const annotations = new SceneAnnotationStore({ storage });
      expect(annotations.loadWarnings.join(' ')).toMatch(/preserved/u);
      expect(storage.data.get(SCENE_ANNOTATIONS_QUARANTINE_KEY)).toBe(raw);
      expect(JSON.parse(storage.data.get(SCENE_ANNOTATIONS_KEY) ?? '{}')).toEqual({
        schemaVersion: SCENE_ANNOTATIONS_SCHEMA_V1,
        scenes: [],
      });
    }
  });

  it('does not overwrite corrupt raw text when quarantine itself fails', () => {
    const raw = '{ corrupt';
    const data = new Map([[SCENE_ANNOTATIONS_KEY, raw]]);
    const storage: SceneAnnotationStorageV1 = {
      getItem: (key) => data.get(key) ?? null,
      setItem: (key, value) => {
        if (key === SCENE_ANNOTATIONS_QUARANTINE_KEY) throw new Error('quarantine denied');
        data.set(key, value);
      },
      removeItem: (key) => { data.delete(key); },
    };
    const annotations = new SceneAnnotationStore({ storage });
    expect(annotations.setBrief('scene:a', 'memory copy')).toMatchObject({ persisted: false });
    expect(annotations.loadWarnings.join(' ')).toMatch(/not overwritten/u);
    expect(data.get(SCENE_ANNOTATIONS_KEY)).toBe(raw);
  });

  it('survives throwing reads in memory without risking an unread existing value', () => {
    const write = vi.fn();
    const storage: SceneAnnotationStorageV1 = {
      getItem: () => { throw new Error('privacy mode'); },
      setItem: write,
      removeItem: () => undefined,
    };
    const annotations = storeAtFixedTime(storage);
    const added = annotations.addPin('scene:a', draft());
    expect(added.persistence).toMatchObject({ persisted: false });
    expect(added.persistence.message).toMatch(/could not be read.*privacy mode/u);
    expect(annotations.readScene('scene:a').pins).toHaveLength(1);
    expect(write).not.toHaveBeenCalled();
  });

  it('survives throwing writes while retaining briefs and pins in memory', () => {
    const storage: SceneAnnotationStorageV1 = {
      getItem: () => null,
      setItem: () => { throw new Error('quota exceeded'); },
      removeItem: () => undefined,
    };
    const annotations = storeAtFixedTime(storage);
    const briefResult = annotations.setBrief('scene:a', 'Still here');
    expect(briefResult.persisted).toBe(false);
    expect(briefResult.message).toMatch(/quota exceeded/u);
    expect(annotations.addPin('scene:a', draft()).persistence.persisted).toBe(false);
    expect(annotations.readScene('scene:a')).toMatchObject({ brief: 'Still here', pins: [{ id: 1 }] });
  });

  it('synchronizes sequential store instances before disjoint and same-scene mutations', () => {
    const storage = mapStorage();
    const first = storeAtFixedTime(storage);
    const second = storeAtFixedTime(storage);

    first.setBrief('scene:a', 'Brief from first');
    second.addPin('scene:b', draft({ text: 'Pin from second' }));
    expect(first.addPin('scene:shared', draft({ text: 'First shared pin' })).pin.id).toBe(1);
    expect(second.addPin('scene:shared', draft({ text: 'Second shared pin' })).pin.id).toBe(2);
    second.setBrief('scene:shared', 'Shared brief');

    expect(first.readScene('scene:a').brief).toBe('Brief from first');
    expect(first.readScene('scene:b').pins).toMatchObject([{ text: 'Pin from second' }]);
    expect(first.readScene('scene:shared')).toMatchObject({
      brief: 'Shared brief',
      pins: [{ id: 1, text: 'First shared pin' }, { id: 2, text: 'Second shared pin' }],
    });
  });

  it('latches a refused save to memory-only before a later sync can discard unsaved work', () => {
    const storage = mapStorage();
    const save = (key: string, value: string) => { storage.data.set(key, value); };
    let refuse = true;
    storage.setItem = (key, value) => {
      if (refuse) throw new Error('quota refused');
      save(key, value);
    };
    const annotations = storeAtFixedTime(storage);
    expect(annotations.setBrief('scene:unsaved', 'Keep this in memory')).toMatchObject({ persisted: false });

    refuse = false;
    save(SCENE_ANNOTATIONS_KEY, JSON.stringify({
      schemaVersion: SCENE_ANNOTATIONS_SCHEMA_V1,
      scenes: [{
        sceneId: 'scene:external',
        brief: 'External state',
        nextPinId: 1,
        pins: [],
      }],
    }));

    expect(annotations.readScene('scene:unsaved').brief).toBe('Keep this in memory');
    expect(annotations.readScene('scene:external')).toEqual({
      sceneId: 'scene:external',
      brief: '',
      pins: [],
    });
    expect(annotations.setBrief('scene:unsaved', 'Still local')).toMatchObject({ persisted: false });
  });

  it('reclaims an empty record at the scene quota while preserving ids before reclamation', () => {
    const annotations = storeAtFixedTime(mapStorage());
    for (let index = 0; index < SCENE_ANNOTATION_MAX_SCENES; index += 1) {
      annotations.setBrief(`scene:${String(index)}`, `Brief ${String(index)}`);
    }
    expect(annotations.addPin('scene:0', draft()).pin.id).toBe(1);
    expect(annotations.clearScene('scene:0').persisted).toBe(true);
    expect(annotations.setBrief('scene:replacement', 'Fits after reclaiming the empty record').persisted).toBe(true);
    expect(annotations.readScene('scene:replacement').brief).toContain('Fits');
    expect(annotations.readScene('scene:0')).toEqual({ sceneId: 'scene:0', brief: '', pins: [] });
  });

  it('exports a strict single-pin validator for request and import boundaries', () => {
    expect(validateSceneViewPinV1(pin({ orbit: { yawDegrees: -90, pitchDegrees: 0, viewHeight: 2 } })))
      .toMatchObject({ orbit: { yawDegrees: 270 } });
    expect(() => validateSceneViewPinV1({ ...pin(), createdAt: 'yesterday' })).toThrow(/canonical ISO/u);
  });

  it('preserves every identifier accepted by the authoritative scene schema', () => {
    const longSceneId = ` scene:${'s'.repeat(300)} `;
    const longPlacementId = ` placement:${'p'.repeat(300)} `;
    const replayId = 'r'.repeat(MAX_SCENE_POSE_REPLAY_ID_LENGTH);
    expect(validateSceneViewPinV1(pin({
      sceneId: longSceneId,
      selectedPlacementId: longPlacementId,
      replay: { id: replayId, inputHash: HASH_A, finalHash: HASH_B },
    }))).toMatchObject({ sceneId: longSceneId, selectedPlacementId: longPlacementId, replay: { id: replayId } });
    expect(() => validateSceneViewPinV1(pin({
      replay: { id: `${replayId}x`, inputHash: HASH_A, finalHash: HASH_B },
    }))).toThrow(new RegExp(`replay id.*at most ${String(MAX_SCENE_POSE_REPLAY_ID_LENGTH)}`, 'u'));
  });
});
