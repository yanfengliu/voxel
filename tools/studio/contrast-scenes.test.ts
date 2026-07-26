import { describe, expect, it } from 'vitest';

import {
  MACHINE_WORKS_LAYOUT,
  machineWorksSupportAlignmentIssuesV1,
} from '../../fixtures/machine-works-consumer/machine-works-fixture-config.js';
import { CURATED_CONTRAST_RECIPES } from './contrast-recipes.js';
import { createContrastScenes } from './contrast-scenes.js';
import { MACHINE_WORKS_SCENE_LAYOUT_V1 } from './machine-works-layout.js';
import { validateSceneV1 } from './scene.js';

describe('contrast scenes', () => {
  it('keeps four honest domain contact sheets plus one valid process scene', () => {
    const scenes = createContrastScenes();
    expect(scenes).toHaveLength(5);
    for (const scene of scenes) expect(validateSceneV1(scene), scene.id).toEqual([]);

    const domainScenes = scenes.filter((scene) => scene.schemaVersion !== 'studio.scene/4');
    expect(domainScenes).toHaveLength(4);
    const placed = domainScenes.flatMap((scene) => scene.placements.map(({ model }) => model));
    const promoted = CURATED_CONTRAST_RECIPES.map(({ recipe }) => recipe.id);
    const promotedPlacements = placed.filter((model) => model.startsWith('studio:contrast:'));
    expect(new Set(promotedPlacements).size).toBe(promotedPlacements.length);
    expect([...promotedPlacements].sort()).toEqual([...promoted].sort());
    expect(domainScenes.every(({ summary }) => summary?.includes('contact sheet'))).toBe(true);
    expect(domainScenes.find(({ id }) => id === 'studio:scene:contrast-mechanical-studies')?.summary)
      .toMatch(/contact sheet, not a claim/);
    const infrastructure = domainScenes.find(
      ({ id }) => id === 'studio:scene:contrast-infrastructure',
    );
    expect(infrastructure?.label).toBe('Infrastructure studies');
    expect(infrastructure?.summary).toMatch(/contact sheet.*not a claim/);
    expect(domainScenes.map(({ label }) => label)).toEqual([
      'Infrastructure studies',
      'Civic form studies',
      'Mechanical studies',
      'Organic form studies',
    ]);
    for (const scene of domainScenes) {
      expect(scene.summary, scene.id).toMatch(/contact sheet/);
      expect(scene.summary, scene.id).toMatch(/not a claim|does not claim|do not form/);
    }
  });

  it('turns Machine Works into one explicit assembly relationship graph', () => {
    const scene = createContrastScenes().find(({ id }) => id === 'studio:scene:contrast-machines');
    expect(scene?.schemaVersion).toBe('studio.scene/4');
    if (scene?.schemaVersion !== 'studio.scene/4') {
      throw new Error('Machine Works must carry its consumer pose replay.');
    }
    expect(scene.poseReplay).toEqual({
      id: 'studio:pose-replay:machine-works',
      durationMs: 18_000,
    });
    const byId = new Map(scene.placements.map((placement) => [placement.id, placement]));
    expect(byId.get('core-head')?.at[0]).toBe(byId.get('product-core')?.at[0]);
    expect(byId.get('cap-head')?.at[0]).toBe(byId.get('product-cap')?.at[0]);
    expect(byId.get('collection-bucket')?.at).toEqual([32.5, 0, 0]);
    expect(byId.get('assembly-carriage')?.at[1]).toBeGreaterThan(
      byId.get('assembly-foundation')?.at[1] ?? Infinity,
    );
    expect(byId.get('assembly-foundation')).toMatchObject({
      at: MACHINE_WORKS_SCENE_LAYOUT_V1.foundation.at,
      grain: MACHINE_WORKS_SCENE_LAYOUT_V1.foundation.grain,
    });
    expect(byId.get('assembly-gantry')).toMatchObject({
      model: 'studio:contrast:shipyard-gantry',
      at: MACHINE_WORKS_SCENE_LAYOUT_V1.gantry.at,
      grain: MACHINE_WORKS_SCENE_LAYOUT_V1.gantry.grain,
    });
    expect(scene.placements.filter(({ model }) => model.startsWith('studio:contrast:')))
      .toHaveLength(1);
    expect([...byId.keys()]).toEqual(expect.arrayContaining([
      'assembly-foundation',
      'assembly-gantry',
      'assembly-carriage',
      'core-head',
      'cap-head',
      'product-base',
      'product-core',
      'product-cap',
      'collection-bucket',
    ]));
  });

  it('pins the rail, carriage, gantry, and continuous head guides into one support chain', () => {
    expect(machineWorksSupportAlignmentIssuesV1()).toEqual([]);
    const layout = MACHINE_WORKS_SCENE_LAYOUT_V1;
    const gantryRecipe = CURATED_CONTRAST_RECIPES.find(
      ({ recipe }) => recipe.id === 'studio:contrast:shipyard-gantry',
    )?.recipe;
    expect(gantryRecipe?.size).toEqual(layout.gantry.sizeVoxels);
    expect(gantryRecipe?.steps.slice(0, 3)).toMatchObject([
      {
        kind: 'part',
        part: 'open-frame',
        at: layout.gantry.guideTowers.west.atVoxels,
        settings: {
          width: layout.gantry.guideTowers.west.sizeVoxels[0],
          height: layout.gantry.guideTowers.west.sizeVoxels[1],
          depth: layout.gantry.guideTowers.west.sizeVoxels[2],
          thickness: 1,
        },
      },
      {
        kind: 'part',
        part: 'open-frame',
        at: layout.gantry.guideTowers.east.atVoxels,
        settings: {
          width: layout.gantry.guideTowers.east.sizeVoxels[0],
          height: layout.gantry.guideTowers.east.sizeVoxels[1],
          depth: layout.gantry.guideTowers.east.sizeVoxels[2],
          thickness: 1,
        },
      },
      {
        kind: 'part',
        part: 'truss-span',
        at: layout.gantry.lowerChord.atVoxels,
        settings: {
          length: layout.gantry.lowerChord.sizeVoxels[0],
          depth: layout.gantry.lowerChord.sizeVoxels[2],
        },
      },
    ]);
    const foundationTop = layout.foundation.at[1]
      + layout.foundation.sizeVoxels[1] * layout.foundation.grain;
    const foundationRight = layout.foundation.at[0]
      + layout.foundation.sizeVoxels[0] * layout.foundation.grain / 2;
    const bucketLeft = layout.bucket.at[0]
      - layout.bucket.sizeVoxels[0] * layout.bucket.grain / 2;
    expect(layout.gantry.guideRails).toEqual({
      west: {
        atVoxels: [4, 0, 0],
        sizeVoxels: [1, 15, 1],
      },
      east: {
        atVoxels: [20, 0, 0],
        sizeVoxels: [1, 15, 1],
      },
    });
    const westRailMinX = layout.gantry.at[0]
      + (layout.gantry.guideRails.west.atVoxels[0]
        - layout.gantry.sizeVoxels[0] / 2) * layout.gantry.grain;
    const westRailMaxX = westRailMinX
      + layout.gantry.guideRails.west.sizeVoxels[0] * layout.gantry.grain;
    const eastRailMinX = layout.gantry.at[0]
      + (layout.gantry.guideRails.east.atVoxels[0]
        - layout.gantry.sizeVoxels[0] / 2) * layout.gantry.grain;
    const eastRailMaxX = eastRailMinX
      + layout.gantry.guideRails.east.sizeVoxels[0] * layout.gantry.grain;
    const coreShoeCenterX = layout.coreHead.at[0]
      + (layout.headGuideShoes.west.atVoxels[0]
        + layout.headGuideShoes.west.sizeVoxels[0] / 2
        - layout.coreHead.sizeVoxels[0] / 2) * layout.coreHead.grain;
    const capShoeCenterX = layout.capHead.at[0]
      + (layout.headGuideShoes.east.atVoxels[0]
        + layout.headGuideShoes.east.sizeVoxels[0] / 2
        - layout.capHead.sizeVoxels[0] / 2) * layout.capHead.grain;
    const gantryFrontZ = layout.gantry.at[2]
      - layout.gantry.sizeVoxels[2] * layout.gantry.grain / 2;
    const shoeRearZ = layout.coreHead.at[2]
      + (layout.headGuideShoes.west.atVoxels[2]
        + layout.headGuideShoes.west.sizeVoxels[2]
        - layout.coreHead.sizeVoxels[2] / 2) * layout.coreHead.grain;

    expect(foundationTop).toBe(layout.gantry.at[1]);
    expect(foundationRight).toBeCloseTo(bucketLeft);
    expect(coreShoeCenterX).toBeGreaterThanOrEqual(westRailMinX);
    expect(coreShoeCenterX).toBeLessThanOrEqual(westRailMaxX);
    expect(capShoeCenterX).toBeGreaterThanOrEqual(eastRailMinX);
    expect(capShoeCenterX).toBeLessThanOrEqual(eastRailMaxX);
    expect(gantryFrontZ).toBeCloseTo(shoeRearZ, 9);
    expect(MACHINE_WORKS_LAYOUT.capStationX).toBeLessThan(foundationRight);
    expect(MACHINE_WORKS_LAYOUT.bucketCenterX).toBeGreaterThan(foundationRight);
    expect(layout.gantry.staticNonColliding).toBe(true);
  });

  it('gives semantic motion to three contact sheets and the consumer replay scene', () => {
    const motionByRecipe = new Map(CURATED_CONTRAST_RECIPES.map(({ recipe }) => [
      recipe.id,
      recipe.motion.periodMs > 0,
    ]));
    const movingSceneIds = createContrastScenes()
      .filter((scene) =>
        scene.schemaVersion === 'studio.scene/4'
        || scene.placements.some(({ model }) => motionByRecipe.get(model)))
      .map(({ id }) => id);
    expect(movingSceneIds).toEqual([
      'studio:scene:contrast-civic',
      'studio:scene:contrast-mechanical-studies',
      'studio:scene:contrast-organic',
      'studio:scene:contrast-machines',
    ]);
  });
});
