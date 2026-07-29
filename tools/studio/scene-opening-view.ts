import {
  fitViewHeight,
  type OrbitCenterV1,
} from './orbit.js';
import {
  placementWorldBoxesV1,
} from './scene-pick.js';
import type {
  PartShelfV1,
  RecipeBookV1,
} from './recipe.js';
import type { SceneV1 } from './scene.js';

export interface SceneOccupiedWorldBoundsV1 {
  readonly min: readonly [number, number, number];
  readonly max: readonly [number, number, number];
}

export interface SceneOpeningViewV1 {
  readonly occupiedBounds: SceneOccupiedWorldBoundsV1 | null;
  readonly center: OrbitCenterV1;
  readonly viewHeight: number;
}

/**
 * Unites the exact occupied placement boxes used by scene picking. Those
 * boxes rebuild each placement with its seed and grain, use occupied voxel
 * bounds rather than declared grid padding, apply quarter-turns, and ground
 * the result with the same base-lift semantics as the scene builder.
 */
export function sceneOccupiedWorldBoundsV1(
  scene: SceneV1,
  recipes: RecipeBookV1,
  parts: PartShelfV1,
): SceneOccupiedWorldBoundsV1 | null {
  const boxes = placementWorldBoxesV1(scene, recipes, parts);
  if (boxes.length === 0) return null;

  const min: [number, number, number] = [
    Number.POSITIVE_INFINITY,
    Number.POSITIVE_INFINITY,
    Number.POSITIVE_INFINITY,
  ];
  const max: [number, number, number] = [
    Number.NEGATIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
  ];
  for (const box of boxes) {
    min[0] = Math.min(min[0], box.min[0]);
    min[1] = Math.min(min[1], box.min[1]);
    min[2] = Math.min(min[2], box.min[2]);
    max[0] = Math.max(max[0], box.max[0]);
    max[1] = Math.max(max[1], box.max[1]);
    max[2] = Math.max(max[2], box.max[2]);
  }
  return { min, max };
}

/**
 * Resolves the catalog's explicit occupied-bounds opening policy around only
 * geometry that can draw. Scenes without that opt-in retain Studio's stable
 * origin-centered framing and do not call this function.
 */
export function sceneOpeningViewV1(
  scene: SceneV1,
  recipes: RecipeBookV1,
  parts: PartShelfV1,
): SceneOpeningViewV1 {
  const occupiedBounds = sceneOccupiedWorldBoundsV1(
    scene,
    recipes,
    parts,
  );
  if (occupiedBounds === null) {
    return {
      occupiedBounds,
      center: [0, 0, 0],
      viewHeight: fitViewHeight([0, 0, 0]),
    };
  }
  const { min, max } = occupiedBounds;
  const size = [
    max[0] - min[0],
    2 * Math.max(Math.abs(min[1]), Math.abs(max[1])),
    max[2] - min[2],
  ] as const;
  return {
    occupiedBounds,
    center: [
      (min[0] + max[0]) / 2,
      0,
      (min[2] + max[2]) / 2,
    ],
    viewHeight: openingViewHeight(size),
  };
}

/**
 * `fitViewHeight` caps at a height that suits Studio's default framing, where
 * an absurd zoom-out would be a mistake. A scene that opts into this policy has
 * already said it wants its own bounds framed, and a long comparison row is
 * wider than that cap allows — so the cap is what would crop the two end
 * specimens off a sheet whose whole job is showing all of them at once. The
 * floor still applies, because a tiny scene should not fill the screen.
 */
function openingViewHeight(
  size: readonly [number, number, number],
): number {
  const diagonal = Math.hypot(size[0], size[1], size[2]);
  return Math.max(fitViewHeight([0, 0, 0]), diagonal * 1.15);
}
