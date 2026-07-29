import type { PhysicalAssetBookV1 } from './physical-asset.js';
import {
  createWindmillCompactPhysicalAssetsV1,
  WINDMILL_COMPACT_PHYSICAL_DECLARATION_V1,
} from './windmill-compact-physical-assets.js';
import {
  WINDMILL_COMPACT_SELECTED_CANDIDATE_V1,
} from './windmill-compact-selection.js';
import type { WindmillRecipeIdV1 } from './windmill-layout.js';

export {
  WINDMILL_COMPACT_BODY_DYNAMICS_V1,
  WINDMILL_COMPACT_MATERIAL_PROFILES_V1,
  WINDMILL_COMPACT_PHYSICAL_DECLARATION_V1,
} from './windmill-compact-physical-assets.js';

/**
 * The catalog and consumer fixture compile from this one selected geometry
 * and sidecar declaration. Box keys are the only authored collider identity;
 * numeric collider positions are derived output.
 */
export const WINDMILL_PHYSICAL_ASSET_SET_V1 =
  createWindmillCompactPhysicalAssetsV1(
    WINDMILL_COMPACT_SELECTED_CANDIDATE_V1,
    WINDMILL_COMPACT_PHYSICAL_DECLARATION_V1,
  );

export const WINDMILL_PHYSICAL_ASSETS =
  WINDMILL_PHYSICAL_ASSET_SET_V1.physicalAssets;

export const WINDMILL_COLLIDER_INDEX_BY_BOX_KEY_V1 =
  WINDMILL_PHYSICAL_ASSET_SET_V1.colliderIndexByBoxKey;

export function windmillColliderIndexForBoxKeyV1(
  recipeId: WindmillRecipeIdV1,
  boxKey: string,
): number {
  const index = WINDMILL_COLLIDER_INDEX_BY_BOX_KEY_V1[recipeId][boxKey];
  if (index === undefined) {
    throw new Error(
      `Cannot locate selected windmill collider '${boxKey}' in recipe '${recipeId}'; use an exact box key emitted by the compact geometry compiler.`,
    );
  }
  return index;
}

/** Returns the exact singleton consumed by every Windmill catalog entry. */
export function createWindmillPhysicalBook(): PhysicalAssetBookV1 {
  return WINDMILL_PHYSICAL_ASSET_SET_V1.physicalAssetBook;
}
