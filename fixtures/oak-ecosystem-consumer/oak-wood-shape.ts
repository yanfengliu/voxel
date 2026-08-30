import type { OakOrganKindV1, OakVec3V1 } from './oak-types.js';

export const OAK_WOOD_FRUSTUM_SIDE_COUNT_V1 = 8;
export const OAK_TAPER_RATIOS_V1 = [0.62, 0.8, 0.94] as const;
export const OAK_MIN_RENDER_SHAFT_LENGTH_M_V1 = 0.0005;
export const OAK_NODE_FLARE_LENGTH_FRACTION_V1 = 0.16;
export const OAK_NODE_FLARE_PEAK_FRACTION_V1 = 0.42;
export const OAK_NODE_FLARE_PEAK_RADIUS_MULTIPLIER_V1 = 1.14;

export interface OakWoodProfileRingV1 {
  readonly axialFraction: number;
  readonly radiusRatio: number;
}

export interface OakWoodShapeSegmentV1 {
  readonly key: string;
  readonly kind: OakOrganKindV1;
  readonly direction: OakVec3V1;
}

export interface OakRenderedWoodShapeV1 {
  readonly taperIndex: number;
  readonly taperRatio: number;
  readonly shaftLengthM: number;
  /** Exact volume enclosed by the one public shaft surface. */
  readonly shaftVolumeM3: number;
  readonly nodeFlared: boolean;
}

/** Area of the unit-circumradius polygon emitted by the wood-shaft geometry. */
export function oakWoodUnitCrossSectionAreaM2V1(): number {
  return OAK_WOOD_FRUSTUM_SIDE_COUNT_V1
    * Math.sin(2 * Math.PI / OAK_WOOD_FRUSTUM_SIDE_COUNT_V1) / 2;
}

export function oakWoodTaperIndexV1(
  baseRadiusM: number,
  childRadiiM: readonly number[],
  terminalTaperIndex = 0,
): number {
  if (childRadiiM.length === 0) return terminalTaperIndex;
  const distalAreaRadiusM = Math.sqrt(childRadiiM.reduce(
    (sum, radiusM) => sum + radiusM * radiusM,
    0,
  ));
  const targetRatio = Math.max(
    0.55,
    Math.min(0.98, distalAreaRadiusM / baseRadiusM),
  );
  let nearestIndex = 0;
  let nearestDistance = Infinity;
  OAK_TAPER_RATIOS_V1.forEach((ratio, index) => {
    const distance = Math.abs(ratio - targetRatio);
    if (distance < nearestDistance) {
      nearestIndex = index;
      nearestDistance = distance;
    }
  });
  return nearestIndex;
}

/** Young terminal shoots keep a near-cylindrical axis beneath a separate bud. */
export function oakWoodTerminalTaperIndexV1(kind: OakOrganKindV1): number {
  return kind === 'stem' ? OAK_TAPER_RATIOS_V1.length - 1 : 0;
}

/**
 * Ring profile of the one mass-bearing public shaft surface. Occupied nodes
 * replace the terminal portion of the linear taper with a continuous flare;
 * there is no concentric marker shell or duplicated material volume.
 */
export function oakWoodProfileAtTaperV1(
  taperIndex: number,
  nodeFlared: boolean,
): readonly OakWoodProfileRingV1[] {
  const taperRatio = OAK_TAPER_RATIOS_V1[taperIndex];
  if (taperRatio === undefined) {
    throw new Error(
      `Cannot shape oak wood with taper index ${String(taperIndex)}; `
      + `expected 0 through ${String(OAK_TAPER_RATIOS_V1.length - 1)}.`,
    );
  }
  if (!nodeFlared) return [
    { axialFraction: 0, radiusRatio: 1 },
    { axialFraction: 1, radiusRatio: taperRatio },
  ];
  const flareStart = 1 - OAK_NODE_FLARE_LENGTH_FRACTION_V1;
  const flareStartRadius = taperRatio
    + (1 - taperRatio) * OAK_NODE_FLARE_LENGTH_FRACTION_V1;
  return [
    { axialFraction: 0, radiusRatio: 1 },
    { axialFraction: flareStart, radiusRatio: flareStartRadius },
    {
      axialFraction: flareStart
        + OAK_NODE_FLARE_LENGTH_FRACTION_V1 * OAK_NODE_FLARE_PEAK_FRACTION_V1,
      radiusRatio: flareStartRadius * OAK_NODE_FLARE_PEAK_RADIUS_MULTIPLIER_V1,
    },
    { axialFraction: 1, radiusRatio: taperRatio },
  ];
}

export function oakRenderedWoodVolumeAtTaperV1(input: Readonly<{
  lengthM: number;
  baseRadiusM: number;
  taperIndex: number;
  nodeFlared?: boolean;
}>): Readonly<{
  taperRatio: number;
  shaftLengthM: number;
  shaftVolumeM3: number;
}> | null {
  const taperRatio = OAK_TAPER_RATIOS_V1[input.taperIndex];
  if (taperRatio === undefined) {
    throw new Error(
      `Cannot shape oak wood with taper index ${String(input.taperIndex)}; `
      + `expected 0 through ${String(OAK_TAPER_RATIOS_V1.length - 1)}.`,
    );
  }
  const shaftLengthM = input.lengthM;
  if (shaftLengthM < OAK_MIN_RENDER_SHAFT_LENGTH_M_V1) return null;
  const profile = oakWoodProfileAtTaperV1(
    input.taperIndex,
    input.nodeFlared ?? false,
  );
  let normalizedVolume = 0;
  for (let index = 0; index < profile.length - 1; index += 1) {
    const start = profile[index]!;
    const end = profile[index + 1]!;
    normalizedVolume += (end.axialFraction - start.axialFraction)
      * (start.radiusRatio * start.radiusRatio
        + start.radiusRatio * end.radiusRatio
        + end.radiusRatio * end.radiusRatio) / 3;
  }
  const shaftVolumeM3 = oakWoodUnitCrossSectionAreaM2V1()
    * input.baseRadiusM * input.baseRadiusM * shaftLengthM * normalizedVolume;
  return {
    taperRatio,
    shaftLengthM,
    shaftVolumeM3,
  };
}

export function oakRenderedWoodShapeV1(input: Readonly<{
  organ: OakWoodShapeSegmentV1 & Readonly<{
    lengthM: number;
    radiusM: number;
  }>;
  children: readonly Readonly<{ radiusM: number }>[];
}>): OakRenderedWoodShapeV1 | null {
  const taperIndex = oakWoodTaperIndexV1(
    input.organ.radiusM,
    input.children.map((child) => child.radiusM),
    oakWoodTerminalTaperIndexV1(input.organ.kind),
  );
  const volume = oakRenderedWoodVolumeAtTaperV1({
    lengthM: input.organ.lengthM,
    baseRadiusM: input.organ.radiusM,
    taperIndex,
    nodeFlared: input.children.length > 0,
  });
  return volume === null ? null : {
    taperIndex,
    ...volume,
    nodeFlared: input.children.length > 0,
  };
}
