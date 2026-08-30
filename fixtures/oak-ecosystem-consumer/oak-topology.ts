import type { OakOrganKindV1, OakVec3V1 } from './oak-types.js';
import {
  OAK_TAPER_RATIOS_V1,
  oakWoodTerminalTaperIndexV1,
  oakWoodTaperIndexV1,
  oakWoodUnitCrossSectionAreaM2V1,
} from './oak-wood-shape.js';

export interface OakTopologyOrganV1 {
  readonly key: string;
  readonly kind: OakOrganKindV1;
  readonly parentKey: string | null;
  readonly positionM: OakVec3V1;
  readonly direction: OakVec3V1;
  readonly lengthM: number;
  readonly radiusM: number;
  readonly stage: string;
  readonly healthFraction: number;
}

export interface OakGerminationPortsV1 {
  /** The lower end of the dimensioned acorn axis, where the radicle emerges. */
  readonly bottom: OakVec3V1;
  /** The upper end of the dimensioned acorn axis, where the shoot emerges. */
  readonly top: OakVec3V1;
}

export interface OakFiniteWoodAttachmentSectionV1 {
  readonly parentKey: string;
  readonly childKey: string;
  readonly parentTerminalAreaM2: number;
  readonly childBasalAreaM2: number;
  /** Finite beam-node area assigned once; sibling sums never exceed the parent. */
  readonly loadPathAreaM2: number;
  /** Half-open scalar sectors make the mechanics partition explicitly disjoint. */
  readonly sectorStartFraction: number;
  readonly sectorEndFraction: number;
}

function magnitude(vector: OakVec3V1): number {
  return Math.sqrt(
    vector.x * vector.x + vector.y * vector.y + vector.z * vector.z,
  );
}

function normalized(vector: OakVec3V1, ownerKey: string): OakVec3V1 {
  const length = magnitude(vector);
  if (!(length > 0) || !Number.isFinite(length)) {
    throw new Error(
      `Oak organ '${ownerKey}' needs a finite nonzero direction to define topology.`,
    );
  }
  return { x: vector.x / length, y: vector.y / length, z: vector.z / length };
}

function ordinal(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function isActiveSegment(organ: OakTopologyOrganV1): boolean {
  return organ.stage !== 'abscised'
    && organ.healthFraction > 0
    && organ.lengthM > 0
    && organ.radiusM > 0
    && (organ.kind === 'stem'
      || organ.kind === 'branch'
      || organ.kind === 'coarse-root'
      || organ.kind === 'fine-root-cohort');
}

/**
 * The acorn is a dimensioned +Y body, not a centre point. Its two endpoints
 * are the only authoritative emergence ports; callers do not add seed radii.
 */
export function oakAcornGerminationPortsV1(
  acorn: Pick<OakTopologyOrganV1,
    'key' | 'kind' | 'positionM' | 'direction' | 'lengthM'>,
): OakGerminationPortsV1 {
  if (acorn.kind !== 'acorn' || !(acorn.lengthM > 0)
    || !Number.isFinite(acorn.lengthM)) {
    throw new Error(
      `Oak germination ports require a positive dimensioned acorn; received '${acorn.key}'.`,
    );
  }
  const direction = normalized(acorn.direction, acorn.key);
  const distal = {
    x: acorn.positionM.x + direction.x * acorn.lengthM,
    y: acorn.positionM.y + direction.y * acorn.lengthM,
    z: acorn.positionM.z + direction.z * acorn.lengthM,
  };
  if (Math.abs(distal.y - acorn.positionM.y) < acorn.lengthM * 0.5) {
    throw new Error(
      `Oak acorn '${acorn.key}' must have a predominantly vertical germination axis.`,
    );
  }
  return distal.y > acorn.positionM.y
    ? { bottom: { ...acorn.positionM }, top: distal }
    : { bottom: distal, top: { ...acorn.positionM } };
}

/**
 * A leaf originates tangentially on its node's terminal face. Its centreline
 * advances by the exact basal-section support and sits outside the node radius
 * so no angled finite petiole corner penetrates a coaxial continuation.
 */
export function oakLateralAttachmentPortV1(
  parent: Pick<OakTopologyOrganV1,
    'key' | 'positionM' | 'direction' | 'lengthM' | 'radiusM'>,
  leafDirection: OakVec3V1,
  radialCenterOffsetM: number,
  basalSupportAlongParentAxisM: number,
): OakVec3V1 {
  if (!(radialCenterOffsetM > parent.radiusM)
    || !Number.isFinite(radialCenterOffsetM) || !(parent.radiusM > 0)
    || !(basalSupportAlongParentAxisM >= 0)
    || !Number.isFinite(basalSupportAlongParentAxisM)) {
    throw new Error(
      `Oak leaf port on '${parent.key}' needs a radial centre outside its node `
      + 'and a finite nonnegative basal support.',
    );
  }
  const axis = normalized(parent.direction, parent.key);
  const authored = normalized(leafDirection, parent.key);
  const radial = subtractVector(authored, scaleVector(axis, dotVector(authored, axis)));
  const radialDirection = normalized(radial, parent.key);
  const tip = addVector(parent.positionM, scaleVector(axis, parent.lengthM));
  return addVector(
    addVector(
      tip,
      scaleVector(axis, basalSupportAlongParentAxisM),
    ),
    scaleVector(radialDirection, radialCenterOffsetM),
  );
}

function addVector(left: OakVec3V1, right: OakVec3V1): OakVec3V1 {
  return { x: left.x + right.x, y: left.y + right.y, z: left.z + right.z };
}

function subtractVector(left: OakVec3V1, right: OakVec3V1): OakVec3V1 {
  return { x: left.x - right.x, y: left.y - right.y, z: left.z - right.z };
}

function scaleVector(vector: OakVec3V1, factor: number): OakVec3V1 {
  return { x: vector.x * factor, y: vector.y * factor, z: vector.z * factor };
}

function dotVector(left: OakVec3V1, right: OakVec3V1): number {
  return left.x * right.x + left.y * right.y + left.z * right.z;
}

/**
 * Mechanics uses finite-area line-element clamps at a node. The rendered
 * parent has one integrated flared shaft surface, while this explicit area
 * budget remains the load path and is never inferred from triangles. Half-open
 * sectors partition a parent's exact octagonal terminal section once, so
 * sibling clamps cannot double-own area.
 */
export function oakFiniteWoodAttachmentSectionsV1(
  organs: readonly OakTopologyOrganV1[],
): readonly OakFiniteWoodAttachmentSectionV1[] {
  const active = organs.filter(isActiveSegment);
  const byKey = new Map(active.map((organ) => [organ.key, organ]));
  const childrenByParent = new Map<string, OakTopologyOrganV1[]>();
  for (const organ of active) {
    if (organ.parentKey === null || !byKey.has(organ.parentKey)) continue;
    const children = childrenByParent.get(organ.parentKey) ?? [];
    children.push(organ);
    childrenByParent.set(organ.parentKey, children);
  }
  const unitArea = oakWoodUnitCrossSectionAreaM2V1();
  const sections: OakFiniteWoodAttachmentSectionV1[] = [];
  for (const [parentKey, unorderedChildren] of [...childrenByParent.entries()]
    .sort(([left], [right]) => ordinal(left, right))) {
    const parent = byKey.get(parentKey)!;
    const children = [...unorderedChildren].sort((left, right) =>
      ordinal(left.key, right.key));
    const taperIndex = oakWoodTaperIndexV1(
      parent.radiusM,
      children.map((child) => child.radiusM),
      oakWoodTerminalTaperIndexV1(parent.kind),
    );
    const terminalRadiusM = parent.radiusM * OAK_TAPER_RATIOS_V1[taperIndex]!;
    const parentAreaM2 = unitArea * terminalRadiusM * terminalRadiusM;
    const childAreas = children.map((child) =>
      unitArea * child.radiusM * child.radiusM);
    const totalChildAreaM2 = childAreas.reduce((sum, area) => sum + area, 0);
    let sectorStartFraction = 0;
    children.forEach((child, index) => {
      const childAreaM2 = childAreas[index]!;
      const sectorFraction = childAreaM2 / totalChildAreaM2;
      const sectorEndFraction = index === children.length - 1
        ? 1
        : sectorStartFraction + sectorFraction;
      sections.push({
        parentKey,
        childKey: child.key,
        parentTerminalAreaM2: parentAreaM2,
        childBasalAreaM2: childAreaM2,
        loadPathAreaM2: Math.min(childAreaM2, parentAreaM2 * sectorFraction),
        sectorStartFraction,
        sectorEndFraction,
      });
      sectorStartFraction = sectorEndFraction;
    });
  }
  return sections;
}

export function assertOakFiniteWoodLoadPathsV1(
  organs: readonly OakTopologyOrganV1[],
): void {
  const sections = oakFiniteWoodAttachmentSectionsV1(organs);
  const byParent = new Map<string, OakFiniteWoodAttachmentSectionV1[]>();
  for (const section of sections) {
    if (!(section.loadPathAreaM2 > 0)
      || !Number.isFinite(section.loadPathAreaM2)) {
      throw new Error(
        `Oak attachment '${section.parentKey}' -> '${section.childKey}' has no finite load path.`,
      );
    }
    const siblings = byParent.get(section.parentKey) ?? [];
    siblings.push(section);
    byParent.set(section.parentKey, siblings);
  }
  for (const [parentKey, siblings] of byParent) {
    const ownedArea = siblings.reduce((sum, section) =>
      sum + section.loadPathAreaM2, 0);
    const availableArea = siblings[0]!.parentTerminalAreaM2;
    if (ownedArea > availableArea * (1 + 1e-12)) {
      throw new Error(
        `Oak node '${parentKey}' assigns ${String(ownedArea)} m2 across `
        + `${String(availableArea)} m2 of terminal wood.`,
      );
    }
    let expectedStart = 0;
    for (const section of siblings) {
      if (section.sectorStartFraction !== expectedStart
        || section.sectorEndFraction <= section.sectorStartFraction) {
        throw new Error(`Oak node '${parentKey}' has overlapping load-path sectors.`);
      }
      expectedStart = section.sectorEndFraction;
    }
    if (expectedStart !== 1) {
      throw new Error(`Oak node '${parentKey}' does not partition its terminal section.`);
    }
  }
}
