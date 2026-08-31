import { Vector3, type PerspectiveCamera } from 'three';
import type { RenderSnapshotV1 } from '../../src/core/index.js';
import { OAK_FALLEN_LITTER_VOXEL_BATCH_KEY_V1 } from './oak-fallen-litter-voxel.js';
import {
  OAK_LEAF_VOXEL_BATCH_KEY_V1,
  OAK_ROOT_VOXEL_BATCH_KEY_V1,
  OAK_SEED_BUD_VOXEL_BATCH_KEY_V1,
  OAK_WOOD_VOXEL_BATCH_KEY_V1,
} from './oak-tissue-voxel-projection.js';
import type {
  OakBrowserProjectedVoxelV1,
  OakBrowserViewportV1,
} from './oak-browser-contract.js';

const ROLE_BY_BATCH = new Map<string, OakBrowserProjectedVoxelV1['role']>([
  [OAK_WOOD_VOXEL_BATCH_KEY_V1, 'wood'],
  [OAK_ROOT_VOXEL_BATCH_KEY_V1, 'root'],
  [OAK_LEAF_VOXEL_BATCH_KEY_V1, 'leaf'],
  [OAK_SEED_BUD_VOXEL_BATCH_KEY_V1, 'seed-bud'],
  [OAK_FALLEN_LITTER_VOXEL_BATCH_KEY_V1, 'litter'],
]);
const MAX_SAMPLES_PER_BATCH = 2_048;

/** Project exact accepted plant-voxel centres for non-vacuous browser pixel evidence. */
export function projectOakBrowserVoxelsV1(
  snapshot: RenderSnapshotV1,
  camera: PerspectiveCamera,
  viewport: OakBrowserViewportV1,
): readonly OakBrowserProjectedVoxelV1[] {
  const projected = new Vector3();
  const result: OakBrowserProjectedVoxelV1[] = [];
  for (const batch of snapshot.batches) {
    const role = ROLE_BY_BATCH.get(batch.key);
    if (role === undefined || batch.colors === undefined) continue;
    const stride = Math.max(1, Math.ceil(batch.instanceKeys.length / MAX_SAMPLES_PER_BATCH));
    for (let index = 0; index < batch.instanceKeys.length; index += stride) {
      const matrixOffset = index * 16;
      projected.set(
        batch.matrices[matrixOffset + 12]!,
        batch.matrices[matrixOffset + 13]!,
        batch.matrices[matrixOffset + 14]!,
      ).project(camera);
      if (projected.z < -1 || projected.z > 1) continue;
      const colorOffset = index * 4;
      result.push({
        x: (projected.x + 1) * viewport.width / 2,
        y: (1 - projected.y) * viewport.height / 2,
        color: {
          r: batch.colors[colorOffset]!,
          g: batch.colors[colorOffset + 1]!,
          b: batch.colors[colorOffset + 2]!,
        },
        role,
      });
    }
  }
  return result;
}
