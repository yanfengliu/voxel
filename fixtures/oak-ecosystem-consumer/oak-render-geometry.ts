import type {
  Aabb3V1,
  GeometryResourceV1,
  Vec3V1,
} from '../../src/core/index.js';
import {
  deterministicCosV1,
  deterministicSinV1,
  exactMagnitudeV1,
} from '../deterministic-math.js';
import {
  deriveOakLeafLobeCountV1,
  OAK_LEAF_PETIOLE_FRACTION_V1,
  OAK_LEAF_PETIOLE_NORMALIZED_HALF_THICKNESS_V1,
  OAK_LEAF_PETIOLE_NORMALIZED_HALF_WIDTH_V1,
  type OakLeafVariantDescriptorV1,
} from './oak-leaf-shape.js';
import { OAK_PARAMETERS_V1 } from './oak-parameters.js';
import {
  OAK_WOOD_FRUSTUM_SIDE_COUNT_V1,
  oakWoodProfileAtTaperV1,
} from './oak-wood-shape.js';

export { OAK_TAPER_RATIOS_V1 } from './oak-wood-shape.js';
export {
  deriveOakLeafLobeCountV1,
  OAK_LEAF_PETIOLE_FRACTION_V1,
  OAK_LEAF_VARIANT_DESCRIPTORS_V1,
} from './oak-leaf-shape.js';
export type { OakLeafVariantDescriptorV1 } from './oak-leaf-shape.js';

export const OAK_WOOD_MATERIAL_KEY_V1 = 'material:oak:wood';
export const OAK_LEAF_MATERIAL_KEY_V1 = 'material:oak:leaf';
export const OAK_SOIL_MATERIAL_KEY_V1 = 'material:oak:soil';

interface MutableGeometry {
  readonly positions: number[];
  readonly normals: number[];
  readonly uvs: number[];
  readonly indices: number[];
}

function boundsOf(positions: ArrayLike<number>): Aabb3V1 {
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  for (let offset = 0; offset < positions.length; offset += 3) {
    minX = Math.min(minX, positions[offset]!);
    minY = Math.min(minY, positions[offset + 1]!);
    minZ = Math.min(minZ, positions[offset + 2]!);
    maxX = Math.max(maxX, positions[offset]!);
    maxY = Math.max(maxY, positions[offset + 1]!);
    maxZ = Math.max(maxZ, positions[offset + 2]!);
  }
  const min: Vec3V1 = { x: minX, y: minY, z: minZ };
  const max: Vec3V1 = { x: maxX, y: maxY, z: maxZ };
  return { min, max };
}

function accumulateNormals(geometry: MutableGeometry): void {
  geometry.normals.push(...new Array<number>(geometry.positions.length).fill(0));
  for (let offset = 0; offset < geometry.indices.length; offset += 3) {
    const ia = geometry.indices[offset]! * 3;
    const ib = geometry.indices[offset + 1]! * 3;
    const ic = geometry.indices[offset + 2]! * 3;
    const abx = geometry.positions[ib]! - geometry.positions[ia]!;
    const aby = geometry.positions[ib + 1]! - geometry.positions[ia + 1]!;
    const abz = geometry.positions[ib + 2]! - geometry.positions[ia + 2]!;
    const acx = geometry.positions[ic]! - geometry.positions[ia]!;
    const acy = geometry.positions[ic + 1]! - geometry.positions[ia + 1]!;
    const acz = geometry.positions[ic + 2]! - geometry.positions[ia + 2]!;
    const nx = aby * acz - abz * acy;
    const ny = abz * acx - abx * acz;
    const nz = abx * acy - aby * acx;
    for (const index of [ia, ib, ic]) {
      geometry.normals[index] = geometry.normals[index]! + nx;
      geometry.normals[index + 1] = geometry.normals[index + 1]! + ny;
      geometry.normals[index + 2] = geometry.normals[index + 2]! + nz;
    }
  }
  for (let offset = 0; offset < geometry.normals.length; offset += 3) {
    const x = geometry.normals[offset]!;
    const y = geometry.normals[offset + 1]!;
    const z = geometry.normals[offset + 2]!;
    const length = exactMagnitudeV1(x, y, z);
    geometry.normals[offset] = x / length;
    geometry.normals[offset + 1] = y / length;
    geometry.normals[offset + 2] = z / length;
  }
}

function resource(
  key: string,
  materialKey: string,
  geometry: MutableGeometry,
): GeometryResourceV1 {
  const positions = new Float32Array(geometry.positions);
  const colors = new Uint8Array(positions.length).fill(255);
  return {
    kind: 'geometry',
    key,
    incarnation: 1,
    revision: 1,
    topology: 'triangles',
    positions,
    normals: new Float32Array(geometry.normals),
    uvs: new Float32Array(geometry.uvs),
    // Neutral white is deliberate: public vertex colour is enabled so the
    // renderer's per-instance phenology/stress colour lane is explicit, and
    // this geometry channel must not tint it a second time.
    colors,
    indices: new Uint16Array(geometry.indices),
    groups: [{ start: 0, count: geometry.indices.length, materialKey }],
    // Bounds are measured from retained Float32 values, not their slightly
    // different double-precision construction intermediates.
    bounds: boundsOf(positions),
    pivot: { x: 0, y: 0, z: 0 },
  };
}

/**
 * One low-poly mass-bearing shaft surface along local +Y. An occupied parent
 * uses the integrated four-ring profile, replacing the terminal taper surface
 * instead of adding a co-located collar shell. The proximal face stays open;
 * terminal tips close and occupied distal ports stay open for descendants.
 */
export function createOakWoodShaftGeometryV1(
  key: string,
  taperIndex: number,
  nodeFlared: boolean,
  capDistal = true,
): GeometryResourceV1 {
  const sides = OAK_WOOD_FRUSTUM_SIDE_COUNT_V1;
  const geometry: MutableGeometry = { positions: [], normals: [], uvs: [], indices: [] };
  const profile = oakWoodProfileAtTaperV1(taperIndex, nodeFlared);
  for (const ring of profile) {
    for (let side = 0; side < sides; side += 1) {
      const angle = side / sides * Math.PI * 2;
      geometry.positions.push(
        deterministicCosV1(angle) * ring.radiusRatio,
        ring.axialFraction,
        deterministicSinV1(angle) * ring.radiusRatio,
      );
      geometry.uvs.push(side / sides, ring.axialFraction);
    }
  }
  for (let ring = 0; ring < profile.length - 1; ring += 1) {
    const lowerStart = ring * sides;
    const upperStart = (ring + 1) * sides;
    for (let side = 0; side < sides; side += 1) {
      const next = (side + 1) % sides;
      geometry.indices.push(
        lowerStart + side, upperStart + side, upperStart + next,
        lowerStart + side, upperStart + next, lowerStart + next,
      );
    }
  }
  if (capDistal) {
    const distal = profile.at(-1)!;
    const topCenter = geometry.positions.length / 3;
    geometry.positions.push(0, 1, 0);
    geometry.uvs.push(0.5, 0.5);
    const capStart = geometry.positions.length / 3;
    for (let side = 0; side < sides; side += 1) {
      const angle = side / sides * Math.PI * 2;
      geometry.positions.push(
        deterministicCosV1(angle) * distal.radiusRatio,
        1,
        deterministicSinV1(angle) * distal.radiusRatio,
      );
      geometry.uvs.push(
        0.5 + deterministicCosV1(angle) * 0.5,
        0.5 + deterministicSinV1(angle) * 0.5,
      );
    }
    for (let side = 0; side < sides; side += 1) {
      const next = (side + 1) % sides;
      geometry.indices.push(topCenter, capStart + next, capStart + side);
    }
  }
  accumulateNormals(geometry);
  return resource(key, OAK_WOOD_MATERIAL_KEY_V1, geometry);
}

interface LeafProfilePoint {
  readonly t: number;
  readonly width: number;
}

const LEAF_PROFILE_SAMPLES_PER_CONTROL = 6;

function smoothLeafProfile(
  descriptor: OakLeafVariantDescriptorV1,
): readonly LeafProfilePoint[] {
  const controls = [
    OAK_LEAF_PETIOLE_NORMALIZED_HALF_WIDTH_V1,
    ...descriptor.stationWidths,
    0,
  ];
  const segmentCount = controls.length - 1;
  const points: LeafProfilePoint[] = [];
  for (let segment = 0; segment < segmentCount; segment += 1) {
    const p1 = controls[segment]!;
    const p2 = controls[segment + 1]!;
    for (let sample = 0; sample < LEAF_PROFILE_SAMPLES_PER_CONTROL; sample += 1) {
      const u = sample / LEAF_PROFILE_SAMPLES_PER_CONTROL;
      const u2 = u * u;
      const u3 = u2 * u;
      const eased = u3 * (u * (u * 6 - 15) + 10);
      // Quintic zero-slope/zero-curvature endpoints round both lobe shoulders
      // and sinuses instead of connecting widest points as serrated teeth.
      const width = p1 + (p2 - p1) * eased;
      points.push({
        t: OAK_LEAF_PETIOLE_FRACTION_V1
          + (segment + u) / segmentCount * (1 - OAK_LEAF_PETIOLE_FRACTION_V1),
        width: Math.max(0, width),
      });
    }
  }
  points.push({ t: 1, width: 0 });
  return points;
}

function addLeafRow(
  geometry: MutableGeometry,
  descriptor: OakLeafVariantDescriptorV1,
  point: LeafProfilePoint,
): readonly [number, number, number] {
  const { t, width } = point;
  const laminaT = (t - OAK_LEAF_PETIOLE_FRACTION_V1)
    / (1 - OAK_LEAF_PETIOLE_FRACTION_V1);
  const centerZ = descriptor.camber * deterministicSinV1(Math.PI * laminaT);
  const edgeZ = centerZ - descriptor.camber * 0.7 * (width / 0.43) ** 2;
  const left = geometry.positions.length / 3;
  geometry.positions.push(-width, t, edgeZ, 0, t, centerZ, width, t, edgeZ);
  geometry.uvs.push(0, t, 0.5, t, 1, t);
  return [left, left + 1, left + 2];
}

function connectLeafRows(
  geometry: MutableGeometry,
  previous: readonly [number, number, number],
  next: readonly [number, number, number],
): void {
  geometry.indices.push(
    previous[0], previous[1], next[1], previous[0], next[1], next[0],
    previous[1], previous[2], next[2], previous[1], next[2], next[1],
  );
}

function addPetiole(geometry: MutableGeometry): void {
  const end = OAK_LEAF_PETIOLE_FRACTION_V1;
  const baseWidth = OAK_LEAF_PETIOLE_NORMALIZED_HALF_WIDTH_V1;
  const baseThickness = OAK_LEAF_PETIOLE_NORMALIZED_HALF_THICKNESS_V1;
  const tipRatio = OAK_PARAMETERS_V1.mechanics.petioleTipRadiusRatio;
  const tipWidth = baseWidth * tipRatio;
  const tipThickness = baseThickness * tipRatio;
  geometry.positions.push(
    -baseWidth, 0, -baseThickness,
    baseWidth, 0, -baseThickness,
    baseWidth, 0, baseThickness,
    -baseWidth, 0, baseThickness,
    -tipWidth, end, -tipThickness,
    tipWidth, end, -tipThickness,
    tipWidth, end, tipThickness,
    -tipWidth, end, tipThickness,
  );
  geometry.uvs.push(
    0, 0, 1, 0, 1, 1, 0, 1,
    0, 0, 1, 0, 1, 1, 0, 1,
  );
  geometry.indices.push(
    0, 1, 2, 0, 2, 3,
    0, 4, 5, 0, 5, 1,
    1, 5, 6, 1, 6, 2,
    2, 6, 7, 2, 7, 3,
    3, 7, 4, 3, 4, 0,
  );
}

function addMidrib(
  geometry: MutableGeometry,
  rows: readonly (readonly [number, number, number])[],
): void {
  const ridgeRows: [number, number, number][] = [];
  for (const row of rows) {
    const center = row[1] * 3;
    const y = geometry.positions[center + 1]!;
    const z = geometry.positions[center + 2]!;
    const taper = 1 - y * 0.65;
    const first = geometry.positions.length / 3;
    geometry.positions.push(
      -0.007 * taper, y, z,
      0, y, z + 0.012 * taper,
      0.007 * taper, y, z,
    );
    geometry.uvs.push(0.46, y, 0.5, y, 0.54, y);
    ridgeRows.push([first, first + 1, first + 2]);
  }
  for (let index = 0; index < ridgeRows.length - 1; index += 1) {
    const previous = ridgeRows[index]!;
    const next = ridgeRows[index + 1]!;
    geometry.indices.push(
      previous[0], previous[1], next[1], previous[0], next[1], next[0],
      previous[1], previous[2], next[2], previous[1], next[2], next[1],
    );
  }
}

export function createOakLeafGeometryV1(
  descriptor: OakLeafVariantDescriptorV1,
): GeometryResourceV1 {
  const geometry: MutableGeometry = { positions: [], normals: [], uvs: [], indices: [] };
  const actualLobes = deriveOakLeafLobeCountV1(descriptor.stationWidths);
  if (actualLobes !== descriptor.lobeCount) {
    throw new Error(
      `Oak leaf '${descriptor.id}' declares ${String(descriptor.lobeCount)} lobes `
      + `but its silhouette derives ${String(actualLobes)}.`,
    );
  }
  addPetiole(geometry);
  const profile = smoothLeafProfile(descriptor);
  const rows = profile.slice(0, -1).map((point) =>
    addLeafRow(geometry, descriptor, point));
  for (let row = 0; row < rows.length - 1; row += 1) {
    connectLeafRows(geometry, rows[row]!, rows[row + 1]!);
  }
  const tip = geometry.positions.length / 3;
  geometry.positions.push(0, 1, 0);
  geometry.uvs.push(0.5, 1);
  const last = rows.at(-1)!;
  geometry.indices.push(last[0], last[1], tip, last[1], last[2], tip);
  addMidrib(geometry, rows);
  accumulateNormals(geometry);
  return resource(descriptor.geometryKey, OAK_LEAF_MATERIAL_KEY_V1, geometry);
}

/** Unit cube centred on its origin. Nonuniform instance scale forms soil cells. */
export function createOakSoilCubeGeometryV1(): GeometryResourceV1 {
  const geometry: MutableGeometry = { positions: [], normals: [], uvs: [], indices: [] };
  const faces = [
    { normal: [1, 0, 0], corners: [[0.5, -0.5, -0.5], [0.5, 0.5, -0.5], [0.5, 0.5, 0.5], [0.5, -0.5, 0.5]] },
    { normal: [-1, 0, 0], corners: [[-0.5, -0.5, 0.5], [-0.5, 0.5, 0.5], [-0.5, 0.5, -0.5], [-0.5, -0.5, -0.5]] },
    { normal: [0, 1, 0], corners: [[-0.5, 0.5, -0.5], [-0.5, 0.5, 0.5], [0.5, 0.5, 0.5], [0.5, 0.5, -0.5]] },
    { normal: [0, -1, 0], corners: [[-0.5, -0.5, 0.5], [-0.5, -0.5, -0.5], [0.5, -0.5, -0.5], [0.5, -0.5, 0.5]] },
    { normal: [0, 0, 1], corners: [[-0.5, -0.5, 0.5], [0.5, -0.5, 0.5], [0.5, 0.5, 0.5], [-0.5, 0.5, 0.5]] },
    { normal: [0, 0, -1], corners: [[0.5, -0.5, -0.5], [-0.5, -0.5, -0.5], [-0.5, 0.5, -0.5], [0.5, 0.5, -0.5]] },
  ] as const;
  for (const face of faces) {
    const first = geometry.positions.length / 3;
    for (const corner of face.corners) {
      geometry.positions.push(...corner);
      geometry.normals.push(...face.normal);
    }
    geometry.uvs.push(0, 0, 0, 1, 1, 1, 1, 0);
    geometry.indices.push(first, first + 1, first + 2, first, first + 2, first + 3);
  }
  return resource('geometry:oak:soil-cube', OAK_SOIL_MATERIAL_KEY_V1, geometry);
}
