import {
  WINDMILL_COMPACT_SELECTED_CANDIDATE_V1,
} from './windmill-compact-selection.js';
import {
  WINDMILL_GRAIN,
  WINDMILL_SCENE_LAYOUT_V1,
} from './windmill-layout.js';

/**
 * Authored datums for the Windmill production line: the mill building shell,
 * the wheat infeed queue, the anvil-side milling spot, the spent-sack row, and
 * the flour bin. Everything here is additive presentation around the frozen
 * four-body mechanism — nothing in this module feeds the solver, the compact
 * geometry generator, or the frozen selection chain.
 *
 * The scene job: show the whole story — wind turns the rotor, wheat comes in,
 * the recorded hammer-anvil impacts pound it, flour comes out — inside a mill
 * building whose open front corner keeps the interior visible from the
 * default camera. Wheat and flour motion is authored kinematics keyed to the
 * five recorded impacts (see windmill-production-kinematics.ts); it is not
 * simulated milling, grain flow, or contact.
 *
 * Every coordinate below is checked against the frozen candidate's real swept
 * envelopes by `windmill-production-clearance.test.ts`; the derivation helpers
 * for those envelopes live here so the test and any future edit share one
 * source of truth.
 */

export const WINDMILL_PRODUCTION_RECIPE_IDS_V1 = Object.freeze({
  building: 'studio:windmill:mill-building',
  wheatSack: 'studio:windmill:wheat-sack',
  flourBin: 'studio:windmill:flour-bin',
  flourHeap: 'studio:windmill:flour-heap',
} as const);

export type WindmillProductionRecipeIdV1 =
  typeof WINDMILL_PRODUCTION_RECIPE_IDS_V1[
    keyof typeof WINDMILL_PRODUCTION_RECIPE_IDS_V1
  ];

export const WINDMILL_PRODUCTION_PLACEMENT_IDS_V1 = Object.freeze({
  building: 'mill-building',
  flourBin: 'flour-bin',
  wheatSacks: Object.freeze([
    'wheat-sack-1',
    'wheat-sack-2',
    'wheat-sack-3',
    'wheat-sack-4',
    'wheat-sack-5',
  ] as const),
  flourHeap: 'flour-heap',
} as const);

export type WindmillProductionPlacementIdV1 =
  | typeof WINDMILL_PRODUCTION_PLACEMENT_IDS_V1.building
  | typeof WINDMILL_PRODUCTION_PLACEMENT_IDS_V1.flourBin
  | typeof WINDMILL_PRODUCTION_PLACEMENT_IDS_V1.wheatSacks[number]
  | typeof WINDMILL_PRODUCTION_PLACEMENT_IDS_V1.flourHeap;

/** Replay tracks appended after the four recorded bodies, in this order. */
export const WINDMILL_PRODUCTION_TRACK_IDS_V1 = Object.freeze([
  ...WINDMILL_PRODUCTION_PLACEMENT_IDS_V1.wheatSacks,
  WINDMILL_PRODUCTION_PLACEMENT_IDS_V1.flourHeap,
] as const);

/** One building voxel is half a machine voxel: thin walls, same alignment. */
export const WINDMILL_BUILDING_GRAIN = WINDMILL_GRAIN / 2;
/** Sacks and flour are props at a quarter machine grain. */
export const WINDMILL_PROP_GRAIN = WINDMILL_GRAIN / 4;

type Vec3 = readonly [number, number, number];

export interface WindmillProductionBoxV1 {
  readonly boxKey: string;
  /** Recipe-local voxel minimum corner. */
  readonly at: Vec3;
  /** Voxel extent, all components at least 1. */
  readonly size: Vec3;
  readonly role: string;
}

/** A deliberate authored void: negative space with a named job. */
export interface WindmillProductionVoidV1 {
  readonly voidKey: string;
  readonly at: Vec3;
  readonly size: Vec3;
}

export interface WindmillProductionAssetLayoutV1 {
  readonly recipeId: WindmillProductionRecipeIdV1;
  readonly sizeVoxels: Vec3;
  readonly grain: number;
  /** ScenePlacementV1.at — X/Z center of the grid, Y at the standing base. */
  readonly sceneAt: Vec3;
  readonly boxes: readonly WindmillProductionBoxV1[];
  readonly voids: readonly WindmillProductionVoidV1[];
}

function box(
  boxKey: string,
  at: Vec3,
  size: Vec3,
  role: string,
): WindmillProductionBoxV1 {
  return Object.freeze({
    boxKey,
    at: Object.freeze([...at] as const),
    size: Object.freeze([...size] as const),
    role,
  });
}

function anAsset(
  recipeId: WindmillProductionRecipeIdV1,
  sizeVoxels: Vec3,
  grain: number,
  sceneAt: Vec3,
  boxes: readonly WindmillProductionBoxV1[],
  voids: readonly WindmillProductionVoidV1[] = [],
): WindmillProductionAssetLayoutV1 {
  for (const candidate of boxes) {
    for (let axis = 0; axis < 3; axis += 1) {
      const end = candidate.at[axis]! + candidate.size[axis]!;
      if (candidate.at[axis]! < 0 || end > sizeVoxels[axis]!) {
        throw new Error(
          `Cannot lay out windmill production recipe '${recipeId}': box `
          + `'${candidate.boxKey}' spans ${String(candidate.at[axis])}..`
          + `${String(end)} on axis ${String(axis)}, outside grid extent `
          + `${String(sizeVoxels[axis])}.`,
        );
      }
    }
  }
  return Object.freeze({
    recipeId,
    sizeVoxels: Object.freeze([...sizeVoxels] as const),
    grain,
    sceneAt: Object.freeze([...sceneAt] as const),
    boxes: Object.freeze([...boxes]),
    voids: Object.freeze([...voids]),
  });
}

/**
 * The mill building shell: the rotor wall (full-height, carrying the shaft
 * opening and the ground-tie notch), the closed west side wall, four corner
 * posts, and one roof slab. The east side and the south side stay open so the
 * default camera looks straight into the working bay.
 *
 * Grid origin sits at world (-1.125, 0, 0.5625): one half-voxel gap behind
 * the sail sweep plane at z = 0.5, chosen so the sails pass the wall face
 * with visible daylight rather than coincident faces.
 */
const BUILDING_SIZE: Vec3 = [42, 22, 20];
const BUILDING_AT: Vec3 = [1.5, 0, 1.8125];

export const WINDMILL_BUILDING_LAYOUT_V1 = anAsset(
  WINDMILL_PRODUCTION_RECIPE_IDS_V1.building,
  BUILDING_SIZE,
  WINDMILL_BUILDING_GRAIN,
  BUILDING_AT,
  [
    box('building-post-front-left', [0, 0, 0], [2, 21, 2], 'mill-post'),
    box('building-post-front-right', [40, 0, 0], [2, 21, 2], 'mill-post'),
    box('building-post-back-right', [40, 0, 18], [2, 21, 2], 'mill-post'),
    box('building-post-back-left', [0, 0, 18], [2, 21, 2], 'mill-post'),
    box('building-rotor-wall-left-pier', [2, 0, 0], [2, 21, 1], 'mill-wall'),
    box('building-rotor-wall-notch-header', [4, 3, 0], [4, 7, 1], 'mill-wall'),
    box('building-rotor-wall-opening-jamb', [4, 10, 0], [3, 6, 1], 'mill-wall'),
    box('building-rotor-wall-lintel', [4, 16, 0], [9, 5, 1], 'mill-wall'),
    box('building-rotor-wall-sill', [8, 0, 0], [5, 10, 1], 'mill-wall'),
    box('building-rotor-wall-right-pier', [13, 0, 0], [27, 21, 1], 'mill-wall'),
    box('building-side-wall', [0, 0, 2], [1, 21, 16], 'mill-wall'),
    box('building-roof', [0, 21, 0], [42, 1, 20], 'mill-roof'),
  ],
  [
    Object.freeze({
      voidKey: 'building-shaft-opening',
      at: Object.freeze([7, 10, 0] as const),
      size: Object.freeze([6, 6, 1] as const),
    }),
    Object.freeze({
      voidKey: 'building-tie-notch',
      at: Object.freeze([4, 0, 0] as const),
      size: Object.freeze([4, 3, 1] as const),
    }),
  ],
);

/** A plump grain sack: burlap body under a tied neck. */
export const WINDMILL_WHEAT_SACK_LAYOUT_V1 = anAsset(
  WINDMILL_PRODUCTION_RECIPE_IDS_V1.wheatSack,
  [3, 5, 3],
  WINDMILL_PROP_GRAIN,
  // Queue slot of sack 1; sacks 2..5 step 0.3125 further along -X.
  [2.5, 0, 0.875],
  [
    box('sack-body', [0, 0, 0], [3, 4, 3], 'wheat-sack'),
    box('sack-tie', [1, 4, 1], [1, 1, 1], 'sack-tie'),
  ],
);

/** The open-topped flour bin standing against the anvil's east face. */
export const WINDMILL_FLOUR_BIN_LAYOUT_V1 = anAsset(
  WINDMILL_PRODUCTION_RECIPE_IDS_V1.flourBin,
  [5, 3, 5],
  WINDMILL_BUILDING_GRAIN,
  [3.625, 0, 1.625],
  [
    box('bin-floor', [0, 0, 0], [5, 1, 5], 'bin-plank'),
    box('bin-wall-north', [0, 1, 0], [5, 2, 1], 'bin-plank'),
    box('bin-wall-south', [0, 1, 4], [5, 2, 1], 'bin-plank'),
    box('bin-wall-west', [0, 1, 1], [1, 2, 3], 'bin-plank'),
    box('bin-wall-east', [4, 1, 1], [1, 2, 3], 'bin-plank'),
  ],
);

/** The rising flour level inside the bin cavity. */
export const WINDMILL_FLOUR_HEAP_LAYOUT_V1 = anAsset(
  WINDMILL_PRODUCTION_RECIPE_IDS_V1.flourHeap,
  [5, 3, 5],
  WINDMILL_PROP_GRAIN,
  // Standing base rests on the bin floor top face at y = 0.125.
  [3.625, 0.125, 1.625],
  [
    box('flour-level-body', [0, 0, 0], [5, 2, 5], 'flour'),
    box('flour-level-surface', [0, 2, 0], [5, 1, 5], 'flour'),
  ],
);

export const WINDMILL_PRODUCTION_ASSETS_V1 = Object.freeze([
  WINDMILL_BUILDING_LAYOUT_V1,
  WINDMILL_WHEAT_SACK_LAYOUT_V1,
  WINDMILL_FLOUR_BIN_LAYOUT_V1,
  WINDMILL_FLOUR_HEAP_LAYOUT_V1,
]);

/** Queue slot centers for sacks 1..5, nearest-to-staging first. */
export const WINDMILL_WHEAT_QUEUE_XS_V1 = Object.freeze(
  [0, 1, 2, 3, 4].map((index) => 2.5 - 0.3125 * index),
);
export const WINDMILL_WHEAT_QUEUE_Z_V1 = 0.875;
/** The corner where a sack turns from the queue lane into the mill lane. */
export const WINDMILL_STAGING_X_V1 = 2.8125;
/** Anvil-side milling spot: against the anvil's west face, under no swing. */
export const WINDMILL_MILL_SPOT_V1 =
  Object.freeze([2.8125, 1.625] as const);
/** Spent sacks lie in a row behind the milling line, sack 1 farthest west. */
export const WINDMILL_DISCARD_ROW_Z_V1 = 2.03125;
export const WINDMILL_DISCARD_ROW_XS_V1 = Object.freeze(
  [0, 1, 2, 3, 4].map((index) => 1.0625 + 0.375 * index),
);
/** Flour level rise per recorded impact, world units. */
export const WINDMILL_FLOUR_RISE_PER_IMPACT_V1 = 0.0375;

export interface WindmillWorldBoxV1 {
  readonly placementId: string;
  readonly boxKey: string;
  readonly min: Vec3;
  readonly max: Vec3;
}

/** World-unit AABB of one authored box under its asset's scene placement. */
export function windmillProductionWorldBoxesV1(
  asset: WindmillProductionAssetLayoutV1,
  placementId: string,
  sceneAt: Vec3 = asset.sceneAt,
): readonly WindmillWorldBoxV1[] {
  const originX = sceneAt[0] - (asset.sizeVoxels[0] * asset.grain) / 2;
  const originY = sceneAt[1];
  const originZ = sceneAt[2] - (asset.sizeVoxels[2] * asset.grain) / 2;
  return asset.boxes.map((entry) => Object.freeze({
    placementId,
    boxKey: entry.boxKey,
    min: Object.freeze([
      originX + entry.at[0] * asset.grain,
      originY + entry.at[1] * asset.grain,
      originZ + entry.at[2] * asset.grain,
    ] as const),
    max: Object.freeze([
      originX + (entry.at[0] + entry.size[0]) * asset.grain,
      originY + (entry.at[1] + entry.size[1]) * asset.grain,
      originZ + (entry.at[2] + entry.size[2]) * asset.grain,
    ] as const),
  }));
}

export interface WindmillSweptBandV1 {
  readonly boxKey: string;
  /** World Z extent of the band; rotation about the rotor axis preserves it. */
  readonly minZ: number;
  readonly maxZ: number;
  /** Largest corner radius about the rotor axis, world units. */
  readonly radius: number;
}

/**
 * The rotor's swept envelope, derived from the frozen candidate: each rotor
 * box turns about the fixed axis, so it sweeps a cylinder over its own world
 * Z band whose radius is its farthest corner from the axis. The recorded
 * rotor body origin drifts by less than 1e-6 world units, so these analytic
 * bands are the honest moving-clearance authority for static geometry.
 */
export function windmillRotorSweptBandsV1(): readonly WindmillSweptBandV1[] {
  const rotor = WINDMILL_COMPACT_SELECTED_CANDIDATE_V1.assets.rotor;
  const axis = WINDMILL_SCENE_LAYOUT_V1.rotorAxisWorld;
  return Object.freeze(rotor.boxes.map((entry) => {
    const minX = (rotor.worldOriginVoxels[0] + entry.at[0]) * WINDMILL_GRAIN;
    const maxX = minX + entry.size[0] * WINDMILL_GRAIN;
    const minY = (rotor.worldOriginVoxels[1] + entry.at[1]) * WINDMILL_GRAIN;
    const maxY = minY + entry.size[1] * WINDMILL_GRAIN;
    const minZ = (rotor.worldOriginVoxels[2] + entry.at[2]) * WINDMILL_GRAIN;
    const maxZ = minZ + entry.size[2] * WINDMILL_GRAIN;
    const spanX = Math.max(
      Math.abs(minX - axis[0]),
      Math.abs(maxX - axis[0]),
    );
    const spanY = Math.max(
      Math.abs(minY - axis[1]),
      Math.abs(maxY - axis[1]),
    );
    return Object.freeze({
      boxKey: entry.key,
      minZ,
      maxZ,
      radius: Math.sqrt(spanX * spanX + spanY * spanY),
    });
  }));
}

/** Shortest XY distance from the rotor axis to an AABB's XY rectangle. */
export function windmillAxisDistanceXyV1(
  min: Vec3,
  max: Vec3,
): number {
  const axis = WINDMILL_SCENE_LAYOUT_V1.rotorAxisWorld;
  const dx = Math.max(min[0] - axis[0], axis[0] - max[0], 0);
  const dy = Math.max(min[1] - axis[1], axis[1] - max[1], 0);
  return Math.sqrt(dx * dx + dy * dy);
}
