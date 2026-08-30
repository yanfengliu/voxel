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
  /** Visible vertical world units. Smaller is closer. */
  readonly viewHeight: number;
}

export const DEFAULT_ORBIT: OrbitStateV1 = {
  yawDegrees: 45,
  pitchDegrees: 30,
  viewHeight: 14,
};

export interface OrbitLimitsV1 {
  readonly pitchLimitDegrees: number;
  readonly minViewHeight: number;
  readonly maxViewHeight: number;
}

const PITCH_LIMIT = 85;
/**
 * The ordinary Studio inspection range. A quarter-unit view makes the
 * editor-scale 0.01-unit voxel legible, while a 256-unit-tall landscape view
 * leaves useful margin around the capped 192-unit scene grid.
 */
export const ORBIT_MIN_VIEW_HEIGHT = 0.25;
export const ORBIT_MAX_VIEW_HEIGHT = 256;
export const STUDIO_ORBIT_LIMITS: OrbitLimitsV1 = {
  pitchLimitDegrees: PITCH_LIMIT,
  minViewHeight: ORBIT_MIN_VIEW_HEIGHT,
  maxViewHeight: ORBIT_MAX_VIEW_HEIGHT,
};
/** Opening an asset keeps the established comfortable framing; wheel input may travel farther. */
export const AUTO_FIT_MIN_VIEW_HEIGHT = 3;
export const AUTO_FIT_MAX_VIEW_HEIGHT = 80;
/** Preserve the established flat-camera depth planes through the old range. */
const MIN_FLAT_EYE_DISTANCE = 100;

export function clampOrbit(
  state: OrbitStateV1,
  limits: OrbitLimitsV1 = STUDIO_ORBIT_LIMITS,
): OrbitStateV1 {
  return {
    yawDegrees: ((state.yawDegrees % 360) + 360) % 360,
    pitchDegrees: Math.min(
      limits.pitchLimitDegrees,
      Math.max(-limits.pitchLimitDegrees, state.pitchDegrees),
    ),
    viewHeight: Math.min(
      limits.maxViewHeight,
      Math.max(limits.minViewHeight, state.viewHeight),
    ),
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
  return Math.min(
    AUTO_FIT_MAX_VIEW_HEIGHT,
    Math.max(AUTO_FIT_MIN_VIEW_HEIGHT, diagonal * 1.15),
  );
}

/** Moves a drag into angle space: pixels to degrees, up-drag looks higher. */
export function dragOrbit(
  state: OrbitStateV1,
  dxPixels: number,
  dyPixels: number,
  limits: OrbitLimitsV1 = STUDIO_ORBIT_LIMITS,
): OrbitStateV1 {
  return clampOrbit({
    yawDegrees: state.yawDegrees - dxPixels * 0.45,
    pitchDegrees: state.pitchDegrees + dyPixels * 0.35,
    viewHeight: state.viewHeight,
  }, limits);
}

export function zoomOrbit(
  state: OrbitStateV1,
  wheelSteps: number,
  limits: OrbitLimitsV1 = STUDIO_ORBIT_LIMITS,
): OrbitStateV1 {
  return clampOrbit({
    ...state,
    viewHeight: state.viewHeight * Math.pow(1.12, wheelSteps),
  }, limits);
}

/** The point the camera looks at; panning slides it across the ground. */
export type OrbitCenterV1 = readonly [number, number, number];

/** Ground distance travelled per second, expressed as a fraction of the current view height. */
export const KEYBOARD_PAN_VIEW_HEIGHTS_PER_SECOND = 0.75;

/**
 * Moves the look-at point with camera-relative ground controls.
 *
 * Forward is the horizontal direction the camera faces; right is screen-right.
 * Diagonal input is normalized so W+D is no faster than W, and the vertical
 * center stays unchanged because WASD has no matching vertical control.
 */
export function moveOrbitCenter(
  state: OrbitStateV1,
  center: OrbitCenterV1,
  forward: number,
  right: number,
  distance: number,
  limits: OrbitLimitsV1 = STUDIO_ORBIT_LIMITS,
): OrbitCenterV1 {
  const magnitude = Math.hypot(forward, right);
  if (magnitude === 0 || distance === 0) return center;
  const normalizedForward = forward / magnitude;
  const normalizedRight = right / magnitude;
  const yaw = (clampOrbit(state, limits).yawDegrees * Math.PI) / 180;
  const forwardX = -Math.sin(yaw);
  const forwardZ = -Math.cos(yaw);
  const rightX = Math.cos(yaw);
  const rightZ = -Math.sin(yaw);
  return [
    center[0] + (forwardX * normalizedForward + rightX * normalizedRight) * distance,
    center[1],
    center[2] + (forwardZ * normalizedForward + rightZ * normalizedRight) * distance,
  ];
}

/**
 * Slides the look-at point across the ground for a right-drag pan. The world
 * follows the cursor: drag right and the scene moves right, so the point the
 * camera holds moves left. It moves in the screen's own right and up
 * directions, projected onto the ground, so a pan feels the same at any yaw.
 */
export function panOrbit(
  state: OrbitStateV1,
  center: OrbitCenterV1,
  dxPixels: number,
  dyPixels: number,
  heightPixels: number,
  limits: OrbitLimitsV1 = STUDIO_ORBIT_LIMITS,
): OrbitCenterV1 {
  const clamped = clampOrbit(state, limits);
  const worldPerPixel = clamped.viewHeight / Math.max(1, heightPixels);
  const yaw = (clamped.yawDegrees * Math.PI) / 180;
  // Screen right and the ground projection of screen up, in world XZ.
  const rightX = Math.cos(yaw);
  const rightZ = -Math.sin(yaw);
  const upX = Math.sin(yaw);
  const upZ = Math.cos(yaw);
  return [
    center[0] + (-rightX * dxPixels + upX * dyPixels) * worldPerPixel,
    center[1],
    center[2] + (-rightZ * dxPixels + upZ * dyPixels) * worldPerPixel,
  ];
}

/** With real depth, how wide the eye opens. Modest, so cubes stay readable. */
export const DEPTH_FOV_DEGREES = 35;

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
  center: OrbitCenterV1 = [0, 0, 0],
): void {
  const clamped = clampOrbit(state);
  const yaw = (clamped.yawDegrees * Math.PI) / 180;
  const pitch = (clamped.pitchDegrees * Math.PI) / 180;
  const aspect = widthPixels / Math.max(1, heightPixels);
  const verticalHalf = clamped.viewHeight / 2;
  const depth = camera instanceof PerspectiveCamera;
  const distance = depth
    ? verticalHalf / Math.tan((DEPTH_FOV_DEGREES * Math.PI) / 360)
    : Math.max(MIN_FLAT_EYE_DISTANCE, clamped.viewHeight);
  const flat = Math.cos(pitch) * distance;
  // Position and aim are both offset by the pan centre, so panning slides the
  // whole view across the ground without changing the angle or the zoom.
  camera.position.set(
    center[0] + Math.sin(yaw) * flat,
    center[1] + Math.sin(pitch) * distance,
    center[2] + Math.cos(yaw) * flat,
  );
  camera.up.set(0, 1, 0);
  camera.lookAt(center[0], center[1], center[2]);
  if (depth) {
    camera.fov = DEPTH_FOV_DEGREES;
    camera.aspect = aspect;
    camera.near = Math.max(0.05, distance / 50);
    camera.far = distance * 4;
  } else {
    camera.left = -verticalHalf * aspect;
    camera.right = verticalHalf * aspect;
    camera.top = verticalHalf;
    camera.bottom = -verticalHalf;
    camera.near = 0.1;
    // Pulling the flat eye back with very wide views keeps fitted assets and
    // the capped scene grid in front of the camera without changing framing.
    camera.far = distance * 2.5;
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
