import type { Srgb8ColorV1 } from '../../src/core/index.js';
import { OAK_PARAMETERS_V1 } from './oak-parameters.js';
import type { OakOrganSnapshotV1 } from './oak-types.js';

export function oakMaturationMaterialFractionV1(
  organ: Pick<OakOrganSnapshotV1, 'developmentFraction'>,
): number {
  const start = OAK_PARAMETERS_V1.growth.development.expansionCarbonFraction;
  return Math.max(0, Math.min(1, (organ.developmentFraction - start) / (1 - start)));
}

export function mixOakSrgbV1(
  start: Readonly<{ r: number; g: number; b: number }>,
  end: Readonly<{ r: number; g: number; b: number }>,
  fraction: number,
): Srgb8ColorV1 {
  const bounded = Math.max(0, Math.min(1, fraction));
  return {
    r: Math.round(start.r + (end.r - start.r) * bounded),
    g: Math.round(start.g + (end.g - start.g) * bounded),
    b: Math.round(start.b + (end.b - start.b) * bounded),
    a: 255,
  };
}
