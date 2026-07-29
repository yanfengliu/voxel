import { describe, expect, it } from 'vitest';

import { assertPurposeGraphV1, checkPurposeGraphV1 } from './purpose-graph-check.js';
import {
  createScenePurposeGraphsV1,
  scenePurposeGraphV1,
  SCENE_PURPOSE_GRAPH_IDS_V1,
} from './scene-purpose-registry.js';
import { createStudioScenes } from './scenes.js';

/**
 * The gate.
 *
 * Every scene must have a purpose graph and every graph must pass the kernel.
 * A new scene therefore cannot ship until someone has said what it is for, what
 * each authored group does, and what it does not claim — before it is looked at
 * rather than afterwards.
 */

describe('every scene in the catalog', () => {
  const scenes = createStudioScenes();
  const graphs = createScenePurposeGraphsV1();

  it('has a purpose graph', () => {
    const missing = scenes
      .filter((scene) => scenePurposeGraphV1(scene.id, graphs) === undefined)
      .map((scene) => `${scene.id} ('${scene.label}')`);

    expect(
      missing,
      'these scenes have no purpose graph; add one to scene-purpose-registry.ts '
      + 'stating what the scene is for and what it does not claim',
    ).toEqual([]);
  });

  for (const scene of scenes) {
    it(`states a coherent purpose for ${scene.id}`, () => {
      const graph = scenePurposeGraphV1(scene.id, graphs);
      if (graph === undefined) {
        throw new Error(`Scene '${scene.id}' has no purpose graph.`);
      }

      expect(() => { assertPurposeGraphV1(graph); }).not.toThrow();

      const report = checkPurposeGraphV1(graph);
      expect(report.ok).toBe(true);
      expect(report.rootCount, `${scene.id} states at least one need`)
        .toBeGreaterThan(0);
    });
  }

  it('never leaves a graph without an honesty boundary', () => {
    for (const graph of Object.values(graphs)) {
      for (const node of graph.nodes) {
        expect(
          node.honestyBoundary.length,
          `${node.id} says nothing about what it does not claim`,
        ).toBeGreaterThan(20);
      }
    }
  });

  it('keeps every alias pointing at a scene that still exists', () => {
    const ids = new Set(scenes.map((scene) => scene.id));

    for (const sceneId of Object.keys(SCENE_PURPOSE_GRAPH_IDS_V1)) {
      expect(ids.has(sceneId), `alias names missing scene '${sceneId}'`)
        .toBe(true);
    }
  });

  it('has no graph for a scene that was deleted', () => {
    const covered = new Set(scenes.map(
      (scene) => SCENE_PURPOSE_GRAPH_IDS_V1[scene.id] ?? scene.id,
    ));
    const orphaned = Object.keys(graphs).filter((key) => !covered.has(key));

    expect(orphaned, 'these graphs describe scenes that no longer exist')
      .toEqual([]);
  });
});
