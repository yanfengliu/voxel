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

/**
 * A count that may legitimately be none. Separate from `intSetting`, which
 * floors at one because a size of zero is a mistake -- but a course with no
 * bed joint, or no bond shift, is an ordinary thing to ask for. Sharing the
 * one clamp silently turned "no bed joint" into one, and the top course of
 * every wall grew a row of mortar with nothing bedded on it.
 */
function countSetting(
  settings: PartSettingsV1,
  key: string,
  fallback: number,
): number {
  const value = settings[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(MAX_PART_DIMENSION, Math.max(0, Math.round(value)));
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
 * One course of brickwork: a single horizontal row of bricks with the head
 * joints between them and, usually, the bed joint of mortar above.
 *
 * A course rather than a whole wall, because a course is the unit a wall is
 * actually built from and the unit where every masonry decision lives -- how
 * long a brick is, how thick the joints are, and how far this course is
 * shifted from the one below, which is the entire difference between one bond
 * and another. A wall is then a recipe that stacks courses, so the bond is
 * visible in the recipe and watchable in the studio.
 *
 * The earlier version of this was one `brick-wall` part that generated every
 * course itself. It produced the same wall, but the knowledge was sealed
 * inside a function body: nothing could be varied without editing code, and
 * the construction was a single step with nothing to watch. What a part hides
 * is what nobody can learn from -- so a part should be the smallest piece
 * that is still worth naming.
 */
export function brickCoursePart(settings: PartSettingsV1): PartFragmentV1 {
  const length = intSetting(settings, 'length', 16);
  const depth = intSetting(settings, 'depth', 2);
  const brickLength = intSetting(settings, 'brickLength', 3);
  const jointWidth = intSetting(settings, 'jointWidth', 1);
  const rows = intSetting(settings, 'rows', 2);
  // The bed joint on top. The topmost course of a wall leaves it off, or the
  // wall ends in a row of mortar with nothing bedded on it.
  const bed = countSetting(settings, 'bed', 1);
  // How far this course is shifted along its length. Half a brick makes a
  // running bond; zero makes a stack bond, where every joint lines up.
  const offset = countSetting(settings, 'offset', 0);
  // Which course this is, counted from the bottom. It only varies the brick
  // shades, so courses do not repeat identically up the wall.
  const course = countSetting(settings, 'course', 0);

  const height = rows + bed;
  const period = brickLength + jointWidth;
  const voxels = new Array<number>(length * height * depth).fill(0);
  for (let z = 0; z < depth; z += 1) {
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < length; x += 1) {
        const cell = x + length * (y + height * z);
        const inBed = y >= rows;
        const shifted = x + offset;
        const headJoint = shifted % period >= brickLength;
        if (inBed || headJoint) {
          voxels[cell] = 1;
          continue;
        }
        // Three shades, chosen by which brick this is and which course it sits
        // in. Arithmetic rather than seeded: the same wall must come back the
        // same way, and a wall's variation is a pattern, not a roll.
        const shade = Math.floor(shifted / period) * 31 + course * 17;
        voxels[cell] = 2 + (shade % 3);
      }
    }
  }
  return {
    size: [length, height, depth],
    roles: ['empty', 'mortar', 'brick-a', 'brick-b', 'brick-c'],
    voxels,
  };
}

/** The shelf the studio builds its own recipes against. */
export function createStudioParts(): PartShelfV1 {
  return {
    box: boxPart,
    'brick-course': brickCoursePart,
  };
}
