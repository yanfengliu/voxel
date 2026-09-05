import type {
  GeometryResourceV1,
  MaterialResourceV1,
  Srgb8ColorV1,
  Vec3V1,
} from '../../src/core/index.js';
import { oakAxisFrameV1, type OakAxisFrameV1 } from './oak-axis-frame.js';
import {
  oakTissueAxialRadialCandidatesV1 as axialRadialCandidates,
  oakTissueCommittedPrefixV1 as committedPrefix,
  oakTissueQuantizedLengthV1 as quantizedLength,
  oakTissueSegmentCandidatesV1 as segmentCandidates,
  oakTissueStructuralVolumeFractionV1 as volumeFraction,
  oakTissueVisibleStructuralCandidatesV1 as visibleStructuralCandidates,
  type OakTissueFrontCandidateV1 as Candidate,
  type OakTissueFrontLocalCellV1 as LocalCell,
} from './oak-tissue-development-front.js';
import {
  oakLeafPetioleSectionForOrganV1,
  type OakLeafVariantDescriptorV1,
} from './oak-leaf-shape.js';
import {
  oakEasedLeafHalfWidthV1,
  oakQuantizedLeafRadialsAtPitchV1,
  oakVisibleLeafTissueCandidatesV1,
} from './oak-leaf-tissue-mask.js';
import type { OakRenderInstanceRecordV1 } from './oak-render-projection.js';
import {
  oakTissueVoxelBaseColorV1,
  oakTissueVoxelCohortColorV1,
} from './oak-tissue-color.js';
import type {
  OakLeafOrganSnapshotV1,
  OakOrganSnapshotV1,
  OakRenderProjectionStateV1,
  OakStructuralOrganSnapshotV1,
  OakVec3V1,
} from './oak-types.js';
import {
  OAK_MIN_RENDER_SHAFT_LENGTH_M_V1,
} from './oak-wood-shape.js';
import { OAK_PHYSICAL_WOOD_TIP_RADIUS_RATIO_V1 } from './oak-physical-wood.js';
import { OAK_PARAMETERS_V1 } from './oak-parameters.js';

/**
 * A 1.99890 mm dyadic pitch (131 / 65536 m). Integer lattice translations and the
 * cube scale therefore survive Float32 serialization exactly at this fixture's
 * bounded coordinate range; face-neighbour cells cannot acquire sub-ULP cracks.
 */
export const OAK_TISSUE_VOXEL_PITCH_NUMERATOR_V1 = 131;
export const OAK_TISSUE_VOXEL_PITCH_DENOMINATOR_V1 = 65_536;
export const OAK_TISSUE_VOXEL_PITCH_M_V1 =
  OAK_TISSUE_VOXEL_PITCH_NUMERATOR_V1 / OAK_TISSUE_VOXEL_PITCH_DENOMINATOR_V1;
/**
 * Organ-local cubes keep a one-micron intercellular cleft. Their centers still
 * use the exact tissue pitch, while the bounded clearance is larger than the
 * accepted Float32 pose error and far below a visible pixel at fixture scale.
 */
export const OAK_ORGAN_LOCAL_VOXEL_CLEARANCE_M_V1 = 0.000_001;
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
/** Disposable radial display calibration; never consumed by biology or mechanics. */
export const OAK_LEAF_NODE_PRESENTATION_CLEARANCE_M_V1 = 0.002;

export { oakEasedLeafHalfWidthV1 };

export const OAK_TISSUE_VOXEL_RULE_IDS_V1 = Object.freeze([
  'declared-port-fused-paths',
  'development-front-prefixes',
  'leaf-anatomical-senescence-order',
  'leaf-lobed-area-mask',
  'leaf-petiole-midrib-mask',
  'leaf-secondary-vein-material-rhythm',
  'leaf-transverse-camber-mask',
  'organ-state-palette-quantization',
  'organ-local-float32-clearance',
  'root-aggregate-legibility-mask',
  'seed-bud-port-masks',
  'source-claim-preservation',
  'shared-dyadic-tissue-lattice',
  'tissue-voxel-primitives',
  'wood-cylindrical-connected-mask',
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

function clampByte(value: number): number { return Math.max(0, Math.min(255, Math.round(value))); }

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
    material(OAK_LEAF_VOXEL_MATERIAL_KEY_V1, 0.62),
    material(OAK_SEED_BUD_VOXEL_MATERIAL_KEY_V1, 0.91),
  ];
}

/** One exact cube. Organ masks, not bespoke meshes, own every visible plant shape. */
export function createOakTissueVoxelGeometryV1(): GeometryResourceV1 {
  const positions = new Float32Array([
    .5,-.5,-.5, .5,.5,-.5, .5,.5,.5, .5,-.5,.5, -.5,-.5,.5, -.5,.5,.5, -.5,.5,-.5, -.5,-.5,-.5, -.5,.5,-.5, -.5,.5,.5, .5,.5,.5, .5,.5,-.5,
    -.5,-.5,.5, -.5,-.5,-.5, .5,-.5,-.5, .5,-.5,.5, -.5,-.5,.5, .5,-.5,.5, .5,.5,.5, -.5,.5,.5, .5,-.5,-.5, -.5,-.5,-.5, -.5,.5,-.5, .5,.5,-.5,
  ]);
  const normals = new Float32Array([
    1,0,0, 1,0,0, 1,0,0, 1,0,0, -1,0,0, -1,0,0, -1,0,0, -1,0,0, 0,1,0, 0,1,0, 0,1,0, 0,1,0,
    0,-1,0, 0,-1,0, 0,-1,0, 0,-1,0, 0,0,1, 0,0,1, 0,0,1, 0,0,1, 0,0,-1, 0,0,-1, 0,0,-1, 0,0,-1,
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

function cubeMatrix(
  center: Vec3V1,
  frame: OakAxisFrameV1,
  edgeLengthM: number,
): readonly number[] {
  return [
    frame.x.x * edgeLengthM, frame.x.y * edgeLengthM, frame.x.z * edgeLengthM, 0,
    frame.y.x * edgeLengthM, frame.y.y * edgeLengthM, frame.y.z * edgeLengthM, 0,
    frame.z.x * edgeLengthM, frame.z.y * edgeLengthM, frame.z.z * edgeLengthM, 0,
    center.x, center.y, center.z, 1,
  ];
}

function cuboidMatrix(
  center: Vec3V1,
  frame: OakAxisFrameV1,
  size: Readonly<{ x: number; y: number; z: number }>,
): readonly number[] {
  return [
    frame.x.x * size.x, frame.x.y * size.x, frame.x.z * size.x, 0,
    frame.y.x * size.y, frame.y.y * size.y, frame.y.z * size.y, 0,
    frame.z.x * size.z, frame.z.y * size.z, frame.z.z * size.z, 0,
    center.x, center.y, center.z, 1,
  ];
}

function leafCellSize(
  leaf: OakLeafOrganSnapshotV1,
  role: string,
  local: LocalCell,
): Readonly<{ x: number; y: number; z: number }> {
  const edge = PITCH - OAK_ORGAN_LOCAL_VOXEL_CLEARANCE_M_V1;
  if (role !== 'petiole-voxel' && role !== 'midrib-voxel') {
    return { x: edge, y: edge, z: edge };
  }
  const section = oakLeafPetioleSectionForOrganV1(
    leaf.key,
    Math.max(leaf.areaM2, Number.MIN_VALUE),
    Math.max(leaf.lengthM, Number.MIN_VALUE),
  );
  const petioleT = Math.max(0, Math.min(1,
    (local.y + .5) * PITCH / Math.max(section.petioleLengthM, PITCH),
  ));
  const taper = 1 + (OAK_PARAMETERS_V1.mechanics.petioleTipRadiusRatio - 1) * petioleT;
  return {
    x: Math.min(edge, section.basalFullWidthM * taper),
    y: edge,
    z: Math.min(edge, section.basalFullThicknessM * taper),
  };
}

function addVoxel(
  target: OakRenderInstanceRecordV1[],
  organ: OakOrganSnapshotV1,
  frame: OakAxisFrameV1,
  candidate: Candidate,
): void {
  const { role, local } = candidate;
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
    (local.y + (organ.kind === 'leaf' ? 0.5 : 0)) * PITCH,
    local.z * PITCH,
  );
  const color = organ.kind === 'leaf' ? candidate.color : shadeOakTissueVoxelColorV1(
    oakTissueVoxelCohortColorV1(organ, local.x, local.y, local.z),
    local.x,
    local.y,
    local.z,
  );
  target.push({
    key: `oak:${organ.key}:${role}:${String(local.x)}:${String(local.y)}:${String(local.z)}`,
    matrix: organ.kind === 'leaf'
      ? cuboidMatrix(center, frame, leafCellSize(organ, role, local))
      : cubeMatrix(center, frame, PITCH),
    color,
  });
}

function appendCandidates(
  target: OakRenderInstanceRecordV1[],
  organ: OakOrganSnapshotV1,
  frame: OakAxisFrameV1,
  candidates: readonly Candidate[],
): void {
  for (const candidate of candidates) {
    addVoxel(target, organ, frame, candidate);
  }
}

function appendSegment(
  target: OakRenderInstanceRecordV1[],
  organ: SegmentOrgan,
): OakTissueVoxelOrganMetricsV1 | null {
  if (organ.targetLengthM < OAK_MIN_RENDER_SHAFT_LENGTH_M_V1
    || !(organ.targetRadiusM > 0)) return null;
  const frame = oakAxisFrameV1(organ.direction, 0);
  const layers = Math.max(1, Math.round(organ.targetLengthM / PITCH));
  const base = oakTissueVoxelBaseColorV1(organ);
  const initialCount = target.length;
  const terminalProfile = [
    { axialFraction: 0, radiusRatio: 1 },
    { axialFraction: 1, radiusRatio: OAK_PHYSICAL_WOOD_TIP_RADIUS_RATIO_V1 },
  ];
  const candidateInput = { layers, radiusM: organ.targetRadiusM, pitchM: PITCH, color: base };
  const baseCandidates = segmentCandidates({ ...candidateInput, profile: terminalProfile });
  const committedBase = visibleStructuralCandidates({
    organ,
    candidates: baseCandidates,
    layers,
    pitchM: PITCH,
    profile: terminalProfile,
  });
  appendCandidates(target, organ, frame, committedBase);
  return {
    organKey: organ.key,
    kind: organ.kind,
    voxelCount: target.length - initialCount,
    quantizedLengthM: quantizedLength(committedBase, PITCH),
    quantizedAreaM2: 0,
  };
}

export function oakQuantizedLeafRadialsV1(
  variant: OakLeafVariantDescriptorV1,
  layers: number,
  widthScaleM: number,
): number[] {
  return oakQuantizedLeafRadialsAtPitchV1(variant, layers, widthScaleM, PITCH);
}

function appendLeaf(
  target: OakRenderInstanceRecordV1[],
  leaf: OakLeafOrganSnapshotV1,
): OakTissueVoxelOrganMetricsV1 {
  const frame = oakAxisFrameV1(leaf.direction, leaf.rollRadians);
  const initialCount = target.length;
  const committed = oakVisibleLeafTissueCandidatesV1(leaf, PITCH);
  const radial = leaf.attachment?.restRadialUnitWorld;
  const radialLength = radial === undefined ? 0 : Math.hypot(radial.x, radial.y, radial.z);
  const presentedLeaf = radial === undefined || !(radialLength > 0) ? leaf : {
    ...leaf,
    positionM: {
      x: leaf.positionM.x + radial.x / radialLength
        * OAK_LEAF_NODE_PRESENTATION_CLEARANCE_M_V1,
      y: leaf.positionM.y + radial.y / radialLength
        * OAK_LEAF_NODE_PRESENTATION_CLEARANCE_M_V1,
      z: leaf.positionM.z + radial.z / radialLength
        * OAK_LEAF_NODE_PRESENTATION_CLEARANCE_M_V1,
    },
  };
  appendCandidates(target, presentedLeaf, frame, committed);
  const voxelCount = target.length - initialCount;
  return {
    organKey: leaf.key,
    kind: leaf.kind,
    voxelCount,
    quantizedLengthM: quantizedLength(committed, PITCH),
    quantizedAreaM2: voxelCount * PITCH * PITCH,
  };
}

function appendSeedOrBud(
  target: OakRenderInstanceRecordV1[],
  organ: OakStructuralOrganSnapshotV1 & { readonly kind: 'acorn' | 'bud' },
): OakTissueVoxelOrganMetricsV1 {
  const frame = oakAxisFrameV1(organ.direction, 0);
  const layers = Math.max(1, Math.round(Math.max(organ.targetLengthM, PITCH) / PITCH));
  const initialCount = target.length;
  const base = oakTissueVoxelBaseColorV1(organ);
  const candidates = axialRadialCandidates({
    layers,
    pitchM: PITCH,
    paddingFraction: .15,
    role: `${organ.kind}-voxel`,
    color: base,
    radiusAt: (t) => organ.kind === 'acorn'
      ? organ.targetRadiusM * Math.sqrt(Math.max(0, 1 - (t * 2 - 1) ** 2))
      : organ.targetRadiusM * (.95 - t * .55),
  });
  const committed = committedPrefix(candidates, volumeFraction(organ));
  appendCandidates(target, organ, frame, committed);
  return {
    organKey: organ.key,
    kind: organ.kind,
    voxelCount: target.length - initialCount,
    quantizedLengthM: quantizedLength(committed, PITCH),
    quantizedAreaM2: 0,
  };
}

/** Derive organ-local source masks; the union lattice owns final visible cells. */
export function buildOakTissueVoxelSourceProjectionV1(
  state: Pick<OakRenderProjectionStateV1, 'organs'>,
  includeRoots: boolean,
  options: Readonly<{ includeDetachedLeaves?: boolean }> = {},
): OakTissueVoxelSourceProjectionV1 {
  const records = new Map<string, OakRenderInstanceRecordV1[]>([
    [OAK_WOOD_VOXEL_BATCH_KEY_V1, []],
    [OAK_ROOT_VOXEL_BATCH_KEY_V1, []],
    [OAK_LEAF_VOXEL_BATCH_KEY_V1, []],
    [OAK_SEED_BUD_VOXEL_BATCH_KEY_V1, []],
  ]);
  const active = state.organs.filter((organ) => organ.stage !== 'abscised'
    && (organ.stage !== 'detached' || options.includeDetachedLeaves === true)
    && organ.developmentPhase !== 'preformed' && organ.healthFraction > 0);
  const byKey = new Map(state.organs.map((organ) => [organ.key, organ]));
  if (byKey.size !== state.organs.length) {
    throw new Error('Oak tissue projection received duplicate organ keys.');
  }
  const organMetrics: OakTissueVoxelOrganMetricsV1[] = [];
  let skippedInvalid = 0;
  let skippedConsumed = 0;
  for (const organ of active) {
    if (isSegment(organ)) {
      if (organ.targetLengthM < OAK_MIN_RENDER_SHAFT_LENGTH_M_V1 || organ.targetRadiusM <= 0) {
        skippedInvalid += 1;
        continue;
      }
      const root = organ.kind === 'coarse-root' || organ.kind === 'fine-root-cohort';
      if (root && !includeRoots) continue;
      const metric = appendSegment(
        records.get(root ? OAK_ROOT_VOXEL_BATCH_KEY_V1 : OAK_WOOD_VOXEL_BATCH_KEY_V1)!,
        organ,
      );
      if (metric) organMetrics.push(metric);
      else skippedConsumed += 1;
    } else if (organ.kind === 'leaf') {
      if (organ.targetAreaM2 > 0) organMetrics.push(appendLeaf(records.get(OAK_LEAF_VOXEL_BATCH_KEY_V1)!, organ));
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
