import { createMachineWorksPurposeGraphV1 } from './machine-works-purpose-graph.js';
import { createRiverfallPurposeGraphV1 } from './riverfall-purpose-graph.js';
import { createWindmillPurposeGraphV1 } from './windmill-purpose-graph.js';
import { createBallDropPurposeGraphV1 } from './scene-purpose-ball-drop.js';
import { createChainPurposeGraphV1 } from './scene-purpose-chain.js';
import {
  createContrastBoardPurposeGraphsV1,
  createGardenPurposeGraphV1,
  createLighting1000PurposeGraphV1,
  createLightingLabPurposeGraphV1,
  createWallStudiesPurposeGraphV1,
} from './scene-purpose-boards.js';
import {
  createDiningPurposeGraphV1,
  createFamilyHomePurposeGraphV1,
  createFurnishedHousePurposeGraphV1,
} from './scene-purpose-rooms.js';
import type { PurposeGraphV1 } from './purpose-graph.js';

/**
 * Every scene's purpose graph, by scene id.
 *
 * This registry is the enforcement point. `scene-purpose-gate.test.ts` walks
 * the live catalog and fails when a scene has no entry here, so a new scene
 * cannot ship without someone stating what it is for and what it does not
 * claim. That is the whole intent: the graph is not documentation written
 * afterwards, it is a condition of the scene existing.
 *
 * Machine Works, Riverfall and Windmill keep their own richer graphs, because
 * their claims are about solved physics rather than about what a viewer sees.
 */

export function createScenePurposeGraphsV1():
Readonly<Record<string, PurposeGraphV1>> {
  const graphs: PurposeGraphV1[] = [
    createDiningPurposeGraphV1(),
    createWallStudiesPurposeGraphV1(),
    createFurnishedHousePurposeGraphV1(),
    createFamilyHomePurposeGraphV1(),
    createGardenPurposeGraphV1(),
    createBallDropPurposeGraphV1(),
    createChainPurposeGraphV1(),
    ...createContrastBoardPurposeGraphsV1(),
    createLightingLabPurposeGraphV1(),
    createLighting1000PurposeGraphV1(),
    createMachineWorksPurposeGraphV1(),
    createRiverfallPurposeGraphV1(),
    createWindmillPurposeGraphV1(),
  ];

  const byId: Record<string, PurposeGraphV1> = {};
  for (const graph of graphs) {
    if (graph.systemId in byId) {
      throw new Error(
        `Two purpose graphs claim system '${graph.systemId}'. Each scene has `
        + 'exactly one graph, so the duplicate has to be merged or renamed.',
      );
    }
    byId[graph.systemId] = graph;
  }
  return byId;
}

/**
 * Scene ids whose graph is keyed by something other than the scene id.
 *
 * Machine Works, Riverfall and Windmill were projected from their consumer
 * fixtures before this registry existed, so their graphs are named for the
 * system rather than for the scene that presents it. The mapping is explicit
 * rather than inferred, so a renamed scene fails loudly.
 */
export const SCENE_PURPOSE_GRAPH_IDS_V1: Readonly<Record<string, string>> =
  Object.freeze({
    'studio:scene:contrast-machines': 'machine-works',
    'studio:scene:riverfall': 'riverfall',
    'studio:scene:windmill-trip-hammer': 'windmill',
  });

/** The graph that covers `sceneId`, or undefined when none does. */
export function scenePurposeGraphV1(
  sceneId: string,
  graphs: Readonly<Record<string, PurposeGraphV1>> = createScenePurposeGraphsV1(),
): PurposeGraphV1 | undefined {
  const key = SCENE_PURPOSE_GRAPH_IDS_V1[sceneId] ?? sceneId;
  return graphs[key];
}
