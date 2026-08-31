import type {
  GeometryResourceV1,
  MaterialResourceV1,
  Srgb8ColorV1,
  Vec3V1,
} from '../../src/core/index.js';
import { deterministicSinV1 } from '../deterministic-math.js';
import { oakAxisFrameV1, type OakAxisFrameV1 } from './oak-axis-frame.js';
import {
  OAK_LEAF_PETIOLE_FRACTION_V1,
  OAK_LEAF_PETIOLE_NORMALIZED_HALF_WIDTH_V1,
  oakLeafVariantForOrganKeyV1,
  oakLeafWidthScaleMForDescriptorV1,
  type OakLeafVariantDescriptorV1,
} from './oak-leaf-shape.js';
import { oakLeafColorV1, type OakRenderInstanceRecordV1 } from './oak-render-projection.js';
import {
  OAK_CUTAWAY_AGGREGATE_FINE_ROOT_COLOR_V1,
  OAK_CUTAWAY_COARSE_ROOT_COLOR_V1,
} from './oak-root-cutaway-presentation.js';
import type {
  OakLeafOrganSnapshotV1,
  OakOrganSnapshotV1,
  OakRenderProjectionStateV1,
  OakStructuralOrganSnapshotV1,
  OakVec3V1,
} from './oak-types.js';
import {
  OAK_MIN_RENDER_SHAFT_LENGTH_M_V1,
  oakRenderedWoodShapeV1,
  oakWoodProfileAtTaperV1,
} from './oak-wood-shape.js';

/**
 * A 1.99890 mm dyadic pitch (131 / 65536 m). Integer lattice translations and the
 * cube scale therefore survive Float32 serialization exactly at this fixture's
 * bounded coordinate range; face-neighbour cells cannot acquire sub-ULP cracks.
 */
export const OAK_TISSUE_VOXEL_PITCH_NUMERATOR_V1 = 131;
export const OAK_TISSUE_VOXEL_PITCH_DENOMINATOR_V1 = 65_536;
export const OAK_TISSUE_VOXEL_PITCH_M_V1 =
  OAK_TISSUE_VOXEL_PITCH_NUMERATOR_V1 / OAK_TISSUE_VOXEL_PITCH_DENOMINATOR_V1;
export const OAK_MAX_EXACT_TISSUE_CELL_COORDINATE_V1 = 16_383;
export const OAK_MAX_TISSUE_VOXELS_PER_BATCH_V1 = 65_536;
export const OAK_TISSUE_VOXEL_GEOMETRY_KEY_V1 = 'geometry:oak:tissue-voxel';
export const OAK_WOOD_VOXEL_MATERIAL_KEY_V1 = 'material:oak:wood-voxel';
export const OAK_ROOT_VOXEL_MATERIAL_KEY_V1 = 'material:oak:root-voxel';
export const OAK_LEAF_VOXEL_MATERIAL_KEY_V1 = 'material:oak:leaf-voxel';
export const OAK_SEED_BUD_VOXEL_MATERIAL_KEY_V1 = 'material:oak:seed-bud-voxel';
export const OAK_WOOD_VOXEL_BATCH_KEY_V1 = 'batch:oak:wood-voxels';
export const OAK_ROOT_VOXEL_BATCH_KEY_V1 = 'batch:oak:root-voxels';
export const OAK_LEAF_VOXEL_BATCH_KEY_V1 = 'batch:oak:leaf-voxels';
export const OAK_SEED_BUD_VOXEL_BATCH_KEY_V1 = 'batch:oak:seed-bud-voxels';

export const OAK_TISSUE_VOXEL_RULE_IDS_V1 = Object.freeze([
  'declared-port-fused-paths',
  'leaf-lobed-area-mask',
  'leaf-petiole-midrib-mask',
  'organ-state-palette-quantization',
  'root-aggregate-legibility-mask',
  'seed-bud-port-masks',
  'source-claim-preservation',
  'shared-dyadic-tissue-lattice',
  'uniform-tissue-cubes',
  'wood-tapered-connected-mask',
] as const);

const PITCH = OAK_TISSUE_VOXEL_PITCH_M_V1;
const SHADE_STEPS = [-7, -3, 0, 3, 6] as const;

type SegmentOrgan = OakStructuralOrganSnapshotV1 & {
  readonly kind: 'stem' | 'branch' | 'coarse-root' | 'fine-root-cohort';
};

export interface OakTissueVoxelOrganMetricsV1 {
  readonly organKey: string;
  readonly kind: OakOrganSnapshotV1['kind'];
  readonly voxelCount: number;
  readonly quantizedLengthM: number;
  readonly quantizedAreaM2: number;
}

export interface OakTissueVoxelSourceProjectionV1 {
  readonly records: ReadonlyMap<string, readonly OakRenderInstanceRecordV1[]>;
  readonly organMetrics: readonly OakTissueVoxelOrganMetricsV1[];
  readonly tissueVoxelCount: number;
  readonly woodVoxelCount: number;
  readonly rootVoxelCount: number;
  readonly leafVoxelCount: number;
  readonly seedBudVoxelCount: number;
  readonly skippedTooShortOrNonpositiveRadiusSegments: number;
  readonly skippedJunctionConsumedSegments: number;
}

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

export function shadeOakTissueVoxelColorV1(
  base: Srgb8ColorV1,
  x: number,
  y: number,
  z: number,
): Srgb8ColorV1 {
  const phase = Math.abs(x * 3 + y * 5 + z * 7) % SHADE_STEPS.length;
  const shade = SHADE_STEPS[phase]!;
  return {
    r: clampByte(base.r + shade),
    g: clampByte(base.g + shade),
    b: clampByte(base.b + shade),
    a: 255,
  };
}

function material(
  key: string,
  roughness: number,
): MaterialResourceV1 {
  return {
    kind: 'material',
    key,
    incarnation: 1,
    revision: 1,
    shading: 'standard',
    color: { r: 255, g: 255, b: 255, a: 255 },
    vertexColors: true,
    transparent: false,
    opacity: 1,
    doubleSided: false,
    roughness,
    metalness: 0,
  };
}

export function createOakTissueVoxelMaterialsV1(): readonly MaterialResourceV1[] {
  return [
    material(OAK_WOOD_VOXEL_MATERIAL_KEY_V1, 0.94),
    material(OAK_ROOT_VOXEL_MATERIAL_KEY_V1, 0.97),
    material(OAK_LEAF_VOXEL_MATERIAL_KEY_V1, 0.86),
    material(OAK_SEED_BUD_VOXEL_MATERIAL_KEY_V1, 0.91),
  ];
}

/** One exact cube. Organ masks, not bespoke meshes, own every visible plant shape. */
export function createOakTissueVoxelGeometryV1(): GeometryResourceV1 {
  const positions = new Float32Array([
    .5,-.5,-.5, .5,.5,-.5, .5,.5,.5, .5,-.5,.5,
    -.5,-.5,.5, -.5,.5,.5, -.5,.5,-.5, -.5,-.5,-.5,
    -.5,.5,-.5, -.5,.5,.5, .5,.5,.5, .5,.5,-.5,
    -.5,-.5,.5, -.5,-.5,-.5, .5,-.5,-.5, .5,-.5,.5,
    -.5,-.5,.5, .5,-.5,.5, .5,.5,.5, -.5,.5,.5,
    .5,-.5,-.5, -.5,-.5,-.5, -.5,.5,-.5, .5,.5,-.5,
  ]);
  const normals = new Float32Array([
    1,0,0, 1,0,0, 1,0,0, 1,0,0,
    -1,0,0, -1,0,0, -1,0,0, -1,0,0,
    0,1,0, 0,1,0, 0,1,0, 0,1,0,
    0,-1,0, 0,-1,0, 0,-1,0, 0,-1,0,
    0,0,1, 0,0,1, 0,0,1, 0,0,1,
    0,0,-1, 0,0,-1, 0,0,-1, 0,0,-1,
  ]);
  const indices: number[] = [];
  for (let face = 0; face < 6; face += 1) {
    const start = face * 4;
    indices.push(start, start + 1, start + 2, start, start + 2, start + 3);
  }
  return {
    kind: 'geometry',
    key: OAK_TISSUE_VOXEL_GEOMETRY_KEY_V1,
    incarnation: 1,
    revision: 1,
    topology: 'triangles',
    positions,
    normals,
    colors: new Uint8Array(positions.length).fill(255),
    indices: new Uint16Array(indices),
    groups: [],
    bounds: { min: { x: -.5, y: -.5, z: -.5 }, max: { x: .5, y: .5, z: .5 } },
    pivot: { x: 0, y: 0, z: 0 },
  };
}

function worldCenter(
  origin: OakVec3V1,
  frame: OakAxisFrameV1,
  localX: number,
  localY: number,
  localZ: number,
): Vec3V1 {
  return {
    x: origin.x + frame.x.x * localX + frame.y.x * localY + frame.z.x * localZ,
    y: origin.y + frame.x.y * localX + frame.y.y * localY + frame.z.y * localZ,
    z: origin.z + frame.x.z * localX + frame.y.z * localY + frame.z.z * localZ,
  };
}

function cubeMatrix(center: Vec3V1, frame: OakAxisFrameV1): readonly number[] {
  return [
    frame.x.x * PITCH, frame.x.y * PITCH, frame.x.z * PITCH, 0,
    frame.y.x * PITCH, frame.y.y * PITCH, frame.y.z * PITCH, 0,
    frame.z.x * PITCH, frame.z.y * PITCH, frame.z.z * PITCH, 0,
    center.x, center.y, center.z, 1,
  ];
}

function addVoxel(
  target: OakRenderInstanceRecordV1[],
  organ: OakOrganSnapshotV1,
  role: string,
  frame: OakAxisFrameV1,
  local: Readonly<{ x: number; y: number; z: number }>,
  color: Srgb8ColorV1,
): void {
  if (target.length >= OAK_MAX_TISSUE_VOXELS_PER_BATCH_V1) {
    throw new RangeError(
      `Oak tissue voxel batch exceeded ${String(OAK_MAX_TISSUE_VOXELS_PER_BATCH_V1)} `
      + `cells while projecting '${organ.key}'; reduce the bounded consumer fixture or `
      + 'increase its declared render budget deliberately.',
    );
  }
  const center = worldCenter(
    organ.positionM,
    frame,
    local.x * PITCH,
    local.y * PITCH,
    local.z * PITCH,
  );
  target.push({
    key: `oak:${organ.key}:${role}:${String(local.x)}:${String(local.y)}:${String(local.z)}`,
    matrix: cubeMatrix(center, frame),
    color: shadeOakTissueVoxelColorV1(color, local.x, local.y, local.z),
  });
}

function radiusRatioAt(
  profile: readonly Readonly<{ axialFraction: number; radiusRatio: number }>[],
  t: number,
): number {
  for (let index = 0; index < profile.length - 1; index += 1) {
    const start = profile[index]!;
    const end = profile[index + 1]!;
    if (t > end.axialFraction) continue;
    const u = (t - start.axialFraction) / (end.axialFraction - start.axialFraction);
    return start.radiusRatio + (end.radiusRatio - start.radiusRatio) * u;
  }
  return profile.at(-1)!.radiusRatio;
}

export function oakTissueVoxelBaseColorV1(organ: OakOrganSnapshotV1): Srgb8ColorV1 {
  if (organ.kind === 'leaf') return oakLeafColorV1(organ);
  const stress = Math.max(0, Math.min(1, organ.stressFraction));
  const base = organ.kind === 'fine-root-cohort' ? OAK_CUTAWAY_AGGREGATE_FINE_ROOT_COLOR_V1
    : organ.kind === 'coarse-root' ? OAK_CUTAWAY_COARSE_ROOT_COLOR_V1
      : organ.kind === 'bud' ? { r: 143, g: 95, b: 52 }
        : organ.kind === 'acorn' ? { r: 116, g: 76, b: 41 }
          : organ.stage === 'expanding' ? { r: 138, g: 90, b: 59 }
            : { r: 98, g: 66, b: 53 };
  return {
    r: clampByte(base.r * (1 - stress * .16)),
    g: clampByte(base.g * (1 - stress * .22)),
    b: clampByte(base.b * (1 - stress * .12)),
    a: 255,
  };
}

function appendSegment(
  target: OakRenderInstanceRecordV1[],
  organ: SegmentOrgan,
  children: readonly SegmentOrgan[],
): OakTissueVoxelOrganMetricsV1 | null {
  const shape = oakRenderedWoodShapeV1({ organ, children });
  if (!shape) return null;
  const profile = oakWoodProfileAtTaperV1(shape.taperIndex, shape.nodeFlared);
  const frame = oakAxisFrameV1(organ.direction, 0);
  const layers = Math.max(1, Math.round(shape.shaftLengthM / PITCH));
  const base = oakTissueVoxelBaseColorV1(organ);
  const initialCount = target.length;
  for (let layer = 0; layer < layers; layer += 1) {
    const t = (layer + .5) / layers;
    const radiusM = organ.radiusM * radiusRatioAt(profile, t);
    const radial = Math.max(0, Math.ceil(radiusM / PITCH));
    const threshold = radiusM * radiusM + PITCH * PITCH * .18;
    for (let x = -radial; x <= radial; x += 1) {
      for (let z = -radial; z <= radial; z += 1) {
        if ((x * PITCH) ** 2 + (z * PITCH) ** 2 > threshold && (x !== 0 || z !== 0)) continue;
        addVoxel(target, organ, 'wood-voxel', frame, { x, y: layer, z }, base);
      }
    }
  }
  return {
    organKey: organ.key,
    kind: organ.kind,
    voxelCount: target.length - initialCount,
    quantizedLengthM: layers * PITCH,
    quantizedAreaM2: 0,
  };
}

export function oakEasedLeafHalfWidthV1(
  variant: OakLeafVariantDescriptorV1,
  t: number,
): number {
  if (t <= OAK_LEAF_PETIOLE_FRACTION_V1) {
    return OAK_LEAF_PETIOLE_NORMALIZED_HALF_WIDTH_V1;
  }
  const controls = [
    OAK_LEAF_PETIOLE_NORMALIZED_HALF_WIDTH_V1,
    ...variant.stationWidths,
    0,
  ];
  const scaled = (t - OAK_LEAF_PETIOLE_FRACTION_V1)
    / (1 - OAK_LEAF_PETIOLE_FRACTION_V1) * (controls.length - 1);
  const index = Math.min(controls.length - 2, Math.floor(scaled));
  const u = Math.max(0, Math.min(1, scaled - index));
  const eased = u ** 3 * (u * (u * 6 - 15) + 10);
  return controls[index]! + (controls[index + 1]! - controls[index]!) * eased;
}

export function oakQuantizedLeafRadialsV1(
  variant: OakLeafVariantDescriptorV1,
  layers: number,
  widthScaleM: number,
): number[] {
  const radial = Array.from({ length: layers }, (_, layer) => {
    const t = (layer + .5) / layers;
    if (t < OAK_LEAF_PETIOLE_FRACTION_V1) return 0;
    return Math.max(0, Math.floor(oakEasedLeafHalfWidthV1(variant, t) * widthScaleM / PITCH + .45));
  });
  const controls = [OAK_LEAF_PETIOLE_NORMALIZED_HALF_WIDTH_V1, ...variant.stationWidths, 0];
  for (let index = 1; index < controls.length - 1; index += 1) {
    if (!(controls[index]! > controls[index - 1]! && controls[index]! > controls[index + 1]!)) continue;
    const bladeT = index / (controls.length - 1);
    const t = OAK_LEAF_PETIOLE_FRACTION_V1 + bladeT * (1 - OAK_LEAF_PETIOLE_FRACTION_V1);
    const layer = Math.max(1, Math.min(layers - 2, Math.round(t * layers - .5)));
    radial[layer] = Math.max(radial[layer]!, radial[layer - 1]! + 1, radial[layer + 1]! + 1);
  }
  return radial;
}

function appendLeaf(
  target: OakRenderInstanceRecordV1[],
  leaf: OakLeafOrganSnapshotV1,
): OakTissueVoxelOrganMetricsV1 {
  const frame = oakAxisFrameV1(leaf.direction, leaf.rollRadians);
  const variant = oakLeafVariantForOrganKeyV1(leaf.key);
  const lengthM = Math.max(leaf.lengthM, OAK_MIN_RENDER_SHAFT_LENGTH_M_V1);
  const widthScaleM = oakLeafWidthScaleMForDescriptorV1(leaf.areaM2, lengthM, variant);
  const layers = Math.max(1, Math.round(lengthM / PITCH));
  const radialProfile = oakQuantizedLeafRadialsV1(variant, layers, widthScaleM);
  const base = oakLeafColorV1(leaf);
  const initialCount = target.length;
  let previousZ = 0;
  for (let layer = 0; layer < layers; layer += 1) {
    const t = (layer + .5) / layers;
    const petiole = t < OAK_LEAF_PETIOLE_FRACTION_V1;
    const radial = radialProfile[layer]!;
    const bladeT = Math.max(0, (t - OAK_LEAF_PETIOLE_FRACTION_V1)
      / (1 - OAK_LEAF_PETIOLE_FRACTION_V1));
    const camberM = petiole ? 0
      : variant.camber * deterministicSinV1(Math.PI * bladeT) * widthScaleM;
    const desiredZ = Math.round(camberM / PITCH);
    const priorZ = previousZ;
    const z = Math.max(priorZ - 1, Math.min(priorZ + 1, desiredZ));
    for (let x = -radial; x <= radial; x += 1) {
      const midrib = x === 0;
      const color = midrib
        ? { r: clampByte(base.r + 13), g: clampByte(base.g + 20), b: clampByte(base.b + 5), a: 255 }
        : base;
      addVoxel(target, leaf, petiole ? 'petiole-voxel' : midrib ? 'midrib-voxel' : 'lamina-voxel', frame, { x, y: layer, z }, color);
    }
    if (z !== priorZ) {
      addVoxel(target, leaf, 'camber-connector-voxel', frame, { x: 0, y: layer, z: priorZ }, base);
    }
    previousZ = z;
  }
  const voxelCount = target.length - initialCount;
  return {
    organKey: leaf.key,
    kind: leaf.kind,
    voxelCount,
    quantizedLengthM: layers * PITCH,
    quantizedAreaM2: voxelCount * PITCH * PITCH,
  };
}

function appendSeedOrBud(
  target: OakRenderInstanceRecordV1[],
  organ: OakStructuralOrganSnapshotV1 & { readonly kind: 'acorn' | 'bud' },
): OakTissueVoxelOrganMetricsV1 {
  const frame = oakAxisFrameV1(organ.direction, 0);
  const layers = Math.max(1, Math.round(Math.max(organ.lengthM, PITCH) / PITCH));
  const initialCount = target.length;
  const base = oakTissueVoxelBaseColorV1(organ);
  for (let layer = 0; layer < layers; layer += 1) {
    const t = (layer + .5) / layers;
    const normalizedY = t * 2 - 1;
    const radiusM = organ.kind === 'acorn'
      ? organ.radiusM * Math.sqrt(Math.max(0, 1 - normalizedY * normalizedY))
      : organ.radiusM * (.95 - t * .55);
    const radial = Math.max(0, Math.floor(radiusM / PITCH + .45));
    for (let x = -radial; x <= radial; x += 1) {
      for (let z = -radial; z <= radial; z += 1) {
        if ((x * PITCH) ** 2 + (z * PITCH) ** 2 > radiusM * radiusM + PITCH * PITCH * .15
          && (x !== 0 || z !== 0)) continue;
        addVoxel(target, organ, `${organ.kind}-voxel`, frame, { x, y: layer, z }, base);
      }
    }
  }
  return {
    organKey: organ.key,
    kind: organ.kind,
    voxelCount: target.length - initialCount,
    quantizedLengthM: layers * PITCH,
    quantizedAreaM2: 0,
  };
}

/** Derive organ-local source masks; the union lattice owns final visible cells. */
export function buildOakTissueVoxelSourceProjectionV1(
  state: Pick<OakRenderProjectionStateV1, 'organs'>,
  includeRoots: boolean,
): OakTissueVoxelSourceProjectionV1 {
  const records = new Map<string, OakRenderInstanceRecordV1[]>([
    [OAK_WOOD_VOXEL_BATCH_KEY_V1, []],
    [OAK_ROOT_VOXEL_BATCH_KEY_V1, []],
    [OAK_LEAF_VOXEL_BATCH_KEY_V1, []],
    [OAK_SEED_BUD_VOXEL_BATCH_KEY_V1, []],
  ]);
  const active = state.organs.filter((organ) => organ.stage !== 'abscised' && organ.healthFraction > 0);
  const byKey = new Map(active.map((organ) => [organ.key, organ]));
  if (byKey.size !== active.length) throw new Error('Oak tissue projection received duplicate organ keys.');
  const children = new Map<string, SegmentOrgan[]>();
  for (const organ of active) {
    if (!isSegment(organ) || organ.parentKey === null) continue;
    const target = children.get(organ.parentKey) ?? [];
    target.push(organ);
    children.set(organ.parentKey, target);
  }
  const organMetrics: OakTissueVoxelOrganMetricsV1[] = [];
  let skippedInvalid = 0;
  let skippedConsumed = 0;
  for (const organ of active) {
    if (isSegment(organ)) {
      if (organ.lengthM < OAK_MIN_RENDER_SHAFT_LENGTH_M_V1 || organ.radiusM <= 0) {
        skippedInvalid += 1;
        continue;
      }
      const root = organ.kind === 'coarse-root' || organ.kind === 'fine-root-cohort';
      if (root && !includeRoots) continue;
      const metric = appendSegment(
        records.get(root ? OAK_ROOT_VOXEL_BATCH_KEY_V1 : OAK_WOOD_VOXEL_BATCH_KEY_V1)!,
        organ,
        children.get(organ.key) ?? [],
      );
      if (metric) organMetrics.push(metric);
      else skippedConsumed += 1;
    } else if (organ.kind === 'leaf') {
      if (organ.areaM2 > 0) organMetrics.push(appendLeaf(records.get(OAK_LEAF_VOXEL_BATCH_KEY_V1)!, organ));
    } else if (isSeedOrBud(organ)) {
      organMetrics.push(appendSeedOrBud(records.get(OAK_SEED_BUD_VOXEL_BATCH_KEY_V1)!, organ));
    }
  }
  for (const values of records.values()) values.sort((left, right) => left.key.localeCompare(right.key));
  const count = (kind: OakOrganSnapshotV1['kind']): number => organMetrics
    .filter((metric) => metric.kind === kind)
    .reduce((sum, metric) => sum + metric.voxelCount, 0);
  const woodVoxelCount = count('stem') + count('branch');
  const rootVoxelCount = count('coarse-root') + count('fine-root-cohort');
  const leafVoxelCount = count('leaf');
  const seedBudVoxelCount = count('acorn') + count('bud');
  return {
    records,
    organMetrics,
    tissueVoxelCount: woodVoxelCount + rootVoxelCount + leafVoxelCount + seedBudVoxelCount,
    woodVoxelCount,
    rootVoxelCount,
    leafVoxelCount,
    seedBudVoxelCount,
    skippedTooShortOrNonpositiveRadiusSegments: skippedInvalid,
    skippedJunctionConsumedSegments: skippedConsumed,
  };
}

function isSegment(organ: OakOrganSnapshotV1): organ is SegmentOrgan {
  return organ.kind === 'stem' || organ.kind === 'branch'
    || organ.kind === 'coarse-root' || organ.kind === 'fine-root-cohort';
}

function isSeedOrBud(
  organ: OakOrganSnapshotV1,
): organ is OakStructuralOrganSnapshotV1 & { readonly kind: 'acorn' | 'bud' } {
  return organ.kind === 'acorn' || organ.kind === 'bud';
}
