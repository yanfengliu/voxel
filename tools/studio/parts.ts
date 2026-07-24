import {
  resolvePartSettingsV1,
  type PartDefinitionV1,
  type PartSettingSpecV1,
} from './part-definition.js';
import type { PartFragmentV1, PartShelfV1 } from './recipe.js';

/**
 * The studio's own parts. Parts are the shapes that repeat — a game's parts
 * live with the game, the way its catalog does — and this studio belongs to
 * the engine, so its shelf holds the proving parts its own models are made
 * from: enough to demonstrate the mechanism and pin it with parity tests,
 * and nothing more. Parts are earned on second use, never invented ahead of
 * need.
 *
 * Each is a self-describing definition: a title and summary, a settings schema
 * with bounds and defaults, and named presets, so a human or an agent can find
 * the part and learn how to call it without reading this file. The build reads
 * its inputs *through* the schema (`resolvePartSettingsV1`), so the bounds a
 * caller sees are the bounds the part enforces. Both parts ignore their seed
 * because neither makes a random choice; the builder hands one down regardless,
 * so gaining variation later never changes a part's call shape.
 */

const BOX_SETTINGS: readonly PartSettingSpecV1[] = [
  { key: 'sizeX', label: 'Width', kind: 'int', default: 1 },
  { key: 'sizeY', label: 'Height', kind: 'int', default: 1 },
  { key: 'sizeZ', label: 'Depth', kind: 'int', default: 1 },
  { key: 'role', label: 'Role', kind: 'name', default: 'box', summary: 'The role name every cell paints.' },
];

/**
 * A filled box of one role. The humblest possible part, and the first one two
 * models needed: the starter's body and its cap are both boxes, which is what
 * earned it a place on the shelf.
 */
export const boxPart: PartDefinitionV1 = {
  title: 'Box',
  summary: 'A filled box of one role, at any size — the humblest part there is.',
  category: 'primitives',
  tags: ['box', 'block', 'solid'],
  settings: BOX_SETTINGS,
  presets: [
    { name: 'Cube', summary: 'A single voxel.', settings: {} },
    { name: 'Slab', summary: 'A wide, thin plate.', settings: { sizeX: 6, sizeY: 1, sizeZ: 6 } },
    { name: 'Post', summary: 'A tall, thin column.', settings: { sizeX: 1, sizeY: 6, sizeZ: 1 } },
  ],
  build(settings): PartFragmentV1 {
    const resolved = resolvePartSettingsV1(BOX_SETTINGS, settings);
    const sx = resolved.sizeX as number;
    const sy = resolved.sizeY as number;
    const sz = resolved.sizeZ as number;
    const role = resolved.role as string;
    return {
      size: [sx, sy, sz],
      roles: ['empty', role],
      voxels: new Array<number>(sx * sy * sz).fill(1),
    };
  },
};

const BRICK_COURSE_SETTINGS: readonly PartSettingSpecV1[] = [
  { key: 'length', label: 'Length', kind: 'int', default: 16, summary: 'How many cells wide the course runs.' },
  { key: 'depth', label: 'Depth', kind: 'int', default: 2, summary: 'How many cells thick the wall is.' },
  { key: 'brickLength', label: 'Brick length', kind: 'int', default: 3 },
  { key: 'jointWidth', label: 'Head joint', kind: 'int', default: 1, summary: 'The mortar gap between bricks.' },
  { key: 'rows', label: 'Brick rows', kind: 'int', default: 2, summary: 'How tall the bricks are, before the bed joint.' },
  { key: 'bed', label: 'Bed joint', kind: 'count', default: 1, summary: 'Mortar rows on top; the top course leaves it off.' },
  { key: 'offset', label: 'Bond offset', kind: 'count', default: 0, summary: 'How far this course shifts along its length; half a brick is a running bond, zero a stack bond.' },
  { key: 'course', label: 'Course number', kind: 'count', default: 0, summary: 'Which course this is, counted up; only varies the brick shades.' },
];

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
 * What a part hides is what nobody can learn from -- so a part should be the
 * smallest piece that is still worth naming.
 */
export const brickCoursePart: PartDefinitionV1 = {
  title: 'Brick course',
  summary: 'One horizontal course of bricks with head and bed joints; stack courses into a wall.',
  category: 'masonry',
  tags: ['wall', 'brick', 'course', 'bond'],
  settings: BRICK_COURSE_SETTINGS,
  presets: [
    { name: 'Running bond', summary: 'Each course shifts half a brick.', settings: { offset: 2 } },
    { name: 'Stack bond', summary: 'Every joint lines up.', settings: { offset: 0 } },
    { name: 'Top course', summary: 'No bed joint above.', settings: { bed: 0 } },
  ],
  build(settings): PartFragmentV1 {
    const resolved = resolvePartSettingsV1(BRICK_COURSE_SETTINGS, settings);
    const length = resolved.length as number;
    const depth = resolved.depth as number;
    const brickLength = resolved.brickLength as number;
    const jointWidth = resolved.jointWidth as number;
    const rows = resolved.rows as number;
    const bed = resolved.bed as number;
    const offset = resolved.offset as number;
    const course = resolved.course as number;

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
          // Three shades, chosen by which brick this is and which course it
          // sits in. Arithmetic rather than seeded: the same wall must come
          // back the same way, and a wall's variation is a pattern, not a roll.
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
  },
};

/**
 * A small deterministic generator seeded by one number: same seed, same
 * stream. Parts that vary use it so a variation is a roll of the seed, and the
 * same seed always rebuilds the same thing — which is what lets a scene place
 * randomized copies that still round-trip and rebuild exactly.
 */
function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FOLIAGE_SETTINGS: readonly PartSettingSpecV1[] = [
  { key: 'width', label: 'Width', kind: 'int', default: 7 },
  { key: 'height', label: 'Height', kind: 'int', default: 8 },
  { key: 'depth', label: 'Depth', kind: 'int', default: 7 },
  { key: 'role', label: 'Role', kind: 'name', default: 'leaf' },
];

/**
 * A leafy crown: a rounded mass whose fullness and eroded surface roll from the
 * seed, so every tree that uses it comes out a little different. The first part
 * the studio made that reads its seed — the box and brick course ignore theirs
 * because their whole job is to be exact, but a crown's job is to vary.
 */
export const foliagePart: PartDefinitionV1 = {
  title: 'Foliage',
  summary: 'A rounded leaf crown whose fullness and surface vary with the seed.',
  category: 'plants',
  tags: ['leaf', 'crown', 'tree', 'foliage', 'varies'],
  settings: FOLIAGE_SETTINGS,
  presets: [
    { name: 'Round', summary: 'A full, even crown.', settings: {} },
    { name: 'Tall', summary: 'A taller crown.', settings: { height: 11 } },
  ],
  build(settings, seed): PartFragmentV1 {
    const resolved = resolvePartSettingsV1(FOLIAGE_SETTINGS, settings);
    const width = resolved.width as number;
    const height = resolved.height as number;
    const depth = resolved.depth as number;
    const role = resolved.role as string;
    const random = seededRandom(seed);
    // One roll for the whole crown's fullness, so a tree is fuller or sparser
    // as a whole rather than speckled; then a roll per surface cell erodes it.
    const fullness = 0.82 + random() * 0.3;
    const cx = (width - 1) / 2;
    const cy = (height - 1) / 2;
    const cz = (depth - 1) / 2;
    const rx = Math.max(0.5, width / 2);
    const ry = Math.max(0.5, height / 2);
    const rz = Math.max(0.5, depth / 2);
    const voxels = new Array<number>(width * height * depth).fill(0);
    for (let z = 0; z < depth; z += 1) {
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          const nx = (x - cx) / rx;
          const ny = (y - cy) / ry;
          const nz = (z - cz) / rz;
          const distance = nx * nx + ny * ny + nz * nz;
          let leaf = false;
          if (distance <= 0.68 * fullness) leaf = true;
          else if (distance <= fullness) leaf = random() > 0.42;
          if (leaf) voxels[x + width * (y + height * z)] = 1;
        }
      }
    }
    return { size: [width, height, depth], roles: ['empty', role], voxels };
  },
};

const PICKET_RUN_SETTINGS: readonly PartSettingSpecV1[] = [
  { key: 'length', label: 'Length', kind: 'int', default: 12 },
  { key: 'height', label: 'Height', kind: 'int', default: 5 },
];

/**
 * A run of picket fence — two posts, a top and bottom rail, and pickets — where
 * the seed decides which pickets are missing and which stand a notch shorter,
 * so a fence built from several runs never repeats. Roles are fixed rather than
 * settings: a fence is posts, rails, and pickets, and the recipe colours them.
 */
export const picketRunPart: PartDefinitionV1 = {
  title: 'Picket run',
  summary: 'A length of picket fence with seed-varied missing and shortened pickets.',
  category: 'outdoor',
  tags: ['fence', 'picket', 'yard', 'varies'],
  settings: PICKET_RUN_SETTINGS,
  presets: [
    { name: 'Run', summary: 'A standard length.', settings: {} },
    { name: 'Short', summary: 'A short length.', settings: { length: 8 } },
  ],
  build(settings, seed): PartFragmentV1 {
    const resolved = resolvePartSettingsV1(PICKET_RUN_SETTINGS, settings);
    const length = resolved.length as number;
    const height = resolved.height as number;
    const random = seededRandom(seed);
    const voxels = new Array<number>(length * height).fill(0);
    const set = (x: number, y: number, role: number): void => { voxels[x + length * y] = role; };
    for (let y = 0; y < height; y += 1) {
      set(0, y, 1);
      set(length - 1, y, 1);
    }
    for (let x = 0; x < length; x += 1) {
      if (voxels[x] === 0) set(x, 1, 2);
      if (height > 3 && voxels[x + length * 3] === 0) set(x, 3, 2);
    }
    for (let x = 1; x < length - 1; x += 2) {
      if (random() < 0.16) continue; // a missing picket
      const top = height - 1 - (random() < 0.22 ? 1 : 0); // some stand a notch short
      for (let y = 0; y < top; y += 1) if (voxels[x + length * y] === 0) set(x, y, 3);
    }
    return { size: [length, height, 1], roles: ['empty', 'post', 'rail', 'picket'], voxels };
  },
};

/** The shelf the studio builds its own recipes against. */
export function createStudioParts(): PartShelfV1 {
  return {
    box: boxPart,
    'brick-course': brickCoursePart,
    foliage: foliagePart,
    'picket-run': picketRunPart,
  };
}
