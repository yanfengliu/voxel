import { describe, expect, it } from 'vitest';

import {
  compileWindmillCompactCandidateV1,
} from '../../fixtures/windmill-consumer/windmill-compact-physical.js';
import {
  WINDMILL_COMPACT_PHYSICAL_DECLARATION_V1 as
    FIXTURE_PHYSICAL_DECLARATION,
  WINDMILL_MATERIAL_PROFILES_V1 as FIXTURE_MATERIAL_PROFILES,
} from '../../fixtures/windmill-consumer/windmill-operational-inputs.js';
import {
  WINDMILL_COMPACT_MATERIAL_PROFILES_V1,
  WINDMILL_COMPACT_PHYSICAL_DECLARATION_V1,
} from './windmill-compact-physical-assets.js';
import {
  WINDMILL_COMPACT_SELECTED_CANDIDATE_V1,
} from './windmill-compact-selection.js';
import {
  WINDMILL_RECIPE_IDS_V1,
} from './windmill-layout.js';
import {
  createWindmillPhysicalBook,
  WINDMILL_COLLIDER_INDEX_BY_BOX_KEY_V1,
  WINDMILL_PHYSICAL_ASSET_SET_V1,
  windmillColliderIndexForBoxKeyV1,
} from './windmill-physical-assets.js';
import { validatePhysicalAssetV1 } from './physical-asset.js';

const ASSET_KEYS = ['frame', 'rotor', 'hammer', 'anvil'] as const;

describe('selected windmill physical sidecars', () => {
  it('shares one declaration object with the consumer fixture', () => {
    expect(FIXTURE_PHYSICAL_DECLARATION)
      .toBe(WINDMILL_COMPACT_PHYSICAL_DECLARATION_V1);
    expect(FIXTURE_MATERIAL_PROFILES)
      .toBe(WINDMILL_COMPACT_MATERIAL_PROFILES_V1);
    expect(FIXTURE_PHYSICAL_DECLARATION.materialProfiles)
      .toBe(FIXTURE_MATERIAL_PROFILES);
  });

  it('gives the catalog one frozen selected sidecar book', () => {
    const first = createWindmillPhysicalBook();
    const second = createWindmillPhysicalBook();
    expect(first).toBe(second);
    expect(first).toBe(WINDMILL_PHYSICAL_ASSET_SET_V1.physicalAssetBook);
    expect(WINDMILL_PHYSICAL_ASSET_SET_V1.parameterKey)
      .toBe(WINDMILL_COMPACT_SELECTED_CANDIDATE_V1.parameterKey);
    expect(WINDMILL_PHYSICAL_ASSET_SET_V1.candidateGeometryFingerprint)
      .toBe(WINDMILL_COMPACT_SELECTED_CANDIDATE_V1.geometryFingerprint);
  });

  it('maps every exact visible box to one exact valid collider by box key', () => {
    const book = createWindmillPhysicalBook();
    for (const assetKey of ASSET_KEYS) {
      const geometry = WINDMILL_COMPACT_SELECTED_CANDIDATE_V1.assets[assetKey];
      const recipeId = WINDMILL_RECIPE_IDS_V1[assetKey];
      const physical = book[recipeId]!;
      expect(validatePhysicalAssetV1(physical), recipeId).toEqual([]);
      expect(physical.colliders).toHaveLength(geometry.boxes.length);
      expect(Object.keys(WINDMILL_COLLIDER_INDEX_BY_BOX_KEY_V1[recipeId]))
        .toEqual(geometry.boxes.map((box) => box.key));
      for (const box of geometry.boxes) {
        const index = windmillColliderIndexForBoxKeyV1(recipeId, box.key);
        const collider = physical.colliders[index]!;
        expect(collider.shape.kind, box.key).toBe('box');
        if (collider.shape.kind !== 'box') {
          throw new Error(
            `Selected windmill box '${box.key}' compiled to '${collider.shape.kind}', expected 'box'.`,
          );
        }
        expect(collider.shape.halfExtents, box.key).toEqual(
          box.size.map((extent) => extent / 2),
        );
        expect(collider.body, box.key).toBe(geometry.bodyKey);
      }
    }
  });

  it('matches the selected consumer compilation without proxy geometry', () => {
    const compiled = compileWindmillCompactCandidateV1(
      WINDMILL_COMPACT_SELECTED_CANDIDATE_V1,
    );
    for (const assetKey of ASSET_KEYS) {
      const recipeId = WINDMILL_RECIPE_IDS_V1[assetKey];
      expect(compiled.physicalAssets[assetKey])
        .toEqual(createWindmillPhysicalBook()[recipeId]);
      expect(compiled.boxColliderIndices[assetKey])
        .toEqual(WINDMILL_COLLIDER_INDEX_BY_BOX_KEY_V1[recipeId]);
    }
  });

  it('has no legacy counterweight or numeric authored-index surface', () => {
    expect(JSON.stringify(WINDMILL_PHYSICAL_ASSET_SET_V1))
      .not.toContain('counterweight');
    expect(() => windmillColliderIndexForBoxKeyV1(
      WINDMILL_RECIPE_IDS_V1.rotor,
      'box-7',
    )).toThrow(/exact box key/);
  });
});
