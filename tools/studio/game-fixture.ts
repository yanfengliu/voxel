import {
  addPaletteColor,
  buildRecipe,
  createEmptyModel,
  mountStudio,
  setMotion,
  setVoxel,
  type PartFragmentV1,
  type PartSettingsV1,
  type PartShelfV1,
  type RecipeV1,
  type StudioCatalogV1,
  type StudioModelV1,
} from './index.js';

/**
 * A Voxel-owned fixture shaped like a game's studio, in the same spirit as the
 * City-shaped render fixture: it proves the mount seam without editing a
 * sibling repository, and it fails loudly if the engine ever needs game
 * knowledge to stand a studio up.
 *
 * The rule it enforces is the import list above. This file may import only
 * from the studio's game-facing surface -- never from `catalog.js`,
 * `parts.js`, or `recipes.js`, which are the *engine's* own content. If a
 * real game would need something this file cannot reach, the surface is
 * incomplete and this fixture stops compiling.
 *
 * "Harbor" is fictional. Its parts, recipes, palettes, and shelf sections are
 * exactly the things a real game owns.
 */

const HARBOR_ROLES = ['empty', 'hull', 'mast', 'trim'] as const;

function intSetting(settings: PartSettingsV1, key: string, fallback: number): number {
  const value = settings[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(64, Math.max(1, Math.round(value)));
}

/**
 * A boat hull: a V-section that widens toward the deck, tapering to a point at
 * the bow, with an open interior behind a one-voxel rim.
 *
 * The open top is what makes it read as a boat rather than a slab. The first
 * version of this part filled the deck solid and rendered as a brick — which
 * the studio showed immediately, and which no amount of reading the code
 * would have.
 */
function hullPart(settings: PartSettingsV1): PartFragmentV1 {
  const sx = intSetting(settings, 'sizeX', 14);
  const sy = intSetting(settings, 'sizeY', 5);
  const sz = intSetting(settings, 'sizeZ', 8);
  const voxels = new Array<number>(sx * sy * sz).fill(0);
  const centre = (sz - 1) / 2;
  const bowStart = Math.floor(sx * 0.6);
  for (let y = 0; y < sy; y += 1) {
    // Widens with height: a cross-section that is narrow at the keel and full
    // at the deck.
    const rise = ((y + 1) / sy) * (sz / 2);
    for (let x = 0; x < sx; x += 1) {
      const bow = x < bowStart ? 0 : ((x - bowStart + 1) / (sx - bowStart)) * (sz / 2 - 0.5);
      const spread = rise - bow;
      if (spread < 0) continue;
      for (let z = 0; z < sz; z += 1) {
        const offset = Math.abs(z - centre);
        if (offset > spread) continue;
        const topLayer = y === sy - 1;
        if (!topLayer) {
          voxels[x + sx * (y + sy * z)] = 1;
          continue;
        }
        // The deck is a rim only, so the hull is open and you can see into it.
        const rim = offset > spread - 1 || x === 0 || x >= sx - 1;
        if (rim) voxels[x + sx * (y + sy * z)] = 3;
      }
    }
  }
  return { size: [sx, sy, sz], roles: ['empty', 'hull', 'mast', 'trim'], voxels };
}

/** A one-voxel mast. The humblest part in the harbor, and the most reused. */
function mastPart(settings: PartSettingsV1): PartFragmentV1 {
  const height = intSetting(settings, 'height', 5);
  return {
    size: [1, height, 1],
    roles: ['empty', 'mast'],
    voxels: new Array<number>(height).fill(1),
  };
}

function createHarborParts(): PartShelfV1 {
  return { hull: hullPart, mast: mastPart };
}

/** A boat, saved as the way it is made: two parts, one hand-placed oar, mirrored. */
function createFishingBoatRecipe(): RecipeV1 {
  return {
    schemaVersion: 'studio.voxel-recipe/1',
    id: 'harbor:fishing-boat',
    label: 'Fishing boat',
    seed: 11,
    // Odd across z so the middle is a real cell: a mast one voxel wide can
    // then sit on the centre line, where mirroring maps it onto itself. On an
    // even width there is no centre cell, and the mirror step quietly gives
    // the boat a second mast -- which watching the construction is exactly
    // how this was caught.
    size: [14, 12, 9],
    roles: [...HARBOR_ROLES],
    palette: [
      { r: 0, g: 0, b: 0 },
      { r: 122, g: 82, b: 52 },
      { r: 208, g: 198, b: 176 },
      { r: 176, g: 96, b: 62 },
    ],
    steps: [
      { kind: 'part', part: 'hull', at: [0, 0, 0], settings: { sizeX: 14, sizeY: 5, sizeZ: 9 } },
      { kind: 'part', part: 'mast', at: [5, 5, 4], settings: { height: 7 } },
      // One oar, placed by hand where no part reaches, then mirrored to the
      // other side: the whole point of keeping raw voxels as a step. It sits
      // a level above the deck, clear of the hull's own rim -- placed level
      // with it, the step landed on cells the hull already filled and added
      // nothing at all.
      { kind: 'voxels', at: [4, 5, 0], size: [4, 1, 1], voxels: [3, 3, 3, 3] },
      { kind: 'mirror', axis: 'z' },
    ],
    motion: {
      periodMs: 2_600,
      phaseRadians: 0,
      translation: [0, 0.35, 0],
      rotationRadians: [0.08, 0, 0.05],
      scale: [0, 0, 0],
    },
  };
}

function createFishingBoat(): StudioModelV1 {
  return buildRecipe(createFishingBoatRecipe(), createHarborParts()).model;
}

/** A crate, authored by hand. Not every model needs a recipe to reach a shelf. */
function createCrate(): StudioModelV1 {
  let model = createEmptyModel({ id: 'harbor:crate', label: 'Crate', size: [5, 5, 5] });
  const wood = addPaletteColor(model, { r: 146, g: 104, b: 64 });
  model = wood.model;
  const band = addPaletteColor(model, { r: 92, g: 82, b: 74 });
  model = band.model;
  for (let x = 0; x < 5; x += 1) {
    for (let y = 0; y < 5; y += 1) {
      for (let z = 0; z < 5; z += 1) {
        const shell = x === 0 || y === 0 || z === 0 || x === 4 || y === 4 || z === 4;
        if (!shell) continue;
        const edge = [x, y, z].filter((axis) => axis === 0 || axis === 4).length >= 2;
        model = setVoxel(model, x, y, z, edge ? band.paletteIndex : wood.paletteIndex);
      }
    }
  }
  return setMotion(model, { periodMs: 0 });
}

/** The harbor's shelf: sections this game names and orders. */
export function createHarborCatalog(): StudioCatalogV1 {
  return {
    sections: [
      {
        name: 'Boats',
        models: [{
          id: 'harbor:fishing-boat',
          label: 'Fishing boat',
          load: createFishingBoat,
          // Saved as the way it is made, so the studio can replay its
          // construction and so improving the hull improves every boat.
          howItsMade: () => ({
            recipe: createFishingBoatRecipe(),
            parts: createHarborParts(),
          }),
        }],
      },
      {
        name: 'Dockside',
        models: [{ id: 'harbor:crate', label: 'Crate', load: createCrate }],
      },
    ],
  };
}

mountStudio({ catalog: createHarborCatalog() });
