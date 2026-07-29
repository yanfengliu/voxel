import { describe, expect, it } from 'vitest';

import {
  MACHINE_WORKS_LAYOUT,
  MACHINE_WORKS_SUPPORT_ALIGNMENT_RULE,
  machineWorksSupportAlignmentIssuesV1,
} from '../../fixtures/machine-works-consumer/machine-works-fixture-config.js';
import { CURATED_CONTRAST_RECIPES } from './contrast-recipes.js';
import { createContrastScenes } from './contrast-scenes.js';
import {
  MACHINE_WORKS_CONVEYOR_SLAT_IDS,
  MACHINE_WORKS_CONVEYOR_SLAT_PITCH,
  MACHINE_WORKS_CONVEYOR_V1,
  MACHINE_WORKS_EXPOSED_COGS_V1,
} from './machine-works-conveyor.js';
import { MACHINE_WORKS_SCENE_LAYOUT_V1 } from './machine-works-layout.js';
import {
  MACHINE_WORKS_OUTPUT_DOCK_PLACEMENT_ID,
  MACHINE_WORKS_OUTPUT_DOCK_RECIPE_ID,
  MACHINE_WORKS_PRESS_BRIDGE_PLACEMENT_ID,
  MACHINE_WORKS_PRESS_BRIDGE_RECIPE_ID,
} from './machine-works-purpose.js';
import {
  createMachineWorksOutputDockRecipe,
  createMachineWorksPressBridgeRecipe,
} from './machine-works-recipes.js';
import { validateSceneV1 } from './scene.js';

describe('contrast scenes', () => {
  /** However it is phrased, each sheet must deny that its specimens compose one place. */
  const DISCLAIMS_COMPOSITION =
    /not a claim|does not claim|makes no claim|do not form|does not form/;

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
    expect(infrastructure?.summary).toMatch(/contact sheet/);
    expect(infrastructure?.summary).toMatch(DISCLAIMS_COMPOSITION);
    expect(domainScenes.map(({ label }) => label)).toEqual([
      'Infrastructure studies',
      'Civic form studies',
      'Mechanical studies',
      'Organic form studies',
    ]);
    for (const scene of domainScenes) {
      expect(scene.summary, scene.id).toMatch(/contact sheet/);
      expect(scene.summary, scene.id).toMatch(DISCLAIMS_COMPOSITION);
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
      durationMs: 30_000,
    });
    expect(scene.summary).toMatch(/press-bridge feet meet occupied foundation pads/);
    expect(scene.summary).toMatch(/narrowed cream stator keeps at least 0\.4 world units of running clearance inside an orange moving C-yoke/);
    expect(scene.summary).toMatch(/two-voxel key enters empty socket clearance.*cap crown reaches its core seat/);
    expect(scene.summary).toMatch(/software compound weld rather than a solved latch/);
    expect(scene.summary).toMatch(
      /does not simulate charging, a flexible moving cable, electricity, motor torque, or jaw motion/,
    );
    expect(scene.summary).toMatch(
      /face-connected cabinet-to-bus route.*head-local buffer starts precharged/,
    );
    expect(scene.summary).toMatch(
      /carrier trunnion enters two foundation-contacting outboard bearing cradles.*servo coupler/,
    );
    expect(scene.summary).toMatch(/minimal exterior radial flags remain non-interacting phase witnesses/);
    const byId = new Map(scene.placements.map((placement) => [placement.id, placement]));
    expect(scene.placements).toHaveLength(MACHINE_WORKS_CONVEYOR_V1.slatCount + 16);
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
    expect(byId.get(MACHINE_WORKS_PRESS_BRIDGE_PLACEMENT_ID)).toMatchObject({
      model: MACHINE_WORKS_PRESS_BRIDGE_RECIPE_ID,
      at: MACHINE_WORKS_SCENE_LAYOUT_V1.pressBridge.at,
      grain: MACHINE_WORKS_SCENE_LAYOUT_V1.pressBridge.grain,
    });
    expect(byId.get(MACHINE_WORKS_OUTPUT_DOCK_PLACEMENT_ID)).toMatchObject({
      model: MACHINE_WORKS_OUTPUT_DOCK_RECIPE_ID,
      at: MACHINE_WORKS_SCENE_LAYOUT_V1.outputDock.at,
      grain: MACHINE_WORKS_SCENE_LAYOUT_V1.outputDock.grain,
    });
    expect(scene.placements.filter(({ model }) => model.startsWith('studio:contrast:')))
      .toHaveLength(0);
    expect(scene.placements.filter(
      ({ model }) => model === 'studio:machine-works:conveyor-slat',
    )).toHaveLength(MACHINE_WORKS_CONVEYOR_V1.slatCount);
    expect(MACHINE_WORKS_CONVEYOR_SLAT_IDS.every((id) => byId.has(id))).toBe(true);
    expect(byId.get('belt-drive-west')).toMatchObject({
      model: 'studio:machine-works:drive-drum',
      at: MACHINE_WORKS_SCENE_LAYOUT_V1.conveyor.westDrum.at,
    });
    expect(byId.get('belt-drive-east')).toMatchObject({
      model: 'studio:machine-works:drive-drum',
      at: MACHINE_WORKS_SCENE_LAYOUT_V1.conveyor.eastDrum.at,
    });
    expect(scene.placements.filter(
      ({ model }) => model === 'studio:machine-works:drive-cog',
    )).toHaveLength(MACHINE_WORKS_EXPOSED_COGS_V1.length);
    for (const { id, side, z } of MACHINE_WORKS_EXPOSED_COGS_V1) {
      expect(byId.get(id)).toMatchObject({
        model: 'studio:machine-works:drive-cog',
        at: [
          side === 'west'
            ? MACHINE_WORKS_CONVEYOR_V1.leftAxleX
            : MACHINE_WORKS_CONVEYOR_V1.rightAxleX,
          MACHINE_WORKS_CONVEYOR_V1.axleY
            - MACHINE_WORKS_CONVEYOR_V1.drumSizeVoxels[1]
              * MACHINE_WORKS_CONVEYOR_V1.drumGrain / 2,
          z,
        ],
      });
    }
    expect([...byId.keys()]).toEqual(expect.arrayContaining([
      'assembly-foundation',
      MACHINE_WORKS_PRESS_BRIDGE_PLACEMENT_ID,
      MACHINE_WORKS_OUTPUT_DOCK_PLACEMENT_ID,
      'assembly-carriage',
      'core-head',
      'cap-head',
      'product-base',
      'product-core',
      'product-cap',
      'collection-bucket',
    ]));
  });

  it('pins the belt, dynamic carrier, grounded press bridge, and actuator alignment datums into one support chain', () => {
    expect(machineWorksSupportAlignmentIssuesV1()).toEqual([]);
    const layout = MACHINE_WORKS_SCENE_LAYOUT_V1;
    const bridgeRecipe = createMachineWorksPressBridgeRecipe();
    const outputDockRecipe = createMachineWorksOutputDockRecipe();
    expect(bridgeRecipe.size).toEqual(layout.pressBridge.sizeVoxels);
    expect(outputDockRecipe.size).toEqual(layout.outputDock.sizeVoxels);
    expect(bridgeRecipe.steps.slice(0, 2)).toMatchObject([
      {
        kind: 'part',
        part: 'open-frame',
        at: layout.pressBridge.guideTowers.west.atVoxels,
        settings: {
          width: layout.pressBridge.guideTowers.west.sizeVoxels[0],
          height: layout.pressBridge.guideTowers.west.sizeVoxels[1],
          depth: layout.pressBridge.guideTowers.west.sizeVoxels[2],
          thickness: 1,
        },
      },
      {
        kind: 'part',
        part: 'open-frame',
        at: layout.pressBridge.guideTowers.east.atVoxels,
        settings: {
          width: layout.pressBridge.guideTowers.east.sizeVoxels[0],
          height: layout.pressBridge.guideTowers.east.sizeVoxels[1],
          depth: layout.pressBridge.guideTowers.east.sizeVoxels[2],
          thickness: 1,
        },
      },
    ]);
    expect(bridgeRecipe.steps.some((step) =>
      step.kind === 'part' && step.part === 'truss-span')).toBe(false);
    expect(bridgeRecipe.summary).toMatch(/four foundation feet.*linear-stator spines.*empty moving C-yoke cavities/i);
    const foundationTop = layout.foundation.at[1]
      + layout.foundation.sizeVoxels[1] * layout.foundation.grain;
    const foundationRight = layout.foundation.at[0]
      + layout.foundation.sizeVoxels[0] * layout.foundation.grain / 2;
    const bucketLeft = layout.bucket.at[0]
      - layout.bucket.sizeVoxels[0] * layout.bucket.grain / 2;
    expect(layout.pressBridge.guideRails).toEqual({
      coreWest: {
        atVoxels: [4, 0, 0],
        sizeVoxels: [1, 15, 1],
      },
      coreEast: {
        atVoxels: [7, 0, 0],
        sizeVoxels: [1, 15, 1],
      },
      capWest: {
        atVoxels: [17, 0, 0],
        sizeVoxels: [1, 15, 1],
      },
      capEast: {
        atVoxels: [20, 0, 0],
        sizeVoxels: [1, 15, 1],
      },
    });
    const guideChecks = [
      { head: layout.coreHead, shoe: layout.headAlignmentPads.west,
        rail: layout.pressBridge.guideRails.coreWest },
      { head: layout.coreHead, shoe: layout.headAlignmentPads.east,
        rail: layout.pressBridge.guideRails.coreEast },
      { head: layout.capHead, shoe: layout.headAlignmentPads.west,
        rail: layout.pressBridge.guideRails.capWest },
      { head: layout.capHead, shoe: layout.headAlignmentPads.east,
        rail: layout.pressBridge.guideRails.capEast },
    ] as const;
    for (const { head, shoe, rail } of guideChecks) {
      const shoeCenterX = head.at[0]
        + (shoe.atVoxels[0] + shoe.sizeVoxels[0] / 2
          - head.sizeVoxels[0] / 2) * head.grain;
      const railMinX = layout.pressBridge.at[0]
        + (rail.atVoxels[0] - layout.pressBridge.sizeVoxels[0] / 2)
          * layout.pressBridge.grain;
      const railMaxX = railMinX + rail.sizeVoxels[0] * layout.pressBridge.grain;
      expect(shoeCenterX).toBeGreaterThanOrEqual(railMinX);
      expect(shoeCenterX).toBeLessThanOrEqual(railMaxX);
    }
    const bridgeFrontZ = layout.pressBridge.at[2]
      - layout.pressBridge.sizeVoxels[2] * layout.pressBridge.grain / 2;
    const shoeRearZ = layout.coreHead.at[2]
      + (layout.headAlignmentPads.west.atVoxels[2]
        + layout.headAlignmentPads.west.sizeVoxels[2]
        - layout.coreHead.sizeVoxels[2] / 2) * layout.coreHead.grain;

    expect(foundationTop).toBe(layout.pressBridge.at[1]);
    expect(foundationRight).toBeCloseTo(bucketLeft);
    expect(bridgeFrontZ).toBeCloseTo(shoeRearZ, 9);
    expect(MACHINE_WORKS_LAYOUT.capStationX).toBeLessThan(foundationRight);
    expect(MACHINE_WORKS_LAYOUT.tipStationX).toBe(MACHINE_WORKS_CONVEYOR_V1.rightAxleX);
    expect(
      MACHINE_WORKS_LAYOUT.tipStationX + MACHINE_WORKS_LAYOUT.carriageTipPivotLocalX,
    ).toBeCloseTo(layout.outputDock.at[0], 9);
    expect(bucketLeft - layout.outputDock.at[0]).toBeCloseTo(0.2, 9);
    const paintedSlatLength =
      MACHINE_WORKS_CONVEYOR_V1.slatSizeVoxels[0]
        * MACHINE_WORKS_CONVEYOR_V1.slatGrain;
    expect(MACHINE_WORKS_CONVEYOR_SLAT_PITCH - paintedSlatLength)
      .toBeGreaterThanOrEqual(0);
    expect(MACHINE_WORKS_CONVEYOR_SLAT_PITCH - paintedSlatLength)
      .toBeLessThanOrEqual(
        MACHINE_WORKS_SUPPORT_ALIGNMENT_RULE.maximumStraightSlatGap,
      );
    expect(MACHINE_WORKS_LAYOUT.bucketCenterX).toBeGreaterThan(foundationRight);
    expect(layout.pressBridge.staticNonColliding).toBe(true);
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
