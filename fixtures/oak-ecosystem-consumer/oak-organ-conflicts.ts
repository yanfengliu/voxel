import type { RenderSnapshotV1 } from '../../src/core/index.js';
import type {
  OakOrganSnapshotV1,
  OakRenderProjectionStateV1,
  OakVec3V1,
} from './oak-types.js';
import { isOakPlacedOrganV1 } from './oak-organ-lifecycle.js';
import {
  oakRenderedOrgansV1,
  type OakRenderedOrganV1,
  type OakRenderedSweptRadiusV1,
  type OakRenderedTriangleV1,
} from './oak-rendered-organ-geometry.js';
import { oakAcornGerminationPortsV1 } from './oak-topology.js';
import {
  isOakRenderedSegmentKindV1,
  oakBasalRenderedRadiusAtNodeV1,
  oakSharedNodeFusionEnvelopeV1,
  type OakNodeFusionEnvelopeV1,
} from './oak-joint-fusion.js';

const POSITION_TOLERANCE_M = 1e-7;
const SWEEP_SAMPLES = 48;

export type OakOrganGeometryConflictKindV1 =
  | 'germination-port-gap-or-overlap'
  | 'parent-port-gap'
  | 'parent-surface-penetration'
  | 'organ-volume-overlap'
  | 'leaf-surface-crossing'
  | 'aboveground-soil-entry';

export interface OakOrganGeometryConflictV1 {
  readonly kind: OakOrganGeometryConflictKindV1;
  readonly organKeys: readonly string[];
  readonly detail: string;
}

export interface OakOrganGeometryExemptionV1 {
  readonly organKey: string;
  readonly soilCellKey: string;
  readonly reason:
    | 'porous-soil-root-co-occupancy'
    | 'germinating-seed-soil-interface';
}

export interface OakOrganGeometryConflictReportV1 {
  readonly conflicts: readonly OakOrganGeometryConflictV1[];
  readonly exemptions: readonly OakOrganGeometryExemptionV1[];
  readonly activeOrganCount: number;
  readonly testedOrganPairs: number;
  readonly skippedDirectOrganPairs: number;
}

function add(left: OakVec3V1, right: OakVec3V1): OakVec3V1 {
  return { x: left.x + right.x, y: left.y + right.y, z: left.z + right.z };
}

function subtract(left: OakVec3V1, right: OakVec3V1): OakVec3V1 {
  return { x: left.x - right.x, y: left.y - right.y, z: left.z - right.z };
}

function scale(vector: OakVec3V1, factor: number): OakVec3V1 {
  return { x: vector.x * factor, y: vector.y * factor, z: vector.z * factor };
}

function dot(left: OakVec3V1, right: OakVec3V1): number {
  return left.x * right.x + left.y * right.y + left.z * right.z;
}

function lengthSquared(vector: OakVec3V1): number {
  return dot(vector, vector);
}

function distanceSquared(left: OakVec3V1, right: OakVec3V1): number {
  return lengthSquared(subtract(left, right));
}

function normalize(vector: OakVec3V1): OakVec3V1 {
  const length = Math.sqrt(lengthSquared(vector));
  return length > 0 ? scale(vector, 1 / length) : { x: 0, y: 1, z: 0 };
}

function pointTriangleDistanceSquared(point: OakVec3V1, triangle: OakRenderedTriangleV1): number {
  const ab = subtract(triangle.b, triangle.a);
  const ac = subtract(triangle.c, triangle.a);
  const ap = subtract(point, triangle.a);
  const d1 = dot(ab, ap);
  const d2 = dot(ac, ap);
  if (d1 <= 0 && d2 <= 0) return distanceSquared(point, triangle.a);
  const bp = subtract(point, triangle.b);
  const d3 = dot(ab, bp);
  const d4 = dot(ac, bp);
  if (d3 >= 0 && d4 <= d3) return distanceSquared(point, triangle.b);
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) {
    const projected = add(triangle.a, scale(ab, d1 / (d1 - d3)));
    return distanceSquared(point, projected);
  }
  const cp = subtract(point, triangle.c);
  const d5 = dot(ab, cp);
  const d6 = dot(ac, cp);
  if (d6 >= 0 && d5 <= d6) return distanceSquared(point, triangle.c);
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) {
    const projected = add(triangle.a, scale(ac, d2 / (d2 - d6)));
    return distanceSquared(point, projected);
  }
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
    const edge = subtract(triangle.c, triangle.b);
    const projected = add(triangle.b, scale(edge, (d4 - d3) / (
      d4 - d3 + d5 - d6
    )));
    return distanceSquared(point, projected);
  }
  const denominator = 1 / (va + vb + vc);
  const projected = add(
    triangle.a,
    add(scale(ab, vb * denominator), scale(ac, vc * denominator)),
  );
  return distanceSquared(point, projected);
}

function segmentDistanceSquared(
  a0: OakVec3V1,
  a1: OakVec3V1,
  b0: OakVec3V1,
  b1: OakVec3V1,
): number {
  const u = subtract(a1, a0);
  const v = subtract(b1, b0);
  const w = subtract(a0, b0);
  const a = dot(u, u);
  const b = dot(u, v);
  const c = dot(v, v);
  const d = dot(u, w);
  const e = dot(v, w);
  const denominator = a * c - b * b;
  let sNumerator: number;
  let tNumerator: number;
  let sDenominator = denominator;
  let tDenominator = denominator;
  if (denominator < 1e-20) {
    sNumerator = 0;
    sDenominator = 1;
    tNumerator = e;
    tDenominator = c;
  } else {
    sNumerator = b * e - c * d;
    tNumerator = a * e - b * d;
    if (sNumerator < 0) {
      sNumerator = 0;
      tNumerator = e;
      tDenominator = c;
    } else if (sNumerator > sDenominator) {
      sNumerator = sDenominator;
      tNumerator = e + b;
      tDenominator = c;
    }
  }
  if (tNumerator < 0) {
    tNumerator = 0;
    sNumerator = Math.max(0, Math.min(sDenominator, -d));
    sDenominator = a;
  } else if (tNumerator > tDenominator) {
    tNumerator = tDenominator;
    sNumerator = Math.max(0, Math.min(sDenominator, b - d));
    sDenominator = a;
  }
  const s = Math.abs(sNumerator) < 1e-20 ? 0 : sNumerator / sDenominator;
  const t = Math.abs(tNumerator) < 1e-20 ? 0 : tNumerator / tDenominator;
  return lengthSquared(add(w, subtract(scale(u, s), scale(v, t))));
}

function sweepPoint(sweep: OakRenderedSweptRadiusV1, fraction: number): OakVec3V1 {
  return add(sweep.start, scale(subtract(sweep.end, sweep.start), fraction));
}

function sweepRadius(sweep: OakRenderedSweptRadiusV1, fraction: number): number {
  return sweep.startRadiusM
    + (sweep.endRadiusM - sweep.startRadiusM) * fraction;
}

function insideFusion(
  point: OakVec3V1,
  fusion: OakNodeFusionEnvelopeV1 | undefined,
): boolean {
  return fusion !== undefined
    && distanceSquared(point, fusion.center) <= fusion.radiusM * fusion.radiusM;
}

function sweepsConflict(
  left: OakRenderedSweptRadiusV1,
  right: OakRenderedSweptRadiusV1,
  fusion?: OakNodeFusionEnvelopeV1,
): boolean {
  for (let leftStep = 0; leftStep <= SWEEP_SAMPLES; leftStep += 1) {
    const leftFraction = leftStep / SWEEP_SAMPLES;
    const leftRadius = sweepRadius(left, leftFraction);
    const leftPoint = sweepPoint(left, leftFraction);
    for (let rightStep = 0; rightStep <= SWEEP_SAMPLES; rightStep += 1) {
      const rightFraction = rightStep / SWEEP_SAMPLES;
      const rightRadius = sweepRadius(right, rightFraction);
      if (leftRadius + rightRadius <= POSITION_TOLERANCE_M) continue;
      const clearance = leftRadius + rightRadius - POSITION_TOLERANCE_M;
      const rightPoint = sweepPoint(right, rightFraction);
      if (distanceSquared(leftPoint, rightPoint) < clearance * clearance
        && !(insideFusion(leftPoint, fusion) && insideFusion(rightPoint, fusion))) {
        return true;
      }
    }
  }
  return false;
}

function sweepCrossesTriangle(
  sweep: OakRenderedSweptRadiusV1,
  triangle: OakRenderedTriangleV1,
  fusion?: OakNodeFusionEnvelopeV1,
): boolean {
  for (let step = 0; step <= SWEEP_SAMPLES * 2; step += 1) {
    const fraction = step / (SWEEP_SAMPLES * 2);
    const radius = sweepRadius(sweep, fraction) - POSITION_TOLERANCE_M;
    if (radius <= 0) continue;
    const point = sweepPoint(sweep, fraction);
    if (pointTriangleDistanceSquared(point, triangle) < radius * radius
      && !(insideFusion(point, fusion)
        && [triangle.a, triangle.b, triangle.c].some((vertex) =>
          insideFusion(vertex, fusion)))) return true;
  }
  return false;
}

function trianglesConflict(left: OakRenderedTriangleV1, right: OakRenderedTriangleV1): boolean {
  const toleranceSquared = POSITION_TOLERANCE_M * POSITION_TOLERANCE_M;
  if ([left.a, left.b, left.c].some((point) =>
    pointTriangleDistanceSquared(point, right) < toleranceSquared)) return true;
  if ([right.a, right.b, right.c].some((point) =>
    pointTriangleDistanceSquared(point, left) < toleranceSquared)) return true;
  const leftEdges = [[left.a, left.b], [left.b, left.c], [left.c, left.a]] as const;
  const rightEdges = [[right.a, right.b], [right.b, right.c], [right.c, right.a]] as const;
  return leftEdges.some(([a0, a1]) => rightEdges.some(([b0, b1]) =>
    segmentDistanceSquared(a0, a1, b0, b1) < toleranceSquared));
}

function shapesConflict(
  left: OakRenderedOrganV1,
  right: OakRenderedOrganV1,
  fusion?: OakNodeFusionEnvelopeV1,
): boolean {
  if (left.sweeps.some((a) => right.sweeps.some((b) =>
    sweepsConflict(a, b, fusion)))) {
    return true;
  }
  if (left.sweeps.some((sweep) => right.triangles.some((triangle) =>
    sweepCrossesTriangle(sweep, triangle, fusion)))) return true;
  if (right.sweeps.some((sweep) => left.triangles.some((triangle) =>
    sweepCrossesTriangle(sweep, triangle, fusion)))) return true;
  return left.triangles.some((a) => right.triangles.some((b) =>
    trianglesConflict(a, b)));
}

function shapeIntersectsCell(
  shape: OakRenderedOrganV1,
  cell: OakRenderProjectionStateV1['soil'][number],
): boolean {
  const half = scale(cell.sizeM, 0.5);
  const minimum = subtract(cell.centerM, half);
  const maximum = add(cell.centerM, half);
  const shapeMinimum = {
    x: Math.min(...shape.vertices.map((point) => point.x)),
    y: Math.min(...shape.vertices.map((point) => point.y)),
    z: Math.min(...shape.vertices.map((point) => point.z)),
  };
  const shapeMaximum = {
    x: Math.max(...shape.vertices.map((point) => point.x)),
    y: Math.max(...shape.vertices.map((point) => point.y)),
    z: Math.max(...shape.vertices.map((point) => point.z)),
  };
  return shapeMaximum.x >= minimum.x && shapeMinimum.x <= maximum.x
    && shapeMaximum.y >= minimum.y && shapeMinimum.y <= maximum.y
    && shapeMaximum.z >= minimum.z && shapeMinimum.z <= maximum.z;
}

function parentTip(parent: OakOrganSnapshotV1): OakVec3V1 {
  return add(parent.positionM, scale(normalize(parent.direction), parent.lengthM));
}

/** Inspect every active rendered organ pair; soil is a porous field, not solid geometry. */
export function inspectOakOrganGeometryConflictsV1(
  state: OakRenderProjectionStateV1,
  snapshot: RenderSnapshotV1,
): OakOrganGeometryConflictReportV1 {
  const shapes = oakRenderedOrgansV1(state, snapshot);
  const conflicts: OakOrganGeometryConflictV1[] = [];
  const exemptions: OakOrganGeometryExemptionV1[] = [];
  const addConflict = (conflict: OakOrganGeometryConflictV1): void => {
    const id = `${conflict.kind}:${[...conflict.organKeys].sort().join(':')}`;
    if (!conflicts.some((candidate) =>
      `${candidate.kind}:${[...candidate.organKeys].sort().join(':')}` === id)) {
      conflicts.push(conflict);
    }
  };
  const soilSurfaceM = Math.max(...state.soil.map((cell) =>
    cell.centerM.y + cell.sizeM.y * 0.5));
  for (const shape of shapes) {
    const { organ } = shape;
    if (organ.kind === 'stem' || organ.kind === 'branch'
      || organ.kind === 'bud' || organ.kind === 'leaf') {
      const minimumY = Math.min(...shape.vertices.map((point) => point.y));
      if (minimumY < soilSurfaceM - POSITION_TOLERANCE_M) addConflict({
        kind: 'aboveground-soil-entry',
        organKeys: [organ.key],
        detail: `Aboveground geometry reaches ${String(minimumY)} m below a ${String(soilSurfaceM)} m soil surface.`,
      });
    }
    if (organ.kind === 'coarse-root' || organ.kind === 'fine-root-cohort'
      || organ.kind === 'acorn') {
      for (const cell of state.soil) {
        if (!shapeIntersectsCell(shape, cell)) continue;
        exemptions.push({
          organKey: organ.key,
          soilCellKey: cell.key,
          reason: organ.kind === 'acorn'
            ? 'germinating-seed-soil-interface'
            : 'porous-soil-root-co-occupancy',
        });
      }
    }
  }
  const organByKey = new Map(state.organs.map((organ) => [organ.key, organ]));
  for (const shape of shapes) {
    const parent = shape.organ.parentKey === null
      ? undefined
      : organByKey.get(shape.organ.parentKey);
    if (!parent) continue;
    if (parent.kind === 'acorn'
      && (shape.organ.kind === 'stem' || shape.organ.kind === 'coarse-root')) {
      const ports = oakAcornGerminationPortsV1(parent);
      const expected = shape.organ.kind === 'stem' ? ports.top : ports.bottom;
      const emergenceAxis = dot(
        normalize(shape.organ.direction),
        normalize(parent.direction),
      ) * (shape.organ.kind === 'stem' ? 1 : -1);
      if (distanceSquared(shape.organ.positionM, expected)
        > POSITION_TOLERANCE_M * POSITION_TOLERANCE_M
        || emergenceAxis <= 0) addConflict({
        kind: 'germination-port-gap-or-overlap',
        organKeys: [parent.key, shape.organ.key],
        detail: `${shape.organ.kind} must begin at the acorn ${shape.organ.kind === 'stem' ? 'top' : 'bottom'} port.`,
      });
      continue;
    }
    if (!['stem', 'branch', 'coarse-root', 'fine-root-cohort'].includes(parent.kind)) {
      continue;
    }
    const tip = parentTip(parent);
    const parentDirection = normalize(parent.direction);
    const attachmentOffset = subtract(shape.organ.positionM, tip);
    const nodeEnvelopeRadiusM = state.organs.reduce((radius, candidate) => {
      const sharesNode = candidate.parentKey === parent.key
        && isOakPlacedOrganV1(candidate)
        && (candidate.kind === 'stem'
          || candidate.kind === 'branch'
          || candidate.kind === 'coarse-root'
          || candidate.kind === 'fine-root-cohort');
      return sharesNode ? Math.max(radius, candidate.radiusM) : radius;
    }, parent.radiusM);
    const minimumForward = Math.min(...shape.vertices.map((point) =>
      dot(subtract(point, tip), parentDirection)));
    const minimumRadialM = Math.min(...shape.vertices.map((point) => {
      const offset = subtract(point, tip);
      const axial = dot(offset, parentDirection);
      return Math.sqrt(lengthSquared(subtract(
        offset,
        scale(parentDirection, axial),
      )));
    }));
    const leafSurfacePort = shape.organ.kind === 'leaf'
      && shape.organ.attachment?.parentOrganKey === parent.key
      && minimumRadialM >= parent.radiusM - POSITION_TOLERANCE_M;
    if (!leafSurfacePort && lengthSquared(attachmentOffset)
      > POSITION_TOLERANCE_M * POSITION_TOLERANCE_M) addConflict({
      kind: 'parent-port-gap',
      organKeys: [parent.key, shape.organ.key],
      detail: 'Child proximal point does not meet its parent distal port.',
    });
    const childAxis = normalize(shape.organ.direction);
    const parentAxial = dot(childAxis, parentDirection);
    const basalRadiusM = isOakRenderedSegmentKindV1(shape.organ.kind)
      ? oakBasalRenderedRadiusAtNodeV1(shape, shape.organ.positionM)
      : 0;
    const intendedFusionDepthM = parentAxial > 0 && basalRadiusM > 0
      ? basalRadiusM * Math.sqrt(Math.max(0, 1 - parentAxial * parentAxial))
      : 0;
    // A finite leaf may sweep behind the parent's terminal plane while staying
    // wholly outside its radius; that is a tangential insertion, not buried
    // tissue. The radial envelope check below is the relevant parent/leaf law.
    if (shape.organ.kind !== 'leaf'
      && minimumForward < -intendedFusionDepthM - POSITION_TOLERANCE_M) addConflict({
      kind: 'parent-surface-penetration',
      organKeys: [parent.key, shape.organ.key],
      detail: `Child geometry crosses ${String(-minimumForward)} m behind its parent terminal plane.`,
    });
    if (shape.organ.kind === 'leaf'
      && minimumRadialM < nodeEnvelopeRadiusM - POSITION_TOLERANCE_M) addConflict({
      kind: 'parent-surface-penetration',
      organKeys: [parent.key, shape.organ.key],
      detail: `Leaf geometry crosses ${String(nodeEnvelopeRadiusM - minimumRadialM)} m inside its node radial envelope.`,
    });
  }
  let testedOrganPairs = 0;
  let skippedDirectOrganPairs = 0;
  for (let leftIndex = 0; leftIndex < shapes.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < shapes.length; rightIndex += 1) {
      const left = shapes[leftIndex]!;
      const right = shapes[rightIndex]!;
      const directlyRelated = left.organ.parentKey === right.organ.key
        || right.organ.parentKey === left.organ.key;
      if (directlyRelated) {
        skippedDirectOrganPairs += 1;
        continue;
      }
      testedOrganPairs += 1;
      const fusion = oakSharedNodeFusionEnvelopeV1(left, right, organByKey);
      if (!shapesConflict(left, right, fusion)) continue;
      const leafInvolved = left.organ.kind === 'leaf' || right.organ.kind === 'leaf';
      addConflict({
        kind: leafInvolved ? 'leaf-surface-crossing' : 'organ-volume-overlap',
        organKeys: [left.organ.key, right.organ.key],
        detail: leafInvolved
          ? `A ${left.organ.kind}/${right.organ.kind} lamina or petiole crossing exists.`
          : `The ${left.organ.kind}/${right.organ.kind} swept-radius volumes overlap.`,
      });
    }
  }
  return {
    conflicts,
    exemptions,
    activeOrganCount: shapes.length,
    testedOrganPairs,
    skippedDirectOrganPairs,
  };
}
