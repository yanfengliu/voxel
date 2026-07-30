import { describe, expect, it } from 'vitest';

import { createStudioCatalog } from './catalog.js';
import { setVoxelSize } from './edit.js';
import { modelVoxelSizeV1 } from './model.js';
import { buildRecipe } from './recipe.js';
import { placementVoxelsV1 } from './scene-overlap.js';
import {
  STUDIO_SCENE_POSE_REPLAY_SCHEMA_V1,
  type ScenePoseReplayV1,
} from './scene-pose-replay.js';
import { sceneSurfaceFightsV1 } from './scene-surface-fights.js';
import { createStudioScenes } from './scenes.js';
import { catalogPartsV1, catalogRecipesV1 } from './studio-library.js';
import type { SceneV1 } from './scene.js';

/**
 * sceneOverlapsV1 deliberately leaves replay-driven placements unjudged, and
 * that gap is where the owner twice saw moving and still surfaces compete for
 * visibility. This pins the rule that closes it: a replay-driven surface may
 * rest flush against still scenery, but may never lie on the same plane facing
 * the same way over the same area — that exact geometry is what flickers.
 */
describe('scene surface fights', () => {
  const catalog = createStudioCatalog();
  const recipes = catalogRecipesV1(catalog);
  const parts = catalogPartsV1(catalog);
  const RECEIVER = 'studio:lighting-receiver';
  const GRAIN = 0.25;

  const probeScene: SceneV1 = {
    schemaVersion: 'studio.scene/1',
    id: 'studio:scene:surface-fight-probe',
    label: 'Surface fight probe',
    placements: [
      { id: 'still', model: RECEIVER, at: [0, 0, 0], grain: GRAIN },
      { id: 'moving', model: RECEIVER, at: [30, 0, 0], grain: GRAIN },
    ],
  };

  const receiverModel = (() => {
    const recipe = recipes[RECEIVER];
    if (!recipe) throw new Error(`No model in the book is called '${RECEIVER}'.`);
    const built = buildRecipe(recipe, parts, recipes).model;
    return modelVoxelSizeV1(built) === GRAIN ? built : setVoxelSize(built, GRAIN);
  })();
  const stillBoxes = placementVoxelsV1(probeScene.placements[0]!, receiverModel, GRAIN);
  const minY = Math.min(...stillBoxes.map((box) => box.y));
  const topPlane = Math.max(...stillBoxes.map((box) => box.y + box.size));
  const height = topPlane - minY;
  const minX = Math.min(...stillBoxes.map((box) => box.x));
  const maxX = Math.max(...stillBoxes.map((box) => box.x + box.size));
  /** A lattice-aligned sideways step of about half the body, so tops overlap. */
  const sideStep = Math.max(GRAIN, Math.round((maxX - minX) / 2 / GRAIN) * GRAIN);
  /** The instance-origin pose that reproduces the authored 'still' placement. */
  const authoredCenter: readonly [number, number, number] = [0, (minY + topPlane) / 2, 0];

  const replayFor = (
    translation: readonly [number, number, number],
    tilt = false,
  ): ScenePoseReplayV1 => {
    const half = Math.sin(Math.PI / 36);
    const quaternion = tilt
      ? [0, 0, half, Math.cos(Math.PI / 36)] as const
      : [0, 0, 0, 1] as const;
    return {
      schemaVersion: STUDIO_SCENE_POSE_REPLAY_SCHEMA_V1,
      sceneId: probeScene.id,
      frameCount: 2,
      provenance: {
        solver: { name: 'test-recorder', version: '1.0.0' },
        fixedTimestepMs: 100,
        gravity: [0, -9.81, 0],
        inputHash: `sha256:${'a'.repeat(64)}`,
        finalHash: `sha256:${'b'.repeat(64)}`,
        lawLabels: ['authored-hold'],
        capabilityLabels: ['surface-fight-probe'],
      },
      tracks: [{
        placementId: 'moving',
        translations: new Float32Array([...translation, ...translation]),
        quaternions: new Float32Array([...quaternion, ...quaternion]),
        linearVelocities: new Float32Array(6),
        angularVelocities: new Float32Array(6),
      }],
      events: [],
    };
  };

  it('reports a moving surface that lands on a still plane facing the same way', () => {
    const replay = replayFor([authoredCenter[0] + sideStep, authoredCenter[1], authoredCenter[2]]);
    const report = sceneSurfaceFightsV1(probeScene, replay, recipes, parts);
    const topFight = report.fights.find((fight) =>
      fight.moving === 'moving' && fight.still === 'still'
      && fight.axis === 'y' && fight.facing === 1
      && Math.abs(fight.plane - topPlane) < 1e-6);
    expect(topFight, JSON.stringify(report.fights)).toBeDefined();
    expect(topFight!.facePairs).toBeGreaterThan(0);
    expect(topFight!.firstTimeMs).toBe(0);
  });

  it('keeps flush resting contact allowed: touch is not co-existence', () => {
    const replay = replayFor([authoredCenter[0], authoredCenter[1] + height, authoredCenter[2]]);
    const report = sceneSurfaceFightsV1(probeScene, replay, recipes, parts);
    expect(report.fights, JSON.stringify(report.fights)).toEqual([]);
    expect(report.overlaps, JSON.stringify(report.overlaps)).toEqual([]);
    expect(report.unchecked).toEqual([]);
  });

  it('reports a moving body inside a still body even when nothing flickers', () => {
    // Shifted off every quarter-unit lattice on all three axes, so no face
    // planes coincide — the bodies simply co-exist, which real objects never do.
    const replay = replayFor([
      authoredCenter[0] + sideStep - 0.13,
      authoredCenter[1] + 0.11,
      authoredCenter[2] + 0.07,
    ]);
    const report = sceneSurfaceFightsV1(probeScene, replay, recipes, parts);
    expect(report.fights, JSON.stringify(report.fights)).toEqual([]);
    expect(report.overlaps, JSON.stringify(report.overlaps)).toHaveLength(1);
    expect(report.overlaps[0]).toMatchObject({ moving: 'moving', still: 'still' });
    expect(report.overlaps[0]!.deepest).toBeGreaterThan(0.05);
    expect(report.overlaps[0]!.firstTimeMs).toBe(0);
  });

  it('judges a tilted pose for space even though its faces cannot hold a plane', () => {
    const replay = replayFor(
      [authoredCenter[0] + sideStep, authoredCenter[1], authoredCenter[2]],
      true,
    );
    const report = sceneSurfaceFightsV1(probeScene, replay, recipes, parts);
    // No plane can be shared by a tilted face, and the report says why the
    // plane check skipped the pose — but the body half-inside the still one
    // is still found by the exact box test.
    expect(report.fights).toEqual([]);
    expect(report.unchecked).toHaveLength(1);
    expect(report.unchecked[0]).toMatchObject({ placementId: 'moving' });
    expect(report.unchecked[0]!.sampledTimes).toBeGreaterThan(0);
    expect(report.unchecked[0]!.reason).toContain('space is still checked');
    expect(report.overlaps, JSON.stringify(report.overlaps)).toHaveLength(1);
    expect(report.overlaps[0]).toMatchObject({ moving: 'moving', still: 'still' });
    expect(report.overlaps[0]!.deepest).toBeGreaterThan(0.05);
  });

  it('a tilted pose standing clear of everything reports nothing', () => {
    const replay = replayFor(
      [authoredCenter[0] + 3 * (maxX - minX), authoredCenter[1], authoredCenter[2]],
      true,
    );
    const report = sceneSurfaceFightsV1(probeScene, replay, recipes, parts);
    expect(report.fights).toEqual([]);
    expect(report.overlaps, JSON.stringify(report.overlaps)).toEqual([]);
    expect(report.unchecked).toHaveLength(1);
  });

  /**
   * The owner's rule includes recorded poses on both sides of a pair: a trace
   * that drives two placements through each other, or lays two recorded faces
   * on one plane facing the same way, is as broken as a placement parked
   * inside the scenery. These pin the moving-vs-moving lane both ways —
   * findings where the rule is broken, silence where contact is flush.
   */
  const pairScene: SceneV1 = {
    schemaVersion: 'studio.scene/1',
    id: 'studio:scene:moving-pair-probe',
    label: 'Moving pair probe',
    placements: [
      { id: 'still', model: RECEIVER, at: [0, 0, 0], grain: GRAIN },
      { id: 'mover-a', model: RECEIVER, at: [30, 0, 0], grain: GRAIN },
      { id: 'mover-b', model: RECEIVER, at: [60, 0, 0], grain: GRAIN },
    ],
  };
  /** A pose base far from the still body, so only the pair is judged. */
  const pairBase: readonly [number, number, number] = [10, authoredCenter[1], 0];

  const pairReplayFor = (
    tracks: readonly {
      readonly id: string;
      readonly translation: readonly [number, number, number];
      readonly tilt?: boolean;
    }[],
  ): ScenePoseReplayV1 => {
    const half = Math.sin(Math.PI / 36);
    return {
      schemaVersion: STUDIO_SCENE_POSE_REPLAY_SCHEMA_V1,
      sceneId: pairScene.id,
      frameCount: 2,
      provenance: {
        solver: { name: 'test-recorder', version: '1.0.0' },
        fixedTimestepMs: 100,
        gravity: [0, -9.81, 0],
        inputHash: `sha256:${'a'.repeat(64)}`,
        finalHash: `sha256:${'b'.repeat(64)}`,
        lawLabels: ['authored-hold'],
        capabilityLabels: ['moving-pair-probe'],
      },
      tracks: tracks.map((track) => {
        const quaternion = track.tilt
          ? [0, 0, half, Math.cos(Math.PI / 36)] as const
          : [0, 0, 0, 1] as const;
        return {
          placementId: track.id,
          translations: new Float32Array([...track.translation, ...track.translation]),
          quaternions: new Float32Array([...quaternion, ...quaternion]),
          linearVelocities: new Float32Array(6),
          angularVelocities: new Float32Array(6),
        };
      }),
      events: [],
    };
  };

  it('reports two recorded bodies co-existing in the same space', () => {
    const replay = pairReplayFor([
      { id: 'mover-a', translation: pairBase },
      // Off every quarter-unit lattice on all three axes: pure co-existence.
      { id: 'mover-b', translation: [pairBase[0] + sideStep - 0.13, pairBase[1] + 0.11, pairBase[2] + 0.07] },
    ]);
    const report = sceneSurfaceFightsV1(pairScene, replay, recipes, parts);
    expect(report.overlaps, JSON.stringify(report.overlaps)).toEqual([]);
    expect(report.movingOverlaps, JSON.stringify(report.movingOverlaps)).toHaveLength(1);
    expect(report.movingOverlaps[0]).toMatchObject({ a: 'mover-a', b: 'mover-b' });
    expect(report.movingOverlaps[0]!.deepest).toBeGreaterThan(0.05);
    expect(report.movingOverlaps[0]!.firstTimeMs).toBe(0);
  });

  it('reports two recorded same-facing surfaces holding one plane', () => {
    const replay = pairReplayFor([
      { id: 'mover-a', translation: pairBase },
      { id: 'mover-b', translation: [pairBase[0] + sideStep, pairBase[1], pairBase[2]] },
    ]);
    const report = sceneSurfaceFightsV1(pairScene, replay, recipes, parts);
    const pairTopPlane = pairBase[1] + height / 2;
    const topFight = report.movingFights.find((fight) =>
      fight.a === 'mover-a' && fight.b === 'mover-b'
      && fight.axis === 'y' && fight.facing === 1
      && Math.abs(fight.plane - pairTopPlane) < 1e-6);
    expect(topFight, JSON.stringify(report.movingFights)).toBeDefined();
    expect(topFight!.facePairs).toBeGreaterThan(0);
  });

  it('keeps flush contact between two recorded bodies allowed', () => {
    const replay = pairReplayFor([
      { id: 'mover-a', translation: pairBase },
      { id: 'mover-b', translation: [pairBase[0], pairBase[1] + height, pairBase[2]] },
    ]);
    const report = sceneSurfaceFightsV1(pairScene, replay, recipes, parts);
    expect(report.movingOverlaps, JSON.stringify(report.movingOverlaps)).toEqual([]);
    expect(report.movingFights, JSON.stringify(report.movingFights)).toEqual([]);
  });

  it('announces a tilted-tilted recorded pair as unchecked instead of staying silent', () => {
    const replay = pairReplayFor([
      { id: 'mover-a', translation: pairBase, tilt: true },
      { id: 'mover-b', translation: [pairBase[0] + sideStep - 0.13, pairBase[1] + 0.11, pairBase[2]], tilt: true },
    ]);
    const report = sceneSurfaceFightsV1(pairScene, replay, recipes, parts);
    const pairEntry = report.unchecked.find((entry) => entry.placementId === 'mover-a & mover-b');
    expect(pairEntry, JSON.stringify(report.unchecked)).toBeDefined();
    expect(pairEntry!.sampledTimes).toBeGreaterThan(0);
    expect(pairEntry!.reason).toContain('tilted-tilted');
  });

  for (const scene of createStudioScenes()) {
    if (!('poseReplay' in scene)) continue;
    const replay = catalog.scenePoseReplays?.[scene.poseReplay.id];
    it(`${scene.id} recorded poses share no space or same-facing plane with still scenery`, { timeout: 60_000 }, () => {
      expect(replay, `Scene '${scene.id}' must resolve pose replay '${scene.poseReplay.id}'.`)
        .toBeDefined();
      const report = sceneSurfaceFightsV1(scene, replay!, recipes, parts);

      expect(report.fights, JSON.stringify(report.fights, null, 2)).toEqual([]);
      expect(report.overlaps, JSON.stringify(report.overlaps, null, 2)).toEqual([]);
    });
  }
});
