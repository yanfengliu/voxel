import { type OrthographicCamera } from 'three';

/**
 * The stage camera: circles the model at any angle while staying the flat,
 * no-perspective view voxel art reads best in. Dragging changes where you
 * stand; the model itself never moves — its animation stays the only motion,
 * so what you judge is the model, not the camera.
 *
 * Pure state in, camera out: the same angles always place the camera the same
 * way, which keeps every studio claim reproducible even while you orbit.
 */

export interface OrbitStateV1 {
  /** Turn around the model, degrees. 0 looks down the front-left diagonal. */
  readonly yawDegrees: number;
  /** Height of the eye, degrees above level. Clamped short of straight up/down. */
  readonly pitchDegrees: number;
  /** Visible world units across the shorter screen edge. Smaller is closer. */
  readonly viewHeight: number;
}

export const DEFAULT_ORBIT: OrbitStateV1 = {
  yawDegrees: 45,
  pitchDegrees: 30,
  viewHeight: 14,
};

const PITCH_LIMIT = 85;
const MIN_VIEW_HEIGHT = 3;
const MAX_VIEW_HEIGHT = 80;
/** Far enough that no reasonable model pokes past the near plane. */
const EYE_DISTANCE = 100;

export function clampOrbit(state: OrbitStateV1): OrbitStateV1 {
  return {
    yawDegrees: ((state.yawDegrees % 360) + 360) % 360,
    pitchDegrees: Math.min(PITCH_LIMIT, Math.max(-PITCH_LIMIT, state.pitchDegrees)),
    viewHeight: Math.min(MAX_VIEW_HEIGHT, Math.max(MIN_VIEW_HEIGHT, state.viewHeight)),
  };
}

/** Moves a drag into angle space: pixels to degrees, up-drag looks higher. */
export function dragOrbit(
  state: OrbitStateV1,
  dxPixels: number,
  dyPixels: number,
): OrbitStateV1 {
  return clampOrbit({
    yawDegrees: state.yawDegrees - dxPixels * 0.45,
    pitchDegrees: state.pitchDegrees + dyPixels * 0.35,
    viewHeight: state.viewHeight,
  });
}

export function zoomOrbit(state: OrbitStateV1, wheelSteps: number): OrbitStateV1 {
  return clampOrbit({ ...state, viewHeight: state.viewHeight * Math.pow(1.12, wheelSteps) });
}

/** Places the studio-owned camera for the given angles and screen shape. */
export function applyOrbit(
  camera: OrthographicCamera,
  state: OrbitStateV1,
  widthPixels: number,
  heightPixels: number,
): void {
  const clamped = clampOrbit(state);
  const yaw = (clamped.yawDegrees * Math.PI) / 180;
  const pitch = (clamped.pitchDegrees * Math.PI) / 180;
  const flat = Math.cos(pitch) * EYE_DISTANCE;
  camera.position.set(
    Math.sin(yaw) * flat,
    Math.sin(pitch) * EYE_DISTANCE,
    Math.cos(yaw) * flat,
  );
  camera.up.set(0, 1, 0);
  camera.lookAt(0, 0, 0);
  const aspect = widthPixels / Math.max(1, heightPixels);
  const half = clamped.viewHeight / 2;
  camera.left = -half * aspect;
  camera.right = half * aspect;
  camera.top = half;
  camera.bottom = -half;
  camera.near = 0.1;
  camera.far = EYE_DISTANCE * 2.5;
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
}

/** The view named in words for the corner chip: "front-left · 30° up". */
export function describeOrbit(state: OrbitStateV1): string {
  const yaw = clampOrbit(state).yawDegrees;
  const names = ['front', 'front-left', 'left', 'back-left', 'back', 'back-right', 'right', 'front-right'];
  const slice = names[Math.round(yaw / 45) % 8] ?? 'front';
  const pitch = Math.round(clampOrbit(state).pitchDegrees);
  const updown = pitch >= 0 ? `${String(pitch)}° up` : `${String(-pitch)}° down`;
  return `${slice} · ${updown}`;
}
