import {
  Camera,
  OrthographicCamera,
  PerspectiveCamera,
  Raycaster,
  Vector2,
  Vector3,
} from 'three';

import type { Vec3V1 } from '../core/index.js';
import {
  captureIsometricViewRollbackInternal,
  configureIsometricOrthographicView,
  createIsometricOrthographicCamera,
  type IsometricViewCenter,
} from './orthographicView.js';

export type ThreeViewOptionsV1 =
  | {
      readonly kind: 'isometric-orthographic';
      readonly center: Vec3V1;
      readonly zoom: number;
      readonly tileWidthPixels: number;
      readonly tileHeightPixels: number;
      readonly near?: number;
      readonly far?: number;
    }
  | {
      readonly kind: 'perspective';
      readonly position: Vec3V1;
      readonly target: Vec3V1;
      readonly up?: Vec3V1;
      readonly verticalFovDegrees: number;
      readonly near: number;
      readonly far: number;
    }
  | {
      readonly kind: 'borrowed-camera';
      readonly camera: Camera;
      readonly projectionOwnership: 'host' | 'runtime';
    };

export interface ThreeViewportSizeV1 {
  readonly width: number;
  readonly height: number;
}

export interface ThreeViewportPointV1 {
  readonly x: number;
  readonly y: number;
}

export interface ThreeProjectedPointV1 extends ThreeViewportPointV1 {
  readonly depth: number;
}

export interface ThreeWorldRayV1 {
  readonly origin: Vec3V1;
  readonly direction: Vec3V1;
}

export type ThreeCameraMathResultV1<Value> =
  | { readonly status: 'ok'; readonly value: Value }
  | {
      readonly status: 'unprojectable';
      readonly reason: 'non-finite-projection' | 'non-finite-ray';
    };

export interface ThreeCameraStrategyInternal {
  readonly camera: Camera;
  readonly kind: ThreeViewOptionsV1['kind'];
  readonly ownership: 'owned' | 'borrowed';
  readonly projectionOwnership: 'runtime' | 'host';
  readonly focus: Vec3V1 | null;
  resize(width: number, height: number): void;
  setLegacyIsometricView(center: IsometricViewCenter, zoom: number): void;
}

/** Captures exact borrowed-camera state for transactional runtime construction. */
export function borrowedCameraRollbackInternal(camera: Camera): () => void {
  if (!(camera instanceof Camera)) throw new TypeError('Borrowed camera must be a Three.js Camera.');
  const base = {
    position: camera.position.clone(),
    quaternion: camera.quaternion.clone(),
    up: camera.up.clone(),
    matrix: camera.matrix.clone(),
    matrixWorld: camera.matrixWorld.clone(),
    matrixWorldInverse: camera.matrixWorldInverse.clone(),
    projectionMatrix: camera.projectionMatrix.clone(),
    projectionMatrixInverse: camera.projectionMatrixInverse.clone(),
    matrixWorldNeedsUpdate: camera.matrixWorldNeedsUpdate,
  };
  const perspective = camera instanceof PerspectiveCamera
    ? { aspect: camera.aspect }
    : null;
  const orthographic = camera instanceof OrthographicCamera
    ? {
        left: camera.left,
        right: camera.right,
        top: camera.top,
        bottom: camera.bottom,
        near: camera.near,
        far: camera.far,
        zoom: camera.zoom,
      }
    : null;
  const rollbackCachedIsometricView = camera instanceof OrthographicCamera
    ? captureIsometricViewRollbackInternal(camera)
    : null;
  return (): void => {
    camera.position.copy(base.position);
    camera.quaternion.copy(base.quaternion);
    camera.up.copy(base.up);
    if (camera instanceof PerspectiveCamera && perspective) camera.aspect = perspective.aspect;
    if (camera instanceof OrthographicCamera && orthographic) {
      camera.left = orthographic.left;
      camera.right = orthographic.right;
      camera.top = orthographic.top;
      camera.bottom = orthographic.bottom;
      camera.near = orthographic.near;
      camera.far = orthographic.far;
      camera.zoom = orthographic.zoom;
    }
    camera.matrix.copy(base.matrix);
    camera.matrixWorld.copy(base.matrixWorld);
    camera.matrixWorldInverse.copy(base.matrixWorldInverse);
    camera.projectionMatrix.copy(base.projectionMatrix);
    camera.projectionMatrixInverse.copy(base.projectionMatrixInverse);
    camera.matrixWorldNeedsUpdate = base.matrixWorldNeedsUpdate;
    rollbackCachedIsometricView?.();
  };
}

interface LegacyIsometricOptionsInternal {
  readonly camera?: OrthographicCamera;
  readonly width: number;
  readonly height: number;
  readonly center: IsometricViewCenter;
  readonly zoom: number;
  readonly tileWidthPixels: number;
  readonly tileHeightPixels: number;
}

function positive(name: string, value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive finite number.`);
  }
  return value;
}

function finiteVec(name: string, value: unknown): Vec3V1 {
  if (typeof value !== 'object' || value === null) {
    throw new TypeError(`${name} must be a three-component vector.`);
  }
  const input = value as Partial<Vec3V1>;
  for (const axis of ['x', 'y', 'z'] as const) {
    if (!Number.isFinite(input[axis])) throw new RangeError(`${name}.${axis} must be finite.`);
  }
  return { x: input.x!, y: input.y!, z: input.z! };
}

function viewport(width: number, height: number): void {
  positive('width', width);
  positive('height', height);
  const aspect = width / height;
  if (!Number.isFinite(aspect) || aspect <= 0) {
    throw new RangeError('Viewport aspect ratio must be positive and finite.');
  }
}

function finite(name: string, value: number): number {
  if (!Number.isFinite(value)) throw new RangeError(`${name} must be finite.`);
  return value;
}

function validateViewOffset(
  name: string,
  view: PerspectiveCamera['view'] | OrthographicCamera['view'],
): void {
  if (!view?.enabled) return;
  positive(`${name}.view.fullWidth`, view.fullWidth);
  positive(`${name}.view.fullHeight`, view.fullHeight);
  positive(`${name}.view.width`, view.width);
  positive(`${name}.view.height`, view.height);
  finite(`${name}.view.offsetX`, view.offsetX);
  finite(`${name}.view.offsetY`, view.offsetY);
}

function validateRuntimePerspective(camera: PerspectiveCamera): void {
  const fov = positive('borrowed perspective fov', camera.fov);
  if (fov >= 180) throw new RangeError('Borrowed perspective fov must be less than 180.');
  const near = positive('borrowed perspective near', camera.near);
  const far = positive('borrowed perspective far', camera.far);
  if (far <= near) throw new RangeError('Borrowed perspective far must be greater than near.');
  positive('borrowed perspective zoom', camera.zoom);
  positive('borrowed perspective filmGauge', camera.filmGauge);
  finite('borrowed perspective filmOffset', camera.filmOffset);
  validateViewOffset('borrowed perspective', camera.view);
}

function validateRuntimeOrthographic(camera: OrthographicCamera): void {
  const left = finite('borrowed orthographic left', camera.left);
  const right = finite('borrowed orthographic right', camera.right);
  const top = finite('borrowed orthographic top', camera.top);
  const bottom = finite('borrowed orthographic bottom', camera.bottom);
  if (right <= left || top <= bottom) {
    throw new RangeError('Borrowed orthographic bounds must have positive width and height.');
  }
  const near = finite('borrowed orthographic near', camera.near);
  const far = finite('borrowed orthographic far', camera.far);
  if (near < 0) throw new RangeError('Borrowed orthographic near must be non-negative.');
  if (far <= near) throw new RangeError('Borrowed orthographic far must be greater than near.');
  positive('borrowed orthographic zoom', camera.zoom);
  validateViewOffset('borrowed orthographic', camera.view);
}

function validatePerspectiveOrientation(position: Vec3V1, target: Vec3V1, up: Vec3V1): void {
  const direction = new Vector3(
    target.x - position.x,
    target.y - position.y,
    target.z - position.z,
  );
  if (![direction.x, direction.y, direction.z].every(Number.isFinite)) {
    throw new RangeError('Perspective position-to-target direction must be finite.');
  }
  const directionLength = Math.hypot(direction.x, direction.y, direction.z);
  const upLength = Math.hypot(up.x, up.y, up.z);
  if (directionLength === 0) throw new RangeError('Perspective position and target must differ.');
  if (upLength === 0) throw new RangeError('Perspective up must be nonzero.');
  direction.multiplyScalar(1 / directionLength);
  const normalizedUp = new Vector3(up.x, up.y, up.z).multiplyScalar(1 / upLength);
  if (direction.cross(normalizedUp).length() <= 1e-12) {
    throw new RangeError('Perspective up must not be collinear with the viewing direction.');
  }
}

function hasOnlyFiniteComponents(value: Vec3V1): boolean {
  return Number.isFinite(value.x) && Number.isFinite(value.y) && Number.isFinite(value.z);
}

class IsometricStrategyInternal implements ThreeCameraStrategyInternal {
  readonly kind = 'isometric-orthographic' as const;
  readonly projectionOwnership = 'runtime' as const;
  private centerValue: IsometricViewCenter;
  private zoomValue: number;
  private width: number;
  private height: number;

  constructor(
    readonly camera: OrthographicCamera,
    readonly ownership: 'owned' | 'borrowed',
    width: number,
    height: number,
    center: IsometricViewCenter,
    zoom: number,
    private readonly tileWidthPixels: number,
    private readonly tileHeightPixels: number,
    private readonly near?: number,
    private readonly far?: number,
  ) {
    this.width = width;
    this.height = height;
    this.centerValue = finiteVec('center', center);
    this.zoomValue = positive('zoom', zoom);
    this.configure();
  }

  get focus(): Vec3V1 {
    return { ...this.centerValue };
  }

  resize(width: number, height: number): void {
    viewport(width, height);
    this.configure(width, height, this.centerValue, this.zoomValue);
    this.width = width;
    this.height = height;
  }

  setLegacyIsometricView(center: IsometricViewCenter, zoom: number): void {
    const nextCenter = finiteVec('center', center);
    const nextZoom = positive('zoom', zoom);
    this.configure(this.width, this.height, nextCenter, nextZoom);
    this.centerValue = nextCenter;
    this.zoomValue = nextZoom;
  }

  private configure(
    width = this.width,
    height = this.height,
    center = this.centerValue,
    zoom = this.zoomValue,
  ): void {
    configureIsometricOrthographicView(this.camera, {
      viewportWidth: width,
      viewportHeight: height,
      center,
      zoom,
      tileWidthPixels: this.tileWidthPixels,
      tileHeightPixels: this.tileHeightPixels,
      ...(this.near === undefined ? {} : { near: this.near }),
      ...(this.far === undefined ? {} : { far: this.far }),
    });
  }
}

class PerspectiveStrategyInternal implements ThreeCameraStrategyInternal {
  readonly kind = 'perspective' as const;
  readonly ownership = 'owned' as const;
  readonly projectionOwnership = 'runtime' as const;
  readonly camera: PerspectiveCamera;
  readonly focus: Vec3V1;

  constructor(options: Extract<ThreeViewOptionsV1, { kind: 'perspective' }>, width: number, height: number) {
    viewport(width, height);
    const position = finiteVec('position', options.position);
    this.focus = finiteVec('target', options.target);
    const up = finiteVec('up', options.up ?? { x: 0, y: 1, z: 0 });
    validatePerspectiveOrientation(position, this.focus, up);
    const fov = positive('verticalFovDegrees', options.verticalFovDegrees);
    if (fov >= 180) throw new RangeError('verticalFovDegrees must be less than 180.');
    const near = positive('near', options.near);
    const far = positive('far', options.far);
    if (far <= near) throw new RangeError('far must be greater than near.');
    this.camera = new PerspectiveCamera(fov, width / height, near, far);
    this.camera.position.set(position.x, position.y, position.z);
    this.camera.up.set(up.x, up.y, up.z);
    this.camera.lookAt(this.focus.x, this.focus.y, this.focus.z);
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld(true);
  }

  resize(width: number, height: number): void {
    viewport(width, height);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  setLegacyIsometricView(): void {
    throw new Error('setView is available only for the isometric-orthographic strategy.');
  }
}

class BorrowedStrategyInternal implements ThreeCameraStrategyInternal {
  readonly kind = 'borrowed-camera' as const;
  readonly ownership = 'borrowed' as const;
  readonly focus = null;
  readonly camera: Camera;
  readonly projectionOwnership: 'host' | 'runtime';
  private readonly orthographicShape: {
    readonly centerX: number;
    readonly centerY: number;
    readonly halfHeight: number;
  } | null;

  constructor(
    cameraValue: unknown,
    projectionOwnershipValue: unknown,
    width: number,
    height: number,
  ) {
    viewport(width, height);
    if (!(cameraValue instanceof Camera)) {
      throw new TypeError('Borrowed camera must be a Three.js Camera.');
    }
    if (projectionOwnershipValue !== 'host' && projectionOwnershipValue !== 'runtime') {
      throw new TypeError('projectionOwnership must be host or runtime.');
    }
    this.camera = cameraValue;
    this.projectionOwnership = projectionOwnershipValue;
    const camera = this.camera;
    const projectionOwnership = this.projectionOwnership;
    if (projectionOwnership === 'runtime' && !(camera instanceof PerspectiveCamera)
      && !(camera instanceof OrthographicCamera)) {
      throw new TypeError('Runtime projection ownership requires a known orthographic or perspective camera.');
    }
    if (projectionOwnership === 'runtime' && camera instanceof PerspectiveCamera) {
      validateRuntimePerspective(camera);
    }
    if (projectionOwnership === 'runtime' && camera instanceof OrthographicCamera) {
      validateRuntimeOrthographic(camera);
      const halfHeight = (camera.top - camera.bottom) / 2;
      this.orthographicShape = {
        centerX: (camera.left + camera.right) / 2,
        centerY: (camera.top + camera.bottom) / 2,
        halfHeight,
      };
    } else {
      this.orthographicShape = null;
    }
    if (projectionOwnership === 'runtime') this.resize(width, height);
  }

  resize(width: number, height: number): void {
    viewport(width, height);
    if (this.projectionOwnership === 'host') return;
    if (this.camera instanceof PerspectiveCamera) {
      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
      return;
    }
    if (this.camera instanceof OrthographicCamera && this.orthographicShape) {
      const halfWidth = this.orthographicShape.halfHeight * width / height;
      this.camera.left = this.orthographicShape.centerX - halfWidth;
      this.camera.right = this.orthographicShape.centerX + halfWidth;
      this.camera.top = this.orthographicShape.centerY + this.orthographicShape.halfHeight;
      this.camera.bottom = this.orthographicShape.centerY - this.orthographicShape.halfHeight;
      this.camera.updateProjectionMatrix();
    }
  }

  setLegacyIsometricView(): void {
    throw new Error('setView cannot mutate a borrowed generic camera.');
  }
}

export function createThreeViewStrategyInternal(
  optionsValue: ThreeViewOptionsV1,
  width: number,
  height: number,
): ThreeCameraStrategyInternal {
  const unknownOptions: unknown = optionsValue;
  if (typeof unknownOptions !== 'object' || unknownOptions === null) {
    throw new TypeError('Three view options must be an object.');
  }
  const options = unknownOptions as ThreeViewOptionsV1;
  switch (options.kind) {
    case 'isometric-orthographic': {
      viewport(width, height);
      const camera = createIsometricOrthographicCamera({
        viewportWidth: width,
        viewportHeight: height,
        center: options.center,
        zoom: options.zoom,
        tileWidthPixels: options.tileWidthPixels,
        tileHeightPixels: options.tileHeightPixels,
        ...(options.near === undefined ? {} : { near: options.near }),
        ...(options.far === undefined ? {} : { far: options.far }),
      });
      return new IsometricStrategyInternal(
        camera,
        'owned',
        width,
        height,
        options.center,
        options.zoom,
        options.tileWidthPixels,
        options.tileHeightPixels,
        options.near,
        options.far,
      );
    }
    case 'perspective':
      return new PerspectiveStrategyInternal(options, width, height);
    case 'borrowed-camera':
      return new BorrowedStrategyInternal(
        options.camera,
        options.projectionOwnership,
        width,
        height,
      );
    default:
      throw new TypeError(
        'view.kind must be isometric-orthographic, perspective, or borrowed-camera.',
      );
  }
}

export function createLegacyIsometricStrategyInternal(
  options: LegacyIsometricOptionsInternal,
): ThreeCameraStrategyInternal {
  viewport(options.width, options.height);
  const cameraValue: unknown = options.camera;
  if (cameraValue !== undefined && !(cameraValue instanceof OrthographicCamera)) {
    throw new TypeError('Legacy isometric camera must be an OrthographicCamera.');
  }
  const camera = cameraValue ?? new OrthographicCamera();
  return new IsometricStrategyInternal(
    camera,
    cameraValue ? 'borrowed' : 'owned',
    options.width,
    options.height,
    options.center,
    options.zoom,
    options.tileWidthPixels,
    options.tileHeightPixels,
  );
}

function stable(value: number): number {
  const rounded = Math.round(value * 1e10) / 1e10;
  return Object.is(rounded, -0) ? 0 : rounded;
}

export function projectWorldToViewportV1(
  camera: Camera,
  point: Vec3V1,
  size: ThreeViewportSizeV1,
): ThreeProjectedPointV1 {
  const result = tryProjectWorldToViewportV1(camera, point, size);
  if (result.status === 'unprojectable') {
    throw new RangeError('World point produced a non-finite viewport projection.');
  }
  return result.value;
}

export function tryProjectWorldToViewportV1(
  camera: Camera,
  point: Vec3V1,
  size: ThreeViewportSizeV1,
): ThreeCameraMathResultV1<ThreeProjectedPointV1> {
  viewport(size.width, size.height);
  const value = finiteVec('point', point);
  const projected = new Vector3(value.x, value.y, value.z).project(camera);
  const result = {
    x: stable((projected.x + 1) * 0.5 * size.width),
    y: stable((1 - projected.y) * 0.5 * size.height),
    depth: stable(projected.z),
  };
  return Number.isFinite(result.x) && Number.isFinite(result.y) && Number.isFinite(result.depth)
    ? { status: 'ok', value: result }
    : { status: 'unprojectable', reason: 'non-finite-projection' };
}

export function viewportPointToRayV1(
  camera: Camera,
  point: ThreeViewportPointV1,
  size: ThreeViewportSizeV1,
): ThreeWorldRayV1 {
  const result = tryViewportPointToRayV1(camera, point, size);
  if (result.status === 'unprojectable') {
    throw new RangeError('Camera produced a non-finite viewport ray.');
  }
  return result.value;
}

export function tryViewportPointToRayV1(
  camera: Camera,
  point: ThreeViewportPointV1,
  size: ThreeViewportSizeV1,
): ThreeCameraMathResultV1<ThreeWorldRayV1> {
  viewport(size.width, size.height);
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    throw new RangeError('Viewport point must be finite.');
  }
  if (!(camera instanceof PerspectiveCamera) && !(camera instanceof OrthographicCamera)) {
    throw new TypeError('Viewport rays require an orthographic or perspective camera.');
  }
  const raycaster = new Raycaster();
  raycaster.setFromCamera(new Vector2(
    point.x / size.width * 2 - 1,
    1 - point.y / size.height * 2,
  ), camera);
  const result = {
    origin: {
      x: stable(raycaster.ray.origin.x),
      y: stable(raycaster.ray.origin.y),
      z: stable(raycaster.ray.origin.z),
    },
    direction: {
      x: stable(raycaster.ray.direction.x),
      y: stable(raycaster.ray.direction.y),
      z: stable(raycaster.ray.direction.z),
    },
  };
  const directionLength = Math.hypot(
    result.direction.x,
    result.direction.y,
    result.direction.z,
  );
  return hasOnlyFiniteComponents(result.origin)
    && hasOnlyFiniteComponents(result.direction)
    && Number.isFinite(directionLength)
    && directionLength > 0
    ? { status: 'ok', value: result }
    : { status: 'unprojectable', reason: 'non-finite-ray' };
}
