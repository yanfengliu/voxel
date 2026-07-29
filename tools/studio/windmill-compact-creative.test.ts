import { describe, expect, it } from 'vitest';

import { createStudioParts } from './parts.js';
import {
  buildRecipe,
  VOXEL_RECIPE_SCHEMA_V1,
  type RecipeBookV1,
  type RecipeV1,
} from './recipe.js';
import { buildSceneSnapshot } from './scene-build.js';
import type { SceneV1 } from './scene.js';
import {
  createWindmillCompactCandidateV1,
  type WindmillCompactAssetV1,
  type WindmillCompactBoxV1,
} from './windmill-compact-geometry.js';
import {
  enumerateWindmillCompactGeometryV1,
} from './windmill-compact-geometry-enumeration.js';
import { windmillCompactRequiredInterfacesV1 } from './windmill-compact-geometry-evidence.js';
import {
  createWindmillCompactCreativeV1,
  WINDMILL_COMPACT_ROLE_COLORS_V1,
  type WindmillCompactCreativeV1,
} from './windmill-compact-creative.js';

const ASSET_KEYS = ['frame', 'rotor', 'hammer', 'anvil'] as const;
const STILL_MOTION = Object.freeze({
  periodMs: 0,
  phaseRadians: 0,
  translation: Object.freeze([0, 0, 0] as const),
  rotationRadians: Object.freeze([0, 0, 0] as const),
  scale: Object.freeze([0, 0, 0] as const),
});

function recipeId(assetKey: typeof ASSET_KEYS[number]): string {
  return `test:compact-windmill:${assetKey}`;
}

function creativeRecipeBook(
  creative: WindmillCompactCreativeV1,
): RecipeBookV1 {
  return Object.freeze(Object.fromEntries(ASSET_KEYS.map((assetKey) => {
    const asset = creative.assets[assetKey];
    const recipe: RecipeV1 = Object.freeze({
      schemaVersion: VOXEL_RECIPE_SCHEMA_V1,
      id: recipeId(assetKey),
      label: `Compact windmill ${assetKey}`,
      seed: 0,
      size: asset.sizeVoxels,
      voxelSize: asset.voxelSize,
      roles: asset.roles,
      palette: asset.palette,
      steps: Object.freeze(asset.boxes.map((box) => box.step)),
      motion: STILL_MOTION,
    });
    return [recipe.id, recipe] as const;
  })));
}

function creativeScene(creative: WindmillCompactCreativeV1): SceneV1 {
  return Object.freeze({
    schemaVersion: 'studio.scene/4' as const,
    id: `test:compact-windmill:${creative.parameterKey}`,
    label: 'Compact windmill placement proof',
    placements: Object.freeze(ASSET_KEYS.map((assetKey) => Object.freeze({
      id: `test:compact-windmill:placement:${assetKey}`,
      model: recipeId(assetKey),
      at: creative.assets[assetKey].scenePlacement.at,
      grain: creative.assets[assetKey].voxelSize,
    }))),
    poseReplay: Object.freeze({
      id: 'test:compact-windmill:replay',
      durationMs: 1,
    }),
  });
}

function expectSceneBuildCenters(
  candidate: ReturnType<typeof createWindmillCompactCandidateV1>,
  creative: WindmillCompactCreativeV1,
): void {
  const recipes = creativeRecipeBook(creative);
  const scene = creativeScene(creative);
  const parts = createStudioParts();
  ASSET_KEYS.forEach((assetKey) => {
    const recipe = recipes[recipeId(assetKey)];
    if (recipe === undefined) {
      throw new Error(`Missing compact test recipe '${assetKey}'.`);
    }
    const built = buildRecipe(recipe, parts, recipes);
    expect(built.model.voxels.filter((slot) => slot !== 0))
      .toHaveLength(candidate.assets[assetKey].occupiedVoxelCount);
  });
  for (const edges of [false, true]) {
    const snapshot = buildSceneSnapshot(
      scene,
      recipes,
      parts,
      { edges },
    );
    expect(snapshot.batches).toHaveLength(ASSET_KEYS.length);
    ASSET_KEYS.forEach((assetKey, index) => {
      const batch = snapshot.batches[index];
      expect(batch?.instanceKeys).toEqual([
        `test:compact-windmill:placement:${assetKey}`,
      ]);
      expect(Array.from(batch?.matrices.slice(12, 15) ?? []))
        .toEqual(candidate.assets[assetKey].bodyWorldVoxels.map(
          (coordinate) => coordinate * candidate.grainMeters,
        ));
    });
  }
}

function cellsOf(
  box: Pick<WindmillCompactBoxV1, 'at' | 'size'>,
): readonly string[] {
  const cells: string[] = [];
  for (let z = box.at[2]; z < box.at[2] + box.size[2]; z += 1) {
    for (let y = box.at[1]; y < box.at[1] + box.size[1]; y += 1) {
      for (let x = box.at[0]; x < box.at[0] + box.size[0]; x += 1) {
        cells.push(`${String(x)},${String(y)},${String(z)}`);
      }
    }
  }
  return cells;
}

function sorted(values: readonly string[]): readonly string[] {
  return [...values].sort();
}

function worldAt(
  asset: WindmillCompactAssetV1,
  boxKey: string,
): readonly [number, number, number] {
  const box = asset.boxes.find((entry) => entry.key === boxKey);
  if (box === undefined) throw new Error(`Missing compact box '${boxKey}'.`);
  return box.at.map((value, axis) =>
    value + asset.worldOriginVoxels[axis]!) as [number, number, number];
}

function expectExactCellParity(
  asset: WindmillCompactAssetV1,
  boxes: readonly { readonly at: WindmillCompactBoxV1['at'];
    readonly size: WindmillCompactBoxV1['size'] }[],
): void {
  const adapted = boxes.flatMap(cellsOf);
  expect(new Set(adapted).size).toBe(adapted.length);
  expect(sorted(adapted)).toEqual(sorted(
    asset.occupiedCells.map((cell) => cell.join(',')),
  ));
}

describe('compact windmill creative adapter', () => {
  it('adapts every accepted tuple in the bounded geometry family', () => {
    const accepted = enumerateWindmillCompactGeometryV1().attempts
      .filter((attempt) => attempt.outcome === 'candidate');
    expect(accepted).toHaveLength(144);
    accepted.forEach(({ candidate }) => {
      const creative = createWindmillCompactCreativeV1(candidate);
      expect(creative.boxCount).toBe(Object.values(candidate.assets)
        .reduce((sum, asset) => sum + asset.boxes.length, 0));
      for (const assetKey of ASSET_KEYS) {
        expectExactCellParity(
          candidate.assets[assetKey],
          creative.assets[assetKey].boxes,
        );
      }
      expectSceneBuildCenters(candidate, creative);
    });
  });

  it('covers every candidate box exactly once with exact normalized cells', () => {
    const candidate = createWindmillCompactCandidateV1();
    const creative = createWindmillCompactCreativeV1(candidate);
    const sourceBoxes = Object.values(candidate.assets)
      .flatMap((asset) => asset.boxes);
    const inputs = Object.values(creative.assets)
      .flatMap((asset) => asset.boxes);

    expect(creative.candidateGeometryFingerprint)
      .toBe(candidate.geometryFingerprint);
    expect(creative.boxCount).toBe(sourceBoxes.length);
    expect(inputs.map((input) => input.boxKey).sort())
      .toEqual(sourceBoxes.map((box) => box.key).sort());
    expect(new Set(inputs.map((input) => input.boxKey)).size)
      .toBe(inputs.length);

    for (const assetKey of ASSET_KEYS) {
      const source = candidate.assets[assetKey];
      const adapted = creative.assets[assetKey];
      expect(adapted.sizeVoxels).toEqual(source.sizeVoxels);
      expect(adapted.boxes).toHaveLength(source.boxes.length);
      expectExactCellParity(source, adapted.boxes);
      adapted.boxes.forEach((input) => {
        const sourceBox = source.boxes.find((box) =>
          box.key === input.boxKey);
        expect(sourceBox).toBeDefined();
        expect(input.at).toEqual(sourceBox?.at);
        expect(input.size).toEqual(sourceBox?.size);
        expect(input.role).toBe(sourceBox?.role);
        expect(input.materialProfile).toBe(sourceBox?.materialProfile);
        expect(input.step).toEqual({
          kind: 'part',
          part: 'box',
          at: input.at,
          settings: {
            sizeX: input.size[0],
            sizeY: input.size[1],
            sizeZ: input.size[2],
            role: input.recipeRole,
          },
          note: `Preserves ${input.boxKey}: ${input.role}.`,
        });
      });
    }
  });

  it('makes every purpose-led box step subtractive rather than repainting', () => {
    const candidate = createWindmillCompactCandidateV1();
    const creative = createWindmillCompactCreativeV1(candidate);
    for (const assetKey of ASSET_KEYS) {
      const asset = creative.assets[assetKey];
      const full = new Set(asset.boxes.flatMap(cellsOf));
      asset.boxes.forEach((removed) => {
        const without = new Set(asset.boxes
          .filter((box) => box !== removed)
          .flatMap(cellsOf));
        const removedVolume =
          removed.size[0] * removed.size[1] * removed.size[2];
        expect(full.size - without.size, removed.boxKey)
          .toBe(removedVolume);
        expect(removed.purpose.beneficiary.length).toBeGreaterThan(0);
        expect(removed.purpose.job.length).toBeGreaterThan(0);
        expect(removed.purpose.locationDatum).toContain(removed.boxKey);
        expect(removed.purpose.removalFailure).toContain(removed.boxKey);
        expect(removed.purpose.relocationFailure).toContain(removed.boxKey);
        expect(removed.purpose.minimumForm).toContain(
          removed.size.join('x'),
        );
        expect(removed.purpose.evidence)
          .toContain(candidate.geometryFingerprint);
        expect(removed.purpose.honestyBoundary.length).toBeGreaterThan(0);
      });
    }
  });

  it('separates cam load paths, cam contacts, impact contact, and added head mass', () => {
    const candidate = createWindmillCompactCandidateV1();
    const creative = createWindmillCompactCreativeV1(candidate);
    const purpose = (
      assetKey: typeof ASSET_KEYS[number],
      boxKey: string,
    ) => creative.assets[assetKey].boxes.find((box) =>
      box.boxKey === boxKey)!;
    const primaryArm = purpose('rotor', 'rotor-cam-arm');
    const primaryNose = purpose('rotor', 'rotor-cam-nose');
    const opposedArm = purpose('rotor', 'rotor-opposed-cam-arm');
    const opposedNose = purpose('rotor', 'rotor-opposed-cam-nose');
    const toe = purpose('hammer', 'hammer-impact-toe');
    const headMass = purpose('hammer', 'hammer-head-mass');
    const anvilCap = purpose('anvil', 'anvil-impact-cap');
    expect([
      primaryArm.purposeId,
      primaryNose.purposeId,
      opposedArm.purposeId,
      opposedNose.purposeId,
      toe.purposeId,
      headMass.purposeId,
    ]).toEqual([
      'windmill:purpose:primary-cam-torque-arm',
      'windmill:purpose:primary-cam-contact-nose',
      'windmill:purpose:opposed-cam-torque-arm',
      'windmill:purpose:opposed-cam-contact-nose',
      'windmill:purpose:hammer-impact-toe',
      'windmill:purpose:hammer-head-return-mass',
    ]);
    expect(primaryArm.purpose.removalFailure).toMatch(
      /primary nose is disconnected from the shaft/i);
    expect(primaryArm.purpose.relocationFailure).toContain('rotor-shaft');
    expect(primaryArm.purpose.relocationFailure).toContain('rotor-cam-nose');
    expect(primaryArm.purpose.removalFailure).not.toContain('lose their');
    expect(primaryNose.purpose.removalFailure)
      .toContain("group loses 'rotor-cam-nose'");
    expect(primaryNose.purpose.removalFailure).toContain('cam-follower');
    expect(primaryNose.purpose.relocationFailure).toContain('rotor-cam-arm');
    expect(primaryNose.purpose.honestyBoundary)
      .toContain('no selected dynamic proof is bound');
    expect(primaryNose.purpose.selectedDynamicProof).toBeNull();
    expect(primaryNose.purpose.job).not.toMatch(/pickup|release/i);
    expect(opposedArm.purpose.removalFailure).toMatch(
      /opposed nose is disconnected from the shaft/i);
    expect(opposedArm.purpose.relocationFailure).toContain('rotor-shaft');
    expect(opposedArm.purpose.relocationFailure)
      .toContain('rotor-opposed-cam-nose');
    expect(opposedArm.purpose.removalFailure).not.toContain('lose their');
    expect(opposedNose.purpose.removalFailure)
      .toContain("group loses 'rotor-opposed-cam-nose'");
    expect(opposedNose.purpose.removalFailure).toContain('cam-follower');
    expect(opposedNose.purpose.relocationFailure)
      .toContain('rotor-opposed-cam-arm');
    expect(opposedNose.purpose.honestyBoundary)
      .toContain('no selected dynamic proof is bound');
    expect(opposedNose.purpose.selectedDynamicProof).toBeNull();
    expect(opposedNose.purpose.job).not.toMatch(/pickup|release/i);
    expect(toe.purpose.minimumForm).toMatch(
      /minimum localized participant and H1 terminal mass/i);
    expect(toe.purpose.removalFailure).toContain('head-anvil');
    expect(toe.purpose.relocationFailure).toContain('hammer-head-mass');
    expect(toe.purpose.selectedDynamicProof).toBeNull();
    expect(headMass.purpose.removalFailure).toMatch(
      /extra candidate mass.*beam-to-toe connector/i);
    expect(headMass.purpose.removalFailure).not.toContain('head-anvil');
    expect(headMass.purpose.relocationFailure).toContain('hammer-impact-toe');
    expect(headMass.purpose.relocationFailure).toContain('hammer-right-beam');
    expect(anvilCap.purpose.beneficiary).toBe(
      "The exact 'hammer-impact-toe' box.");

    const interfaces = new Set(candidate.requiredInterfaces.map((entry) =>
      [entry.fromBoxKey, entry.toBoxKey].sort().join('|')));
    [
      ['rotor-shaft', 'rotor-cam-arm'],
      ['rotor-cam-arm', 'rotor-cam-nose'],
      ['rotor-shaft', 'rotor-opposed-cam-arm'],
      ['rotor-opposed-cam-arm', 'rotor-opposed-cam-nose'],
      ['hammer-right-beam', 'hammer-head-mass'],
      ['hammer-head-mass', 'hammer-impact-toe'],
      ['anvil-column', 'anvil-impact-cap'],
    ].forEach((pair) => expect(interfaces).toContain([...pair].sort().join('|')));

    const camContact = candidate.intentionalContactGroups
      .find((group) => group.key === 'cam-follower');
    expect(camContact?.firstBoxKeys).toEqual([
      'rotor-cam-nose',
      'rotor-opposed-cam-nose',
    ]);
    const followerAt = worldAt(candidate.assets.hammer, 'hammer-follower-shoe');
    const primaryNoseAt = worldAt(candidate.assets.rotor, 'rotor-cam-nose');
    const opposedNoseAt =
      worldAt(candidate.assets.rotor, 'rotor-opposed-cam-nose');
    expect(primaryNoseAt[2]).toBe(followerAt[2]);
    expect(opposedNoseAt[2]).toBe(followerAt[2]);
    expect(primaryNoseAt[2] + 1).not.toBe(followerAt[2]);
    expect(opposedNoseAt[2] + 1).not.toBe(followerAt[2]);
    expect(primaryNose.purpose.evidence).toContain(
      `z=[${String(followerAt[2])},${String(followerAt[2] + 1)})`);
    const headContact = candidate.intentionalContactGroups
      .find((group) => group.key === 'head-anvil');
    expect(headContact?.firstBoxKeys).toEqual(['hammer-impact-toe']);
    const toeAt = worldAt(candidate.assets.hammer, 'hammer-impact-toe');
    const capAt = worldAt(candidate.assets.anvil, 'anvil-impact-cap');
    expect([toeAt[0], toeAt[2]]).toEqual([capAt[0], capAt[2]]);
    expect([toeAt[0], toeAt[2] + 1]).not.toEqual([capAt[0], capAt[2]]);
    expect(toe.purpose.evidence).toContain(
      `x=[${String(toeAt[0])},${String(toeAt[0] + 1)})`,
    );
    expect(toe.purpose.evidence).toContain(
      `z=[${String(toeAt[2])},${String(toeAt[2] + 1)})`,
    );

    const h1 = createWindmillCompactCandidateV1({
      ...candidate.parameters,
      hammerHeadHeightVoxels: 1,
    });
    const h1Creative = createWindmillCompactCreativeV1(h1);
    const h1Toe = h1Creative.assets.hammer.boxes.find((box) =>
      box.boxKey === 'hammer-impact-toe');
    expect(h1Toe?.purposeId).toBe('windmill:purpose:hammer-impact-toe');
    expect(h1Toe?.size).toEqual([1, 1, 1]);
    expect(h1Creative.assets.hammer.boxes.some((box) =>
      box.boxKey === 'hammer-head-mass')).toBe(false);
    const h1Interfaces = new Set(h1.requiredInterfaces.map((entry) =>
      [entry.fromBoxKey, entry.toBoxKey].sort().join('|')));
    expect(h1Interfaces).toContain(
      ['hammer-right-beam', 'hammer-impact-toe'].sort().join('|'),
    );
    expect(JSON.stringify(Object.values(creative.assets).flatMap(
      (asset) => asset.boxes.map((box) => box.purpose),
    ))).not.toMatch(/\b(measured impact|gravity-return|pickup|release|proofSha256)\b/i);
  });

  it('recomputes the broken load path after relocating each accountable scope', () => {
    const candidate = createWindmillCompactCandidateV1();
    const relocations = [
      ['rotor', 'rotor-cam-arm'],
      ['rotor', 'rotor-cam-nose'],
      ['rotor', 'rotor-opposed-cam-arm'],
      ['rotor', 'rotor-opposed-cam-nose'],
      ['hammer', 'hammer-impact-toe'],
      ['hammer', 'hammer-head-mass'],
      ['anvil', 'anvil-impact-cap'],
    ] as const;
    relocations.forEach(([assetKey, boxKey]) => {
      const asset = candidate.assets[assetKey];
      const changedBoxes = asset.boxes.map((box) => box.key === boxKey
        ? { ...box, at: [box.at[0], box.at[1], box.at[2] + 1] as const }
        : box);
      expect(
        () => windmillCompactRequiredInterfacesV1(
          candidate.parameters,
          { [assetKey]: { ...asset, boxes: changedBoxes } },
        ),
        boxKey,
      ).toThrow(/interface need/i);
    });
  });

  it('maps every semantic role once while preserving physical material profiles', () => {
    const candidate = createWindmillCompactCandidateV1();
    const creative = createWindmillCompactCreativeV1(candidate);
    const sourceBoxes = Object.values(candidate.assets)
      .flatMap((asset) => asset.boxes);
    const usedRoles = new Set(sourceBoxes.map((box) => box.role));
    expect(creative.roleColors.map((entry) => entry.role))
      .toEqual(WINDMILL_COMPACT_ROLE_COLORS_V1
        .filter((entry) => usedRoles.has(entry.role))
        .map((entry) => entry.role));
    expect(new Set(creative.roleColors.map((entry) =>
      entry.role)).size).toBe(usedRoles.size);
    expect(new Set(creative.roleColors.map((entry) =>
      entry.colorGroup)).size).toBe(11);
    const colorsByGroup = new Map<string, string>();
    creative.roleColors.forEach((entry) => {
      const serialized = JSON.stringify(entry.color);
      const existing = colorsByGroup.get(entry.colorGroup);
      if (existing === undefined) colorsByGroup.set(entry.colorGroup, serialized);
      else expect(serialized, entry.role).toBe(existing);
    });
    expect(new Set(colorsByGroup.values()).size).toBe(colorsByGroup.size);

    Object.values(creative.assets).forEach((asset) => {
      expect(asset.roles).toHaveLength(asset.palette.length);
      expect(asset.roles[0]).toBe('empty');
      expect(new Set(asset.roles).size).toBe(asset.roles.length);
      asset.boxes.forEach((box) => {
        const source = sourceBoxes.find((entry) => entry.key === box.boxKey);
        expect(source?.materialProfile).toBe(box.materialProfile);
        expect(box.recipeRole).toBe(box.role);
        expect(creative.roleColors.filter((entry) =>
          entry.role === box.role), box.boxKey).toHaveLength(1);
        expect(asset.roles.filter((role) =>
          role === box.recipeRole)).toHaveLength(1);
      });
    });
  });

  it('reconstructs candidate body centers after Scene Build ground lift', () => {
    const candidate = createWindmillCompactCandidateV1();
    const creative = createWindmillCompactCreativeV1(candidate);
    for (const assetKey of ASSET_KEYS) {
      const source = candidate.assets[assetKey];
      const placement = creative.assets[assetKey].scenePlacement;
      const expectedWorld = source.bodyWorldVoxels.map((coordinate) =>
        coordinate * candidate.grainMeters);
      expect(placement.authoredBodyWorld).toEqual(expectedWorld);
      expect(placement.groundLiftWorldUnits).toBe(
        source.sizeVoxels[1] * candidate.grainMeters / 2,
      );
      expect([
        placement.at[0],
        placement.at[1] + placement.groundLiftWorldUnits,
        placement.at[2],
      ]).toEqual(expectedWorld);
      expect(placement.presentedBodyWorld).toEqual(expectedWorld);
    }
  });

});
