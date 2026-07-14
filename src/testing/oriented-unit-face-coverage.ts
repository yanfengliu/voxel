import { stableMergeSortInternal } from '../core/bounded-sort.js';
import type { Int3V1 } from '../core/contracts.js';
import type {
  PureMesherDescriptorV1,
  PureMesherInputV1,
  ValidatedMesherOutputV1,
} from '../meshing/mesher-contract.js';
import {
  validatePureMesherDescriptorV1,
  validatePureMesherInputV1,
} from '../meshing/mesher-contract-validation.js';

export const DEFAULT_MAX_ORIENTED_FACE_RASTER_CELLS_V1 = 10_000_000;

export type OrientedAxisNormalV1 =
  | readonly [-1, 0, 0]
  | readonly [1, 0, 0]
  | readonly [0, -1, 0]
  | readonly [0, 1, 0]
  | readonly [0, 0, -1]
  | readonly [0, 0, 1];

export interface OrientedUnitFaceV1 {
  /** Geometry-only canonical key; attributes are compared separately. */
  readonly key: string;
  readonly normal: OrientedAxisNormalV1;
  readonly plane: number;
  readonly u: number;
  readonly v: number;
  readonly paletteIndex: number;
  readonly materialIndex: number | null;
}

export interface OrientedUnitFaceCoverageV1 {
  readonly faces: readonly OrientedUnitFaceV1[];
  readonly rasterCellVisits: number;
}

export interface OrientedUnitFaceAttributeMismatchV1 {
  readonly key: string;
  readonly expectedPaletteIndex: number;
  readonly actualPaletteIndex: number;
  readonly expectedMaterialIndex: number | null;
  readonly actualMaterialIndex: number | null;
}

export interface OrientedUnitFaceComparisonV1 {
  readonly equal: boolean;
  readonly missing: readonly OrientedUnitFaceV1[];
  readonly unexpected: readonly OrientedUnitFaceV1[];
  readonly attributeMismatches: readonly OrientedUnitFaceAttributeMismatchV1[];
}

interface FaceOrientation {
  readonly label: '-x' | '+x' | '-y' | '+y' | '-z' | '+z';
  readonly normal: OrientedAxisNormalV1;
  readonly axis: 0 | 1 | 2;
  readonly sign: -1 | 1;
  readonly uAxis: 0 | 1;
  readonly vAxis: 1 | 2;
}

const ORIENTATIONS: readonly FaceOrientation[] = Object.freeze([
  { label: '-x', normal: [-1, 0, 0], axis: 0, sign: -1, uAxis: 1, vAxis: 2 },
  { label: '+x', normal: [1, 0, 0], axis: 0, sign: 1, uAxis: 1, vAxis: 2 },
  { label: '-y', normal: [0, -1, 0], axis: 1, sign: -1, uAxis: 0, vAxis: 2 },
  { label: '+y', normal: [0, 1, 0], axis: 1, sign: 1, uAxis: 0, vAxis: 2 },
  { label: '-z', normal: [0, 0, -1], axis: 2, sign: -1, uAxis: 0, vAxis: 1 },
  { label: '+z', normal: [0, 0, 1], axis: 2, sign: 1, uAxis: 0, vAxis: 1 },
]);

function faceKey(orientation: FaceOrientation, plane: number, u: number, v: number): string {
  return `${orientation.label}:${String(plane)}:${String(u)}:${String(v)}`;
}

function compareFaces(left: OrientedUnitFaceV1, right: OrientedUnitFaceV1): number {
  return left.key < right.key ? -1 : left.key > right.key ? 1 : 0;
}

function orientationForNormal(
  x: number,
  y: number,
  z: number,
): FaceOrientation {
  const result = ORIENTATIONS.find((candidate) => (
    candidate.normal[0] === x && candidate.normal[1] === y && candidate.normal[2] === z
  ));
  if (!result) throw new RangeError('Validated output contains an unknown oriented normal.');
  return result;
}

function dimensions(
  input: PureMesherInputV1,
  descriptor: PureMesherDescriptorV1,
): Int3V1 {
  return {
    x: input.source.size.x + descriptor.halo.negative.x + descriptor.halo.positive.x,
    y: input.source.size.y + descriptor.halo.negative.y + descriptor.halo.positive.y,
    z: input.source.size.z + descriptor.halo.negative.z + descriptor.halo.positive.z,
  };
}

function sample(
  input: PureMesherInputV1,
  descriptor: PureMesherDescriptorV1,
  x: number,
  y: number,
  z: number,
): number {
  const size = dimensions(input, descriptor);
  const sampleX = x + descriptor.halo.negative.x;
  const sampleY = y + descriptor.halo.negative.y;
  const sampleZ = z + descriptor.halo.negative.z;
  return input.sampleVolume[sampleX + size.x * (sampleZ + size.z * sampleY)]!;
}

function faceAtVoxel(
  orientation: FaceOrientation,
  x: number,
  y: number,
  z: number,
  paletteIndex: number,
): OrientedUnitFaceV1 {
  const coordinates = [x, y, z];
  const plane = coordinates[orientation.axis]! + (orientation.sign === 1 ? 1 : 0);
  const u = coordinates[orientation.uAxis]!;
  const v = coordinates[orientation.vAxis]!;
  return Object.freeze({
    key: faceKey(orientation, plane, u, v),
    normal: orientation.normal,
    plane,
    u,
    v,
    paletteIndex,
    materialIndex: null,
  });
}

/**
 * Computes the occupancy truth directly from the copied source-plus-halo input.
 * It is independent of both the oracle's quad layout and candidate topology.
 */
export function createExpectedOrientedUnitFaceCoverageV1(
  inputValue: PureMesherInputV1,
  descriptorValue: PureMesherDescriptorV1,
): OrientedUnitFaceCoverageV1 {
  const descriptorResult = validatePureMesherDescriptorV1(descriptorValue);
  if (!descriptorResult.ok) throw new RangeError(descriptorResult.issue.message);
  const inputResult = validatePureMesherInputV1(inputValue, descriptorResult.value);
  if (!inputResult.ok) throw new RangeError(inputResult.issue.message);
  const descriptor = descriptorResult.value;
  const input = inputResult.value;
  const faces: OrientedUnitFaceV1[] = [];
  for (let y = 0; y < input.source.size.y; y += 1) {
    for (let z = 0; z < input.source.size.z; z += 1) {
      for (let x = 0; x < input.source.size.x; x += 1) {
        const paletteIndex = sample(input, descriptor, x, y, z);
        if (paletteIndex === 0) continue;
        for (const orientation of ORIENTATIONS) {
          if (sample(
            input,
            descriptor,
            x + orientation.normal[0],
            y + orientation.normal[1],
            z + orientation.normal[2],
          ) === 0) {
            faces.push(faceAtVoxel(orientation, x, y, z, paletteIndex));
          }
        }
      }
    }
  }
  return Object.freeze({
    faces: Object.freeze(stableMergeSortInternal(faces, compareFaces)),
    rasterCellVisits: faces.length,
  });
}

interface Point2 {
  readonly u: number;
  readonly v: number;
}

function clipPolygon(
  polygon: readonly Point2[],
  coordinate: 'u' | 'v',
  bound: number,
  keepGreater: boolean,
): readonly Point2[] {
  if (polygon.length === 0) return polygon;
  const output: Point2[] = [];
  const inside = (point: Point2): boolean => (
    keepGreater ? point[coordinate] >= bound : point[coordinate] <= bound
  );
  for (let index = 0; index < polygon.length; index += 1) {
    const start = polygon[index]!;
    const end = polygon[(index + 1) % polygon.length]!;
    const startInside = inside(start);
    const endInside = inside(end);
    if (startInside !== endInside) {
      const denominator = end[coordinate] - start[coordinate];
      const fraction = denominator === 0 ? 0 : (bound - start[coordinate]) / denominator;
      output.push(Object.freeze({
        u: start.u + (end.u - start.u) * fraction,
        v: start.v + (end.v - start.v) * fraction,
      }));
    }
    if (endInside) output.push(end);
  }
  return output;
}

function triangleCellArea(
  triangle: readonly [Point2, Point2, Point2],
  cellU: number,
  cellV: number,
): number {
  let polygon: readonly Point2[] = triangle;
  polygon = clipPolygon(polygon, 'u', cellU, true);
  polygon = clipPolygon(polygon, 'u', cellU + 1, false);
  polygon = clipPolygon(polygon, 'v', cellV, true);
  polygon = clipPolygon(polygon, 'v', cellV + 1, false);
  if (polygon.length < 3) return 0;
  let doubledArea = 0;
  for (let index = 0; index < polygon.length; index += 1) {
    const current = polygon[index]!;
    const next = polygon[(index + 1) % polygon.length]!;
    doubledArea += current.u * next.v - next.u * current.v;
  }
  return Math.abs(doubledArea) / 2;
}

interface MutableAttributeArea {
  readonly paletteIndex: number;
  readonly materialIndex: number | null;
  area: number;
}

interface MutableFaceArea {
  readonly orientation: FaceOrientation;
  readonly plane: number;
  readonly u: number;
  readonly v: number;
  totalArea: number;
  readonly attributes: Map<string, MutableAttributeArea>;
}

function attributeKey(paletteIndex: number, materialIndex: number | null): string {
  return `${String(paletteIndex)}:${materialIndex === null ? 'none' : String(materialIndex)}`;
}

function approximatelyOne(value: number): boolean {
  return Math.abs(value - 1) <= 1e-9;
}

/**
 * Rasterizes validated axis-aligned triangles into oriented unit faces. A
 * greedy rectangle and the equivalent set of unit quads produce identical
 * coverage. Gaps, overlaps, or mixed attributes within one unit face reject.
 */
export function extractOrientedUnitFaceCoverageV1(
  output: ValidatedMesherOutputV1,
  maxRasterCellVisits = DEFAULT_MAX_ORIENTED_FACE_RASTER_CELLS_V1,
): OrientedUnitFaceCoverageV1 {
  if (!Number.isSafeInteger(maxRasterCellVisits) || maxRasterCellVisits <= 0) {
    throw new RangeError('maxRasterCellVisits must be a positive safe integer.');
  }
  const coverage = new Map<string, MutableFaceArea>();
  let rasterCellVisits = 0;
  const position = (vertex: number, axis: number): number => output.positions[vertex * 3 + axis]!;
  for (let triangleIndex = 0; triangleIndex < output.counts.triangleCount; triangleIndex += 1) {
    const vertices = [
      output.indices[triangleIndex * 3]!,
      output.indices[triangleIndex * 3 + 1]!,
      output.indices[triangleIndex * 3 + 2]!,
    ] as const;
    const first = vertices[0];
    const orientation = orientationForNormal(
      output.normals[first * 3]!,
      output.normals[first * 3 + 1]!,
      output.normals[first * 3 + 2]!,
    );
    const plane = position(first, orientation.axis);
    const projected = vertices.map((vertex) => Object.freeze({
      u: position(vertex, orientation.uAxis),
      v: position(vertex, orientation.vAxis),
    })) as unknown as readonly [Point2, Point2, Point2];
    const minimumU = Math.floor(Math.min(...projected.map((point) => point.u)));
    const maximumU = Math.ceil(Math.max(...projected.map((point) => point.u)));
    const minimumV = Math.floor(Math.min(...projected.map((point) => point.v)));
    const maximumV = Math.ceil(Math.max(...projected.map((point) => point.v)));
    const visits = (maximumU - minimumU) * (maximumV - minimumV);
    if (!Number.isSafeInteger(visits) || rasterCellVisits + visits > maxRasterCellVisits) {
      throw new RangeError('Oriented unit-face rasterization exceeds maxRasterCellVisits.');
    }
    rasterCellVisits += visits;
    const paletteIndex = output.paletteIndices[first]!;
    const materialIndex = output.materialIndices?.[triangleIndex] ?? null;
    const attributesKey = attributeKey(paletteIndex, materialIndex);
    for (let u = minimumU; u < maximumU; u += 1) {
      for (let v = minimumV; v < maximumV; v += 1) {
        const area = triangleCellArea(projected, u, v);
        if (area <= 1e-12) continue;
        const key = faceKey(orientation, plane, u, v);
        let face = coverage.get(key);
        if (!face) {
          face = {
            orientation,
            plane,
            u,
            v,
            totalArea: 0,
            attributes: new Map(),
          };
          coverage.set(key, face);
        }
        face.totalArea += area;
        const attribute = face.attributes.get(attributesKey) ?? {
          paletteIndex,
          materialIndex,
          area: 0,
        };
        attribute.area += area;
        face.attributes.set(attributesKey, attribute);
      }
    }
  }

  const faces: OrientedUnitFaceV1[] = [];
  for (const [key, face] of coverage) {
    if (!approximatelyOne(face.totalArea)) {
      throw new RangeError(`Oriented unit face ${key} has gap or overlap area ${String(face.totalArea)}.`);
    }
    const completeAttributes = [...face.attributes.values()].filter((entry) => entry.area > 1e-9);
    if (completeAttributes.length !== 1 || !approximatelyOne(completeAttributes[0]!.area)) {
      throw new RangeError(`Oriented unit face ${key} mixes palette or material attributes.`);
    }
    const attribute = completeAttributes[0]!;
    faces.push(Object.freeze({
      key,
      normal: face.orientation.normal,
      plane: face.plane,
      u: face.u,
      v: face.v,
      paletteIndex: attribute.paletteIndex,
      materialIndex: attribute.materialIndex,
    }));
  }
  const ordered = stableMergeSortInternal(faces, compareFaces);
  if (ordered.length !== output.counts.exposedUnitFaceCount) {
    throw new RangeError('Rasterized unit-face count does not match validated output area.');
  }
  return Object.freeze({ faces: Object.freeze(ordered), rasterCellVisits });
}

export function compareOrientedUnitFaceCoverageV1(
  expected: OrientedUnitFaceCoverageV1,
  actual: OrientedUnitFaceCoverageV1,
): OrientedUnitFaceComparisonV1 {
  const uniqueMap = (
    faces: readonly OrientedUnitFaceV1[],
    name: string,
  ): ReadonlyMap<string, OrientedUnitFaceV1> => {
    const map = new Map<string, OrientedUnitFaceV1>();
    for (const face of faces) {
      if (map.has(face.key)) throw new RangeError(`${name} coverage contains duplicate ${face.key}.`);
      map.set(face.key, face);
    }
    return map;
  };
  const expectedByKey = uniqueMap(expected.faces, 'Expected');
  const actualByKey = uniqueMap(actual.faces, 'Actual');
  const missing: OrientedUnitFaceV1[] = [];
  const unexpected: OrientedUnitFaceV1[] = [];
  const attributeMismatches: OrientedUnitFaceAttributeMismatchV1[] = [];
  for (const face of expected.faces) {
    const counterpart = actualByKey.get(face.key);
    if (!counterpart) {
      missing.push(face);
      continue;
    }
    if (counterpart.paletteIndex !== face.paletteIndex
      || counterpart.materialIndex !== face.materialIndex) {
      attributeMismatches.push(Object.freeze({
        key: face.key,
        expectedPaletteIndex: face.paletteIndex,
        actualPaletteIndex: counterpart.paletteIndex,
        expectedMaterialIndex: face.materialIndex,
        actualMaterialIndex: counterpart.materialIndex,
      }));
    }
  }
  for (const face of actual.faces) {
    if (!expectedByKey.has(face.key)) unexpected.push(face);
  }
  return Object.freeze({
    equal: missing.length === 0 && unexpected.length === 0 && attributeMismatches.length === 0,
    missing: Object.freeze(missing),
    unexpected: Object.freeze(unexpected),
    attributeMismatches: Object.freeze(attributeMismatches),
  });
}
