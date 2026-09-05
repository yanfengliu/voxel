import { OAK_PARAMETERS_V1 } from './oak-parameters.js';
import { oakAxisFrameV1 } from './oak-axis-frame.js';
import type { OakVec3V1 } from './oak-types.js';

export interface OakLeafVariantDescriptorV1 {
  readonly id: 'broad-nine-lobe' | 'compact-eleven-lobe' | 'narrow-nine-lobe';
  readonly geometryKey: string;
  readonly stationWidths: readonly number[];
  readonly camber: number;
  readonly lobeCount: number;
  readonly aspectClass: 'broad' | 'compact' | 'narrow';
}

export interface OakLeafPetioleSectionV1 {
  readonly variant: OakLeafVariantDescriptorV1;
  readonly totalLengthM: number;
  readonly bladeLengthM: number;
  readonly petioleLengthM: number;
  readonly bladeWidthScaleM: number;
  readonly basalFullWidthM: number;
  readonly basalFullThicknessM: number;
  readonly weakAxisSecondMomentM4: number;
  readonly weakAxisEquivalentCircularRadiusM: number;
}

export interface OakLeafTangentialPortOffsetsV1 {
  readonly axialCenterOffsetM: number;
  readonly radialCenterOffsetM: number;
}

export const OAK_LEAF_PETIOLE_FRACTION_V1 =
  OAK_PARAMETERS_V1.leafGeometry.petioleLengthFractionOfTotalLeaf;
export const OAK_LEAF_PETIOLE_NORMALIZED_HALF_WIDTH_V1 =
  OAK_PARAMETERS_V1.leafGeometry.petioleNormalizedHalfWidth;
export const OAK_LEAF_PETIOLE_NORMALIZED_HALF_THICKNESS_V1 =
  OAK_PARAMETERS_V1.leafGeometry.petioleNormalizedHalfThickness;

/**
 * Three deterministic pedunculate-oak silhouettes. Palette variation is not
 * counted as shape variation: lobe count, aspect and camber all differ.
 */
export const OAK_LEAF_VARIANT_DESCRIPTORS_V1:
readonly OakLeafVariantDescriptorV1[] = Object.freeze(
  OAK_PARAMETERS_V1.leafGeometry.variants.map((variant) => ({
    ...variant,
    geometryKey: `geometry:oak:leaf:${variant.id}`,
  })),
);

export function deriveOakLeafLobeCountV1(widths: readonly number[]): number {
  let pairedPeaks = 0;
  for (let index = 1; index < widths.length - 1; index += 1) {
    if (widths[index]! > widths[index - 1]! && widths[index]! > widths[index + 1]!) {
      pairedPeaks += 1;
    }
  }
  return pairedPeaks * 2 + 1;
}

export function oakLeafVariantForOrganKeyV1(
  key: string,
): OakLeafVariantDescriptorV1 {
  const match = /^organ:(\d+):(\d+)$/u.exec(key);
  const localId = match ? Number(match[1]) : Number.NaN;
  if (!Number.isSafeInteger(localId)) {
    throw new Error(
      `Oak leaf key '${key}' must be 'organ:<nonnegative-safe-local-id>:<generation>'.`,
    );
  }
  return OAK_LEAF_VARIANT_DESCRIPTORS_V1[
    localId % OAK_LEAF_VARIANT_DESCRIPTORS_V1.length
  ]!;
}

export function oakNormalizedLeafAreaV1(
  variant: OakLeafVariantDescriptorV1,
): number {
  const widths = [
    OAK_LEAF_PETIOLE_NORMALIZED_HALF_WIDTH_V1,
    ...variant.stationWidths,
    0,
  ];
  const step = (1 - OAK_LEAF_PETIOLE_FRACTION_V1) / (widths.length - 1);
  let halfArea = 0;
  for (let index = 0; index < widths.length - 1; index += 1) {
    halfArea += (widths[index]! + widths[index + 1]!) * 0.5 * step;
  }
  return halfArea * 2;
}

export function oakLeafWidthScaleMForDescriptorV1(
  areaM2: number,
  totalLengthM: number,
  variant: OakLeafVariantDescriptorV1,
): number {
  if (!(areaM2 > 0) || !(totalLengthM > 0)) {
    throw new Error(
      `Oak leaf area and total length must be positive; received ${String(areaM2)} m2 and ${String(totalLengthM)} m.`,
    );
  }
  return areaM2 / (oakNormalizedLeafAreaV1(variant) * totalLengthM);
}

/**
 * The rendered tapered rectangular petiole is the mechanics section source.
 * The beam solver consumes the circle with the same basal weak-axis I, so its
 * existing tapered-circle integration is materially tied to visible geometry.
 */
export function oakLeafPetioleSectionForOrganV1(
  key: string,
  areaM2: number,
  totalLengthM: number,
): OakLeafPetioleSectionV1 {
  const variant = oakLeafVariantForOrganKeyV1(key);
  const bladeWidthScaleM = oakLeafWidthScaleMForDescriptorV1(
    areaM2,
    totalLengthM,
    variant,
  );
  const basalFullWidthM = 2 * OAK_LEAF_PETIOLE_NORMALIZED_HALF_WIDTH_V1
    * bladeWidthScaleM;
  const basalFullThicknessM = 2 * OAK_LEAF_PETIOLE_NORMALIZED_HALF_THICKNESS_V1
    * bladeWidthScaleM;
  const weakAxisSecondMomentM4 = basalFullWidthM * basalFullThicknessM ** 3 / 12;
  const weakAxisEquivalentCircularRadiusM = (
    4 * weakAxisSecondMomentM4 / Math.PI
  ) ** (1 / 4);
  const petioleLengthM = totalLengthM * OAK_LEAF_PETIOLE_FRACTION_V1;
  return {
    variant,
    totalLengthM,
    bladeLengthM: totalLengthM - petioleLengthM,
    petioleLengthM,
    bladeWidthScaleM,
    basalFullWidthM,
    basalFullThicknessM,
    weakAxisSecondMomentM4,
    weakAxisEquivalentCircularRadiusM,
  };
}

function normalizedAxis(
  direction: OakVec3V1,
  key: string,
  role: string,
): OakVec3V1 {
  const magnitude = Math.sqrt(
    direction.x * direction.x + direction.y * direction.y + direction.z * direction.z,
  );
  if (!(magnitude > 0) || !Number.isFinite(magnitude)) {
    throw new Error(`Oak leaf '${key}' needs a finite nonzero ${role} direction.`);
  }
  return {
    x: direction.x / magnitude,
    y: direction.y / magnitude,
    z: direction.z / magnitude,
  };
}

function basalSectionSupportAlongAxisM(
  section: OakLeafPetioleSectionV1,
  frame: ReturnType<typeof oakAxisFrameV1>,
  axis: OakVec3V1,
): number {
  const dot = (vector: OakVec3V1): number =>
    vector.x * axis.x + vector.y * axis.y + vector.z * axis.z;
  return Math.abs(dot(frame.x)) * section.basalFullWidthM / 2
    + Math.abs(dot(frame.z)) * section.basalFullThicknessM / 2;
}

export function oakLeafPetioleSupportAlongAxisM_V1(
  key: string,
  areaM2: number,
  totalLengthM: number,
  leafDirection: OakVec3V1,
  rollRadians: number,
  axis: OakVec3V1,
): number {
  return basalSectionSupportAlongAxisM(
    oakLeafPetioleSectionForOrganV1(key, areaM2, totalLengthM),
    oakAxisFrameV1(leafDirection, rollRadians),
    normalizedAxis(axis, key, 'support'),
  );
}

/**
 * Offset the finite petiole rectangle by separate terminal-plane and radial
 * supports. These conservative clearance offsets do not prove material contact
 * at the intersection of the supporting planes.
 */
export function oakLeafTangentialPortOffsetsForOrganV1(
  key: string,
  areaM2: number,
  totalLengthM: number,
  parentDirection: OakVec3V1,
  parentRadiusM: number,
  leafDirection: OakVec3V1,
  rollRadians: number,
): OakLeafTangentialPortOffsetsV1 {
  if (!(parentRadiusM > 0) || !Number.isFinite(parentRadiusM)) {
    throw new Error(`Oak leaf '${key}' needs a finite positive parent radius.`);
  }
  const parentAxis = normalizedAxis(parentDirection, key, 'parent');
  const leafAxis = normalizedAxis(leafDirection, key, 'leaf');
  const leafAxialDot = leafAxis.x * parentAxis.x
    + leafAxis.y * parentAxis.y
    + leafAxis.z * parentAxis.z;
  const radialDirection = normalizedAxis({
    x: leafAxis.x - parentAxis.x * leafAxialDot,
    y: leafAxis.y - parentAxis.y * leafAxialDot,
    z: leafAxis.z - parentAxis.z * leafAxialDot,
  }, key, 'radial');
  return {
    axialCenterOffsetM: oakLeafPetioleSupportAlongAxisM_V1(
      key, areaM2, totalLengthM, leafDirection, rollRadians, parentAxis,
    ),
    radialCenterOffsetM: parentRadiusM
      + oakLeafPetioleSupportAlongAxisM_V1(
        key, areaM2, totalLengthM, leafDirection, rollRadians, radialDirection,
      ),
  };
}
