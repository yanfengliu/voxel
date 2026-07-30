import { describe, expect, it } from 'vitest';

import { modelCenterV1 } from './build.js';
import { createStudioCatalog } from './catalog.js';
import { setVoxelSize } from './edit.js';
import { modelVoxelSizeV1, type StudioModelV1 } from './model.js';
import { buildRecipe } from './recipe.js';
import { placementVoxelsV1 } from './scene-overlap.js';
import {
  sampleValidatedScenePoseReplayV1OrV2,
  scenePoseReplayDurationMsV1OrV2,
} from './scene-pose-replay-sampling.js';
import { createStudioScenes } from './scenes.js';
import { catalogPartsV1, catalogRecipesV1 } from './studio-library.js';

/**
 * The machine re-layout's standing claim: no recorded pose ever occupies the
 * same space as still scenery. sceneOverlapsV1 keeps authored stills out of
 * each other, and sceneSurfaceFightsV1 catches coincident same-facing planes;
 * this closes the third gap — a moving body passing through a still solid's
 * volume, which is what the old foundation pads, tower legs, and end frames
 * did to the slats and drums even after the faces stopped flickering.
 *
 * Lattice poses only: identity and the belt's half-turn about z (the whole
 * return run) are rasterized; a pose tilted off those cannot land on the
 * placement lattice, so turn-phase slats and off-phase drums and flags are
 * skipped. Those are bounded instead by the authored numbers this layout
 * pins elsewhere — the drum's widest rotating corner reaches 2.85 world
 * units from its axle while the nearest still solid (the guard at
 * |z| >= 4.5) stays z-clear of the whole rotating body, and the slat turn
 * annulus ends at |x| <= axle + 3.163 inside the opened end portals. The
 * frame-zero drums are sampled at identity, which is exactly the pose the
 * old end frames interpenetrated. Sampling is a stride over recorded
 * frames, so a transit shorter than one stride could pass between samples;
 * a persistent layout collision — the debt class this pins — cannot.
 */
const OVERLAP_EPSILON = 1e-6;
const SAMPLED_FRAMES = 61;
const POSE_EPSILON = 1e-9;

describe('machine works recorded-pose clearance', () => {
  // A deliberate whole-replay geometric sweep; well past the default timeout.
  it('shares no volume between recorded poses and still scenery at any sampled frame', { timeout: 60_000 }, () => {
    const catalog = createStudioCatalog();
    const recipes = catalogRecipesV1(catalog);
    const parts = catalogPartsV1(catalog);
    const scene = createStudioScenes().find(
      (candidate) => candidate.id === 'studio:scene:contrast-machines',
    );
    if (!scene || !('poseReplay' in scene)) {
      throw new Error('The contrast-machines scene must exist and carry a pose replay.');
    }
    const replay = catalog.scenePoseReplays?.[scene.poseReplay.id];
    expect(replay, `Scene '${scene.id}' must resolve its pose replay.`).toBeDefined();
    if (!replay) return;

    const models = new Map<string, { model: StudioModelV1; grain: number }>();
    const modelFor = (modelId: string, grain: number) => {
      const key = `${modelId}@${String(grain)}`;
      let entry = models.get(key);
      if (!entry) {
        const recipe = recipes[modelId];
        if (!recipe) throw new Error(`No recipe in the book is called '${modelId}'.`);
        let model = buildRecipe(recipe, parts, recipes).model;
        if (modelVoxelSizeV1(model) !== grain) model = setVoxelSize(model, grain);
        entry = { model, grain };
        models.set(key, entry);
      }
      return entry;
    };

    const movingIds = new Set(replay.tracks.map(({ placementId }) => placementId));
    interface Box { x: number; y: number; z: number; size: number }
    const stillBoxes: Box[] = [];
    for (const placement of scene.placements) {
      if (movingIds.has(placement.id)) continue;
      const { model, grain } = modelFor(placement.model, placement.grain ?? 1);
      stillBoxes.push(...placementVoxelsV1(placement, model, grain));
    }
    // A unit-cell hash over still voxels, keyed by min corner, so each posed
    // voxel tests only its neighbouring cells instead of every still cell.
    // Integer keys: the scene spans well under +-500 cells on every axis.
    const cellKey = (cx: number, cy: number, cz: number): number =>
      ((cx + 512) << 20) + ((cy + 512) << 10) + (cz + 512);
    const byCell = new Map<number, Box[]>();
    let widestStill = 0;
    for (const box of stillBoxes) {
      widestStill = Math.max(widestStill, box.size);
      const key = cellKey(Math.floor(box.x), Math.floor(box.y), Math.floor(box.z));
      const bucket = byCell.get(key);
      if (bucket) bucket.push(box);
      else byCell.set(key, [box]);
    }

    const durationMs = scenePoseReplayDurationMsV1OrV2(replay);
    const stepMs = replay.frameCount > 0 ? durationMs / replay.frameCount : 0;
    const last = Math.max(0, replay.frameCount - 1);
    const stride = Math.max(1, Math.ceil(last / (SAMPLED_FRAMES - 1)));
    const frames: number[] = [];
    for (let frame = 0; frame <= last; frame += stride) frames.push(frame);
    if (frames[frames.length - 1] !== last) frames.push(last);

    const collisions: string[] = [];
    let checkedPoses = 0;
    for (const frame of frames) {
      const sample = sampleValidatedScenePoseReplayV1OrV2(replay, frame * stepMs);
      for (const pose of sample.placements) {
        const placement = scene.placements.find(({ id }) => id === pose.placementId);
        if (!placement) continue;
        const q = pose.quaternion;
        const identity = Math.abs(q[0]) <= POSE_EPSILON && Math.abs(q[1]) <= POSE_EPSILON
          && Math.abs(q[2]) <= POSE_EPSILON && Math.abs(Math.abs(q[3]) - 1) <= POSE_EPSILON;
        // The belt's whole return run rides at a half turn about z, which
        // maps a voxel's low corner to the mirrored cube's low corner.
        const halfTurn = Math.abs(q[0]) <= POSE_EPSILON && Math.abs(q[1]) <= POSE_EPSILON
          && Math.abs(Math.abs(q[2]) - 1) <= POSE_EPSILON && Math.abs(q[3]) <= POSE_EPSILON;
        if (!identity && !halfTurn) continue;
        checkedPoses += 1;
        const { model, grain } = modelFor(placement.model, placement.grain ?? 1);
        const middle = modelCenterV1(model);
        const [sx, sy, sz] = model.size;
        for (let z = 0; z < sz; z += 1) {
          for (let y = 0; y < sy; y += 1) {
            for (let x = 0; x < sx; x += 1) {
              if ((model.voxels[x + sx * (y + sy * z)] ?? 0) === 0) continue;
              const localX = (x - middle.x) * grain;
              const localZ = (z - middle.z) * grain;
              const box: Box = {
                x: pose.translation[0] + (identity ? localX : -localX - grain),
                y: pose.translation[1] + (y - middle.y) * grain,
                z: pose.translation[2] + (identity ? localZ : -localZ - grain),
                size: grain,
              };
              // Overlap needs the still box's min corner within (moving.min
              // minus the still size, moving.min plus the moving size), so
              // the probe reaches down by the widest still grain and up by
              // this voxel's own size.
              const lo = -Math.ceil(widestStill);
              const hi = Math.ceil(box.size);
              const cellX = Math.floor(box.x);
              const cellY = Math.floor(box.y);
              const cellZ = Math.floor(box.z);
              for (let dx = lo; dx <= hi; dx += 1) {
                for (let dy = lo; dy <= hi; dy += 1) {
                  for (let dz = lo; dz <= hi; dz += 1) {
                    const key = cellKey(cellX + dx, cellY + dy, cellZ + dz);
                    for (const still of byCell.get(key) ?? []) {
                      const overlap = Math.min(
                        Math.min(box.x + box.size, still.x + still.size) - Math.max(box.x, still.x),
                        Math.min(box.y + box.size, still.y + still.size) - Math.max(box.y, still.y),
                        Math.min(box.z + box.size, still.z + still.size) - Math.max(box.z, still.z),
                      );
                      if (overlap > OVERLAP_EPSILON) {
                        collisions.push(
                          `frame ${String(frame)}: '${pose.placementId}' voxel at `
                          + `(${box.x.toFixed(3)}, ${box.y.toFixed(3)}, ${box.z.toFixed(3)}) `
                          + `enters still scenery by ${overlap.toFixed(6)} world units`,
                        );
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
    expect(collisions.slice(0, 12), `${String(collisions.length)} collisions`).toEqual([]);
    // The check must not silently go vacuous if the replay or scene changes.
    expect(checkedPoses).toBeGreaterThan(500);
  });
});
