import type { Srgb8ColorV1, Vec3V1 } from '../../src/core/index.js';
import type {
  OakLeafOrganSnapshotV1,
  OakOrganSnapshotV1,
  OakRenderProjectionStateV1,
  OakSoilCellSnapshotV1,
  OakStructuralOrganSnapshotV1,
  OakVec3V1,
} from './oak-types.js';
import { oakAxisFrameV1 } from './oak-axis-frame.js';
import {
  oakLeafVariantForOrganKeyV1,
  oakLeafWidthScaleMForDescriptorV1,
} from './oak-leaf-shape.js';
import {
  OAK_MIN_RENDER_SHAFT_LENGTH_M_V1,
  oakRenderedWoodShapeV1,
} from './oak-wood-shape.js';
import {
  exactMagnitudeV1,
} from '../deterministic-math.js';

const MIN_RENDER_LENGTH_M = OAK_MIN_RENDER_SHAFT_LENGTH_M_V1;

type OakSegmentOrganV1 = OakStructuralOrganSnapshotV1 & {
  readonly kind: 'stem' | 'branch' | 'coarse-root' | 'fine-root-cohort';
};

export interface OakRootCutawayV1 {
  readonly axis: 'x' | 'z';
  readonly planeM: number;
  readonly keep: 'less-than' | 'greater-than';
}

export interface OakRenderProjectionOptionsV1 {
  readonly rootCutaway?: OakRootCutawayV1;
}

export interface OakRenderInstanceRecordV1 {
  readonly key: string;
  readonly matrix: readonly number[];
  readonly color: Srgb8ColorV1;
}

export interface OakRenderRecordSetV1 {
  readonly records: ReadonlyMap<string, readonly OakRenderInstanceRecordV1[]>;
  readonly skippedInvalidDimension: number;
  readonly skippedJunctionConsumed: number;
}

interface SegmentProjection {
  readonly start: OakVec3V1;
  readonly lengthM: number;
  readonly taperIndex: number;
  readonly nodeFlared: boolean;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function normalize(vector: OakVec3V1): Vec3V1 {
  const length = exactMagnitudeV1(vector.x, vector.y, vector.z);
  return length > 0
    ? { x: vector.x / length, y: vector.y / length, z: vector.z / length }
    : { x: 0, y: 1, z: 0 };
}

function axisMatrix(
  start: OakVec3V1,
  directionInput: OakVec3V1,
  length: number,
  radialScale: number,
  thicknessScale = radialScale,
  roll = 0,
): readonly number[] {
  const { x, y, z } = oakAxisFrameV1(directionInput, roll);
  return [
    x.x * radialScale, x.y * radialScale, x.z * radialScale, 0,
    y.x * length, y.y * length, y.z * length, 0,
    z.x * thicknessScale, z.y * thicknessScale, z.z * thicknessScale, 0,
    start.x, start.y, start.z, 1,
  ];
}

function scaleTranslationMatrix(center: OakVec3V1, size: OakVec3V1): readonly number[] {
  return [
    size.x, 0, 0, 0,
    0, size.y, 0, 0,
    0, 0, size.z, 0,
    center.x, center.y, center.z, 1,
  ];
}

function renderableSegment(organ: OakOrganSnapshotV1): organ is OakSegmentOrganV1 {
  return organ.kind === 'stem'
    || organ.kind === 'branch'
    || organ.kind === 'coarse-root'
    || organ.kind === 'fine-root-cohort';
}

function segmentProjection(
  organ: OakSegmentOrganV1,
  parent: OakOrganSnapshotV1 | undefined,
  children: readonly OakSegmentOrganV1[],
): SegmentProjection | null {
  if (parent && renderableSegment(parent)) {
    const parentDirection = normalize(parent.direction);
    const parentTip = {
      x: parent.positionM.x + parentDirection.x * parent.lengthM,
      y: parent.positionM.y + parentDirection.y * parent.lengthM,
      z: parent.positionM.z + parentDirection.z * parent.lengthM,
    };
    const attachmentError = exactMagnitudeV1(
      organ.positionM.x - parentTip.x,
      organ.positionM.y - parentTip.y,
      organ.positionM.z - parentTip.z,
    );
    if (attachmentError > 0.00001) {
      throw new Error(
        `Oak organ '${organ.key}' is ${String(attachmentError)} m from parent '${parent.key}' `
        + 'distal surface; connected projection requires the authoritative graph to meet.',
      );
    }
  }
  const shape = oakRenderedWoodShapeV1({
    organ,
    children,
  });
  if (shape === null) return null;
  return {
    start: organ.positionM,
    lengthM: shape.shaftLengthM,
    taperIndex: shape.taperIndex,
    nodeFlared: shape.nodeFlared,
  };
}

export function oakLeafColorV1(leaf: OakLeafOrganSnapshotV1): Srgb8ColorV1 {
  const stress = clamp01(Math.max(leaf.stressFraction, 1 - leaf.relativeWaterContentFraction));
  const chlorophyll = clamp01(leaf.chlorophyllFraction);
  if (leaf.stage === 'senescing') {
    return {
      r: Math.round(174 + stress * 18),
      g: Math.round(125 - stress * 42),
      b: Math.round(34 - stress * 8),
      a: 255,
    };
  }
  if (leaf.stage === 'abscised') return { r: 105, g: 68, b: 36, a: 255 };
  const base = leaf.stage === 'expanding'
    ? { r: 54, g: 148, b: 50 }
    : { r: 37, g: 116, b: 43 };
  const chlorophyllLoss = 1 - chlorophyll;
  const green = Math.round(base.g - chlorophyllLoss * 62 - stress * 17);
  const red = Math.round(base.r + chlorophyllLoss * 82 + stress * 10);
  return {
    // Water stress primarily changes turgor/pose. It only dulls living tissue;
    // chlorophyll loss drives yellowing, and brown is reserved for senescence.
    r: red,
    g: green,
    b: Math.round(base.b + chlorophyllLoss * 8 - stress * 4),
    a: 255,
  };
}

function woodColor(organ: OakOrganSnapshotV1): Srgb8ColorV1 {
  const stress = clamp01(organ.stressFraction);
  const base = organ.kind === 'fine-root-cohort'
    // Living absorptive roots are pale tan rather than bark-dark; keeping that
    // material distinction also makes the uptake surface legible in wet soil.
    ? { r: 154, g: 121, b: 80 }
    : organ.kind === 'coarse-root'
      ? { r: 76, g: 54, b: 36 }
    : organ.kind === 'bud'
      ? { r: 120, g: 88, b: 48 }
      : organ.kind === 'acorn'
        ? { r: 111, g: 75, b: 37 }
        : { r: 99, g: 72, b: 49 };
  return {
    r: Math.round(base.r * (1 - stress * 0.18)),
    g: Math.round(base.g * (1 - stress * 0.25)),
    b: Math.round(base.b * (1 - stress * 0.12)),
    a: 255,
  };
}

function soilColor(cell: OakSoilCellSnapshotV1): Srgb8ColorV1 {
  const saturation = clamp01(cell.volumetricWaterFraction / Math.max(0.01, cell.porosityFraction));
  const availableNutrients = clamp01((cell.ammoniumKg + cell.nitrateKg + cell.labilePhosphorusKg) * 4_000);
  return {
    r: Math.round(126 - saturation * 51 - availableNutrients * 8),
    g: Math.round(91 - saturation * 39 + availableNutrients * 9),
    b: Math.round(58 - saturation * 27),
    a: 255,
  };
}

function append(
  records: Map<string, OakRenderInstanceRecordV1[]>,
  batchKey: string,
  record: OakRenderInstanceRecordV1,
): void {
  const target = records.get(batchKey);
  if (!target) throw new Error(`Oak projection has no fixed batch '${batchKey}'.`);
  target.push(record);
}

function includeSoilCell(
  cell: OakSoilCellSnapshotV1,
  highestSurfaceM: number,
  cutaway: OakRootCutawayV1 | undefined,
): boolean {
  if (!cutaway) return Math.abs(cell.centerM.y + cell.sizeM.y * 0.5 - highestSurfaceM) < 1e-6;
  const coordinate = cell.centerM[cutaway.axis];
  return cutaway.keep === 'less-than' ? coordinate <= cutaway.planeM : coordinate >= cutaway.planeM;
}

export function buildOakInstanceRecordsV1(
  state: OakRenderProjectionStateV1,
  batchKeys: readonly string[],
  options: OakRenderProjectionOptionsV1,
): OakRenderRecordSetV1 {
  const records = new Map(batchKeys.map((key) => [key, [] as OakRenderInstanceRecordV1[]]));
  const activeOrgans = state.organs.filter((organ) =>
    organ.stage !== 'abscised' && organ.healthFraction > 0);
  const organByKey = new Map(activeOrgans.map((organ) => [organ.key, organ]));
  const childrenByKey = new Map<string, OakSegmentOrganV1[]>();
  const seenOrganKeys = new Set<string>();
  for (const organ of activeOrgans) {
    if (seenOrganKeys.has(organ.key)) throw new Error(`Oak projection received duplicate organ key '${organ.key}'.`);
    seenOrganKeys.add(organ.key);
    if (!renderableSegment(organ) || organ.parentKey === null) continue;
    const children = childrenByKey.get(organ.parentKey) ?? [];
    children.push(organ);
    childrenByKey.set(organ.parentKey, children);
  }
  let skippedInvalidDimension = 0;
  let skippedJunctionConsumed = 0;
  for (const organ of state.organs) {
    if (organ.stage === 'abscised' || organ.healthFraction <= 0) continue;
    if (renderableSegment(organ)) {
      if (organ.lengthM < MIN_RENDER_LENGTH_M || organ.radiusM <= 0) {
        skippedInvalidDimension += 1;
        continue;
      }
      const projection = segmentProjection(
        organ,
        organ.parentKey === null ? undefined : organByKey.get(organ.parentKey),
        childrenByKey.get(organ.key) ?? [],
      );
      if (!projection) {
        skippedJunctionConsumed += 1;
        continue;
      }
      const isRoot = organ.kind === 'coarse-root' || organ.kind === 'fine-root-cohort';
      if (organ.kind === 'fine-root-cohort' && options.rootCutaway === undefined) continue;
      const nodeQualifier = projection.nodeFlared ? ':node-flared' : '';
      append(records, `batch:oak:${isRoot ? 'root' : 'wood'}${nodeQualifier}:taper-${String(projection.taperIndex)}`, {
        key: `oak:${organ.key}:shaft`,
        matrix: axisMatrix(projection.start, organ.direction, projection.lengthM, organ.radiusM),
        color: woodColor(organ),
      });
    } else if (organ.kind === 'leaf') {
      if (organ.areaM2 <= 0) continue;
      const variant = oakLeafVariantForOrganKeyV1(organ.key);
      const lengthScale = Math.max(organ.lengthM, MIN_RENDER_LENGTH_M);
      const widthScale = oakLeafWidthScaleMForDescriptorV1(
        organ.areaM2,
        lengthScale,
        variant,
      );
      append(records, `batch:oak:leaf:${variant.id}`, {
        key: `oak:${organ.key}`,
        matrix: axisMatrix(
          organ.positionM,
          organ.direction,
          lengthScale,
          widthScale,
          widthScale,
          organ.rollRadians,
        ),
        color: oakLeafColorV1(organ),
      });
    } else if (organ.kind === 'bud' || organ.kind === 'acorn') {
      const length = Math.max(organ.lengthM, organ.radiusM * 1.7, MIN_RENDER_LENGTH_M);
      append(records, 'batch:oak:buds-and-acorns', {
        key: `oak:${organ.key}`,
        matrix: axisMatrix(organ.positionM, organ.direction, length, Math.max(organ.radiusM, 0.001), Math.max(organ.radiusM, 0.001) * 0.8),
        color: woodColor(organ),
      });
    }
  }
  const highestSurfaceM = state.soil.reduce(
    (highest, cell) => Math.max(highest, cell.centerM.y + cell.sizeM.y * 0.5),
    -Infinity,
  );
  for (const cell of state.soil) {
    if (!includeSoilCell(cell, highestSurfaceM, options.rootCutaway)) continue;
    append(records, 'batch:oak:soil', {
      key: `oak-soil:${cell.key}`,
      matrix: scaleTranslationMatrix(cell.centerM, cell.sizeM),
      color: soilColor(cell),
    });
  }
  for (const batchRecords of records.values()) {
    batchRecords.sort((left, right) => left.key < right.key ? -1 : left.key > right.key ? 1 : 0);
  }
  return { records, skippedInvalidDimension, skippedJunctionConsumed };
}
