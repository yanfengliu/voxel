import type { OrbitCenterV1, OrbitStateV1 } from './orbit.js';
import type { SceneViewPinV1 } from './scene-annotations.js';
import type { SceneV1 } from './scene.js';

export interface SceneAnnotationReplayContextV1 {
  readonly id: string;
  readonly inputHash: string;
  readonly finalHash: string;
}

export interface SceneAnnotationViewContextV1 {
  readonly sceneId: string;
  readonly sceneFingerprint: string;
  readonly timeMs: number;
  readonly orbit: OrbitStateV1;
  readonly panCenter: OrbitCenterV1;
  readonly depth: boolean;
  readonly lit: boolean;
  readonly edges: boolean;
  readonly selectedPlacementId: string | null;
  readonly viewport: {
    readonly width: number;
    readonly height: number;
  };
  readonly replay?: SceneAnnotationReplayContextV1;
}

export const SCENE_ANNOTATION_PRESENTATION_FINGERPRINT_V1 =
  'studio.scene-annotation-presentation/1' as const;

function presentationSnapshot(
  scene: SceneV1,
  resolvedContentHashes: readonly string[],
): object {
  const common = {
    fingerprintSchema: SCENE_ANNOTATION_PRESENTATION_FINGERPRINT_V1,
    schemaVersion: scene.schemaVersion,
    id: scene.id,
    placements: scene.placements,
    resolvedContentHashes,
  };
  if (scene.schemaVersion === 'studio.scene/1') return common;
  if (scene.schemaVersion === 'studio.scene/2' || scene.schemaVersion === 'studio.scene/3') {
    return { ...common, lights: scene.lights ?? [] };
  }
  return {
    ...common,
    lights: scene.lights ?? [],
    poseReplay: scene.poseReplay,
  };
}

/**
 * Identifies the scene data that can change a presented raster. Display prose
 * is deliberately omitted, so renaming a scene does not detach its review.
 */
export function scenePresentationFingerprintV1(
  scene: SceneV1,
  resolvedContentHashes: readonly string[] = [],
): string {
  const json = JSON.stringify(presentationSnapshot(scene, resolvedContentHashes));
  let hash = 0x811c9dc5;
  for (let index = 0; index < json.length; index += 1) {
    hash ^= json.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a32:${(hash >>> 0).toString(16).padStart(8, '0')}:${String(json.length)}`;
}

const VIEW_EPSILON = 1e-6;
const TIME_EPSILON_MS = 1e-6;

function near(left: number, right: number, epsilon = VIEW_EPSILON): boolean {
  return Math.abs(left - right) <= epsilon;
}

function sameReplay(
  pin: SceneViewPinV1['replay'],
  current: SceneAnnotationViewContextV1['replay'],
): boolean {
  if (pin === undefined || current === undefined) return pin === current;
  return pin.id === current.id
    && pin.inputHash === current.inputHash
    && pin.finalHash === current.finalHash;
}

/** True only while the stage still presents the evidence this capture recorded. */
export function sceneCapturedViewMatchesV1(
  capture: Omit<SceneAnnotationViewContextV1, 'sceneId'>,
  current: SceneAnnotationViewContextV1,
): boolean {
  return capture.sceneFingerprint === current.sceneFingerprint
    && near(capture.timeMs, current.timeMs, TIME_EPSILON_MS)
    && near(capture.orbit.yawDegrees, current.orbit.yawDegrees)
    && near(capture.orbit.pitchDegrees, current.orbit.pitchDegrees)
    && near(capture.orbit.viewHeight, current.orbit.viewHeight)
    && near(capture.panCenter[0], current.panCenter[0])
    && near(capture.panCenter[1], current.panCenter[1])
    && near(capture.panCenter[2], current.panCenter[2])
    && capture.depth === current.depth
    && capture.lit === current.lit
    && capture.edges === current.edges
    && capture.selectedPlacementId === current.selectedPlacementId
    && capture.viewport.width === current.viewport.width
    && capture.viewport.height === current.viewport.height
    && sameReplay(capture.replay, current.replay);
}

/** True only while the stage still presents the evidence this saved pin captured. */
export function sceneViewPinMatchesV1(
  pin: SceneViewPinV1,
  current: SceneAnnotationViewContextV1,
): boolean {
  return pin.sceneId === current.sceneId && sceneCapturedViewMatchesV1(pin, current);
}

/**
 * Explains why Show cannot honestly reattach a pin to the current scene data.
 * View and time differences are restorable; viewport and evidence drift are not.
 */
export function sceneViewPinStaleReasonV1(
  pin: SceneViewPinV1,
  current: SceneAnnotationViewContextV1,
): string | null {
  if (pin.sceneId !== current.sceneId) {
    return `Annotation '${String(pin.id)}' belongs to scene '${pin.sceneId}', not the open scene '${current.sceneId}'.`;
  }
  if (pin.sceneFingerprint !== current.sceneFingerprint) {
    return `Annotation '${String(pin.id)}' captured an earlier presentation of scene '${pin.sceneId}'. `
      + 'Restore that scene data or create a new annotation for the current revision.';
  }
  if (!sameReplay(pin.replay, current.replay)) {
    return `Annotation '${String(pin.id)}' captured different replay evidence for scene '${pin.sceneId}'. `
      + 'Restore the matching replay trace or create a new annotation for the current trace.';
  }
  if (pin.viewport.width !== current.viewport.width || pin.viewport.height !== current.viewport.height) {
    return `Annotation '${String(pin.id)}' was captured at ${String(pin.viewport.width)}x`
      + `${String(pin.viewport.height)}, but the stage is ${String(current.viewport.width)}x`
      + `${String(current.viewport.height)}. Resize the Studio stage to the captured viewport before showing it.`;
  }
  return null;
}
