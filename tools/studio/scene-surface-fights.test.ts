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

  for (const scene of createStudioScenes()) {
    if (!('poseReplay' in scene)) continue;
    const replay = catalog.scenePoseReplays?.[scene.poseReplay.id];
    it(`${scene.id} recorded poses share no space or same-facing plane with still scenery`, { timeout: 60_000 }, () => {
      expect(replay, `Scene '${scene.id}' must resolve pose replay '${scene.poseReplay.id}'.`)
        .toBeDefined();
      const report = sceneSurfaceFightsV1(scene, replay!, recipes, parts);
      if (scene.id === 'studio:scene:contrast-machines') {
        // Machine Works was authored with its recorded process threading
        // through the still scenery, so its known debts are pinned as a
        // shrink-only list: fixing one needs no edit here, while anything NEW
        // — a new pair, a deeper entry, a fight on another plane — fails the
        // scene. The machine re-layout task owns driving this list to zero;
        // it must move statics and re-record the trace, because the recorded
        // poses and the bore/trunnion couplings pin both sides. Depths are
        // per-voxel-pair push-out distances (lower bounds on how far the
        // bodies interleave), measured 2026-07-30 with the exact box test
        // that also judges tilted poses. Delete entries as the re-layout
        // lands them.
        const knownFights = [
          // The dock's east base cells under the recorded bucket's rim flare,
          // both undersides on the y = 9 plane.
          {
            moving: 'collection-bucket', still: 'assembly-output-dock',
            axis: 'y', facing: -1, plane: 9,
          },
        ];
        const knownCoexistence: readonly {
          moving: RegExp | string; still: string; deepestAtMost: number;
        }[] = [
          // The belt band runs through the foundation's trough and pads —
          // straight-run slats to 0.41, curve slats rounding the drums to 0.65.
          { moving: /^belt-slat-\d+$/, still: 'assembly-foundation', deepestAtMost: 0.7 },
          // The settled press feet dip 0.02 into the recorded belt band.
          { moving: /^belt-slat-\d+$/, still: 'assembly-press-bridge', deepestAtMost: 0.03 },
          // Both drive drums sit inside the foundation's end housings, up to
          // 1.15 deep at every sampled time.
          { moving: 'belt-drive-west', still: 'assembly-foundation', deepestAtMost: 1.2 },
          { moving: 'belt-drive-east', still: 'assembly-foundation', deepestAtMost: 1.2 },
          // The carriage transits through the press towers' front legs (0.4)
          // and into the dock's reach at the tip station (0.2).
          { moving: 'assembly-carriage', still: 'assembly-press-bridge', deepestAtMost: 0.45 },
          { moving: 'assembly-carriage', still: 'assembly-output-dock', deepestAtMost: 0.25 },
          // Each insertion head enters the press volume on its stroke (0.4).
          { moving: 'cap-head', still: 'assembly-press-bridge', deepestAtMost: 0.45 },
          { moving: 'core-head', still: 'assembly-press-bridge', deepestAtMost: 0.45 },
          // The recorded bucket's rim flare and the dock's east cells (0.2).
          { moving: 'collection-bucket', still: 'assembly-output-dock', deepestAtMost: 0.25 },
        ];
        // A full-frame sweep also found one sub-visible transit crossing the
        // sampling deliberately does not chase: at recorded frame 143 only
        // (16.7 ms), the carriage's +x face passes within 1e-4 of the west
        // tower's x = -9 plane. If SAMPLES_PER_REPLAY changes and this test
        // starts reporting that crossing, that is the known transit, not a
        // regression of the settled layout.
        for (const fight of report.fights) {
          const known = knownFights.some((debt) =>
            debt.moving === fight.moving && debt.still === fight.still
            && debt.axis === fight.axis && debt.facing === fight.facing
            && Math.abs(debt.plane - fight.plane) < 1e-6);
          expect(known, `a new surface fight appeared: ${JSON.stringify(fight)}`).toBe(true);
        }
        for (const overlap of report.overlaps) {
          const debt = knownCoexistence.find((entry) =>
            (typeof entry.moving === 'string'
              ? entry.moving === overlap.moving
              : entry.moving.test(overlap.moving))
            && entry.still === overlap.still);
          expect(debt, `a new co-existence appeared: ${JSON.stringify(overlap)}`).toBeDefined();
          expect(
            overlap.deepest,
            `${overlap.moving} x ${overlap.still} deepened past its pinned debt`,
          ).toBeLessThanOrEqual(debt!.deepestAtMost);
        }
        return;
      }
      expect(report.fights, JSON.stringify(report.fights, null, 2)).toEqual([]);
      expect(report.overlaps, JSON.stringify(report.overlaps, null, 2)).toEqual([]);
    });
  }
});
