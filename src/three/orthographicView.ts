import { OrthographicCamera, type Vector3 } from 'three';

export interface IsometricViewCenter {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface IsometricOrthographicView {
  readonly viewportWidth: number;
  readonly viewportHeight: number;
  readonly center: IsometricViewCenter;
  readonly zoom: number;
  readonly tileWidthPixels?: number;
  readonly tileHeightPixels?: number;
  readonly distance?: number;
  readonly near?: number;
  readonly far?: number;
}

interface ResolvedIsometricOrthographicView {
  readonly viewportWidth: number;
  readonly viewportHeight: number;
  readonly center: IsometricViewCenter;
  readonly zoom: number;
  readonly tileWidthPixels: number;
  readonly tileHeightPixels: number;
  readonly distance: number;
  readonly near: number;
  readonly far: number;
}

const DEFAULT_TILE_WIDTH_PIXELS = 64;
const DEFAULT_TILE_HEIGHT_PIXELS = 32;
const DEFAULT_DISTANCE = 1_000;
const DEFAULT_NEAR = 0.1;
const DEFAULT_FAR = 4_000;
const viewByCamera = new WeakMap<OrthographicCamera, ResolvedIsometricOrthographicView>();

function requirePositiveFinite(name: string, value: number): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive finite number.`);
  }
}

function requireFiniteCenter(center: IsometricViewCenter): void {
  for (const [name, value] of Object.entries(center)) {
    if (!Number.isFinite(value)) {
      throw new RangeError(`center.${name} must be finite.`);
    }
  }
}

function resolveView(
  input: IsometricOrthographicView,
  prior?: ResolvedIsometricOrthographicView,
): ResolvedIsometricOrthographicView {
  const tileWidthPixels = input.tileWidthPixels
    ?? prior?.tileWidthPixels
    ?? DEFAULT_TILE_WIDTH_PIXELS;
  const tileHeightPixels = input.tileHeightPixels
    ?? prior?.tileHeightPixels
    ?? DEFAULT_TILE_HEIGHT_PIXELS;
  const distance = input.distance ?? prior?.distance ?? DEFAULT_DISTANCE;
  const near = input.near ?? prior?.near ?? DEFAULT_NEAR;
  const far = input.far ?? prior?.far ?? DEFAULT_FAR;

  requirePositiveFinite('viewportWidth', input.viewportWidth);
  requirePositiveFinite('viewportHeight', input.viewportHeight);
  requirePositiveFinite('zoom', input.zoom);
  requirePositiveFinite('tileWidthPixels', tileWidthPixels);
  requirePositiveFinite('tileHeightPixels', tileHeightPixels);
  requirePositiveFinite('distance', distance);
  requireFiniteCenter(input.center);

  if (tileHeightPixels >= tileWidthPixels) {
    throw new RangeError('tileHeightPixels must be smaller than tileWidthPixels.');
  }
  if (!Number.isFinite(near) || near < 0) {
    throw new RangeError('near must be a non-negative finite number.');
  }
  if (!Number.isFinite(far) || far <= near) {
    throw new RangeError('far must be finite and greater than near.');
  }

  return {
    viewportWidth: input.viewportWidth,
    viewportHeight: input.viewportHeight,
    center: { ...input.center },
    zoom: input.zoom,
    tileWidthPixels,
    tileHeightPixels,
    distance,
    near,
    far,
  };
}

export function createIsometricOrthographicCamera(
  view: IsometricOrthographicView,
): OrthographicCamera {
  const camera = new OrthographicCamera();
  return configureIsometricOrthographicView(camera, view);
}

export function configureIsometricOrthographicView(
  camera: OrthographicCamera,
  input: IsometricOrthographicView,
): OrthographicCamera {
  const view = resolveView(input, viewByCamera.get(camera));
  const pitch = Math.asin(view.tileHeightPixels / view.tileWidthPixels);
  const horizontalDistance = Math.cos(pitch) * view.distance;
  const axisDistance = horizontalDistance / Math.SQRT2;
  const pixelsPerCameraUnit = view.tileWidthPixels / Math.SQRT2;
  const visibleWidth = view.viewportWidth / (pixelsPerCameraUnit * view.zoom);
  const visibleHeight = view.viewportHeight / (pixelsPerCameraUnit * view.zoom);

  camera.left = -visibleWidth / 2;
  camera.right = visibleWidth / 2;
  camera.top = visibleHeight / 2;
  camera.bottom = -visibleHeight / 2;
  camera.near = view.near;
  camera.far = view.far;
  camera.zoom = 1;
  camera.up.set(0, 1, 0);
  camera.position.set(
    view.center.x + axisDistance,
    view.center.y + Math.sin(pitch) * view.distance,
    view.center.z + axisDistance,
  );
  camera.lookAt(view.center.x, view.center.y, view.center.z);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  viewByCamera.set(camera, view);
  return camera;
}

function stablePixel(value: number): number {
  const rounded = Math.round(value * 1e10) / 1e10;
  return Object.is(rounded, -0) ? 0 : rounded;
}

export function projectWorldToViewport(
  camera: OrthographicCamera,
  point: Vector3,
  viewportWidth: number,
  viewportHeight: number,
): { x: number; y: number } {
  requirePositiveFinite('viewportWidth', viewportWidth);
  requirePositiveFinite('viewportHeight', viewportHeight);
  const projected = point.clone().project(camera);
  return {
    x: stablePixel((projected.x + 1) * 0.5 * viewportWidth),
    y: stablePixel((1 - projected.y) * 0.5 * viewportHeight),
  };
}
