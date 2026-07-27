import type { StudioModelV1 } from './model.js';
import type { StudioNoteV1 } from './notes.js';
import type { OrbitCenterV1, OrbitStateV1 } from './orbit.js';
import {
  SCENE_ANNOTATION_MAX_PINS,
  validateSceneAnnotationBriefV1,
  validateSceneViewPinV1,
  type SceneViewPinV1,
} from './scene-annotations.js';
import { validateSceneV1, type ScenePlacementV1, type ScenePointLightV1, type ScenePointLightV3, type SceneV1 } from './scene.js';
/** Durable local revision requests; saving starts no agent or notification. */
export const STUDIO_REQUEST_SCHEMA = 'studio.request/1' as const;
export const STUDIO_SCENE_REQUEST_SCHEMA = 'studio.request/2' as const;
export interface StudioRequestV1 {
  readonly schemaVersion: typeof STUDIO_REQUEST_SCHEMA;
  readonly words: string;
  readonly notes: readonly StudioNoteV1[];
  readonly model: StudioModelV1;
}
export interface StudioSceneReplayCaptureV1 {
  readonly id: string;
  readonly inputHash: string;
  readonly finalHash: string;
}
export interface StudioSceneCaptureV1 {
  readonly timeMs: number;
  readonly orbit: OrbitStateV1;
  readonly center: OrbitCenterV1;
  readonly depth: boolean;
  readonly lit: boolean;
  readonly edges: boolean;
  readonly selectedPlacementId: string | null;
  readonly replay?: StudioSceneReplayCaptureV1;
}
export interface StudioSceneRequestV2 {
  readonly schemaVersion: typeof STUDIO_SCENE_REQUEST_SCHEMA;
  readonly words: string;
  readonly pins: readonly SceneViewPinV1[];
  readonly scene: SceneV1;
  readonly capture: StudioSceneCaptureV1;
}
export type StudioRequest = StudioRequestV1 | StudioSceneRequestV2;
const SHA256_HASH_PATTERN = /^sha256:[0-9a-f]{64}$/;
export function buildRequest(
  words: string,
  notes: readonly StudioNoteV1[],
  model: StudioModelV1,
): StudioRequestV1 {
  const trimmed = words.trim();
  if (trimmed.length === 0 && notes.length === 0) {
    throw new Error('A request needs words or at least one note.');
  }
  return { schemaVersion: STUDIO_REQUEST_SCHEMA, words: trimmed, notes: [...notes], model };
}
function requestRecord(value: unknown, subject: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`A scene request needs ${subject} to be an object; received '${String(value)}'.`);
  }
  return value as Record<string, unknown>;
}
function requireBoundedCaptureNumber(
  value: unknown,
  field: string,
  minimum: number,
  maximum: number,
): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum || value > maximum) {
    throw new Error(
      `A scene request capture needs ${field} to be a finite number from ${String(minimum)} through `
        + `${String(maximum)}; received '${String(value)}'.`,
    );
  }
}
function requireTrimmedReplayField(value: unknown, field: string): asserts value is string {
  if (typeof value !== 'string' || value.length === 0 || value.trim() !== value) {
    throw new Error(
      `A scene request replay needs a non-empty, trimmed ${field}; received '${String(value)}'.`,
    );
  }
}
function requireReplayHash(value: unknown, field: string): asserts value is string {
  if (typeof value !== 'string' || !SHA256_HASH_PATTERN.test(value)) {
    throw new Error(
      `A scene request replay needs ${field} to be 'sha256:' followed by 64 lowercase hexadecimal `
        + `digits; received '${String(value)}'. Capture provenance from the currently presented replay.`,
    );
  }
}
function snapshotPlacement(placement: ScenePlacementV1): ScenePlacementV1 {
  return {
    id: placement.id,
    model: placement.model,
    at: [placement.at[0], placement.at[1], placement.at[2]],
    ...(placement.turns === undefined ? {} : { turns: placement.turns }),
    ...(placement.grain === undefined ? {} : { grain: placement.grain }),
    ...(placement.seed === undefined ? {} : { seed: placement.seed }),
  };
}
function snapshotPointLight(light: ScenePointLightV1): ScenePointLightV1 {
  return {
    id: light.id,
    kind: light.kind,
    at: [light.at[0], light.at[1], light.at[2]],
    color: { r: light.color.r, g: light.color.g, b: light.color.b },
    intensity: light.intensity,
    range: light.range,
  };
}
function snapshotPointLightV3(light: ScenePointLightV3): ScenePointLightV3 {
  return {
    ...snapshotPointLight(light),
    ...(light.motion === undefined
      ? {}
      : {
          motion: {
            kind: light.motion.kind,
            center: [
              light.motion.center[0],
              light.motion.center[1],
              light.motion.center[2],
            ],
            axis: light.motion.axis,
            periodMs: light.motion.periodMs,
            phaseRadians: light.motion.phaseRadians,
          },
        }),
  };
}
function snapshotScene(scene: SceneV1): SceneV1 {
  const fields = {
    id: scene.id,
    label: scene.label,
    ...(scene.summary === undefined ? {} : { summary: scene.summary }),
    placements: scene.placements.map(snapshotPlacement),
  };
  if (scene.schemaVersion === 'studio.scene/1') {
    return { schemaVersion: scene.schemaVersion, ...fields };
  }
  if (scene.schemaVersion === 'studio.scene/2') {
    return {
      schemaVersion: scene.schemaVersion,
      ...fields,
      ...(scene.lights === undefined
        ? {}
        : { lights: scene.lights.map(snapshotPointLight) }),
    };
  }
  if (scene.schemaVersion === 'studio.scene/3') {
    return {
      schemaVersion: scene.schemaVersion,
      ...fields,
      ...(scene.lights === undefined
        ? {}
        : { lights: scene.lights.map(snapshotPointLightV3) }),
    };
  }
  return {
    schemaVersion: scene.schemaVersion,
    ...fields,
    ...(scene.lights === undefined
      ? {}
      : { lights: scene.lights.map(snapshotPointLightV3) }),
    poseReplay: {
      id: scene.poseReplay.id,
      durationMs: scene.poseReplay.durationMs,
    },
  };
}
function snapshotPin(pin: SceneViewPinV1): SceneViewPinV1 {
  return {
    sceneId: pin.sceneId,
    id: pin.id,
    text: pin.text,
    createdAt: pin.createdAt,
    sceneFingerprint: pin.sceneFingerprint,
    spot: { u: pin.spot.u, v: pin.spot.v },
    timeMs: pin.timeMs,
    orbit: {
      yawDegrees: pin.orbit.yawDegrees,
      pitchDegrees: pin.orbit.pitchDegrees,
      viewHeight: pin.orbit.viewHeight,
    },
    panCenter: [pin.panCenter[0], pin.panCenter[1], pin.panCenter[2]],
    depth: pin.depth,
    lit: pin.lit,
    edges: pin.edges,
    selectedPlacementId: pin.selectedPlacementId,
    viewport: { width: pin.viewport.width, height: pin.viewport.height },
    ...(pin.replay === undefined
      ? {}
      : {
          replay: {
            id: pin.replay.id,
            inputHash: pin.replay.inputHash,
            finalHash: pin.replay.finalHash,
          },
        }),
  };
}
function requirePinReplayConsistency(scene: SceneV1, pin: SceneViewPinV1): void {
  if (pin.selectedPlacementId !== null) {
    if (scene.schemaVersion === 'studio.scene/4') {
      throw new Error(`Scene view pin ${String(pin.id)} cannot select '${pin.selectedPlacementId}' in a replay scene.`);
    }
    if (!scene.placements.some((placement) => placement.id === pin.selectedPlacementId)) {
      throw new Error(
        `Scene view pin ${String(pin.id)} selects missing placement '${pin.selectedPlacementId}' in '${scene.id}'.`,
      );
    }
  }
  if (scene.schemaVersion !== 'studio.scene/4') {
    if (pin.replay !== undefined) {
      throw new Error(
        `Scene view pin ${String(pin.id)} claims replay '${pin.replay.id}', but scene '${scene.id}' `
          + 'has no pose-replay reference.',
      );
    }
    return;
  }
  if (pin.replay === undefined) {
    throw new Error(
      `Scene view pin ${String(pin.id)} needs replay provenance for scene '${scene.id}' replay `
        + `'${scene.poseReplay.id}'.`,
    );
  }
  if (pin.replay.id !== scene.poseReplay.id) {
    throw new Error(
      `Scene view pin ${String(pin.id)} replay '${pin.replay.id}' does not match scene '${scene.id}' `
        + `replay '${scene.poseReplay.id}'.`,
    );
  }
}
function captureSelection(scene: SceneV1, value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(
      `A scene request capture needs selectedPlacementId to be null or a non-empty placement id; `
        + `received ${typeof value === 'string' ? "''" : typeof value}.`,
    );
  }
  if (scene.schemaVersion === 'studio.scene/4') {
    throw new Error(`Scene '${scene.id}' is a replay, so its request capture selectedPlacementId must be null.`);
  }
  if (!scene.placements.some((placement) => placement.id === value)) {
    throw new Error(`Scene request capture selects missing placement '${value}' in scene '${scene.id}'.`);
  }
  return value;
}
function snapshotCapture(scene: SceneV1, value: unknown): StudioSceneCaptureV1 {
  const capture = requestRecord(value, 'capture');
  const orbit = requestRecord(capture.orbit, 'capture.orbit');
  requireBoundedCaptureNumber(capture.timeMs, 'timeMs', 0, Number.MAX_SAFE_INTEGER);
  requireBoundedCaptureNumber(orbit.yawDegrees, 'orbit.yawDegrees', -1_000_000, 1_000_000);
  requireBoundedCaptureNumber(orbit.pitchDegrees, 'orbit.pitchDegrees', -85, 85);
  requireBoundedCaptureNumber(orbit.viewHeight, 'orbit.viewHeight', 0.25, 256);
  const selectedPlacementId = captureSelection(scene, capture.selectedPlacementId);
  const center: unknown = capture.center;
  if (!Array.isArray(center) || center.length !== 3) {
    throw new Error(
      `A scene request capture needs center to contain exactly three finite coordinates; `
        + `received '${JSON.stringify(center)}'.`,
    );
  }
  center.forEach((coordinate: unknown, index) => {
    if (typeof coordinate !== 'number') {
      throw new Error(
        `A scene request capture needs center[${String(index)}] to be a finite number; `
          + `received '${String(coordinate)}'.`,
      );
    }
    requireBoundedCaptureNumber(coordinate, `center[${String(index)}]`, -1_000_000, 1_000_000);
  });
  if (typeof capture.depth !== 'boolean') {
    throw new Error(
      `A scene request capture needs depth to be true or false; received '${String(capture.depth)}'.`,
    );
  }
  if (typeof capture.lit !== 'boolean') {
    throw new Error(`A scene request capture needs lit to be true or false; received '${String(capture.lit)}'.`);
  }
  if (typeof capture.edges !== 'boolean') {
    throw new Error(`A scene request capture needs edges to be true or false; received '${String(capture.edges)}'.`);
  }
  const replaySource = capture.replay;
  const replay = replaySource === undefined
    ? undefined
    : requestRecord(replaySource, 'capture.replay');
  let normalizedReplay: StudioSceneReplayCaptureV1 | undefined;
  if (replay !== undefined) {
    const replayId = replay.id;
    const inputHash = replay.inputHash;
    const finalHash = replay.finalHash;
    requireTrimmedReplayField(replayId, 'id');
    requireReplayHash(inputHash, 'inputHash');
    requireReplayHash(finalHash, 'finalHash');
    normalizedReplay = { id: replayId, inputHash, finalHash };
    if (scene.schemaVersion !== 'studio.scene/4') {
      throw new Error(
        `Scene '${scene.id}' has no pose-replay reference, so its request capture cannot claim `
          + `replay '${replayId}'. Remove capture.replay or use the matching studio.scene/4 snapshot.`,
      );
    }
    if (replayId !== scene.poseReplay.id) {
      throw new Error(
        `Scene request capture replay '${replayId}' does not match scene '${scene.id}' replay `
          + `'${scene.poseReplay.id}'. Capture the currently presented replay before sending.`,
      );
    }
  }
  if (scene.schemaVersion === 'studio.scene/4') {
    if (normalizedReplay === undefined) {
      throw new Error(
        `Scene '${scene.id}' uses replay '${scene.poseReplay.id}', so its request capture needs matching replay provenance.`,
      );
    }
  }
  return {
    timeMs: capture.timeMs,
    orbit: {
      yawDegrees: ((orbit.yawDegrees % 360) + 360) % 360,
      pitchDegrees: orbit.pitchDegrees,
      viewHeight: orbit.viewHeight,
    },
    center: [center[0] as number, center[1] as number, center[2] as number],
    depth: capture.depth,
    lit: capture.lit,
    edges: capture.edges,
    selectedPlacementId,
    ...(normalizedReplay === undefined ? {} : { replay: normalizedReplay }),
  };
}
/**
 * Captures one scene review without leaking another scene's pins or a
 * catalog's replay frames into the durable request.
 */
export function buildSceneRequest(
  words: string,
  pins: readonly SceneViewPinV1[],
  scene: SceneV1,
  capture: StudioSceneCaptureV1,
): StudioSceneRequestV2 {
  const issues = validateSceneV1(scene);
  if (issues.length > 0) {
    const issue = issues[0]!;
    const invalidScene = scene as unknown;
    const sceneId = typeof invalidScene === 'object'
      && invalidScene !== null
      && 'id' in invalidScene
      && typeof invalidScene.id === 'string'
      ? invalidScene.id
      : '<unknown>';
    throw new Error(
      `Cannot request changes to scene '${sceneId}': ${issue.path} ${issue.message} `
        + 'Fix the scene snapshot before sending it.',
    );
  }
  const trimmed = validateSceneAnnotationBriefV1(words).trim();
  const pinIds = new Set<number>();
  const scenePins = pins
    .filter((pin) => pin.sceneId === scene.id)
    .map((pin, index) => {
      try {
        const validated = validateSceneViewPinV1(pin);
        requirePinReplayConsistency(scene, validated);
        if (pinIds.has(validated.id)) {
          throw new Error(`Pin id ${String(validated.id)} appears more than once.`);
        }
        pinIds.add(validated.id);
        return validated;
      } catch (error) {
        throw new Error(
          `Scene request pin ${String(index)} for '${scene.id}' is invalid: `
            + (error instanceof Error ? error.message : String(error)),
          { cause: error },
        );
      }
    });
  if (scenePins.length > SCENE_ANNOTATION_MAX_PINS) {
    throw new Error(
      `A scene request can retain at most ${String(SCENE_ANNOTATION_MAX_PINS)} pins for '${scene.id}'; `
        + `received ${String(scenePins.length)}.`,
    );
  }
  if (trimmed.length === 0 && scenePins.length === 0) {
    throw new Error(
      `A scene request for '${scene.id}' needs a review brief or at least one view pin belonging `
        + 'to that scene.',
    );
  }
  return {
    schemaVersion: STUDIO_SCENE_REQUEST_SCHEMA,
    words: trimmed,
    pins: scenePins.map(snapshotPin),
    scene: snapshotScene(scene),
    capture: snapshotCapture(scene, capture),
  };
}
/** Normalizes untrusted request/2 and rejects cross-scene pins. */
export function normalizeStudioSceneRequestV2(value: unknown): StudioSceneRequestV2 {
  const source = requestRecord(value, 'request/2 body');
  if (source.schemaVersion !== STUDIO_SCENE_REQUEST_SCHEMA) {
    throw new Error(
      `A scene request needs schemaVersion '${STUDIO_SCENE_REQUEST_SCHEMA}'; received `
        + `'${String(source.schemaVersion)}'.`,
    );
  }
  if (typeof source.words !== 'string') {
    throw new Error(`A scene request needs words to be text; received '${typeof source.words}'.`);
  }
  if (!Array.isArray(source.pins)) {
    throw new Error(`A scene request needs pins to be an array; received '${typeof source.pins}'.`);
  }
  const sceneSource = requestRecord(source.scene, 'scene');
  const issues = validateSceneV1(sceneSource);
  if (issues.length > 0) {
    const issue = issues[0]!;
    throw new Error(`Cannot normalize the scene request: ${issue.path} ${issue.message}`);
  }
  const scene = sceneSource as unknown as SceneV1;
  const pins = source.pins.map((pin, index) => {
    try {
      return validateSceneViewPinV1(pin);
    } catch (error) {
      throw new Error(
        `Cannot normalize scene request pin ${String(index)}: `
          + (error instanceof Error ? error.message : String(error)),
        { cause: error },
      );
    }
  });
  const crossScene = pins.find((pin) => pin.sceneId !== scene.id);
  if (crossScene) {
    throw new Error(
      `Scene request pin ${String(crossScene.id)} belongs to '${crossScene.sceneId}', not request scene `
        + `'${scene.id}'. Remove the cross-scene pin before saving.`,
    );
  }
  return buildSceneRequest(source.words, pins, scene, source.capture as StudioSceneCaptureV1);
}
export type SendResult =
  | { readonly ok: true; readonly file: string }
  | { readonly ok: false; readonly reason: string };
export async function sendRequest(request: StudioRequest): Promise<SendResult> {
  try {
    const response = await fetch('/studio/requests', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(request),
    });
    if (!response.ok) {
      let detail: string | null = null;
      try {
        const body = (await response.json()) as { error?: unknown };
        if (typeof body.error === 'string' && body.error.trim().length > 0) {
          detail = body.error.trim();
        }
      } catch {
        // A proxy or generic dev server may return HTML here. The status and
        // endpoint guidance below remain actionable without assuming JSON.
      }
      const status = `${String(response.status)}${response.statusText ? ` ${response.statusText}` : ''}`;
      return {
        ok: false,
        reason: detail === null
          ? `The Studio server rejected POST /studio/requests (${status}). Serve this page with the Voxel `
            + 'Studio dev server or provide that request-saving endpoint.'
          : `The Studio server rejected the request (${status}): ${detail}`,
      };
    }
    let body: { file?: unknown };
    try {
      body = (await response.json()) as { file?: unknown };
    } catch {
      return {
        ok: false,
        reason: 'The Studio server reported success, but its response was not JSON with a saved file path.',
      };
    }
    if (typeof body.file !== 'string' || body.file.trim().length === 0) {
      return {
        ok: false,
        reason: 'The Studio server reported success without naming the saved request file.',
      };
    }
    return { ok: true, file: body.file };
  } catch (error) {
    return {
      ok: false,
      reason: `POST /studio/requests could not be reached: ${String(error)}. Serve this page with the `
        + 'Voxel Studio dev server or provide that request-saving endpoint.',
    };
  }
}
