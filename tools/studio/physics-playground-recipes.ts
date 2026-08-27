import type { RecipeBookV1, RecipeV1, RecipeStepV1 } from './recipe.js';
import { createTrebuchetRecipesV1 } from './physics-playground-trebuchet.js';
import { createCartRecipesV1 } from './physics-playground-cart-recipes.js';
import {
  PLAYGROUND_MATERIALS_V1,
  type PlaygroundMaterialIdV1,
} from './physics-playground-materials.js';

/**
 * Recipes for the physics playground stations.
 *
 * Every shape here is deliberately plain — slabs, cubes, beams, a sphere,
 * cylinders — because the playground compares solver behaviour, and any
 * decoration would be an uncontrolled variable. Each recipe names the
 * diagnostic it serves in its summary; the station definitions in
 * `physics-playground-stations.ts` say where it goes and what is measured,
 * and the purpose graphs trace each placement to the behaviour under test.
 *
 * Colliders come from each placement's own voxels through
 * `decomposeVoxelsV1`, so the simulated shape is exactly the drawn shape.
 * The one stated exception is the rolling station's "ideal ball" twin,
 * which reuses the voxel sphere recipe but declares a primitive ball
 * collider — the difference between the two is the grid-stepping artifact
 * the station exists to measure.
 */

const STILL = {
  periodMs: 0,
  phaseRadians: 0,
  translation: [0, 0, 0] as const,
  rotationRadians: [0, 0, 0] as const,
  scale: [0, 0, 0] as const,
};

export function materialPalette(material: PlaygroundMaterialIdV1): {
  readonly roles: readonly string[];
  readonly palette: { r: number; g: number; b: number }[];
} {
  const color = PLAYGROUND_MATERIALS_V1[material].color;
  return {
    roles: ['empty', material],
    palette: [{ r: 0, g: 0, b: 0 }, { r: color.r, g: color.g, b: color.b }],
  };
}

export function boxStep(
  at: readonly [number, number, number],
  size: readonly [number, number, number],
  role: string,
  note: string,
): RecipeStepV1 {
  return {
    kind: 'part',
    part: 'box',
    at: [at[0], at[1], at[2]],
    settings: { sizeX: size[0], sizeY: size[1], sizeZ: size[2], role },
    note,
  };
}

export function playgroundRecipe(options: {
  readonly id: string;
  readonly label: string;
  readonly summary: string;
  readonly size: readonly [number, number, number];
  readonly material: PlaygroundMaterialIdV1;
  readonly steps: readonly RecipeStepV1[];
}): RecipeV1 {
  const { roles, palette } = materialPalette(options.material);
  return {
    schemaVersion: 'studio.voxel-recipe/1',
    id: options.id,
    label: options.label,
    summary: options.summary,
    seed: 1,
    size: [options.size[0], options.size[1], options.size[2]],
    roles,
    palette,
    tags: ['physics', 'playground'],
    steps: [...options.steps],
    motion: { ...STILL },
  };
}

/** One flat slab, the ground of every station. Material `deck` multiplies. */
function slabRecipe(
  id: string,
  label: string,
  summary: string,
  size: readonly [number, number, number],
  material: PlaygroundMaterialIdV1,
): RecipeV1 {
  return playgroundRecipe({
    id,
    label,
    summary,
    size,
    material,
    steps: [boxStep([0, 0, 0], size, material, 'Lays the one solid slab')],
  });
}

/** A solid block of one material, the unit of every comparison. */
function blockRecipe(
  id: string,
  label: string,
  summary: string,
  size: readonly [number, number, number],
  material: PlaygroundMaterialIdV1,
): RecipeV1 {
  return playgroundRecipe({
    id,
    label,
    summary,
    size,
    material,
    steps: [boxStep([0, 0, 0], size, material, 'Fills the solid block')],
  });
}

export function createPlaygroundBrickRecipe(): RecipeV1 {
  return blockRecipe(
    'studio:pg-brick',
    'Physics brick',
    'One brick of the target wall. The wall is destructible without any '
      + 'fracture system: it is not one body pretending to break, it is '
      + 'many bodies that were only ever stacked, so a hit scatters them '
      + 'because nothing held them together in the first place. Stone, so '
      + 'a brick outweighs the wood it would be trivial to shove.',
    [4, 2, 1],
    'stone',
  );
}

export function createPlaygroundHalfBrickRecipe(): RecipeV1 {
  return blockRecipe(
    'studio:pg-brick-half',
    'Physics half brick',
    'The closer that ends a staggered course. Without it the end brick of '
      + 'every other course overhangs by half its width, its center of '
      + 'mass sits over the edge of what holds it, and the wall sheds its '
      + 'corners standing still — measured, before any ball arrived.',
    [2, 2, 1],
    'stone',
  );
}

export function createPlaygroundFloorRecipe(): RecipeV1 {
  return slabRecipe(
    'studio:pg-floor',
    'Physics floor',
    'The flat ground of a station. Deck material: its multiply combine rule '
      + 'means every contact reads the touching object\'s own friction and '
      + 'restitution, so material comparisons are undiluted.',
    [48, 1, 48],
    'deck',
  );
}

export function createPlaygroundApronRecipe(): RecipeV1 {
  return slabRecipe(
    'studio:pg-apron',
    'Physics apron',
    'One 16-meter tile of ground. A recipe dimension caps at 64 voxels, so '
      + 'stations that need more run-out than the standard floor lay '
      + 'several: four tile the rolling station, because its smooth ball '
      + 'takes 20.1 meters of flat to stop and its 45-degree track throws '
      + 'its own ball diagonally out of the first two.',
    [64, 1, 64],
    'deck',
  );
}

export function createPlaygroundRampRecipe(): RecipeV1 {
  return slabRecipe(
    'studio:pg-ramp',
    'Physics ramp',
    'The friction ramp. Authored flat; the live world poses it at the '
      + 'selected angle, so the drawn slab and the simulated slab are the '
      + 'same smooth box — a voxel staircase would add fake friction. Five '
      + 'meters wide, so four one-meter blocks fit with clear gaps.',
    [40, 1, 20],
    'deck',
  );
}

export function createPlaygroundTrackRecipe(): RecipeV1 {
  return slabRecipe(
    'studio:pg-track',
    'Rolling track',
    'One rolling slope, wide enough for six racing lanes. The station '
      + 'places two: one with its downhill direction on the voxel grid and '
      + 'one yawed 45 degrees, so grid-direction artifacts show up as '
      + 'behaviour differences between otherwise identical runs.',
    [32, 1, 40],
    'deck',
  );
}

export function createPlaygroundBermRecipe(): RecipeV1 {
  return blockRecipe(
    'studio:pg-berm',
    'Catch berm',
    'The ramp station\'s catch wall, and the last one in the playground. '
      + 'Ice declares friction 0.04 and slides 40.7 meters past the ramp '
      + 'foot on 1.5 meters of floor, so without a wall it goes off the '
      + 'edge and reads as a vanishing-object bug. The rolling station had '
      + 'two of these until rolling resistance became a law and its racers '
      + 'started stopping on their own. Tall enough (1.25 m) that a sliding '
      + 'block cannot ride up and over it.',
    [2, 5, 48],
    'stone',
  );
}

export function createPlaygroundMaterialBlockRecipe(
  material: PlaygroundMaterialIdV1,
): RecipeV1 {
  const label = PLAYGROUND_MATERIALS_V1[material].label;
  return blockRecipe(
    `studio:pg-block-${material}`,
    `${label} block`,
    `A one-meter ${label.toLowerCase()} cube for the ramp and field `
      + 'stations. Same shape as its siblings, so any behaviour difference '
      + 'is the material, not the geometry.',
    [4, 4, 4],
    material,
  );
}

export function createPlaygroundSolidCubeRecipe(): RecipeV1 {
  return blockRecipe(
    'studio:pg-cube-stone-solid',
    'Solid stone cube',
    'The falling station\'s solid reference. Its hollow twin shares the '
      + 'outer size, so the mass readout must differ by exactly the missing '
      + 'interior voxels.',
    [6, 6, 6],
    'stone',
  );
}

export function createPlaygroundHollowCubeRecipe(): RecipeV1 {
  const size = [6, 6, 6] as const;
  const cells: number[] = [];
  for (let z = 0; z < size[2]; z += 1) {
    for (let y = 0; y < size[1]; y += 1) {
      for (let x = 0; x < size[0]; x += 1) {
        const shell = x === 0 || y === 0 || z === 0
          || x === size[0] - 1 || y === size[1] - 1 || z === size[2] - 1;
        cells.push(shell ? 1 : 0);
      }
    }
  }
  const { roles, palette } = materialPalette('stone');
  return {
    schemaVersion: 'studio.voxel-recipe/1',
    id: 'studio:pg-cube-stone-hollow',
    label: 'Hollow stone cube',
    summary: 'The solid cube\'s one-voxel-walled twin. Falls at the same '
      + 'acceleration (gravity is mass-independent) but weighs less, and the '
      + 'debug readout must show both facts.',
    seed: 1,
    size: [size[0], size[1], size[2]],
    roles,
    palette,
    tags: ['physics', 'playground'],
    steps: [{
      kind: 'voxels',
      at: [0, 0, 0],
      size: [size[0], size[1], size[2]],
      voxels: cells,
      note: 'Keeps the one-voxel shell, empties the interior',
    }],
    motion: { ...STILL },
  };
}

export function createPlaygroundWoodCubeRecipe(): RecipeV1 {
  return blockRecipe(
    'studio:pg-cube-wood',
    'Wood cube',
    'The falling station\'s light material contrast: same outer size as the '
      + 'stone cubes, lower density, so equal fall acceleration is tested '
      + 'across a real mass difference.',
    [6, 6, 6],
    'wood',
  );
}

export function createPlaygroundBeamRecipe(): RecipeV1 {
  return blockRecipe(
    'studio:pg-beam',
    'Stone beam',
    'A long thin rectangular beam. Falls flat and must come to rest without '
      + 'rocking apart — the elongated shape stresses resting stability in a '
      + 'way the cubes cannot.',
    [16, 2, 2],
    'stone',
  );
}

/** Squared-integer sphere membership, the same rule the drop ball uses. */
export function sphereCells(diameter: number): number[] {
  const radius = (diameter - 1) / 2;
  const cells: number[] = [];
  for (let z = 0; z < diameter; z += 1) {
    for (let y = 0; y < diameter; y += 1) {
      for (let x = 0; x < diameter; x += 1) {
        const dx = x - radius;
        const dy = y - radius;
        const dz = z - radius;
        cells.push(dx * dx + dy * dy + dz * dz <= radius * radius + 1 ? 1 : 0);
      }
    }
  }
  return cells;
}

export function createPlaygroundSphereRecipe(): RecipeV1 {
  const diameter = 7;
  const { roles, palette } = materialPalette('stone');
  return {
    schemaVersion: 'studio.voxel-recipe/1',
    id: 'studio:pg-sphere',
    label: 'Voxel sphere',
    summary: 'A voxel ball for the rolling station. Placed twice: once with '
      + 'its exact stepped-box colliders and once with a primitive ball '
      + 'collider (a stated simplification) — the behaviour gap between the '
      + 'two is the measured grid-stepping artifact.',
    seed: 1,
    size: [diameter, diameter, diameter],
    roles,
    palette,
    tags: ['physics', 'playground'],
    steps: [{
      kind: 'voxels',
      at: [0, 0, 0],
      size: [diameter, diameter, diameter],
      voxels: sphereCells(diameter),
      note: 'Fills the exact squared-integer sphere',
    }],
    motion: { ...STILL },
  };
}

/** Circle in x-y extruded along z, so the roll axis is the placement's z. */
function cylinderCells(
  diameter: number,
  depth: number,
  innerDiameter: number,
): number[] {
  const radius = (diameter - 1) / 2;
  const innerRadius = innerDiameter > 0 ? (innerDiameter - 1) / 2 : -1;
  const cells: number[] = [];
  for (let z = 0; z < depth; z += 1) {
    for (let y = 0; y < diameter; y += 1) {
      for (let x = 0; x < diameter; x += 1) {
        const dx = x - radius;
        const dy = y - radius;
        const inOuter = dx * dx + dy * dy <= radius * radius + 1;
        const inInner = innerRadius >= 0
          && dx * dx + dy * dy <= innerRadius * innerRadius + 1;
        cells.push(inOuter && !inInner ? 1 : 0);
      }
    }
  }
  return cells;
}

function cylinderRecipe(id: string, label: string, summary: string, inner: number): RecipeV1 {
  const diameter = 7;
  const depth = 6;
  const { roles, palette } = materialPalette('stone');
  return {
    schemaVersion: 'studio.voxel-recipe/1',
    id,
    label,
    summary,
    seed: 1,
    size: [diameter, diameter, depth],
    roles,
    palette,
    tags: ['physics', 'playground'],
    steps: [{
      kind: 'voxels',
      at: [0, 0, 0],
      size: [diameter, diameter, depth],
      voxels: cylinderCells(diameter, depth, inner),
      note: inner > 0
        ? 'Keeps the rim, empties the core'
        : 'Fills the exact squared-integer disc through the depth',
    }],
    motion: { ...STILL },
  };
}

export function createPlaygroundSolidCylinderRecipe(): RecipeV1 {
  return cylinderRecipe(
    'studio:pg-cylinder-solid',
    'Solid cylinder',
    'The rolling station\'s low-inertia roller. Same outer size as the '
      + 'hollow twin; a solid cylinder stores less rotational inertia per '
      + 'mass, so it must reach the bottom first.',
    0,
  );
}

export function createPlaygroundHollowCylinderRecipe(): RecipeV1 {
  return cylinderRecipe(
    'studio:pg-cylinder-hollow',
    'Hollow cylinder',
    'The solid cylinder\'s tube twin. Its mass sits at the rim, so it must '
      + 'roll down the same slope measurably behind the solid one — the '
      + 'classic rotational-inertia race.',
    3,
  );
}

export function createPlaygroundIrregularRecipe(): RecipeV1 {
  return playgroundRecipe({
    id: 'studio:pg-irregular',
    label: 'Irregular chunk',
    summary: 'A deliberately asymmetric body: a base slab with an offset '
      + 'lobe, so the center of mass sits away from the geometric center and '
      + 'tumbling, settling bias, and off-axis rolling become visible.',
    size: [6, 4, 4],
    material: 'stone',
    steps: [
      boxStep([0, 0, 0], [6, 1, 4], 'stone', 'Lays the base slab'),
      boxStep([4, 1, 0], [2, 3, 2], 'stone', 'Raises the offset lobe that shifts the center of mass'),
    ],
  });
}

export function createPlaygroundProjectileRecipe(
  material: PlaygroundMaterialIdV1,
): RecipeV1 {
  const label = PLAYGROUND_MATERIALS_V1[material].label;
  return blockRecipe(
    `studio:pg-projectile-${material}`,
    `${label} projectile`,
    `A ${label.toLowerCase()} cube the launcher fires. Light wood against `
      + 'heavy steel and the reverse make momentum transfer directions '
      + 'obvious; equal pairs test symmetric exchange.',
    [3, 3, 3],
    material,
  );
}

export function createPlaygroundHeavyTargetRecipe(): RecipeV1 {
  return blockRecipe(
    'studio:pg-target-steel',
    'Steel target',
    'The launcher\'s heavy target: a steel cube outweighing the wood '
      + 'projectile roughly a hundred to one (1684.8 vs 16.2 mass units), '
      + 'so a light impact must barely move it.',
    [6, 6, 6],
    'steel',
  );
}

export function createPlaygroundThinWallRecipe(): RecipeV1 {
  return blockRecipe(
    'studio:pg-wall-thin',
    'One-voxel wall',
    'A wall exactly one voxel (0.25 m) thick. A fast projectile crosses '
      + 'that in under one solver step, so this is the tunneling probe: '
      + 'without continuous collision detection it passes through, with it '
      + 'it must stop.',
    [12, 10, 1],
    'stone',
  );
}

export function createPlaygroundStackBlockRecipe(): RecipeV1 {
  return blockRecipe(
    'studio:pg-stack-block',
    'Stack block',
    'The launcher\'s knock-down unit: a half-meter wood cube light enough '
      + 'to scatter, stacked into a pyramid that must stand until hit.',
    [2, 2, 2],
    'wood',
  );
}

export function createPlaygroundPillarRecipe(): RecipeV1 {
  return blockRecipe(
    'studio:pg-pillar',
    'Stone pillar',
    'A structure-station column: tall and narrow, so it carries a lintel '
      + 'honestly and falls honestly when its partner is removed.',
    [2, 8, 2],
    'stone',
  );
}

export function createPlaygroundLintelRecipe(): RecipeV1 {
  return blockRecipe(
    'studio:pg-lintel',
    'Stone lintel',
    'The beam a pillar pair carries: a post-and-lintel "simple arch". A '
      + 'true compression arch of voxel wedges is deferred; this tests '
      + 'support and load transfer, not arch thrust.',
    [10, 2, 2],
    'stone',
  );
}

export function createPlaygroundPlankRecipe(): RecipeV1 {
  return blockRecipe(
    'studio:pg-plank',
    'Wood plank',
    'A thin plank for the supported beam, the cantilever, and the bridge '
      + 'deck. One voxel thick, so load and support arrangement — not bulk — '
      + 'decides whether it stays up.',
    [10, 1, 2],
    'wood',
  );
}

export function createPlaygroundClampJawRecipe(): RecipeV1 {
  return blockRecipe(
    'studio:pg-clamp-jaw',
    'Clamp jaw',
    'One of two fixed jaws that pinch the cantilever plank\'s root. The '
      + 'live lane builds no joints, so "attached at one end" is honest '
      + 'contact clamping: geometry holds the plank, and the hold is only '
      + 'as good as friction and contact make it.',
    [4, 2, 4],
    'stone',
  );
}

export function createPlaygroundWeightRecipe(): RecipeV1 {
  return blockRecipe(
    'studio:pg-weight',
    'Steel weight',
    'The load the structure station drops onto towers, beams, and bridges. '
      + 'Dense and small, so where it lands is unambiguous.',
    [3, 3, 3],
    'steel',
  );
}

export function createPlaygroundTowerBlockRecipe(): RecipeV1 {
  return blockRecipe(
    'studio:pg-tower-block',
    'Tower block',
    'The stacking unit of the structure station\'s tower: uniform cubes '
      + 'whose settled column must neither creep nor explode.',
    [3, 3, 3],
    'stone',
  );
}

export function createPhysicsPlaygroundRecipeBook(): RecipeBookV1 {
  const recipes = [
    ...createTrebuchetRecipesV1(),
    ...createCartRecipesV1(),
    createPlaygroundFloorRecipe(),
    createPlaygroundApronRecipe(),
    createPlaygroundBermRecipe(),
    createPlaygroundBrickRecipe(),
    createPlaygroundHalfBrickRecipe(),
    createPlaygroundRampRecipe(),
    createPlaygroundTrackRecipe(),
    ...(['wood', 'stone', 'steel', 'ice'] as const)
      .map((material) => createPlaygroundMaterialBlockRecipe(material)),
    createPlaygroundSolidCubeRecipe(),
    createPlaygroundHollowCubeRecipe(),
    createPlaygroundWoodCubeRecipe(),
    createPlaygroundBeamRecipe(),
    createPlaygroundSphereRecipe(),
    createPlaygroundSolidCylinderRecipe(),
    createPlaygroundHollowCylinderRecipe(),
    createPlaygroundIrregularRecipe(),
    createPlaygroundProjectileRecipe('wood'),
    createPlaygroundProjectileRecipe('steel'),
    createPlaygroundHeavyTargetRecipe(),
    createPlaygroundThinWallRecipe(),
    createPlaygroundStackBlockRecipe(),
    createPlaygroundPillarRecipe(),
    createPlaygroundLintelRecipe(),
    createPlaygroundPlankRecipe(),
    createPlaygroundClampJawRecipe(),
    createPlaygroundWeightRecipe(),
    createPlaygroundTowerBlockRecipe(),
  ];
  return Object.fromEntries(recipes.map((recipe) => [recipe.id, recipe]));
}
