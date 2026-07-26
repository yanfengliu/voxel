import type { PartSettingsV1, RecipeStepV1 } from './recipe.js';

export function partStepV1(
  part: string,
  at: readonly [number, number, number],
  settings: PartSettingsV1,
  note: string,
  seedSalt?: number,
): RecipeStepV1 {
  return {
    kind: 'part',
    part,
    at: [at[0], at[1], at[2]],
    settings,
    note,
    ...(seedSalt === undefined ? {} : { seedSalt }),
  };
}

export function boxStepV1(
  at: readonly [number, number, number],
  size: readonly [number, number, number],
  role: 'primary' | 'secondary' | 'accent' | 'dark' | 'organic',
  note: string,
): RecipeStepV1 {
  return partStepV1('box', at, {
    sizeX: size[0],
    sizeY: size[1],
    sizeZ: size[2],
    role,
  }, note);
}
