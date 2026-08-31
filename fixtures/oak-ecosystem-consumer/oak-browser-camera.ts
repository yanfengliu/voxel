import {
  MathUtils,
  Vector3,
} from 'three';
import type { PerspectiveCamera } from 'three';

import type { RenderSnapshotV1 } from '../../src/core/index.js';
import type {
  OakBrowserCameraFitV1,
  OakBrowserCameraV1,
  OakBrowserProjectedShaftV1,
  OakBrowserViewportV1,
} from './oak-browser-contract.js';
import { oakRenderedSubjectGeometryV1 } from './oak-rendered-organ-geometry.js';
import type { OakSimulationSnapshotV1, OakVec3V1 } from './oak-types.js';

const MIN_SUBJECT_HEIGHT_M = 0.105;
const MIN_CROWN_RADIUS_M = 0.07;
const MIN_CUTAWAY_RADIUS_M = 0.11;
const MIN_CUTAWAY_DEPTH_M = 0.14;
const MAX_HALF_WIDTH_NDC_WITH_HUD = 0.5;
const MAX_HALF_WIDTH_NDC_FULL_CANVAS = 0.68;
const MAX_HALF_HEIGHT_NDC = 0.82;
const FRAME_VERTICAL_LIMIT_NDC = 0.86;
const RETAIN_VERTICAL_LIMIT_NDC = 0.9;
const FRAME_RIGHT_NDC = 0.94;
const FRAME_MARGIN_NDC = 0.035;

const CAMERA_DIRECTIONS: Readonly<Record<OakBrowserCameraV1, readonly [number, number, number]>> = {
  hero: [0.72, 0.64, 0.28],
  side: [1, 0.5, 0.015],
  overhead: [0, 1, 0.001],
};
// The ordinary hero azimuth cancels the declared fine-root x/z vector in projection.
const ROOT_CUTAWAY_HERO_DIRECTION = [0.72, 0.64, 0.9] as const;

interface ProjectedBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

function projectBounds(
  camera: PerspectiveCamera,
  worldPoints: readonly OakVec3V1[],
): ProjectedBounds {
  const result: ProjectedBounds = {
    minX: Number.POSITIVE_INFINITY,
    maxX: Number.NEGATIVE_INFINITY,
    minY: Number.POSITIVE_INFINITY,
    maxY: Number.NEGATIVE_INFINITY,
  };
  const projected = new Vector3();
  for (const worldPoint of worldPoints) {
    projected.set(worldPoint.x, worldPoint.y, worldPoint.z).project(camera);
    result.minX = Math.min(result.minX, projected.x);
    result.maxX = Math.max(result.maxX, projected.x);
    result.minY = Math.min(result.minY, projected.y);
    result.maxY = Math.max(result.maxY, projected.y);
  }
  return result;
}

function centerProjectedBounds(
  camera: PerspectiveCamera,
  worldPoints: readonly OakVec3V1[],
  bounds: ProjectedBounds,
  desiredCenterNdc: number,
): ProjectedBounds {
  const currentCenterNdc = (bounds.minX + bounds.maxX) / 2;
  const ndcShift = desiredCenterNdc - currentCenterNdc;
  camera.filmOffset -= ndcShift
    * camera.getFilmWidth()
    * Math.tan(MathUtils.degToRad(camera.fov / 2))
    * camera.aspect;
  camera.updateProjectionMatrix();
  return projectBounds(camera, worldPoints);
}

interface RenderedSubjectV1 {
  readonly points: readonly OakVec3V1[];
  readonly organCount: number;
  readonly litterVoxelCount: number;
  readonly center: Vector3;
  readonly size: Vector3;
}

export type OakBrowserCameraRetentionV1 = boolean | 'always';

function renderedSubject(
  renderSnapshot: RenderSnapshotV1,
  rootCutaway: boolean,
): RenderedSubjectV1 {
  const geometry = oakRenderedSubjectGeometryV1(renderSnapshot, rootCutaway);
  const points = geometry.vertices;
  const minimum = new Vector3(Infinity, Infinity, Infinity);
  const maximum = new Vector3(-Infinity, -Infinity, -Infinity);
  for (const point of points) {
    minimum.min(new Vector3(point.x, point.y, point.z));
    maximum.max(new Vector3(point.x, point.y, point.z));
  }
  if (points.length === 0) {
    throw new Error(
      `Cannot fit oak camera to render revision ${String(renderSnapshot.revision)}: `
      + 'the current frame has no rendered organ vertices.',
    );
  }
  return {
    points,
    organCount: geometry.organKeys.length,
    litterVoxelCount: geometry.litterVoxelCount,
    center: minimum.clone().add(maximum).multiplyScalar(0.5),
    size: maximum.clone().sub(minimum),
  };
}

function positionCamera(
  camera: PerspectiveCamera,
  preset: OakBrowserCameraV1,
  center: Vector3,
  distance: number,
  directionTuple: readonly [number, number, number],
): void {
  const direction = new Vector3(...directionTuple).normalize();
  camera.up.set(0, preset === 'overhead' ? 0 : 1, preset === 'overhead' ? -1 : 0);
  camera.position.copy(center).addScaledVector(direction, distance);
  camera.lookAt(center);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
}

function projectedRootShaft(
  snapshot: OakSimulationSnapshotV1,
  camera: PerspectiveCamera,
  kind: 'coarse-root' | 'fine-root-cohort',
): OakBrowserProjectedShaftV1 | null {
  const root = snapshot.organs.find((organ) =>
    organ.kind === kind && organ.stage !== 'abscised');
  if (root === undefined) return null;
  const base = new Vector3(root.positionM.x, root.positionM.y, root.positionM.z)
    .project(camera);
  const tip = new Vector3(
    root.positionM.x + root.direction.x * root.lengthM,
    root.positionM.y + root.direction.y * root.lengthM,
    root.positionM.z + root.direction.z * root.lengthM,
  ).project(camera);
  return {
    base: { x: base.x, y: base.y },
    tip: { x: tip.x, y: tip.y },
  };
}

/** Deterministically frames the authoritative oak envelope clear of the fixture HUD. */
export function fitOakBrowserCameraV1(
  camera: PerspectiveCamera,
  preset: OakBrowserCameraV1,
  snapshot: OakSimulationSnapshotV1,
  renderSnapshot: RenderSnapshotV1,
  viewport: OakBrowserViewportV1,
  hudRightPx: number | null,
  rootCutaway: boolean,
  retainCurrentView: OakBrowserCameraRetentionV1 = false,
): OakBrowserCameraFitV1 {
  const diagnostics = snapshot.diagnostics;
  const subject = renderedSubject(renderSnapshot, rootCutaway);
  const subjectHeightM = Math.max(
    MIN_SUBJECT_HEIGHT_M,
    subject.size.y,
    rootCutaway ? diagnostics.heightM + MIN_CUTAWAY_DEPTH_M : 0,
  );
  const subjectRadiusM = rootCutaway
    ? Math.max(MIN_CUTAWAY_RADIUS_M, subject.size.x / 2, subject.size.z / 2)
    : Math.max(MIN_CROWN_RADIUS_M, subject.size.x / 2, subject.size.z / 2);
  const center = subject.center;
  const directionTuple = rootCutaway && preset === 'hero'
    ? ROOT_CUTAWAY_HERO_DIRECTION
    : CAMERA_DIRECTIONS[preset];
  const cameraDirection = new Vector3(...directionTuple).normalize();
  const halfDepth = subject.points.reduce((depth, point) => Math.max(
    depth,
    Math.abs(
      (point.x - center.x) * cameraDirection.x
      + (point.y - center.y) * cameraDirection.y
      + (point.z - center.z) * cameraDirection.z,
    ),
  ), 0);
  const hudReserved = hudRightPx !== null;
  const safeLeftNdc = hudRightPx === null
    ? -FRAME_RIGHT_NDC
    : MathUtils.clamp((2 * (hudRightPx + 12)) / viewport.width - 1, -0.9, 0.78);
  const availableWidthNdc = Math.max(0.2, FRAME_RIGHT_NDC - safeLeftNdc);
  const targetHalfWidthNdc = Math.max(
    0.08,
    Math.min(
      hudReserved ? MAX_HALF_WIDTH_NDC_WITH_HUD : MAX_HALF_WIDTH_NDC_FULL_CANVAS,
      availableWidthNdc / 2 - FRAME_MARGIN_NDC,
    ),
  );
  const desiredCenterNdc = hudReserved
    ? MathUtils.clamp(
      Math.max(0.3, safeLeftNdc + FRAME_MARGIN_NDC + targetHalfWidthNdc),
      safeLeftNdc + FRAME_MARGIN_NDC + targetHalfWidthNdc,
      FRAME_RIGHT_NDC - FRAME_MARGIN_NDC - targetHalfWidthNdc,
    )
    : 0;

  let distanceM = camera.position.distanceTo(center);
  let bounds = projectBounds(camera, subject.points);
  const retained = retainCurrentView === 'always'
    || (retainCurrentView
      && bounds.minX > safeLeftNdc + FRAME_MARGIN_NDC
      && bounds.maxX < FRAME_RIGHT_NDC
      && bounds.minY > -RETAIN_VERTICAL_LIMIT_NDC
      && bounds.maxY < RETAIN_VERTICAL_LIMIT_NDC);
  if (!retained) {
    camera.aspect = viewport.width / viewport.height;
    camera.filmOffset = -desiredCenterNdc
      * camera.getFilmWidth()
      * Math.tan(MathUtils.degToRad(camera.fov / 2))
      * camera.aspect;
    distanceM = Math.max(
      0.12,
      subjectHeightM,
      subjectRadiusM * 2.5,
      halfDepth + 0.06,
    );
    for (let iteration = 0; iteration < 12; iteration += 1) {
      positionCamera(camera, preset, center, distanceM, directionTuple);
      bounds = projectBounds(camera, subject.points);
      bounds = centerProjectedBounds(camera, subject.points, bounds, desiredCenterNdc);
      const horizontalRatio = (bounds.maxX - bounds.minX) / (targetHalfWidthNdc * 2);
      const verticalRatio = Math.max(
        (bounds.maxY - bounds.minY) / (MAX_HALF_HEIGHT_NDC * 2),
        Math.max(Math.abs(bounds.minY), Math.abs(bounds.maxY)) / FRAME_VERTICAL_LIMIT_NDC,
      );
      const boundaryRatio = Math.max(
        bounds.minX < safeLeftNdc + FRAME_MARGIN_NDC
          ? (desiredCenterNdc - bounds.minX)
            / Math.max(0.01, desiredCenterNdc - safeLeftNdc - FRAME_MARGIN_NDC)
          : 1,
        bounds.maxX > FRAME_RIGHT_NDC
          ? (bounds.maxX - desiredCenterNdc)
            / Math.max(0.01, FRAME_RIGHT_NDC - desiredCenterNdc)
          : 1,
      );
      const ratio = Math.max(horizontalRatio, verticalRatio, boundaryRatio);
      if (ratio <= 1.001) break;
      distanceM = halfDepth + (distanceM - halfDepth) * ratio * 1.025;
    }
    positionCamera(camera, preset, center, distanceM, directionTuple);
    bounds = projectBounds(camera, subject.points);
    bounds = centerProjectedBounds(camera, subject.points, bounds, desiredCenterNdc);
  }
  return {
    focus: rootCutaway ? 'root-cutaway' : 'tree',
    hudReserved,
    distanceM,
    hudRightNdc: safeLeftNdc,
    subjectBoundsNdc: bounds,
    subjectClearOfHud: bounds.minX > safeLeftNdc + FRAME_MARGIN_NDC,
    fittedOrganCount: subject.organCount,
    fittedLitterVoxelCount: subject.litterVoxelCount,
    fittedVertexCount: subject.points.length,
    rootShaftsNdc: rootCutaway
      ? {
        coarse: projectedRootShaft(snapshot, camera, 'coarse-root'),
        aggregateFine: projectedRootShaft(snapshot, camera, 'fine-root-cohort'),
      }
      : { coarse: null, aggregateFine: null },
  };
}
