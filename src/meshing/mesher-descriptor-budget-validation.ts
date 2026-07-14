import { HARD_RENDER_LIMITS_V1 } from '../core/contracts.js';
import {
  MAX_MESHER_WORK_ELEMENTS_V1,
  type MesherAttributePolicyV1,
  type MesherOutputBudgetV1,
} from './mesher-contract.js';
import {
  failMesherValidationInternal,
  literalMesherInternal,
  objectMesherInternal,
  safeIntegerMesherInternal,
} from './mesher-validation-internal.js';

const MAX_ATTRIBUTE_ENTRIES_V1 = 65_536;

export const HARD_MESHER_OUTPUT_BUDGET_V1_INTERNAL: Readonly<MesherOutputBudgetV1> =
  Object.freeze({
    maxExposedUnitFaces: HARD_RENDER_LIMITS_V1.maxGeometryIndices,
    maxVertices: HARD_RENDER_LIMITS_V1.maxGeometryVertices,
    maxIndices: HARD_RENDER_LIMITS_V1.maxGeometryIndices,
    maxPositionBytes: HARD_RENDER_LIMITS_V1.maxTotalBytes,
    maxNormalBytes: HARD_RENDER_LIMITS_V1.maxTotalBytes,
    maxPaletteIndexBytes: HARD_RENDER_LIMITS_V1.maxTotalBytes,
    maxMaterialIndexBytes: HARD_RENDER_LIMITS_V1.maxTotalBytes,
    maxTotalBytes: HARD_RENDER_LIMITS_V1.maxTotalBytes,
    maxMeshingWorkElements: MAX_MESHER_WORK_ELEMENTS_V1,
    maxResultValidationElements: MAX_MESHER_WORK_ELEMENTS_V1,
  });

const OUTPUT_BUDGET_KEYS = Object.freeze([
  'maxExposedUnitFaces',
  'maxVertices',
  'maxIndices',
  'maxPositionBytes',
  'maxNormalBytes',
  'maxPaletteIndexBytes',
  'maxMaterialIndexBytes',
  'maxTotalBytes',
  'maxMeshingWorkElements',
  'maxResultValidationElements',
] as const satisfies readonly (keyof MesherOutputBudgetV1)[]);

export function parseMesherOutputBudgetV1Internal(
  value: unknown,
  path: string,
  ceiling: MesherOutputBudgetV1,
  minimum: 0 | 1,
): MesherOutputBudgetV1 {
  const input = objectMesherInternal(value, path);
  const parsed = {} as Record<keyof MesherOutputBudgetV1, number>;
  for (const key of OUTPUT_BUDGET_KEYS) {
    parsed[key] = safeIntegerMesherInternal(
      input[key],
      `${path}.${key}`,
      minimum,
      ceiling[key],
    );
  }
  return Object.freeze(parsed);
}

export function parseMesherAttributePolicyV1Internal(
  value: unknown,
  path: string,
): MesherAttributePolicyV1 {
  const input = objectMesherInternal(value, path);
  literalMesherInternal(input.normals, 'flat-axis-aligned-f32x3', `${path}.normals`);
  literalMesherInternal(input.paletteIndices, 'per-vertex-u16', `${path}.paletteIndices`);
  if (input.materialIndices !== 'none' && input.materialIndices !== 'per-triangle-u16') {
    failMesherValidationInternal(
      'mesher.value',
      `${path}.materialIndices`,
      `${path}.materialIndices must be none or per-triangle-u16.`,
    );
  }
  const maxPaletteEntries = safeIntegerMesherInternal(
    input.maxPaletteEntries,
    `${path}.maxPaletteEntries`,
    1,
    MAX_ATTRIBUTE_ENTRIES_V1,
  );
  const maxMaterialEntries = safeIntegerMesherInternal(
    input.maxMaterialEntries,
    `${path}.maxMaterialEntries`,
    0,
    MAX_ATTRIBUTE_ENTRIES_V1,
  );
  if (input.materialIndices === 'none' && maxMaterialEntries !== 0) {
    failMesherValidationInternal(
      'mesher.attribute',
      `${path}.maxMaterialEntries`,
      'A mesher with no material attribute must declare zero material entries.',
    );
  }
  if (input.materialIndices === 'per-triangle-u16' && maxMaterialEntries === 0) {
    failMesherValidationInternal(
      'mesher.attribute',
      `${path}.maxMaterialEntries`,
      'A per-triangle material attribute requires at least one material entry.',
    );
  }
  return Object.freeze({
    normals: 'flat-axis-aligned-f32x3',
    paletteIndices: 'per-vertex-u16',
    materialIndices: input.materialIndices,
    maxPaletteEntries,
    maxMaterialEntries,
  });
}
