import { describe, expect, it } from 'vitest';

import {
  OAK_BROWSER_AMBIENT_BOUNCE_INTENSITY_V1,
  OAK_BROWSER_SKY_FILL_INTENSITY_V1,
  OAK_BROWSER_SUN_INTENSITY_V1,
} from './oak-browser-lighting.js';
import { buildOakSoilVoxelResourcesV1 } from './oak-soil-voxel.js';
import {
  createOakTissueVoxelMaterialsV1,
  OAK_LEAF_VOXEL_MATERIAL_KEY_V1,
  OAK_ROOT_VOXEL_MATERIAL_KEY_V1,
  OAK_WOOD_VOXEL_MATERIAL_KEY_V1,
} from './oak-tissue-voxel-projection.js';

describe('oak leaf material separation', () => {
  it('keeps living leaf tissue less rough than bark, roots and soil', () => {
    const materials = new Map(createOakTissueVoxelMaterialsV1()
      .map((material) => [material.key, material]));
    const leaf = materials.get(OAK_LEAF_VOXEL_MATERIAL_KEY_V1)!;
    const wood = materials.get(OAK_WOOD_VOXEL_MATERIAL_KEY_V1)!;
    const root = materials.get(OAK_ROOT_VOXEL_MATERIAL_KEY_V1)!;
    const soil = buildOakSoilVoxelResourcesV1()[1];
    expect(leaf.roughness).toBeLessThan(wood.roughness);
    expect(leaf.roughness).toBeLessThan(root.roughness);
    expect(leaf.roughness).toBeLessThan(soil.roughness);
    expect(leaf.metalness).toBe(0);
  });

  it('uses a directional key stronger than either broad fill source', () => {
    expect(OAK_BROWSER_AMBIENT_BOUNCE_INTENSITY_V1).toBeLessThanOrEqual(0.25);
    expect(OAK_BROWSER_AMBIENT_BOUNCE_INTENSITY_V1)
      .toBeLessThan(OAK_BROWSER_SKY_FILL_INTENSITY_V1);
    expect(OAK_BROWSER_SKY_FILL_INTENSITY_V1).toBeLessThan(OAK_BROWSER_SUN_INTENSITY_V1);
  });
});
