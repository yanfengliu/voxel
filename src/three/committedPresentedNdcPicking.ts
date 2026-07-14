import type { Vec3V1 } from '../core/index.js';
import {
  THREE_PRESENTED_MANIFEST_SCHEMA_V1,
  type ThreePresentedManifestV1,
} from './hostFrameProtocol.js';
import {
  preparePickQueryV1,
  type PickLaneV1,
  type PickOrderingV1,
  type PickPresentedResultV1,
  type PickQueryIssueCodeV1,
  type PickQueryV1,
  type PickUnavailableReasonV1,
  type PickWorkBudgetV1,
} from './pickingContracts.js';
import {
  pickCommittedPresentedRayForLifecycleInternal,
  type CommittedPresentedPickSnapshotInternal,
} from './committedPresentedPickSnapshot.js';
import type { ThreeRuntimeLifecycleV1 } from './runtimeTypes.js';

export interface PresentedNdcPointInternal {
  readonly x: number;
  readonly y: number;
}

/** Internal object form retained until a public NDC contract is deliberately frozen. */
export interface PresentedNdcPickQueryInternal {
  readonly ndc: PresentedNdcPointInternal;
  readonly maxDistance: number;
  readonly maxHits: number;
  readonly maxWork: PickWorkBudgetV1;
  readonly lanes?: readonly PickLaneV1[];
  readonly ordering?: PickOrderingV1;
}

export interface PreparedPresentedNdcQueryInternal {
  readonly ndc: PresentedNdcPointInternal;
  readonly maxDistance: number;
  readonly maxHits: number;
  readonly maxWork: PickWorkBudgetV1;
  readonly lanes: readonly PickLaneV1[];
  readonly ordering: PickOrderingV1;
}

export interface PresentedManifestWorldRayInternal {
  readonly origin: Vec3V1;
  readonly direction: Vec3V1;
}

export type PresentedNdcCameraUnavailableReasonInternal =
  | 'presented-manifest-invalid'
  | 'presented-camera-unprojectable';

export type PreparePresentedNdcQueryResultInternal =
  | { readonly status: 'valid'; readonly query: PreparedPresentedNdcQueryInternal }
  | {
      readonly status: 'invalid';
      readonly code: PickQueryIssueCodeV1;
      readonly path: string;
      readonly message: string;
    };

export type PresentedManifestNdcRayResultInternal =
  | { readonly status: 'valid'; readonly ray: PresentedManifestWorldRayInternal }
  | {
      readonly status: 'unavailable';
      readonly reason: PresentedNdcCameraUnavailableReasonInternal;
    };

export type CommittedPresentedNdcPickResultInternal =
  | Exclude<PickPresentedResultV1, { readonly status: 'unavailable' }>
  | {
      readonly status: 'unavailable';
      readonly reason:
        | PickUnavailableReasonV1
        | PresentedNdcCameraUnavailableReasonInternal;
    };

type HomogeneousPointInternal = readonly [number, number, number, number];

const PLACEHOLDER_ORIGIN = Object.freeze({ x: 0, y: 0, z: 0 });
const PLACEHOLDER_DIRECTION = Object.freeze({ x: 0, y: 0, z: -1 });
const MATRIX_SIZE = 4;
const CAMERA_LINEAR_SIZE = 3;
const PIVOT_EPSILON = Number.EPSILON * 32;

function invalid(
  code: PickQueryIssueCodeV1,
  path: string,
  message: string,
): Extract<PreparePresentedNdcQueryResultInternal, { readonly status: 'invalid' }> {
  return Object.freeze({ status: 'invalid', code, path, message });
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** Validates, copies, and freezes the complete bounded NDC query. */
export function preparePresentedNdcQueryInternal(
  value: unknown,
): PreparePresentedNdcQueryResultInternal {
  if (!record(value)) {
    return invalid('pick.query.invalid-type', '', 'NDC pick query must be an object.');
  }
  if (!record(value.ndc)) {
    return invalid('pick.query.invalid-type', 'ndc', 'ndc must be an object.');
  }
  const copiedNdc: { x: number; y: number } = { x: 0, y: 0 };
  for (const axis of ['x', 'y'] as const) {
    const component = value.ndc[axis];
    if (!Number.isFinite(component)) {
      return invalid(
        'pick.query.invalid-number',
        `ndc.${axis}`,
        `ndc.${axis} must be finite.`,
      );
    }
    if ((component as number) < -1 || (component as number) > 1) {
      return invalid(
        'pick.query.invalid-number',
        `ndc.${axis}`,
        `ndc.${axis} must be between -1 and 1 inclusive.`,
      );
    }
    copiedNdc[axis] = component as number;
  }
  const base = preparePickQueryV1({
    origin: PLACEHOLDER_ORIGIN,
    direction: PLACEHOLDER_DIRECTION,
    maxDistance: value.maxDistance,
    maxHits: value.maxHits,
    maxWork: value.maxWork,
    lanes: value.lanes,
    ordering: value.ordering,
  });
  if (base.status === 'invalid') {
    return invalid(base.code, base.path, base.message);
  }
  return Object.freeze({
    status: 'valid',
    query: Object.freeze({
      ndc: Object.freeze(copiedNdc),
      maxDistance: base.query.maxDistance,
      maxHits: base.query.maxHits,
      maxWork: base.query.maxWork,
      lanes: base.query.lanes,
      ordering: base.query.ordering,
    }),
  });
}

function unavailableRay(
  reason: PresentedNdcCameraUnavailableReasonInternal,
): PresentedManifestNdcRayResultInternal {
  return Object.freeze({ status: 'unavailable', reason });
}

function validFrozenMatrix(value: readonly number[]): boolean {
  return Array.isArray(value)
    && value.length === 16
    && value.every(Number.isFinite)
    && Object.isFrozen(value);
}

function normalizedMatrixIsNonsingular(
  rowMajorValues: readonly number[],
  size: number,
): boolean {
  const scale = Math.max(...rowMajorValues.map(Math.abs));
  if (!Number.isFinite(scale) || scale === 0) return false;
  const rows = Array.from({ length: size }, (_, row) => (
    Array.from({ length: size }, (_, column) => (
      rowMajorValues[row * size + column]! / scale
    ))
  ));
  for (let column = 0; column < size; column += 1) {
    let pivotRow = column;
    for (let row = column + 1; row < size; row += 1) {
      if (Math.abs(rows[row]![column]!) > Math.abs(rows[pivotRow]![column]!)) {
        pivotRow = row;
      }
    }
    const pivot = rows[pivotRow]![column]!;
    if (!Number.isFinite(pivot) || Math.abs(pivot) <= PIVOT_EPSILON) return false;
    if (pivotRow !== column) [rows[column], rows[pivotRow]] = [rows[pivotRow]!, rows[column]!];
    for (let row = column + 1; row < size; row += 1) {
      const factor = rows[row]![column]! / rows[column]![column]!;
      if (!Number.isFinite(factor)) return false;
      const rowValues = rows[row]!;
      const pivotValues = rows[column]!;
      for (let inner = column + 1; inner < size; inner += 1) {
        rowValues[inner] = rowValues[inner]! - factor * pivotValues[inner]!;
      }
    }
  }
  return true;
}

function projectionInverseUsable(value: readonly number[]): boolean {
  const rowMajor = Array.from({ length: 16 }, (_, index) => {
    const row = Math.floor(index / MATRIX_SIZE);
    const column = index % MATRIX_SIZE;
    return value[column * MATRIX_SIZE + row]!;
  });
  return normalizedMatrixIsNonsingular(rowMajor, MATRIX_SIZE);
}

function affineWorldMatrixUsable(value: readonly number[]): boolean {
  if (value[3] !== 0 || value[7] !== 0 || value[11] !== 0 || value[15] !== 1) return false;
  const linear = [
    value[0]!, value[4]!, value[8]!,
    value[1]!, value[5]!, value[9]!,
    value[2]!, value[6]!, value[10]!,
  ];
  return normalizedMatrixIsNonsingular(linear, CAMERA_LINEAR_SIZE);
}

function validateManifestCamera(
  manifest: ThreePresentedManifestV1,
): PresentedNdcCameraUnavailableReasonInternal | null {
  const schemaVersion: unknown = manifest.schemaVersion;
  const projectionKind: unknown = manifest.camera.projectionKind;
  if (
    schemaVersion !== THREE_PRESENTED_MANIFEST_SCHEMA_V1
    || (projectionKind !== 'perspective'
      && projectionKind !== 'orthographic'
      && projectionKind !== 'generic')
    || !Object.isFrozen(manifest)
    || !Object.isFrozen(manifest.frame)
    || !Object.isFrozen(manifest.viewport)
    || !Object.isFrozen(manifest.camera)
    || !validFrozenMatrix(manifest.camera.projectionMatrix)
    || !validFrozenMatrix(manifest.camera.projectionMatrixInverse)
    || !validFrozenMatrix(manifest.camera.matrixWorld)
    || !validFrozenMatrix(manifest.camera.matrixWorldInverse)
  ) return 'presented-manifest-invalid';
  return projectionInverseUsable(manifest.camera.projectionMatrixInverse)
    && affineWorldMatrixUsable(manifest.camera.matrixWorld)
    ? null
    : 'presented-camera-unprojectable';
}

function multiply(
  matrix: readonly number[],
  point: HomogeneousPointInternal,
): HomogeneousPointInternal | null {
  const result = [0, 0, 0, 0] as [number, number, number, number];
  for (let row = 0; row < MATRIX_SIZE; row += 1) {
    result[row] = matrix[row]! * point[0]
      + matrix[row + 4]! * point[1]
      + matrix[row + 8]! * point[2]
      + matrix[row + 12]! * point[3];
    if (!Number.isFinite(result[row])) return null;
  }
  return result;
}

function worldPoint(
  manifest: ThreePresentedManifestV1,
  ndc: PresentedNdcPointInternal,
  clipDepth: number,
): Vec3V1 | null {
  if (!Number.isFinite(clipDepth)) return null;
  const cameraPoint = multiply(
    manifest.camera.projectionMatrixInverse,
    [ndc.x, ndc.y, clipDepth, 1],
  );
  if (!cameraPoint) return null;
  const world = multiply(manifest.camera.matrixWorld, cameraPoint);
  if (!world || world[3] === 0) return null;
  const point = {
    x: world[0] / world[3],
    y: world[1] / world[3],
    z: world[2] / world[3],
  };
  return [point.x, point.y, point.z].every(Number.isFinite)
    ? Object.freeze(point)
    : null;
}

function normalized(value: Vec3V1): Vec3V1 | null {
  const scale = Math.max(Math.abs(value.x), Math.abs(value.y), Math.abs(value.z));
  if (!Number.isFinite(scale) || scale === 0) return null;
  const scaled = { x: value.x / scale, y: value.y / scale, z: value.z / scale };
  const length = Math.hypot(scaled.x, scaled.y, scaled.z);
  if (!Number.isFinite(length) || length === 0) return null;
  const clean = (component: number): number => {
    const result = component / length;
    return Object.is(result, -0) ? 0 : result;
  };
  return Object.freeze({
    x: clean(scaled.x),
    y: clean(scaled.y),
    z: clean(scaled.z),
  });
}

function directionBetween(origin: Vec3V1, target: Vec3V1): Vec3V1 | null {
  return normalized({
    x: target.x - origin.x,
    y: target.y - origin.y,
    z: target.z - origin.z,
  });
}

function perspectiveRay(
  manifest: ThreePresentedManifestV1,
  ndc: PresentedNdcPointInternal,
): PresentedManifestWorldRayInternal | null {
  const world = manifest.camera.matrixWorld;
  const origin = Object.freeze({ x: world[12]!, y: world[13]!, z: world[14]! });
  const target = worldPoint(manifest, ndc, 0.5);
  const direction = target ? directionBetween(origin, target) : null;
  return direction ? Object.freeze({ origin, direction }) : null;
}

function orthographicRay(
  manifest: ThreePresentedManifestV1,
  ndc: PresentedNdcPointInternal,
): PresentedManifestWorldRayInternal | null {
  const inverse = manifest.camera.projectionMatrixInverse;
  const depthScale = inverse[10]!;
  const depthOffset = inverse[2]! * ndc.x + inverse[6]! * ndc.y + inverse[14]!;
  if (depthScale === 0) return null;
  const origin = worldPoint(manifest, ndc, -depthOffset / depthScale);
  const world = manifest.camera.matrixWorld;
  const direction = normalized({ x: -world[8]!, y: -world[9]!, z: -world[10]! });
  return origin && direction ? Object.freeze({ origin, direction }) : null;
}

function genericRay(
  manifest: ThreePresentedManifestV1,
  ndc: PresentedNdcPointInternal,
): PresentedManifestWorldRayInternal | null {
  const near = worldPoint(manifest, ndc, -1);
  const far = worldPoint(manifest, ndc, 1);
  const direction = near && far ? directionBetween(near, far) : null;
  return near && direction ? Object.freeze({ origin: near, direction }) : null;
}

/**
 * Pure manifest-only NDC unprojection. Perspective rays originate at the
 * committed camera position; orthographic rays match Three's camera plane;
 * generic rays use the committed clip segment from NDC z=-1 toward z=+1.
 */
export function derivePresentedManifestNdcRayInternal(
  manifest: ThreePresentedManifestV1,
  query: PreparedPresentedNdcQueryInternal,
): PresentedManifestNdcRayResultInternal {
  const unavailable = validateManifestCamera(manifest);
  if (unavailable) return unavailableRay(unavailable);
  const ray = manifest.camera.projectionKind === 'perspective'
    ? perspectiveRay(manifest, query.ndc)
    : manifest.camera.projectionKind === 'orthographic'
      ? orthographicRay(manifest, query.ndc)
      : genericRay(manifest, query.ndc);
  return ray
    ? Object.freeze({ status: 'valid', ray })
    : unavailableRay('presented-camera-unprojectable');
}

function asRayQuery(
  query: PreparedPresentedNdcQueryInternal,
  ray: PresentedManifestWorldRayInternal,
): PickQueryV1 {
  return Object.freeze({
    origin: ray.origin,
    direction: ray.direction,
    maxDistance: query.maxDistance,
    maxHits: query.maxHits,
    maxWork: query.maxWork,
    lanes: query.lanes,
    ordering: query.ordering,
  });
}

function invalidPickResult(
  result: Extract<PreparePresentedNdcQueryResultInternal, { readonly status: 'invalid' }>,
): CommittedPresentedNdcPickResultInternal {
  return Object.freeze({
    status: 'invalid-query',
    code: result.code,
    path: result.path,
    message: result.message,
  });
}

/** Validates NDC, snapshots no live state, and delegates the derived ray. */
export function pickCommittedPresentedNdcInternal(
  snapshot: CommittedPresentedPickSnapshotInternal | null,
  lifecycle: ThreeRuntimeLifecycleV1,
  value: PresentedNdcPickQueryInternal,
): CommittedPresentedNdcPickResultInternal {
  const prepared = preparePresentedNdcQueryInternal(value);
  if (prepared.status === 'invalid') return invalidPickResult(prepared);
  if (lifecycle !== 'running' || !snapshot) {
    return pickCommittedPresentedRayForLifecycleInternal(
      snapshot,
      lifecycle,
      asRayQuery(prepared.query, {
        origin: PLACEHOLDER_ORIGIN,
        direction: PLACEHOLDER_DIRECTION,
      }),
    );
  }
  const derived = derivePresentedManifestNdcRayInternal(
    snapshot.manifestInternal,
    prepared.query,
  );
  if (derived.status === 'unavailable') return derived;
  return pickCommittedPresentedRayForLifecycleInternal(
    snapshot,
    lifecycle,
    asRayQuery(prepared.query, derived.ray),
  );
}
