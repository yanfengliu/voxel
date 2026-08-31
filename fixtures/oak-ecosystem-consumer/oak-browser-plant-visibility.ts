import type { Scene } from 'three';

import { OAK_FALLEN_LITTER_VOXEL_BATCH_KEY_V1 } from './oak-fallen-litter-voxel.js';
import {
  OAK_LEAF_VOXEL_BATCH_KEY_V1,
  OAK_ROOT_VOXEL_BATCH_KEY_V1,
  OAK_SEED_BUD_VOXEL_BATCH_KEY_V1,
  OAK_WOOD_VOXEL_BATCH_KEY_V1,
} from './oak-tissue-voxel-projection.js';

const PLANT_BATCH_KEYS = new Set([
  OAK_WOOD_VOXEL_BATCH_KEY_V1,
  OAK_ROOT_VOXEL_BATCH_KEY_V1,
  OAK_LEAF_VOXEL_BATCH_KEY_V1,
  OAK_SEED_BUD_VOXEL_BATCH_KEY_V1,
  OAK_FALLEN_LITTER_VOXEL_BATCH_KEY_V1,
]);

/** Test-evidence switch; accepted Voxel state and soil/contact presentation stay untouched. */
export function setOakBrowserPlantVisibilityForEvidenceV1(
  scene: Scene,
  visible: boolean,
): number {
  let matched = 0;
  scene.traverse((object) => {
    if (!PLANT_BATCH_KEYS.has(object.name)) return;
    object.visible = visible;
    matched += 1;
  });
  if (matched === 0) throw new Error('Oak plant visibility evidence found no presented Voxel batches.');
  return matched;
}
