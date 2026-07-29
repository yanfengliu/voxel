import {
  WINDMILL_PRODUCTION_ASSETS_V1,
  WINDMILL_PRODUCTION_RECIPE_IDS_V1,
  type WindmillProductionAssetLayoutV1,
} from './windmill-production-layout.js';
import {
  STUDIO_PHYSICAL_ASSET_SCHEMA_V1,
  validatePhysicalAssetV1,
  type PhysicalAssetBookV1,
  type PhysicalAssetV1,
} from './physical-asset.js';

/**
 * Minimal honest sidecars for the production-line recipes. The building and
 * bin are fixed architecture; the sacks and the flour level are kinematic —
 * their poses come from the authored presentation tracks, never a solver.
 * Every collider mirrors one exact authored box, so the stage's collider
 * outline shows the same units the purpose ledger accounts for. No solver in
 * this repository consumes these; they claim composition, not simulation.
 */

const BODY_TYPES: Readonly<Record<string, 'fixed' | 'kinematic'>> =
  Object.freeze({
    [WINDMILL_PRODUCTION_RECIPE_IDS_V1.building]: 'fixed',
    [WINDMILL_PRODUCTION_RECIPE_IDS_V1.flourBin]: 'fixed',
    [WINDMILL_PRODUCTION_RECIPE_IDS_V1.wheatSack]: 'kinematic',
    [WINDMILL_PRODUCTION_RECIPE_IDS_V1.flourHeap]: 'kinematic',
  });

function sidecarFor(
  asset: WindmillProductionAssetLayoutV1,
): PhysicalAssetV1 {
  const type = BODY_TYPES[asset.recipeId];
  if (type === undefined) {
    throw new Error(
      `Cannot declare windmill production sidecar for '${asset.recipeId}': `
      + 'no body type is declared for it.',
    );
  }
  const bodyKey = `${asset.recipeId.split(':').pop() ?? 'body'}-body`;
  const sidecar: PhysicalAssetV1 = {
    schemaVersion: STUDIO_PHYSICAL_ASSET_SCHEMA_V1,
    recipeId: asset.recipeId,
    bodies: [{
      key: bodyKey,
      type,
      pose: { position: [0, 0, 0] },
    }],
    colliders: asset.boxes.map((box) => ({
      body: bodyKey,
      shape: {
        kind: 'box',
        halfExtents: [
          box.size[0] / 2,
          box.size[1] / 2,
          box.size[2] / 2,
        ],
      },
      pose: {
        position: [
          box.at[0] + box.size[0] / 2,
          box.at[1] + box.size[1] / 2,
          box.at[2] + box.size[2] / 2,
        ],
      },
    })),
    constraints: [],
    ports: [],
  };
  const issues = validatePhysicalAssetV1(sidecar);
  if (issues.length > 0) {
    throw new Error(
      `Windmill production sidecar '${asset.recipeId}' is invalid: `
      + issues.map((issue) => `${issue.path} ${issue.message}`).join('; '),
    );
  }
  return Object.freeze(sidecar);
}

const PRODUCTION_PHYSICAL_BOOK: PhysicalAssetBookV1 = Object.freeze(
  Object.fromEntries(WINDMILL_PRODUCTION_ASSETS_V1.map((asset) =>
    [asset.recipeId, sidecarFor(asset)])),
);

/** Sidecars for the production recipes only, keyed by recipe id. */
export function createWindmillProductionPhysicalBook(): PhysicalAssetBookV1 {
  return PRODUCTION_PHYSICAL_BOOK;
}
