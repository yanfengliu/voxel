import { describe, expect, it } from 'vitest';

import {
  analyzeStudioCatalogDiversityV1,
} from './catalog-diversity.js';
import { createStudioCatalog } from './catalog.js';
import { voxelIndex } from './model.js';
import { buildRecipe } from './recipe.js';
import { catalogPartsV1, catalogRecipesV1 } from './studio-library.js';
import {
  createWindmillCompactCreativeV1,
} from './windmill-compact-creative.js';
import {
  enumerateWindmillCompactGeometryV1,
} from './windmill-compact-geometry-enumeration.js';
import {
  WINDMILL_COMPACT_SELECTED_CANDIDATE_V1,
  WINDMILL_COMPACT_SELECTED_PARAMETER_KEY_V1,
  WINDMILL_COMPACT_SELECTED_PROOF_NOMINAL_EVALUATION_SHA256_V1,
  WINDMILL_COMPACT_SELECTED_PROOF_SHA256_V1,
  WINDMILL_COMPACT_SELECTION_SHA256_V1,
} from './windmill-compact-selection.js';
import {
  WINDMILL_RECIPE_IDS_V1,
  WINDMILL_SCENE_LAYOUT_V1,
} from './windmill-layout.js';
import {
  WINDMILL_PURPOSE_BY_BOX_KEY_V1,
  WINDMILL_PURPOSE_LEDGER_V1,
} from './windmill-purpose.js';
import {
  WINDMILL_INTENDED_VIEW_PROOF_V1,
} from './windmill-intended-view-proof.js';
import {
  createWindmillRecipeBook,
  WINDMILL_RECIPES,
  WINDMILL_RECIPE_STEP_PURPOSES_V1,
} from './windmill-recipes.js';
import {
  WINDMILL_PRODUCTION_RECIPE_IDS_V1,
} from './windmill-production-layout.js';
import {
  WINDMILL_MATERIAL_PURPOSES_V1,
  WINDMILL_MATERIAL_PURPOSE_MAP_V1,
  WINDMILL_RECIPE_CONTRASTS_V1,
  WINDMILL_SYSTEM_DYNAMIC_PROOF_BINDING_V1,
  WINDMILL_SYSTEM_PURPOSE_LEDGER_V1,
} from './windmill-system-purpose.js';

const ASSET_KEYS = ['frame', 'rotor', 'hammer', 'anvil'] as const;
const creative = createWindmillCompactCreativeV1(
  WINDMILL_COMPACT_SELECTED_CANDIDATE_V1,
);

describe('selected compact windmill recipes', () => {
  it('binds all Studio layout and recipe data to the selected candidate', () => {
    expect(WINDMILL_SCENE_LAYOUT_V1.parameterKey)
      .toBe(WINDMILL_COMPACT_SELECTED_PARAMETER_KEY_V1);
    expect(WINDMILL_SCENE_LAYOUT_V1.geometryFingerprint)
      .toBe(WINDMILL_COMPACT_SELECTED_CANDIDATE_V1.geometryFingerprint);
    expect(createWindmillRecipeBook()).toBe(createWindmillRecipeBook());
    expect(WINDMILL_RECIPES.map(({ id }) => id))
      .toEqual(Object.values(WINDMILL_RECIPE_IDS_V1));
  });

  it('derives every visible recipe step from one exact box key', () => {
    for (const assetKey of ASSET_KEYS) {
      const recipeId = WINDMILL_RECIPE_IDS_V1[assetKey];
      const recipe = createWindmillRecipeBook()[recipeId]!;
      const asset = creative.assets[assetKey];
      const purposes = WINDMILL_RECIPE_STEP_PURPOSES_V1[recipeId];
      expect(recipe.size, recipeId).toEqual(asset.sizeVoxels);
      expect(recipe.voxelSize, recipeId).toBe(asset.voxelSize);
      expect(recipe.steps, recipeId).toHaveLength(asset.boxes.length);
      expect(purposes, recipeId).toHaveLength(asset.boxes.length);
      asset.boxes.forEach((box, stepIndex) => {
        const step = recipe.steps[stepIndex]!;
        const purpose = purposes[stepIndex]!;
        expect(step.kind, box.boxKey).toBe('part');
        expect(purpose.boxKey, box.boxKey).toBe(box.boxKey);
        expect(purpose.exactBox, box.boxKey).toEqual({
          at: box.at,
          size: box.size,
          role: box.role,
        });
        expect(WINDMILL_PURPOSE_BY_BOX_KEY_V1[box.boxKey]?.boxes)
          .toEqual([{
            boxKey: box.boxKey,
            at: box.at,
            size: box.size,
            role: box.role,
            materialProfile: box.materialProfile,
          }]);
      });
    }
  });

  it('accounts for removal, relocation, minimum form, and appearance per box', () => {
    const candidateBoxes = Object.values(
      WINDMILL_COMPACT_SELECTED_CANDIDATE_V1.assets,
    ).flatMap((asset) => asset.boxes);
    expect(WINDMILL_PURPOSE_LEDGER_V1).toHaveLength(candidateBoxes.length);
    expect(new Set(WINDMILL_PURPOSE_LEDGER_V1.map(({ boxKey }) => boxKey)).size)
      .toBe(candidateBoxes.length);
    expect(new Set(WINDMILL_PURPOSE_LEDGER_V1.map(({ id }) => id)).size)
      .toBe(candidateBoxes.length);
    for (const purpose of WINDMILL_PURPOSE_LEDGER_V1) {
      const sourceBox = candidateBoxes.find(
        ({ key }) => key === purpose.boxKey,
      )!;
      expect(purpose.id).toBe(
        `windmill:purpose-record:${purpose.boxKey}`,
      );
      expect(purpose.needId).toBe(sourceBox.purposeId);
      for (const field of [
        'beneficiary',
        'job',
        'locationDatum',
        'removalFailure',
        'relocationFailure',
        'smallestAdequateForm',
        'evidence',
        'honestyBoundary',
      ] as const) {
        expect(purpose[field].trim().length, `${purpose.boxKey}:${field}`)
          .toBeGreaterThan(20);
      }
      expect(purpose.selectedDynamicProof, purpose.boxKey).toBeNull();
      expect(purpose.appearance.intendedViewProof, purpose.boxKey)
        .toBe(WINDMILL_INTENDED_VIEW_PROOF_V1);
      expect(purpose.appearance.intendedViewEvidence, purpose.boxKey)
        .toContain('Selected catalog evidence binds this exact box');
      expect(purpose.appearance.intendedViewEvidence, purpose.boxKey)
        .toContain('every exact box removal to the first passing view');
      expect(purpose.appearance.intendedViewEvidence, purpose.boxKey)
        .toContain(
          'Relocation is structurally tested for every exact box; bounded representative relocations have visual artifacts',
        );
    }
  });

  it('binds dynamic evidence once at system level without laundering it into boxes', () => {
    const binding = WINDMILL_SYSTEM_DYNAMIC_PROOF_BINDING_V1;
    expect(Object.isFrozen(binding)).toBe(true);
    expect(Object.isFrozen(binding.establishes)).toBe(true);
    expect(binding).toMatchObject({
      candidateParameterKey: WINDMILL_COMPACT_SELECTED_PARAMETER_KEY_V1,
      nominalEvaluationSha256:
        WINDMILL_COMPACT_SELECTED_PROOF_NOMINAL_EVALUATION_SHA256_V1,
      proofSha256: WINDMILL_COMPACT_SELECTED_PROOF_SHA256_V1,
      selectionSha256: WINDMILL_COMPACT_SELECTION_SHA256_V1,
    });
    expect(binding.establishes).toHaveLength(3);
    expect(binding.honestyBoundary).toMatch(/not the independent necessity/);
    expect(binding.establishes.join(' ')).not.toMatch(
      /ablations? distinguish[^.]*upper head mass/i,
    );
    expect(binding.establishes.join(' ')).toMatch(
      /separate static evidence binds the upper head cell only/i,
    );
    expect(binding.honestyBoundary)
      .toMatch(/No isolated upper-cell dynamics ablation was run/);
    expect(binding.honestyBoundary)
      .toMatch(/H1\/H2\/H3 search outcomes vary multiple/i);
    expect(new Set(WINDMILL_PURPOSE_LEDGER_V1.map(
      ({ selectedDynamicProof }) => selectedDynamicProof,
    ))).toEqual(new Set([null]));
    expect(new Set(WINDMILL_SYSTEM_PURPOSE_LEDGER_V1.map(
      ({ selectedDynamicProof }) => selectedDynamicProof,
    ))).toEqual(new Set([null]));
    const upperHeadCell =
      WINDMILL_PURPOSE_BY_BOX_KEY_V1['hammer-head-mass'];
    expect(upperHeadCell?.job)
      .toMatch(/face-connected.*right-beam-to-toe link/i);
    expect(upperHeadCell?.honestyBoundary)
      .toMatch(/No isolated upper-cell dynamics ablation was run/);
    expect(upperHeadCell?.honestyBoundary)
      .toMatch(/do not prove this cell independently necessary/i);
  });

  it('contains the complete named mechanism and no orphan counterweight', () => {
    const candidate = WINDMILL_COMPACT_SELECTED_CANDIDATE_V1;
    const rotorKeys = candidate.assets.rotor.boxes.map(({ key }) => key);
    const hammerKeys = candidate.assets.hammer.boxes.map(({ key }) => key);
    expect(candidate.ports.map(({ key }) => key)).toEqual(expect.arrayContaining([
      'frame-rotor-axis',
      'rotor-axis',
      'rotor-front-bearing',
      'rotor-rear-bearing',
      'frame-hammer-axis',
      'hammer-axis',
    ]));
    expect(candidate.sails.map(({ key }) => key))
      .toEqual(['north-sail', 'south-sail']);
    expect(rotorKeys).toEqual(expect.arrayContaining([
      'rotor-shaft',
      'north-panel-step-z0',
      'north-panel-step-z1',
      'south-panel-step-z0',
      'south-panel-step-z1',
      'rotor-cam-nose',
      'rotor-opposed-cam-nose',
    ]));
    expect(hammerKeys).toEqual(expect.arrayContaining([
      'hammer-follower-shoe',
      'hammer-pivot-core',
      'hammer-right-beam',
      'hammer-impact-toe',
    ]));
    // The promoted head is three voxels tall, so its face reaches the
    // ground and the anvil is the cap alone — no column between them.
    expect(candidate.assets.anvil.boxes.map(({ key }) => key))
      .toEqual(['anvil-impact-cap']);
    expect(JSON.stringify({
      recipes: WINDMILL_RECIPES,
      purposes: WINDMILL_PURPOSE_LEDGER_V1,
      system: WINDMILL_SYSTEM_PURPOSE_LEDGER_V1,
    }).toLowerCase()).not.toMatch(/counterweight|ornament|four[- ]sail/);
  });

  it('binds every used color role to a named communication job', () => {
    // Across the whole enumerated family, not just the promoted candidate.
    // The generator emits `anvil-waist` only when the head is short enough
    // to need a column under the anvil face, and the promoted head is not;
    // scoping this to one candidate would call a live role an orphan.
    const usedRoles = new Set(enumerateWindmillCompactGeometryV1().attempts
      .flatMap((attempt) => attempt.outcome === 'candidate'
        ? Object.values(
          createWindmillCompactCreativeV1(attempt.candidate).assets,
        ).flatMap((asset) => asset.boxes.map((box) => box.role))
        : []));
    const selectedRoles = new Set(Object.values(creative.assets).flatMap(
      (asset) => asset.boxes.map((box) => box.role),
    ));
    expect([...selectedRoles].every((role) => usedRoles.has(role))).toBe(true);
    expect(Object.keys(WINDMILL_MATERIAL_PURPOSE_MAP_V1).sort())
      .toEqual([...usedRoles].sort());
    expect(new Set(WINDMILL_MATERIAL_PURPOSES_V1.map(({ id }) => id)).size)
      .toBe(WINDMILL_MATERIAL_PURPOSES_V1.length);
    for (const role of usedRoles) {
      const purpose = WINDMILL_MATERIAL_PURPOSE_MAP_V1[role]!;
      expect(purpose.job.length, role).toBeGreaterThan(20);
      expect(purpose.honestyBoundary.length, role).toBeGreaterThan(20);
    }
  });

  it('pins every declared nearest neighbor to the live catalog analyzer', () => {
    const nearestById = new Map(
      analyzeStudioCatalogDiversityV1(createStudioCatalog())
        .nearestNeighbors.map((entry) => [entry.recipeId, entry]),
    );
    expect(new Set(WINDMILL_RECIPE_CONTRASTS_V1.map(
      ({ recipeId }) => recipeId,
    )).size).toBe(WINDMILL_RECIPE_CONTRASTS_V1.length);
    for (const contrast of WINDMILL_RECIPE_CONTRASTS_V1) {
      expect(
        nearestById.get(contrast.recipeId)?.nearestRecipeId,
        contrast.recipeId,
      ).toBe(contrast.analyzerNearestRecipeId);
      expect(contrast.axes.length, contrast.recipeId).toBeGreaterThanOrEqual(2);
    }
  });

  it('derives the wheat-sack contrast prose from the built neighboring geometry', () => {
    const catalog = createStudioCatalog();
    const recipes = catalogRecipesV1(catalog);
    const parts = catalogPartsV1(catalog);
    const wheatSack = buildRecipe(
      recipes[WINDMILL_PRODUCTION_RECIPE_IDS_V1.wheatSack]!,
      parts,
      recipes,
    ).model;
    const phaseFlag = buildRecipe(
      recipes['studio:machine-works:drive-cog']!,
      parts,
      recipes,
    ).model;
    const wheatContrast = WINDMILL_RECIPE_CONTRASTS_V1.find(({ recipeId }) =>
      recipeId === WINDMILL_PRODUCTION_RECIPE_IDS_V1.wheatSack)!;
    const materialCounts = (voxels: readonly number[]): readonly number[] =>
      [...voxels.reduce((counts, value) => {
        if (value !== 0) counts.set(value, (counts.get(value) ?? 0) + 1);
        return counts;
      }, new Map<number, number>()).values()].sort((a, b) => a - b);

    expect(wheatSack.size).toEqual([3, 5, 3]);
    expect(wheatSack.voxels.filter((value) => value !== 0)).toHaveLength(37);
    expect(materialCounts(wheatSack.voxels)).toEqual([1, 36]);
    const sackBodyMaterial = wheatSack.voxels[voxelIndex(wheatSack, 0, 0, 0)];
    const sackTieMaterial = wheatSack.voxels[voxelIndex(wheatSack, 1, 4, 1)];
    expect(sackBodyMaterial).not.toBe(0);
    expect(sackTieMaterial).not.toBe(0);
    expect(sackTieMaterial).not.toBe(sackBodyMaterial);
    for (let z = 0; z < 3; z += 1) {
      for (let y = 0; y < 5; y += 1) {
        for (let x = 0; x < 3; x += 1) {
          const expected = y < 4
            ? sackBodyMaterial
            : (x === 1 && z === 1 ? sackTieMaterial : 0);
          expect(wheatSack.voxels[voxelIndex(wheatSack, x, y, z)])
            .toBe(expected);
        }
      }
    }
    expect(phaseFlag.size).toEqual([3, 6, 3]);
    expect(phaseFlag.voxels.every((value) => value !== 0)).toBe(true);
    expect(materialCounts(phaseFlag.voxels)).toEqual([27, 27]);
    const flagLowerMaterial = phaseFlag.voxels[voxelIndex(phaseFlag, 0, 0, 0)];
    const flagUpperMaterial = phaseFlag.voxels[voxelIndex(phaseFlag, 0, 5, 0)];
    expect(flagLowerMaterial).not.toBe(flagUpperMaterial);
    for (let z = 0; z < 3; z += 1) {
      for (let y = 0; y < 6; y += 1) {
        for (let x = 0; x < 3; x += 1) {
          expect(phaseFlag.voxels[voxelIndex(phaseFlag, x, y, z)])
            .toBe(y < 3 ? flagLowerMaterial : flagUpperMaterial);
        }
      }
    }
    expect(wheatContrast.axes.map(({ axis }) => axis)).toEqual([
      'topology-negative-space',
      'material-role-rhythm',
    ]);
    const prose = wheatContrast.axes.map(({ difference }) => difference).join(' ');
    expect(prose).toMatch(/37 of its 45 cells/);
    expect(prose).toMatch(/all 54 cells/);
    expect(prose).toMatch(/36 cells to its body and one to its tie/);
    expect(prose).toMatch(/equal 27-cell structure and safety halves/);
    expect(prose).not.toMatch(/tooth|teeth|rim|bore/i);
  });
});
