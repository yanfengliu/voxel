import { filledGridBoundsV1, modelCenterV1 } from './build.js';
import { modelVoxelSizeV1, type StudioModelV1 } from './model.js';
import type { SceneV1 } from './scene.js';
import type { WireSegmentV1 } from './wireframe.js';

/**
 * A one-unit ground grid under the model, so a voxel size reads as a real
 * scale rather than a bare number. Each square is one world unit; how many the
 * model covers is its true size — a fine-grained flower spans a square or two,
 * a coarse wall spans many. Without a fixed reference the model just refills
 * the view at every grain and the scaling is invisible; this is that reference.
 *
 * Segments are world coordinates centred on the origin, where the built model
 * sits, so the grid needs no offset or scale of its own — it is drawn straight,
 * while the model-space overlays are the ones scaled by the voxel size.
 */
const MARGIN = 1;
/** A ceiling so a huge model rules a floor, not a thousand-line cage. */
const MAX_HALF = 24;

export function referenceGridSegmentsV1(model: StudioModelV1): readonly WireSegmentV1[] {
  const bounds = filledGridBoundsV1(model);
  if (!bounds) return [];
  const middle = modelCenterV1(model);
  const voxelSize = modelVoxelSizeV1(model);
  // The floor sits at the model's feet, in world units.
  const bottomY = (bounds.min.y - middle.y) * voxelSize;
  const halfX = ((bounds.max.x + 1 - bounds.min.x) / 2) * voxelSize;
  const halfZ = ((bounds.max.z + 1 - bounds.min.z) / 2) * voxelSize;
  const half = Math.min(MAX_HALF, Math.ceil(Math.max(halfX, halfZ)) + MARGIN);
  const segments: WireSegmentV1[] = [];
  for (let k = -half; k <= half; k += 1) {
    segments.push({ a: [-half, bottomY, k], b: [half, bottomY, k] });
    segments.push({ a: [k, bottomY, -half], b: [k, bottomY, half] });
  }
  return segments;
}

/** How coarse a scene's floor squares are: bigger than a model's, since a scene
 * spans many models and a one-unit grid would be a dense cage under it. */
const SCENE_STEP = 4;
/** A ceiling so a sprawling scene still rules a floor, not an endless cage. */
const SCENE_MAX_HALF = 96;

/**
 * A ground grid under a whole scene, at the shared floor the scene stands its
 * models on (y = 0). It reaches to cover how far the placements spread, with a
 * coarser square than a single model's grid because a scene is much larger.
 */
export function sceneReferenceGridSegmentsV1(scene: SceneV1): readonly WireSegmentV1[] {
  let reach = 8;
  for (const placement of scene.placements) {
    reach = Math.max(reach, Math.abs(placement.at[0]), Math.abs(placement.at[2]));
  }
  // Rounded up to whole squares, plus a margin so a model at the edge still
  // has floor under its far side.
  const half = Math.min(SCENE_MAX_HALF, (Math.ceil((reach + 10) / SCENE_STEP) * SCENE_STEP));
  const segments: WireSegmentV1[] = [];
  for (let k = -half; k <= half; k += SCENE_STEP) {
    segments.push({ a: [-half, 0, k], b: [half, 0, k] });
    segments.push({ a: [k, 0, -half], b: [k, 0, half] });
  }
  return segments;
}
