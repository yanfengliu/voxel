import { OAK_PARAMETERS_V1 } from './oak-parameters.js';

/** Shared physical taper used by allometry and cantilever mechanics. */
export const OAK_PHYSICAL_WOOD_TIP_RADIUS_RATIO_V1 =
  OAK_PARAMETERS_V1.mechanics.woodTipRadiusRatio;

export function oakPhysicalWoodVolumeM3V1(
  lengthM: number,
  baseRadiusM: number,
): number | null {
  if (!(lengthM > 0) || !(baseRadiusM > 0)
    || !Number.isFinite(lengthM) || !Number.isFinite(baseRadiusM)) return null;
  const tip = OAK_PHYSICAL_WOOD_TIP_RADIUS_RATIO_V1;
  return Math.PI * baseRadiusM * baseRadiusM * lengthM
    * (1 + tip + tip * tip) / 3;
}

export function oakPhysicalWoodRadiusMForFreshMassV1(
  lengthM: number,
  freshMassKg: number,
): number {
  if (!(lengthM > 0) || !Number.isFinite(lengthM)) {
    throw new Error(
      `Cannot solve physical oak wood radius for length ${String(lengthM)} m; `
      + 'expected a finite positive length.',
    );
  }
  if (!(freshMassKg > 0) || !Number.isFinite(freshMassKg)) {
    throw new Error(
      `Cannot solve physical oak wood radius for fresh mass ${String(freshMassKg)} kg; `
      + 'expected a finite positive mass.',
    );
  }
  const unitVolume = oakPhysicalWoodVolumeM3V1(lengthM, 1)!;
  return Math.sqrt(
    freshMassKg
      / (OAK_PARAMETERS_V1.mechanics.greenWoodDensityKgPerM3 * unitVolume),
  );
}
