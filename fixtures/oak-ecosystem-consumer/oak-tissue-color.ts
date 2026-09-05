import type { Srgb8ColorV1 } from '../../src/core/index.js';
import { mixOakSrgbV1, oakMaturationMaterialFractionV1 } from './oak-development-color.js';
import { OAK_PARAMETERS_V1 } from './oak-parameters.js';
import { oakLeafColorV1 } from './oak-render-projection.js';
import {
  OAK_CUTAWAY_AGGREGATE_FINE_ROOT_COLOR_V1,
  OAK_CUTAWAY_COARSE_ROOT_COLOR_V1,
} from './oak-root-cutaway-presentation.js';
import type { OakOrganSnapshotV1 } from './oak-types.js';

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

export function oakTissueVoxelBaseColorV1(organ: OakOrganSnapshotV1): Srgb8ColorV1 {
  if (organ.kind === 'leaf') return oakLeafColorV1(organ);
  const stress = Math.max(0, Math.min(1, organ.stressFraction));
  const base = organ.kind === 'fine-root-cohort' ? OAK_CUTAWAY_AGGREGATE_FINE_ROOT_COLOR_V1
    : organ.kind === 'coarse-root' ? OAK_CUTAWAY_COARSE_ROOT_COLOR_V1
      : organ.kind === 'bud' ? { r: 143, g: 95, b: 52, a: 255 }
        : organ.kind === 'acorn' ? { r: 116, g: 76, b: 41, a: 255 }
          : mixOakSrgbV1(
            { r: 138, g: 90, b: 59 },
            { r: 98, g: 66, b: 53 },
            oakMaturationMaterialFractionV1(organ),
          );
  return {
    r: clampByte(base.r * (1 - stress * .16)),
    g: clampByte(base.g * (1 - stress * .22)),
    b: clampByte(base.b * (1 - stress * .12)),
    a: 255,
  };
}

/**
 * Maturing cells change material in deterministic spatial cohorts instead of
 * recolouring an entire organ on one host tick. The 64 slots span the primary
 * maturation interval and all converge to the exact mature material.
 */
export function oakTissueVoxelCohortColorV1(
  organ: OakOrganSnapshotV1,
  x: number,
  y: number,
  z: number,
): Srgb8ColorV1 {
  const start = OAK_PARAMETERS_V1.growth.development.expansionCarbonFraction;
  const fraction = organ.developmentFraction;
  const hash = (
    Math.imul(x, 73_856_093)
    ^ Math.imul(y, 19_349_663)
    ^ Math.imul(z, 83_492_791)
  ) >>> 0;
  const slots = 64;
  const threshold = start + ((hash % slots) + 1) / slots * (1 - start);
  const developmentFraction = fraction <= start || fraction >= 1
    ? fraction
    : fraction >= threshold ? 1 : start;
  const ditherFraction = (value: number, salt: number): number => {
    const bounded = Math.max(0, Math.min(1, value));
    const levels = 4;
    const scaled = bounded * levels;
    const lowerStep = Math.floor(scaled);
    if (lowerStep >= levels) return 1;
    const phase = (((hash ^ salt) >>> 0) % slots + 0.5) / slots;
    return (lowerStep + Number(phase < scaled - lowerStep)) / levels;
  };
  const stressFraction = ditherFraction(organ.stressFraction, 0x9e37_79b9);
  if (organ.kind === 'leaf') {
    return oakTissueVoxelBaseColorV1({
      ...organ,
      developmentFraction,
      // Leaf water, stress and chlorophyll are authoritative continuous
      // organ scalars. Spatial leaf patterning is anatomical downstream, so
      // these cues must not become hash/checker cohorts.
      stressFraction: organ.stressFraction,
      chlorophyllFraction: organ.chlorophyllFraction,
      relativeWaterContentFraction: organ.relativeWaterContentFraction,
    });
  }
  return oakTissueVoxelBaseColorV1({
    ...organ,
    developmentFraction,
    stressFraction,
  });
}
