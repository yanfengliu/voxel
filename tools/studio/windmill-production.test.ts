import { describe, expect, it } from 'vitest';

import { createStudioParts } from './parts.js';
import { buildRecipe } from './recipe.js';
import {
  WINDMILL_COMPACT_REPLAY_RECORD_PROFILE,
  WINDMILL_PRODUCTION_PRESENTATION,
} from './generated-windmill-replay.js';
import { createWindmillPurposeGraphV1 } from './windmill-purpose-graph.js';
import {
  synthesizeWindmillProductionTracksV1,
} from './windmill-production-kinematics.js';
import {
  WINDMILL_PRODUCTION_ASSETS_V1,
  WINDMILL_PRODUCTION_RECIPE_IDS_V1,
  WINDMILL_PRODUCTION_TRACK_IDS_V1,
} from './windmill-production-layout.js';
import {
  createWindmillProductionPhysicalBook,
} from './windmill-production-physical.js';
import {
  WINDMILL_PRODUCTION_HONESTY_V1,
  WINDMILL_PRODUCTION_PURPOSE_LEDGER_V1,
  WINDMILL_PRODUCTION_SYSTEM_PURPOSES_V1,
  WINDMILL_PRODUCTION_VOID_PURPOSES_V1,
} from './windmill-production-purpose.js';
import {
  createWindmillProductionRecipeBook,
  WINDMILL_PRODUCTION_RECIPES,
  WINDMILL_PRODUCTION_ROLE_COLORS_V1,
  WINDMILL_PRODUCTION_STEP_PURPOSES_V1,
} from './windmill-production-recipes.js';
import { WINDMILL_PURPOSE_LEDGER_V1 } from './windmill-purpose.js';
import { createWindmillRecipeBook } from './windmill-recipes.js';

const PROSE_FIELDS = [
  'beneficiary',
  'job',
  'locationDatum',
  'removalFailure',
  'relocationFailure',
  'smallestAdequateForm',
  'evidence',
  'honestyBoundary',
] as const;

describe('windmill production line accountability', () => {
  it('derives every recipe step from one exact authored box', () => {
    expect(WINDMILL_PRODUCTION_RECIPES.map(({ id }) => id))
      .toEqual(Object.values(WINDMILL_PRODUCTION_RECIPE_IDS_V1));
    for (const asset of WINDMILL_PRODUCTION_ASSETS_V1) {
      const recipe = createWindmillProductionRecipeBook()[asset.recipeId]!;
      const purposes = WINDMILL_PRODUCTION_STEP_PURPOSES_V1[asset.recipeId];
      expect(recipe.size, asset.recipeId).toEqual(asset.sizeVoxels);
      expect(recipe.voxelSize, asset.recipeId).toBe(asset.grain);
      expect(recipe.steps, asset.recipeId).toHaveLength(asset.boxes.length);
      expect(purposes, asset.recipeId).toHaveLength(asset.boxes.length);
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
      });
    }
  });

  it('accounts for every box and void with one falsifiable record each', () => {
    const boxKeys = WINDMILL_PRODUCTION_ASSETS_V1.flatMap(
      (asset) => asset.boxes.map(({ boxKey }) => boxKey),
    );
    expect(WINDMILL_PRODUCTION_PURPOSE_LEDGER_V1.map(({ boxKey }) => boxKey))
      .toEqual(boxKeys);
    const voidKeys = WINDMILL_PRODUCTION_ASSETS_V1.flatMap(
      (asset) => asset.voids.map(({ voidKey }) => voidKey),
    );
    expect(WINDMILL_PRODUCTION_VOID_PURPOSES_V1.map(({ voidKey }) => voidKey))
      .toEqual(voidKeys);
    const allIds = [
      ...WINDMILL_PURPOSE_LEDGER_V1.map(({ id }) => id),
      ...WINDMILL_PRODUCTION_PURPOSE_LEDGER_V1.map(({ id }) => id),
      ...WINDMILL_PRODUCTION_VOID_PURPOSES_V1.map(({ id }) => id),
    ];
    expect(new Set(allIds).size).toBe(allIds.length);
    for (const record of WINDMILL_PRODUCTION_PURPOSE_LEDGER_V1) {
      for (const field of PROSE_FIELDS) {
        expect(record[field].trim().length, `${record.boxKey}:${field}`)
          .toBeGreaterThan(20);
      }
      expect(record.boxes, record.boxKey).toHaveLength(1);
      expect(record.boxes[0]?.boxKey, record.boxKey).toBe(record.boxKey);
    }
    for (const record of WINDMILL_PRODUCTION_VOID_PURPOSES_V1) {
      expect(record.job.length, record.voidKey).toBeGreaterThan(20);
      expect(record.fillFailure.length, record.voidKey).toBeGreaterThan(20);
      expect(record.honestyBoundary.length, record.voidKey)
        .toBeGreaterThan(20);
    }
  });

  it('binds placements and presentation rules to the system ledger', () => {
    expect(WINDMILL_PRODUCTION_SYSTEM_PURPOSES_V1.map(({ id }) => id))
      .toEqual([
        'windmill:system-purpose:mill-building',
        'windmill:system-purpose:wheat-infeed-magazine',
        'windmill:system-purpose:flour-outfeed',
        'windmill:system-purpose:wheat-delivery-rule',
        'windmill:system-purpose:flour-accumulation-rule',
      ]);
    for (const entry of WINDMILL_PRODUCTION_SYSTEM_PURPOSES_V1) {
      for (const field of PROSE_FIELDS) {
        expect(entry[field].trim().length, `${entry.id}:${field}`)
          .toBeGreaterThan(20);
      }
      expect(entry.subjectIds.length, entry.id).toBeGreaterThan(0);
    }
    const honestyCarriers = WINDMILL_PRODUCTION_SYSTEM_PURPOSES_V1.filter(
      ({ honestyBoundary }) =>
        honestyBoundary === WINDMILL_PRODUCTION_HONESTY_V1,
    );
    expect(honestyCarriers.length).toBeGreaterThanOrEqual(3);
    expect(WINDMILL_PRODUCTION_HONESTY_V1)
      .toMatch(/keyed to the .*answered hammer-anvil impacts/);
    expect(WINDMILL_PRODUCTION_HONESTY_V1)
      .toMatch(/nothing simulates milling, grain, contact, or mass flow/);
  });

  it('mirrors every authored box as one collider on one honest body', () => {
    const book = createWindmillProductionPhysicalBook();
    const expectedTypes: Readonly<Record<string, string>> = {
      [WINDMILL_PRODUCTION_RECIPE_IDS_V1.building]: 'fixed',
      [WINDMILL_PRODUCTION_RECIPE_IDS_V1.flourBin]: 'fixed',
      [WINDMILL_PRODUCTION_RECIPE_IDS_V1.wheatSack]: 'kinematic',
      [WINDMILL_PRODUCTION_RECIPE_IDS_V1.flourHeap]: 'kinematic',
    };
    for (const asset of WINDMILL_PRODUCTION_ASSETS_V1) {
      const sidecar = book[asset.recipeId]!;
      expect(sidecar.bodies, asset.recipeId).toHaveLength(1);
      expect(sidecar.bodies[0]?.type, asset.recipeId)
        .toBe(expectedTypes[asset.recipeId]);
      expect(sidecar.colliders, asset.recipeId)
        .toHaveLength(asset.boxes.length);
      expect(sidecar.constraints, asset.recipeId).toHaveLength(0);
    }
  });

  it('binds every used color role to a named communication job', () => {
    const usedRoles = new Set(WINDMILL_PRODUCTION_ASSETS_V1.flatMap(
      (asset) => asset.boxes.map(({ role }) => role),
    ));
    const declared = new Map(WINDMILL_PRODUCTION_ROLE_COLORS_V1.map(
      (entry) => [entry.role, entry],
    ));
    expect([...declared.keys()].sort()).toEqual([...usedRoles].sort());
    for (const entry of WINDMILL_PRODUCTION_ROLE_COLORS_V1) {
      expect(entry.job.length, entry.role).toBeGreaterThan(20);
      expect(entry.honestyBoundary.length, entry.role).toBeGreaterThan(20);
    }
  });

  it('builds every production recipe through the shared windmill book', () => {
    const parts = createStudioParts();
    const book = createWindmillRecipeBook();
    for (const recipe of WINDMILL_PRODUCTION_RECIPES) {
      expect(book[recipe.id], recipe.id).toBe(recipe);
      const built = buildRecipe(recipe, parts, book).model;
      expect(built.voxels.some((slot) => slot !== 0), recipe.id).toBe(true);
    }
  });

  it('declares the open grain-mass boundary the kernel can check', () => {
    const graph = createWindmillPurposeGraphV1();
    const claim = graph.conservationClaims.find(
      ({ quantity }) => quantity === 'grain-mass',
    );
    expect(claim).toBeDefined();
    expect(claim?.closed).toBe(false);
    expect(claim?.sourceIds).toEqual(['windmill:source:wheat-infeed']);
    expect(claim?.sinkIds).toEqual([]);
    const source = graph.nodes.find(
      ({ id }) => id === 'windmill:source:wheat-infeed',
    );
    expect(source?.kind).toBe('material-source');
    expect(source !== undefined && 'visibility' in source
      ? source.visibility
      : undefined).toBe('visible');
  });

  it('synthesizes deterministic tracks and refuses impossible schedules', () => {
    const impacts = WINDMILL_PRODUCTION_PRESENTATION.impactTicks.map(
      (tick) => tick
        * WINDMILL_COMPACT_REPLAY_RECORD_PROFILE.solverStepSeconds,
    );
    const first = synthesizeWindmillProductionTracksV1(impacts, 721, 1 / 60);
    const second = synthesizeWindmillProductionTracksV1(impacts, 721, 1 / 60);
    expect(first.map(({ placementId }) => placementId))
      .toEqual([...WINDMILL_PRODUCTION_TRACK_IDS_V1]);
    first.forEach((track, index) => {
      expect(track.translations).toEqual(second[index]!.translations);
      expect(track.quaternions).toEqual(second[index]!.quaternions);
      expect(track.linearVelocities)
        .toEqual(second[index]!.linearVelocities);
      expect(track.angularVelocities)
        .toEqual(second[index]!.angularVelocities);
    });
    // Fewer blows than sacks, and blows past the last sack, are both
    // ordinary: the magazine answers what it can and the rest of the queue
    // waits. Only a window in which not one blow can be answered is refused.
    expect(() => synthesizeWindmillProductionTracksV1(
      impacts.slice(0, 4),
      721,
      1 / 60,
    )).not.toThrow();
    expect(() => synthesizeWindmillProductionTracksV1(
      [...impacts, impacts[impacts.length - 1]! + 0.5],
      721,
      1 / 60,
    )).not.toThrow();
    expect(() => synthesizeWindmillProductionTracksV1(
      [11.9],
      721,
      1 / 60,
    )).toThrow(/not one blow could be answered by a sack/);
    expect(() => synthesizeWindmillProductionTracksV1(
      [...impacts.slice(0, 4), impacts[3]!],
      721,
      1 / 60,
    )).toThrow(/must be finite and later than/);
    expect(() => synthesizeWindmillProductionTracksV1(
      [0.2, ...impacts.slice(1)],
      721,
      1 / 60,
    )).toThrow(/leave the queue at/);
    // A five-second window against a mill whose first blow lands at 4.1 s:
    // no sack can both reach the spot and settle in the spent row before it
    // closes, so there is nothing to show rather than a sack frozen mid-drag.
    expect(() => synthesizeWindmillProductionTracksV1(
      impacts,
      301,
      1 / 60,
    )).toThrow(/not one blow could be answered by a sack/);
  });
});
