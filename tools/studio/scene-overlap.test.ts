import { describe, expect, it } from 'vitest';

import { createStudioCatalog } from './catalog.js';
import { LIVE_PHYSICS_PROFILES_V1 } from './live-physics-profiles.js';
import { sceneOverlapsV1 } from './scene-overlap.js';
import { createStudioScenes } from './scenes.js';
import { catalogPartsV1, catalogRecipesV1 } from './studio-library.js';

/**
 * A scene builder does not reject overlapping placements, so the built-in
 * scenes are pinned clean here: two models may touch but never fill the same
 * world cells, which is what z-fights on screen.
 *
 * Two kinds of placement are exempt for one reason: their presented pose
 * carries a rotation an authored quarter-turn placement cannot express, so
 * judging the authored transform would be judging something nobody sees. A
 * pose-replay track is one; a live-physics profile pose is the other, and the
 * chain is why the distinction matters — its rings clear each other only once
 * each leans along the catenary tangent, and the authored fallback that cannot
 * lean does overlap. Both are judged where they are actually posed:
 * scene-surface-fights.test.ts at recorded poses, and the live-physics browser
 * spec asserts the live chain stays threaded through settling and dragging.
 */
describe('the studio scenes', () => {
  const catalog = createStudioCatalog();
  const recipes = catalogRecipesV1(catalog);
  const parts = catalogPartsV1(catalog);

  for (const scene of createStudioScenes()) {
    const replay = 'poseReplay' in scene
      ? catalog.scenePoseReplays?.[scene.poseReplay.id]
      : undefined;
    const posed = new Set([
      ...(replay?.tracks.map(({ placementId }) => placementId) ?? []),
      ...Object.keys(LIVE_PHYSICS_PROFILES_V1[scene.id]?.poses ?? {}),
    ]);
    const authoredScene = posed.size === 0
      ? scene
      : {
          ...scene,
          placements: scene.placements.filter(({ id }) => !posed.has(id)),
        };
    const scope = posed.size === 0 ? 'placements' : 'placements posed only by the scene';
    it(`${scene.id} ${scope} place no two models in the same space`, () => {
      if ('poseReplay' in scene) {
        expect(replay, `Scene '${scene.id}' must resolve pose replay '${scene.poseReplay.id}'.`)
          .toBeDefined();
      }
      const overlaps = sceneOverlapsV1(authoredScene, recipes, parts);
      expect(overlaps, JSON.stringify(overlaps)).toEqual([]);
    });
  }

  /**
   * Regression: the former cell hash keyed each target cube by its low corner
   * and probed only downward, so a pair meeting across a unit-cell wall on
   * mutually offset grids was reported clean in one argument order — the
   * shallow sink the check exists to catch. These arrangements make the only
   * overlapping cube pair straddle a wall, and pin both placement orders.
   */
  const crossCell = (
    id: string,
    first: readonly [number, number, number],
    second: readonly [number, number, number],
    grain: number,
  ) => sceneOverlapsV1({
    schemaVersion: 'studio.scene/1',
    id: `studio:scene:${id}`,
    label: 'Cross-cell overlap regression',
    placements: [
      { id: 'lower', model: 'studio:lighting-receiver', at: first, grain },
      { id: 'upper', model: 'studio:lighting-receiver', at: second, grain },
    ],
  }, recipes, parts);

  it('catches a shallow overlap that crosses a unit-cell wall, in both placement orders', () => {
    // Centres 0.4 and 1.8 put the sole overlapping cube pair astride x = 1
    // with a 0.10-unit overlap — thinner than the 0.25 grain, so no aligned
    // pair exists to rescue the old scan.
    const forward = crossCell('cross-cell-forward', [0.4, 0, 0], [1.8, 0, 0], 0.25);
    expect(forward).toEqual([{ a: 'lower', b: 'upper', cells: expect.any(Number) as number }]);
    expect(forward[0]!.cells).toBeGreaterThan(0);
    const reversed = crossCell('cross-cell-reversed', [1.8, 0, 0], [0.4, 0, 0], 0.25);
    expect(reversed).toHaveLength(1);
    expect(reversed[0]!.cells).toBeGreaterThan(0);
  });

  it('catches a cross-wall overlap at grain 1, where a whole cube face sinks in', () => {
    // At grain 1 the receiver spans 6 units; centres 0.4 and 6.2 overlap
    // 0.2 units astride x = 3 with no cell-aligned pair.
    const overlaps = crossCell('cross-cell-grain-1', [0.4, 0, 0], [6.2, 0, 0], 1);
    expect(overlaps).toHaveLength(1);
    expect(overlaps[0]!.cells).toBeGreaterThan(0);
  });

  it('still finds overlaps when a giant grain bypasses the cell hash', () => {
    // Grain 8 cubes span more unit cells than the hash enumerates, so the
    // oversized path must scan them directly against the fine-grained side.
    const overlaps = sceneOverlapsV1({
      schemaVersion: 'studio.scene/1',
      id: 'studio:scene:oversized-grain',
      label: 'Oversized grain overlap',
      placements: [
        { id: 'giant', model: 'studio:lighting-receiver', at: [0, 0, 0], grain: 8 },
        { id: 'fine', model: 'studio:lighting-receiver', at: [1, 0, 0], grain: 0.25 },
      ],
    }, recipes, parts);
    expect(overlaps).toHaveLength(1);
    expect(overlaps[0]!.cells).toBeGreaterThan(0);
  });

  it('reports overlapping pairs in scene order while skipping touching and distant receivers', () => {
    const overlaps = sceneOverlapsV1({
      schemaVersion: 'studio.scene/1',
      id: 'studio:scene:overlap-order',
      label: 'Overlap order',
      placements: [
        { id: 'first', model: 'studio:lighting-receiver', at: [0, 0, 0], grain: 0.25 },
        { id: 'distant', model: 'studio:lighting-receiver', at: [20, 0, 0], grain: 0.25 },
        { id: 'second', model: 'studio:lighting-receiver', at: [0, 0, 0], grain: 0.25 },
        // The receiver is 1.5 units wide, so this one only touches first/second.
        { id: 'touching', model: 'studio:lighting-receiver', at: [1.5, 0, 0], grain: 0.25 },
      ],
    }, recipes, parts);

    expect(overlaps).toEqual([{ a: 'first', b: 'second', cells: 24 }]);
  });
});
