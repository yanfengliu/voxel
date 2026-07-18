import type { PartFragmentV1, PartSettingsV1, PartShelfV1 } from './recipe.js';

/**
 * The studio's own parts. Parts are the shapes that repeat — a game's parts
 * live with the game, the way its catalog does — and this studio belongs to
 * the engine, so its shelf holds the proving parts its own models are made
 * from: enough to demonstrate the mechanism and pin it with parity tests,
 * and nothing more. Parts are earned on second use, never invented ahead of
 * need.
 *
 * A part clamps its settings the way edits clamp, so a part cannot be asked
 * into a broken state — validation is for files, construction is for people.
 * Both parts here ignore their seed because neither has a random choice to
 * make; the builder hands one down regardless, so gaining variation later
 * never changes a part's call shape.
 */

const MAX_PART_DIMENSION = 64;

function intSetting(
  settings: PartSettingsV1,
  key: string,
  fallback: number,
): number {
  const value = settings[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(MAX_PART_DIMENSION, Math.max(1, Math.round(value)));
}

function nameSetting(
  settings: PartSettingsV1,
  key: string,
  fallback: string,
): string {
  const value = settings[key];
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}

/**
 * A filled box of one role. The humblest possible part, and the first one two
 * models needed: the starter's body and its cap are both boxes, which is what
 * earned it a place on the shelf.
 */
export function boxPart(settings: PartSettingsV1): PartFragmentV1 {
  const sx = intSetting(settings, 'sizeX', 1);
  const sy = intSetting(settings, 'sizeY', 1);
  const sz = intSetting(settings, 'sizeZ', 1);
  const role = nameSetting(settings, 'role', 'box');
  return {
    size: [sx, sy, sz],
    roles: ['empty', role],
    voxels: new Array<number>(sx * sy * sz).fill(1),
  };
}

/**
 * A brick wall: offset courses, mortar joints, three brick tints chosen by a
 * fixed rule. Extracted from the catalog's brick wall — the pattern below is
 * that model's pattern, cell for cell, and the parity test holds this part to
 * it. It proves that "texture" in this art style is pattern plus variation,
 * and that a pattern worth keeping belongs in a part, not in one model.
 *
 * The tint rule is arithmetic rather than seeded for now; when a wall earns
 * real variation, the seed is already in the part's hands.
 */
export function brickWallPart(settings: PartSettingsV1): PartFragmentV1 {
  const sx = intSetting(settings, 'sizeX', 16);
  const sy = intSetting(settings, 'sizeY', 10);
  const sz = intSetting(settings, 'sizeZ', 2);
  const voxels = new Array<number>(sx * sy * sz).fill(0);
  for (let z = 0; z < sz; z += 1) {
    for (let y = 0; y < sy; y += 1) {
      for (let x = 0; x < sx; x += 1) {
        const mortarRow = y % 3 === 2;
        const offset = Math.floor(y / 3) % 2 === 0 ? 0 : 2;
        const mortarJoint = (x + offset) % 4 === 3;
        const cell = x + sx * (y + sy * z);
        if (mortarRow || mortarJoint) {
          voxels[cell] = 1;
          continue;
        }
        const brick = Math.floor((x + offset) / 4) * 31 + Math.floor(y / 3) * 17;
        voxels[cell] = 2 + (brick % 3);
      }
    }
  }
  return {
    size: [sx, sy, sz],
    roles: ['empty', 'mortar', 'brick-a', 'brick-b', 'brick-c'],
    voxels,
  };
}

/** The shelf the studio builds its own recipes against. */
export function createStudioParts(): PartShelfV1 {
  return {
    box: boxPart,
    'brick-wall': brickWallPart,
  };
}
