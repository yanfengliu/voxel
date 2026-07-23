import { PerspectiveCamera, type OrthographicCamera } from 'three';

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

/**
 * How much of the world to show so a model of this size fits with room to
 * spare, whatever angle it is seen from.
 *
 * A shelf holds a game's whole asset set, and those are not all one size — a
 * doorframe and a cathedral sit next to each other. One fixed view height
 * either buries the small models or crops the large ones, so opening a model
 * fits the view to it. Turning still changes nothing but where you stand: the
 * fit is taken once, from the model, not continuously from what is on screen.
 *
 * The model's diagonal rather than its height, because a model turns: a long
 * wall seen end-on is as tall as it is long, and fitting only its height
 * would crop it the moment you orbit.
 */
export function fitViewHeight(
  size: readonly [number, number, number],
  voxelSize = 1,
): number {
  const [sx, sy, sz] = size;
  // World units, not cells: a model's size on screen is its grid times how big
  // each voxel is, so a fine-grained flower and a coarse wall both frame right.
  const diagonal = Math.sqrt(sx * sx + sy * sy + sz * sz) * voxelSize;
  return clampOrbit({ ...DEFAULT_ORBIT, viewHeight: diagonal * 1.15 }).viewHeight;
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

/** With real depth, how wide the eye opens. Modest, so cubes stay readable. */
const DEPTH_FOV_DEGREES = 35;

/**
 * Places the studio-owned camera for the given angles and screen shape.
 *
 * Works for both stage looks. Flat (no depth): the classic voxel view — equal
 * sizes at every distance, drawn from far away. Real depth: nearer really is
 * bigger; the eye stands at whatever distance makes the same amount of model
 * fill the screen, so switching looks never jumps the framing. Flat rendering
 * has a known illusion — equal sizes at all distances read as GROWING with
 * distance — and the real-depth look exists to check a model against it.
 */
export function applyOrbit(
  camera: OrthographicCamera | PerspectiveCamera,
  state: OrbitStateV1,
  widthPixels: number,
  heightPixels: number,
): void {
  const clamped = clampOrbit(state);
  const yaw = (clamped.yawDegrees * Math.PI) / 180;
  const pitch = (clamped.pitchDegrees * Math.PI) / 180;
  const aspect = widthPixels / Math.max(1, heightPixels);
  const half = clamped.viewHeight / 2;
  const depth = camera instanceof PerspectiveCamera;
  const distance = depth
    ? half / Math.tan((DEPTH_FOV_DEGREES * Math.PI) / 360)
    : EYE_DISTANCE;
  const flat = Math.cos(pitch) * distance;
  camera.position.set(
    Math.sin(yaw) * flat,
    Math.sin(pitch) * distance,
    Math.cos(yaw) * flat,
  );
  camera.up.set(0, 1, 0);
  camera.lookAt(0, 0, 0);
  if (depth) {
    camera.fov = DEPTH_FOV_DEGREES;
    camera.aspect = aspect;
    camera.near = Math.max(0.05, distance / 50);
    camera.far = distance * 4;
  } else {
    camera.left = -half * aspect;
    camera.right = half * aspect;
    camera.top = half;
    camera.bottom = -half;
    camera.near = 0.1;
    camera.far = EYE_DISTANCE * 2.5;
  }
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
}

/**
 * The view named in words for the corner chip: "front-left · 30° up".
 *
 * The convention, stated so it never feels mirrored: the model faces the
 * default view, and sides are the MODEL's own — like a person facing you,
 * their left appears on your right. "Front-left" means you are seeing the
 * front and the model's left side.
 */
export function describeOrbit(state: OrbitStateV1): string {
  const yaw = clampOrbit(state).yawDegrees;
  const names = ['front', 'front-left', 'left', 'back-left', 'back', 'back-right', 'right', 'front-right'];
  const slice = names[Math.round(yaw / 45) % 8] ?? 'front';
  const pitch = Math.round(clampOrbit(state).pitchDegrees);
  const updown = pitch >= 0 ? `${String(pitch)}° up` : `${String(-pitch)}° down`;
  return `${slice} · ${updown}`;
}
