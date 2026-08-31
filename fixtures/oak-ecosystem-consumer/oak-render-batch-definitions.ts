import {
  OAK_FALLEN_LITTER_VOXEL_BATCH_KEY_V1,
  OAK_FALLEN_LITTER_VOXEL_MATERIAL_KEY_V1,
} from './oak-fallen-litter-voxel.js';
import { OAK_SOIL_CONTACT_VOXEL_BATCH_KEY_V1 } from './oak-soil-contact-voxels.js';
import { OAK_SOIL_VOXEL_MATERIAL_KEY_V1 } from './oak-soil-voxel.js';
import {
  OAK_LEAF_VOXEL_BATCH_KEY_V1,
  OAK_LEAF_VOXEL_MATERIAL_KEY_V1,
  OAK_ROOT_VOXEL_BATCH_KEY_V1,
  OAK_ROOT_VOXEL_MATERIAL_KEY_V1,
  OAK_SEED_BUD_VOXEL_BATCH_KEY_V1,
  OAK_SEED_BUD_VOXEL_MATERIAL_KEY_V1,
  OAK_TISSUE_VOXEL_GEOMETRY_KEY_V1,
  OAK_WOOD_VOXEL_BATCH_KEY_V1,
  OAK_WOOD_VOXEL_MATERIAL_KEY_V1,
} from './oak-tissue-voxel-projection.js';
import {
  OAK_WEATHER_VOXEL_BATCH_KEY_V1,
  OAK_WEATHER_VOXEL_MATERIAL_KEY_V1,
} from './oak-weather-voxel-presentation.js';

export interface OakRenderBatchDefinitionV1 {
  readonly key: string;
  readonly geometryKey: string;
  readonly materialKey: string;
  readonly castShadow: boolean;
  readonly receiveShadow: boolean;
}

export const OAK_RENDER_BATCH_DEFINITIONS_V1:
readonly OakRenderBatchDefinitionV1[] = Object.freeze([
  {
    key: OAK_WOOD_VOXEL_BATCH_KEY_V1,
    geometryKey: OAK_TISSUE_VOXEL_GEOMETRY_KEY_V1,
    materialKey: OAK_WOOD_VOXEL_MATERIAL_KEY_V1,
    castShadow: true,
    receiveShadow: true,
  },
  {
    key: OAK_ROOT_VOXEL_BATCH_KEY_V1,
    geometryKey: OAK_TISSUE_VOXEL_GEOMETRY_KEY_V1,
    materialKey: OAK_ROOT_VOXEL_MATERIAL_KEY_V1,
    castShadow: true,
    receiveShadow: true,
  },
  {
    key: OAK_LEAF_VOXEL_BATCH_KEY_V1,
    geometryKey: OAK_TISSUE_VOXEL_GEOMETRY_KEY_V1,
    materialKey: OAK_LEAF_VOXEL_MATERIAL_KEY_V1,
    castShadow: true,
    receiveShadow: true,
  },
  {
    key: OAK_SEED_BUD_VOXEL_BATCH_KEY_V1,
    geometryKey: OAK_TISSUE_VOXEL_GEOMETRY_KEY_V1,
    materialKey: OAK_SEED_BUD_VOXEL_MATERIAL_KEY_V1,
    castShadow: true,
    receiveShadow: true,
  },
  {
    key: OAK_FALLEN_LITTER_VOXEL_BATCH_KEY_V1,
    geometryKey: OAK_TISSUE_VOXEL_GEOMETRY_KEY_V1,
    materialKey: OAK_FALLEN_LITTER_VOXEL_MATERIAL_KEY_V1,
    castShadow: true,
    receiveShadow: true,
  },
  {
    key: OAK_SOIL_CONTACT_VOXEL_BATCH_KEY_V1,
    geometryKey: OAK_TISSUE_VOXEL_GEOMETRY_KEY_V1,
    materialKey: OAK_SOIL_VOXEL_MATERIAL_KEY_V1,
    castShadow: false,
    receiveShadow: true,
  },
  {
    key: OAK_WEATHER_VOXEL_BATCH_KEY_V1,
    geometryKey: OAK_TISSUE_VOXEL_GEOMETRY_KEY_V1,
    materialKey: OAK_WEATHER_VOXEL_MATERIAL_KEY_V1,
    castShadow: false,
    receiveShadow: false,
  },
]);
